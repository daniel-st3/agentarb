"""LangGraph orchestrator: scan -> score -> claim-gate -> execute -> submit -> settle -> record.

The claim gate is a real LangGraph `interrupt()`. The graph suspends there,
its state is checkpointed to SQLite, and it stays suspended -- across process
restarts -- until a human resumes it with `Command(resume=...)` from the
Streamlit queue. Nothing is claimed, executed, or settled before that.

Week 2 constraint: there is no wallet. `settle` reads the connector's own
settlement status, which for MockMarketplace is explicitly simulated. No code
here signs anything or moves real funds.
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from arbiter.config import Settings, get_settings
from arbiter.connectors.base import MarketplaceConnector, UnsupportedOperation
from arbiter.db import session_scope
from arbiter.executors import CategoryRouter
from arbiter.logging import get_logger
from arbiter.models import Bounty, EventRow, Score, TaskRow, TaskState, utcnow
from arbiter.risk import RiskGuard
from arbiter.scoring import ScoringAgent

log = get_logger(__name__)


def _last(_old: Any, new: Any) -> Any:
    return new


class ArbiterState(TypedDict, total=False):
    """State threaded through the graph. One bounty per run."""

    run_id: Annotated[str, _last]
    bounty: Annotated[dict, _last]
    score: Annotated[dict, _last]
    approved: Annotated[bool | None, _last]
    approver: Annotated[str | None, _last]
    reject_reason: Annotated[str | None, _last]
    risk: Annotated[dict, _last]
    claim: Annotated[dict, _last]
    result: Annotated[dict, _last]
    submission: Annotated[dict, _last]
    settlement: Annotated[dict, _last]
    state: Annotated[str, _last]
    error: Annotated[str | None, _last]


def record_event(run_id: str, node: str, message: str, bounty_key: str | None = None, **payload):
    with session_scope() as session:
        session.add(
            EventRow(
                run_id=run_id,
                bounty_key=bounty_key,
                node=node,
                message=message,
                payload=payload,
            )
        )


def _upsert_task(bounty: Bounty, run_id: str, score: Score, **fields) -> None:
    with session_scope() as session:
        row = session.get(TaskRow, bounty.key)
        if row is None:
            row = TaskRow(
                bounty_key=bounty.key,
                run_id=run_id,
                marketplace=bounty.marketplace,
                bounty_id=bounty.bounty_id,
                title=bounty.title,
                category=bounty.category.value,
                payout_usd=bounty.payout_usd,
                score=score.score,
            )
        for key, value in fields.items():
            setattr(row, key, value)
        row.updated_at = utcnow()
        session.add(row)


class ArbiterGraph:
    """Builds and runs the orchestrator for a single bounty."""

    def __init__(
        self,
        connectors: dict[str, MarketplaceConnector],
        settings: Settings | None = None,
        scorer: ScoringAgent | None = None,
        router: CategoryRouter | None = None,
        guard: RiskGuard | None = None,
        checkpointer: Any | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.connectors = connectors
        self.scorer = scorer or ScoringAgent(settings=self.settings)
        self.router = router or CategoryRouter()
        self.guard = guard or RiskGuard(self.settings)
        self._checkpointer = checkpointer
        self.graph = self._build()

    # ---------------- nodes ----------------

    async def score_node(self, state: ArbiterState) -> dict:
        bounty = Bounty(**state["bounty"])
        connector = self.connectors[bounty.marketplace]
        score = await self.scorer.score_one(bounty, connector.capabilities)

        # A skipped bounty must never enter the approval queue -- the scorer
        # already declined it, and asking a human about it would be noise.
        _upsert_task(
            bounty,
            state["run_id"],
            score,
            state=(
                TaskState.REJECTED.value if score.skipped else TaskState.PENDING_APPROVAL.value
            ),
            approved=False if score.skipped else None,
            error=score.skip_reason,
        )
        record_event(
            state["run_id"], "score", f"scored {score.score:.2f}", bounty.key,
            skipped=score.skipped, skip_reason=score.skip_reason,
        )
        return {"score": score.model_dump(), "state": "scored"}

    async def risk_node(self, state: ArbiterState) -> dict:
        """RiskGuard runs *before* the human is asked, so we never ask about
        something the limits would refuse anyway."""
        bounty = Bounty(**state["bounty"])
        score = Score(**state["score"])
        decision = self.guard.check(bounty, score)

        record_event(
            state["run_id"], "risk", decision.reason, bounty.key,
            allowed=decision.allowed, limit=decision.limit,
        )
        if not decision.allowed:
            _upsert_task(
                bounty, state["run_id"], score,
                state=TaskState.REJECTED.value, error=f"risk: {decision.reason}",
            )
        return {
            "risk": {
                "allowed": decision.allowed,
                "reason": decision.reason,
                "limit": decision.limit,
            },
            "state": "risk_checked",
        }

    async def claim_gate_node(self, state: ArbiterState) -> dict:
        """The human-in-the-loop gate. Suspends the graph until resumed."""
        bounty = Bounty(**state["bounty"])
        score = Score(**state["score"])

        if not self.settings.require_approval:
            record_event(
                state["run_id"], "claim_gate", "auto-approved (approval disabled)", bounty.key
            )
            return {"approved": True, "approver": "auto", "state": "auto_approved"}

        record_event(state["run_id"], "claim_gate", "awaiting human approval", bounty.key)

        # Execution stops here. The payload is what the dashboard shows.
        decision = interrupt(
            {
                "kind": "claim_approval",
                "bounty_key": bounty.key,
                "marketplace": bounty.marketplace,
                "title": bounty.title,
                "payout_usd": bounty.payout_usd,
                "score": score.score,
                "net_ev_usd": score.net_ev_usd,
                "est_cost_usd": score.est_api_cost_usd + score.est_gas_cost_usd,
                "p_success": score.p_success,
                "rationale": score.rationale,
                "url": bounty.url,
            }
        )

        if isinstance(decision, dict):
            approved = bool(decision.get("approved"))
            approver = decision.get("approver") or "human"
            reason = decision.get("reason")
        else:
            approved, approver, reason = bool(decision), "human", None

        _upsert_task(
            bounty, state["run_id"], score,
            approved=approved, approved_by=approver, decided_at=utcnow(),
            state=TaskState.CLAIMED.value if approved else TaskState.REJECTED.value,
        )
        record_event(
            state["run_id"], "claim_gate",
            f"{'approved' if approved else 'rejected'} by {approver}", bounty.key,
            reason=reason,
        )
        return {
            "approved": approved,
            "approver": approver,
            "reject_reason": reason,
            "state": TaskState.CLAIMED.value if approved else TaskState.REJECTED.value,
        }

    async def claim_node(self, state: ArbiterState) -> dict:
        bounty = Bounty(**state["bounty"])
        score = Score(**state["score"])
        connector = self.connectors[bounty.marketplace]

        claimable, why = connector.can_claim(bounty)
        if not claimable:
            _upsert_task(
                bounty, state["run_id"], score, state=TaskState.FAILED.value, error=why
            )
            record_event(state["run_id"], "claim", f"not claimable: {why}", bounty.key)
            return {"state": "failed", "error": why}

        try:
            claim = await connector.claim(bounty.bounty_id)
        except UnsupportedOperation as exc:
            _upsert_task(
                bounty, state["run_id"], score, state=TaskState.FAILED.value, error=str(exc)
            )
            record_event(state["run_id"], "claim", f"unsupported: {exc}", bounty.key)
            return {"state": "failed", "error": str(exc)}

        _upsert_task(bounty, state["run_id"], score, state=TaskState.CLAIMED.value)
        record_event(state["run_id"], "claim", str(claim.get("status")), bounty.key, **claim)
        return {"claim": claim, "state": TaskState.CLAIMED.value}

    async def execute_node(self, state: ArbiterState) -> dict:
        bounty = Bounty(**state["bounty"])
        score = Score(**state["score"])
        _upsert_task(bounty, state["run_id"], score, state=TaskState.EXECUTING.value)

        result = await self.router.execute(bounty)

        # Cost is spent whether or not the work succeeded.
        self.guard.record_spend(
            bounty.key, result.cost_usd, f"execute:{result.handler}", bounty.marketplace
        )
        _upsert_task(
            bounty, state["run_id"], score,
            handler=result.handler, actual_cost_usd=result.cost_usd,
            state=TaskState.EXECUTING.value if result.ok else TaskState.FAILED.value,
            error=result.error,
        )
        record_event(
            state["run_id"], "execute", f"{result.handler} ok={result.ok}", bounty.key,
            stubbed=result.stubbed, cost_usd=result.cost_usd, error=result.error,
        )
        return {
            "result": {
                "ok": result.ok, "handler": result.handler, "output": result.output,
                "stubbed": result.stubbed, "cost_usd": result.cost_usd, "error": result.error,
            },
            "state": "executed" if result.ok else "failed",
            "error": result.error,
        }

    async def submit_node(self, state: ArbiterState) -> dict:
        bounty = Bounty(**state["bounty"])
        score = Score(**state["score"])
        connector = self.connectors[bounty.marketplace]
        result = state["result"]

        try:
            submission = await connector.submit(
                bounty.bounty_id,
                {
                    "handler": result["handler"],
                    "output": result["output"],
                    "stubbed": result["stubbed"],
                },
            )
        except (UnsupportedOperation, ValueError) as exc:
            _upsert_task(
                bounty, state["run_id"], score, state=TaskState.FAILED.value, error=str(exc)
            )
            record_event(state["run_id"], "submit", f"failed: {exc}", bounty.key)
            return {"state": "failed", "error": str(exc)}

        _upsert_task(
            bounty, state["run_id"], score, state=TaskState.SUBMITTED.value, result=result
        )
        record_event(state["run_id"], "submit", str(submission.get("status")), bounty.key)
        return {"submission": submission, "state": TaskState.SUBMITTED.value}

    async def settle_node(self, state: ArbiterState) -> dict:
        """Read settlement from the connector. No wallet, no signing.

        For MockMarketplace this is a simulated settlement; the ledger entry
        is flagged `simulated=True` so nothing here can be mistaken for real
        earnings.
        """
        bounty = Bounty(**state["bounty"])
        score = Score(**state["score"])
        connector = self.connectors[bounty.marketplace]

        try:
            settlement = await connector.settlement_status(bounty.bounty_id)
        except UnsupportedOperation as exc:
            record_event(state["run_id"], "settle", f"unsupported: {exc}", bounty.key)
            _upsert_task(bounty, state["run_id"], score, state=TaskState.SUBMITTED.value)
            return {
                "settlement": {"status": "unsupported", "detail": str(exc)},
                "state": "submitted",
            }

        if settlement.get("status") == "settled":
            amount = float(settlement.get("amount_usd") or 0.0)
            self.guard.record_earning(
                bounty.key, amount, "settlement", bounty.marketplace,
                reference=settlement.get("tx"),
            )
            _upsert_task(
                bounty, state["run_id"], score,
                state=TaskState.SETTLED.value, settled_amount_usd=amount,
                settlement_ref=settlement.get("tx"),
                simulated=bool(settlement.get("simulated", True)),
            )
        record_event(
            state["run_id"], "settle", str(settlement.get("status")), bounty.key, **settlement
        )
        return {"settlement": settlement, "state": settlement.get("status", "unknown")}

    # ---------------- edges ----------------

    @staticmethod
    def _after_score(state: ArbiterState) -> str:
        return "end" if state["score"].get("skipped") else "risk"

    @staticmethod
    def _after_risk(state: ArbiterState) -> str:
        return "claim_gate" if state["risk"]["allowed"] else "end"

    @staticmethod
    def _after_gate(state: ArbiterState) -> str:
        return "claim" if state.get("approved") else "end"

    @staticmethod
    def _after_claim(state: ArbiterState) -> str:
        return "end" if state.get("state") == "failed" else "execute"

    @staticmethod
    def _after_execute(state: ArbiterState) -> str:
        return "submit" if state["result"]["ok"] else "end"

    @staticmethod
    def _after_submit(state: ArbiterState) -> str:
        return "end" if state.get("state") == "failed" else "settle"

    def _build(self):
        builder = StateGraph(ArbiterState)
        builder.add_node("score", self.score_node)
        builder.add_node("risk", self.risk_node)
        builder.add_node("claim_gate", self.claim_gate_node)
        builder.add_node("claim", self.claim_node)
        builder.add_node("execute", self.execute_node)
        builder.add_node("submit", self.submit_node)
        builder.add_node("settle", self.settle_node)

        builder.add_edge(START, "score")
        builder.add_conditional_edges("score", self._after_score, {"risk": "risk", "end": END})
        builder.add_conditional_edges(
            "risk", self._after_risk, {"claim_gate": "claim_gate", "end": END}
        )
        builder.add_conditional_edges(
            "claim_gate", self._after_gate, {"claim": "claim", "end": END}
        )
        builder.add_conditional_edges(
            "claim", self._after_claim, {"execute": "execute", "end": END}
        )
        builder.add_conditional_edges(
            "execute", self._after_execute, {"submit": "submit", "end": END}
        )
        builder.add_conditional_edges(
            "submit", self._after_submit, {"settle": "settle", "end": END}
        )
        builder.add_edge("settle", END)

        return builder.compile(checkpointer=self._checkpointer)


async def sqlite_checkpointer(path: str | None = None) -> AsyncSqliteSaver:
    """Checkpointer so an interrupted gate survives a process restart.

    Async because the graph is driven with `ainvoke`; the sync `SqliteSaver`
    refuses async calls. The returned saver owns its aiosqlite connection,
    which is bound to the running event loop -- so build one Orchestrator per
    `asyncio.run`, not one shared across loops.
    """
    import aiosqlite

    settings = get_settings()
    db_path = path or str(settings.checkpoint_db_path)
    settings.checkpoint_db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = await aiosqlite.connect(db_path, check_same_thread=False, timeout=30.0)
    await conn.execute("PRAGMA journal_mode=WAL")
    await conn.execute("PRAGMA busy_timeout=30000")
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    return saver
