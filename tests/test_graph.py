"""The orchestrator: gate suspension, approve/reject paths, and durability."""

import pytest
from langgraph.checkpoint.memory import MemorySaver
from sqlmodel import Session, SQLModel, create_engine, select

import arbiter.db as db
from arbiter.connectors import MockMarketplaceConnector
from arbiter.executors.base import ExecutionResult
from arbiter.executors.router import CategoryRouter
from arbiter.models import EventRow, LedgerRow, TaskRow, TaskState
from arbiter.orchestrator import Orchestrator, pending_tasks
from arbiter.risk import RiskGuard


@pytest.fixture
def memory_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db, "_engine", engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr("arbiter.orchestrator.init_db", lambda: None)
    return engine


class FakeRouter(CategoryRouter):
    """Deterministic executor so graph tests never depend on an LLM."""

    def __init__(self, ok=True, cost=0.01, error=None):
        self._ok, self._cost, self._error = ok, cost, error

    async def execute(self, bounty):
        return ExecutionResult(
            ok=self._ok, handler="fake", output="deliverable",
            cost_usd=self._cost, error=self._error,
        )


@pytest.fixture
async def setup(memory_db, settings):
    settings.require_approval = True
    settings.max_effort_hours = 1.0        # keep the seed bounties scoreable
    settings.cost_safety_margin = 1.0
    mock = MockMarketplaceConnector()
    orchestrator = await Orchestrator.create(
        {"mock": mock},
        settings=settings,
        checkpointer=MemorySaver(),
        router=FakeRouter(),
        guard=RiskGuard(settings),
    )
    return orchestrator, mock, settings


class TestClaimGate:
    async def test_suspends_before_doing_anything(self, setup):
        orchestrator, mock, _ = setup
        bounty = await mock.get("mock-007")

        pending = await orchestrator.start(bounty)

        assert pending.thread_id == "mock:mock-007"
        assert pending.payload["kind"] == "claim_approval"
        assert pending.payload["title"] == bounty.title
        # Nothing happened yet: not claimed, not executed, not settled.
        assert mock._claimed == set()
        assert mock._submissions == {}

    async def test_payload_carries_what_a_human_needs(self, setup):
        orchestrator, mock, _ = setup
        pending = await orchestrator.start(await mock.get("mock-007"))
        for key in ("bounty_key", "payout_usd", "score", "net_ev_usd",
                    "est_cost_usd", "p_success", "url"):
            assert key in pending.payload

    async def test_appears_in_the_queue(self, setup):
        orchestrator, mock, _ = setup
        await orchestrator.start(await mock.get("mock-007"))
        assert [t.bounty_key for t in pending_tasks()] == ["mock:mock-007"]

    async def test_approve_runs_the_full_loop(self, setup):
        orchestrator, mock, _ = setup
        pending = await orchestrator.start(await mock.get("mock-007"))

        final = await orchestrator.resume(pending.thread_id, True, "tester")

        assert final["state"] == "settled"
        assert final["claim"]["status"] == "claimed"
        assert final["result"]["ok"]
        assert final["submission"]["status"] == "submitted"
        assert final["settlement"]["simulated"] is True
        assert mock._claimed == {"mock-007"}

    async def test_reject_stops_everything(self, setup):
        orchestrator, mock, _ = setup
        pending = await orchestrator.start(await mock.get("mock-007"))

        final = await orchestrator.resume(pending.thread_id, False, "tester", "no")

        assert final["approved"] is False
        assert final["state"] == TaskState.REJECTED.value
        assert mock._claimed == set(), "a rejected bounty must never be claimed"
        # LangGraph materializes every declared channel, so assert emptiness
        # rather than absence: nothing executed, submitted, or settled.
        assert not final.get("result")
        assert not final.get("submission")
        assert not final.get("settlement")
        assert mock._submissions == {}
        assert pending_tasks() == []

    async def test_decision_is_recorded(self, setup, memory_db):
        orchestrator, mock, _ = setup
        pending = await orchestrator.start(await mock.get("mock-007"))
        await orchestrator.resume(pending.thread_id, True, "daniel")

        with Session(memory_db) as session:
            task = session.get(TaskRow, "mock:mock-007")
        assert task.approved is True
        assert task.approved_by == "daniel"
        assert task.decided_at is not None
        assert task.state == TaskState.SETTLED.value


class TestGuards:
    async def test_skipped_bounty_never_reaches_the_gate(self, setup):
        orchestrator, mock, _ = setup
        # mock-006 is an unsupported category.
        outcome = await orchestrator.start(await mock.get("mock-006"))
        assert not hasattr(outcome, "payload")
        assert outcome["score"]["skipped"] is True
        assert pending_tasks() == []

    async def test_risk_refusal_never_reaches_the_gate(self, setup):
        orchestrator, mock, settings = setup
        settings.max_cost_per_task_usd = 0.0     # refuse everything
        outcome = await orchestrator.start(await mock.get("mock-007"))
        assert not hasattr(outcome, "payload")
        assert outcome["risk"]["allowed"] is False
        assert mock._claimed == set()

    async def test_unclaimable_marketplace_fails_cleanly(self, setup, memory_db):
        orchestrator, mock, _ = setup
        bounty = await mock.get("mock-007")
        await mock.claim("mock-007")          # already taken
        pending = await orchestrator.start(bounty)
        final = await orchestrator.resume(pending.thread_id, True, "tester")
        assert final["state"] == "failed"
        assert "already claimed" in final["error"]

    async def test_execution_failure_stops_before_submit(self, memory_db, settings):
        settings.require_approval = True
        settings.max_effort_hours = 1.0
        settings.cost_safety_margin = 1.0
        mock = MockMarketplaceConnector()
        orchestrator = await Orchestrator.create(
            {"mock": mock}, settings=settings, checkpointer=MemorySaver(),
            router=FakeRouter(ok=False, error="handler blew up"),
        )
        pending = await orchestrator.start(await mock.get("mock-007"))
        final = await orchestrator.resume(pending.thread_id, True, "tester")

        assert final["state"] == "failed"
        assert mock._submissions == {}, "nothing is submitted after a failed execution"

    async def test_cost_is_charged_even_when_execution_fails(self, memory_db, settings):
        settings.require_approval = True
        settings.max_effort_hours = 1.0
        settings.cost_safety_margin = 1.0
        mock = MockMarketplaceConnector()
        orchestrator = await Orchestrator.create(
            {"mock": mock}, settings=settings, checkpointer=MemorySaver(),
            router=FakeRouter(ok=False, cost=0.02, error="boom"),
        )
        pending = await orchestrator.start(await mock.get("mock-007"))
        await orchestrator.resume(pending.thread_id, True, "tester")

        with Session(memory_db) as session:
            debits = [r for r in session.exec(select(LedgerRow)).all() if r.kind == "debit"]
        assert debits and debits[0].amount_usd == pytest.approx(0.02)


class TestAuditTrail:
    async def test_every_node_logs_an_event(self, setup, memory_db):
        orchestrator, mock, _ = setup
        pending = await orchestrator.start(await mock.get("mock-007"))
        await orchestrator.resume(pending.thread_id, True, "tester")

        with Session(memory_db) as session:
            nodes = {e.node for e in session.exec(select(EventRow)).all()}
        assert {"score", "risk", "claim_gate", "claim", "execute", "submit", "settle"} <= nodes

    async def test_settlement_is_flagged_simulated_in_the_ledger(self, setup, memory_db):
        orchestrator, mock, _ = setup
        pending = await orchestrator.start(await mock.get("mock-007"))
        await orchestrator.resume(pending.thread_id, True, "tester")

        with Session(memory_db) as session:
            credits = [r for r in session.exec(select(LedgerRow)).all() if r.kind == "credit"]
        assert credits and all(r.simulated for r in credits)
        assert credits[0].amount_usd == pytest.approx(40.0)


class TestAutonomousMode:
    async def test_approval_disabled_runs_straight_through(self, memory_db, settings):
        settings.require_approval = False
        settings.max_effort_hours = 1.0
        settings.cost_safety_margin = 1.0
        mock = MockMarketplaceConnector()
        orchestrator = await Orchestrator.create(
            {"mock": mock}, settings=settings, checkpointer=MemorySaver(), router=FakeRouter(),
        )
        outcome = await orchestrator.start(await mock.get("mock-007"))
        assert not hasattr(outcome, "payload"), "no gate when approval is disabled"
        assert outcome["state"] == "settled"
        assert outcome["approver"] == "auto"


class TestIdempotency:
    async def test_thread_id_is_the_bounty_key(self, setup):
        orchestrator, mock, _ = setup
        bounty = await mock.get("mock-007")
        pending = await orchestrator.start(bounty)
        assert pending.thread_id == bounty.key

    async def test_restarting_a_suspended_bounty_does_not_double_claim(self, setup):
        orchestrator, mock, _ = setup
        bounty = await mock.get("mock-007")
        await orchestrator.start(bounty)
        await orchestrator.start(bounty)      # same thread, still at the gate

        with Session(db.get_engine()) as session:
            tasks = session.exec(select(TaskRow)).all()
        assert len(tasks) == 1, "one task row per bounty, not one per start"
        assert mock._claimed == set()
