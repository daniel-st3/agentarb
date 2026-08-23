"""Streamlit dashboard: approval queue, scores, P&L, and the audit log.

Read-mostly over SQLite, plus the one thing that is not read-only: the
approve/reject queue that resumes a LangGraph run suspended at the claim gate.

Everything money-shaped on this page is **simulated** in Week 2 — there is no
wallet module and nothing here signs a transaction.
"""

from __future__ import annotations

import asyncio

import pandas as pd
import streamlit as st
from sqlmodel import select

from arbiter import calibration
from arbiter.config import get_settings
from arbiter.connectors import (
    ExecutionMarketConnector,
    MockMarketplaceConnector,
    OpenTaskConnector,
)
from arbiter.db import init_db, session_scope
from arbiter.logging import configure_logging
from arbiter.models import (
    BountyRow,
    DecisionRow,
    EventRow,
    LedgerRow,
    OutcomeRow,
    ScanRow,
    TaskRow,
)
from arbiter.orchestrator import Orchestrator, pending_tasks
from arbiter.pipeline import run_scan
from arbiter.risk import RiskGuard, next_reset
from arbiter.scoring import top_n_within_budget

st.set_page_config(page_title="Agent Arbiter", page_icon="🧭", layout="wide")

settings = get_settings()
configure_logging(settings.log_level, settings.log_json)
init_db()

CONNECTORS = {
    "opentask": OpenTaskConnector,
    "execution_market": ExecutionMarketConnector,
    "mock": MockMarketplaceConnector,
}


@st.cache_data(ttl=3)
def load(table: str) -> pd.DataFrame:
    models = {
        "bounties": BountyRow, "decisions": DecisionRow, "scans": ScanRow,
        "tasks": TaskRow, "ledger": LedgerRow, "events": EventRow,
        "outcomes": OutcomeRow,
    }
    with session_scope() as session:
        rows = session.exec(select(models[table])).all()
        return pd.DataFrame([r.model_dump() for r in rows])


def _connectors(markets: list[str]):
    return [CONNECTORS[m]() for m in markets]


def do_scan(markets: list[str], limit: int, enqueue: int) -> None:
    """Scan, score, and push the top bounties up to the claim gate."""
    connectors = _connectors(markets)

    async def _run():
        orchestrator = await Orchestrator.create(
            {c.name: c for c in connectors}, settings=settings
        )
        try:
            result = await run_scan(connectors, limit=limit, settings=settings)
            queued = 0
            if enqueue:
                for item in top_n_within_budget(
                    result.scored, settings.daily_budget_usd, n=enqueue
                ):
                    outcome = await orchestrator.start(item.bounty, run_id=result.run_id)
                    queued += int(hasattr(outcome, "payload"))
            return result, queued
        finally:
            await orchestrator.aclose()
            for connector in connectors:
                await connector.aclose()

    result, queued = asyncio.run(_run())
    st.cache_data.clear()
    for name, error in result.errors.items():
        st.warning(f"{name}: {error}")
    st.success(
        f"Scan {result.run_id}: {len(result.scored)} found · "
        f"{len(result.actionable)} actionable · {queued} queued for approval"
    )


def decide(bounty_key: str, approved: bool, reason: str | None = None) -> None:
    """Resume a suspended graph with the human's decision."""
    market = bounty_key.split(":", 1)[0]
    connectors = _connectors([market])

    async def _run():
        orchestrator = await Orchestrator.create(
            {c.name: c for c in connectors}, settings=settings
        )
        try:
            return await orchestrator.resume(bounty_key, approved, "dashboard", reason)
        finally:
            await orchestrator.aclose()
            for connector in connectors:
                await connector.aclose()

    final = asyncio.run(_run())
    st.cache_data.clear()
    if not approved:
        st.info(f"Rejected {bounty_key}")
        return
    settlement = final.get("settlement") or {}
    result = final.get("result") or {}
    st.success(
        f"Approved {bounty_key} → {final.get('state')} · handler "
        f"{result.get('handler')}{' (STUB)' if result.get('stubbed') else ''} · "
        f"settled ${settlement.get('amount_usd', 0)} (simulated)"
    )


# --------------------------------------------------------------------------

st.title("🧭 Agent Arbiter")
st.caption(
    "A router across AI-agent task marketplaces. "
    "**Week 2: human-gated execution on simulated settlement** — no wallet, no real funds."
)

guard = RiskGuard(settings)
totals = guard.totals_today()

with st.sidebar:
    st.header("Scan")
    markets = st.multiselect(
        "Marketplaces", list(CONNECTORS), default=list(CONNECTORS)
    )
    limit = st.slider("Bounties per marketplace", 5, 100, 25, step=5)
    enqueue = st.slider("Send top N to approval queue", 0, 5, 2)
    if st.button("Run scan", type="primary", width="stretch", disabled=not markets):
        with st.spinner("Scanning…"):
            do_scan(markets, limit, enqueue)

    st.divider()
    st.caption("**Risk limits**")
    st.write(f"daily budget · ${settings.daily_budget_usd:.2f}")
    st.write(f"max loss/day · ${settings.max_loss_per_day_usd:.2f}")
    st.write(f"max cost/task · ${settings.max_cost_per_task_usd:.2f}")
    st.write(f"max tasks/day · {settings.max_tasks_per_day}")
    st.write(f"approval gate · {'ON' if settings.require_approval else 'OFF'}")
    st.caption(f"resets {next_reset():%Y-%m-%d %H:%M} UTC")

# --- risk banner ---
budget_left = settings.daily_budget_usd - totals.spent_usd
if guard.tripped:
    st.error(f"⛔ Circuit breaker tripped — claims halted. {guard.tripped_reason}")
elif -totals.net_usd >= settings.max_loss_per_day_usd:
    st.error(f"⛔ Net loss ${-totals.net_usd:.2f} at daily cap — claims will be refused.")
elif budget_left <= 0:
    st.warning(f"⚠️ Daily spend budget exhausted (${settings.daily_budget_usd:.2f}).")

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Spent today", f"${totals.spent_usd:.4f}")
c2.metric("Earned today", f"${totals.earned_usd:.2f}", help="Simulated settlement only")
c3.metric("Net today", f"${totals.net_usd:.2f}")
c4.metric("Budget left", f"${max(0.0, budget_left):.4f}")
c5.metric("Tasks today", totals.tasks)
st.caption("💡 All amounts are **simulated** — MockMarketplace settlement. No wallet exists yet.")

queue_rows = pending_tasks()
tab_queue, tab_ranked, tab_skipped, tab_tasks, tab_cal, tab_markets, tab_log = st.tabs(
    [
        f"⏸ Approval queue ({len(queue_rows)})",
        "Ranked", "Skipped (with reasons)", "Tasks & P&L",
        "Calibration", "Marketplaces", "Audit log",
    ]
)

with tab_queue:
    st.subheader("Bounties waiting at the claim gate")
    st.caption(
        "Each row is a LangGraph run suspended at an `interrupt()`. Nothing is "
        "claimed, executed, or settled until you decide."
    )
    if not queue_rows:
        st.info("Queue is empty. Run a scan with 'Send top N to approval queue' > 0.")
    for row in queue_rows:
        payout = f"${row.payout_usd:.2f}" if row.payout_usd is not None else "?"
        with st.container(border=True):
            left, right = st.columns([4, 1])
            with left:
                st.markdown(f"**{row.title}**")
                st.caption(
                    f"`{row.bounty_key}` · {row.category} · payout {payout} · "
                    f"score {row.score:.2f}"
                )
            with right:
                if st.button("Approve", key=f"a-{row.bounty_key}", type="primary",
                             width="stretch"):
                    with st.spinner("Executing…"):
                        decide(row.bounty_key, True)
                    st.rerun()
                if st.button("Reject", key=f"r-{row.bounty_key}", width="stretch"):
                    decide(row.bounty_key, False, "rejected from dashboard")
                    st.rerun()

decisions = load("decisions")
scans = load("scans")

with tab_ranked:
    if decisions.empty:
        st.info("No scans yet.")
    else:
        latest = scans.sort_values("started_at", ascending=False).iloc[0]
        current = decisions[decisions["run_id"] == latest["run_id"]]
        scored = current[current["action"] == "scored"].sort_values("score", ascending=False)
        st.subheader("Ranked by score")
        st.caption(f"Run `{latest['run_id']}` · {latest['started_at']} · {latest['marketplaces']}")
        if scored.empty:
            st.info("Nothing cleared the filters in this run.")
        else:
            st.dataframe(
                scored[[
                    "rank", "marketplace", "title", "payout_usd", "score", "net_ev_usd",
                    "p_success", "feasibility", "confidence", "est_effort_hours",
                    "estimator", "rationale",
                ]],
                hide_index=True, width="stretch",
                column_config={
                    "payout_usd": st.column_config.NumberColumn("payout", format="$%.2f"),
                    "net_ev_usd": st.column_config.NumberColumn("net EV", format="$%.2f"),
                    "score": st.column_config.NumberColumn("score", format="%.2f"),
                },
            )

with tab_skipped:
    st.subheader("Why bounties were skipped")
    st.caption("The judgment is the product — the skip reason matters as much as the ranking.")
    if decisions.empty:
        st.info("No scans yet.")
    else:
        skipped = decisions[decisions["action"] == "skipped"]
        st.dataframe(
            skipped[["marketplace", "title", "payout_usd", "skip_reason"]],
            hide_index=True, width="stretch",
        )

with tab_tasks:
    tasks = load("tasks")
    ledger = load("ledger")
    st.subheader("Task outcomes")
    if tasks.empty:
        st.info("No tasks yet.")
    else:
        st.dataframe(
            tasks.sort_values("updated_at", ascending=False)[[
                "bounty_key", "title", "state", "deliverable_state", "approved",
                "approved_by", "handler", "payout_usd", "actual_cost_usd",
                "settled_amount_usd", "simulated", "validation_notes",
            ]],
            hide_index=True, width="stretch",
        )
        st.bar_chart(tasks["state"].value_counts())
    st.subheader("Ledger (all simulated)")
    if ledger.empty:
        st.info("No ledger entries yet.")
    else:
        st.dataframe(
            ledger.sort_values("created_at", ascending=False)[
                ["created_at", "bounty_key", "kind", "amount_usd", "reason", "simulated"]
            ],
            hide_index=True, width="stretch",
        )

with tab_cal:
    st.subheader("Is the scorer actually right?")
    only_real = st.toggle(
        "Exclude simulated (mock) outcomes", value=False,
        help="Mock settlements always succeed, so they flatter the scorer. "
             "Toggle on to see evidence from real marketplaces only.",
    )
    scope = False if only_real else None
    summary = calibration.overall(simulated=scope)

    if summary.n == 0:
        st.info(
            "No outcomes recorded yet."
            + (" No real-marketplace outcomes exist — every paid action so far is "
               "simulated." if only_real else " Approve a bounty to generate one.")
        )
    else:
        k1, k2, k3, k4, k5 = st.columns(5)
        k1.metric("Outcomes", summary.n)
        k2.metric(
            "Acceptance rate",
            f"{summary.acceptance_rate:.0%}" if summary.acceptance_rate is not None else "—",
        )
        k3.metric("Brier score", f"{summary.brier:.3f}", help="Lower is better; 0 is perfect.")
        k4.metric(
            "Bias", f"{summary.bias:+.3f}",
            help="Predicted minus actual. Positive = over-confident.",
        )
        k5.metric("Net (sim.)", f"${summary.net_usd:.2f}")
        st.caption(f"Verdict: **{summary.verdict}**")

        if summary.buckets:
            st.markdown("**Reliability — predicted vs. actual by confidence band**")
            frame = pd.DataFrame(
                [
                    {
                        "band": b.label, "n": b.n,
                        "predicted": round(b.predicted_mean, 3),
                        "actual": round(b.actual_rate, 3),
                        "gap (over-confidence)": round(b.gap, 3),
                    }
                    for b in summary.buckets
                ]
            )
            st.dataframe(frame, hide_index=True, width="stretch")
            st.bar_chart(frame.set_index("band")[["predicted", "actual"]])

        st.markdown("**By category**")
        rows = [
            {
                "category": name, "n": c.n,
                "acceptance": (f"{c.acceptance_rate:.0%}" if c.acceptance_rate is not None
                               else "—"),
                "brier": None if c.brier is None else round(c.brier, 3),
                "bias": None if c.bias is None else round(c.bias, 3),
                "verdict": c.verdict,
                "net_usd": round(c.net_usd, 2),
            }
            for name, c in calibration.by_category(simulated=scope).items()
        ]
        if rows:
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")

        st.markdown("**By marketplace**")
        rows = [
            {
                "marketplace": name, "n": c.n,
                "acceptance": (f"{c.acceptance_rate:.0%}" if c.acceptance_rate is not None
                               else "—"),
                "brier": None if c.brier is None else round(c.brier, 3),
                "cost_usd": round(c.total_cost_usd, 4),
                "payout_usd": round(c.total_payout_usd, 2),
                "net_usd": round(c.net_usd, 2),
            }
            for name, c in calibration.by_marketplace(simulated=scope).items()
        ]
        if rows:
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")

        st.caption(
            f"Mean cost error {summary.cost_error:+.4f} USD "
            "(actual minus predicted, per task)."
            if summary.cost_error is not None else ""
        )

    outcomes = load("outcomes")
    if not outcomes.empty:
        st.markdown("**Raw outcomes**")
        st.dataframe(
            outcomes.sort_values("created_at", ascending=False)[[
                "created_at", "bounty_key", "marketplace", "category",
                "predicted_p_success", "accepted", "deliverable_state",
                "actual_cost_usd", "actual_payout_usd", "simulated",
            ]],
            hide_index=True, width="stretch",
        )

with tab_markets:
    st.subheader("Marketplace capabilities, as declared by each connector")
    st.caption(
        "The router's whole point: these markets are incompatible, and the "
        "connectors say so rather than pretending otherwise."
    )
    caps = []
    for name, cls in CONNECTORS.items():
        c = cls.capabilities
        caps.append({
            "marketplace": name,
            "open claim": "yes" if c.supports_open_claim else "no",
            "claim model": c.claim_model.value,
            "settlement": c.settlement.value,
            "accept gate": "yes" if c.has_human_accept_gate else "no",
            "autonomous settle": "yes" if c.supports_autonomous_settle else "no",
        })
    st.dataframe(pd.DataFrame(caps), hide_index=True, width="stretch")
    for name, cls in CONNECTORS.items():
        with st.expander(f"{name} — why"):
            st.write(cls.capabilities.notes)
    st.info(
        "**Only MockMarketplace can close a paid loop today.** OpenTask settles "
        "off-platform and is bid-based; execution.market has real escrow but on "
        "mainnet only. Both are discovery + scoring sources."
    )

with tab_log:
    st.subheader("Orchestrator events")
    st.caption("Every node transition, append-only. This plus the decision log is the audit trail.")
    events = load("events")
    if events.empty:
        st.info("No events yet.")
    else:
        st.dataframe(
            events.sort_values("created_at", ascending=False)[
                ["created_at", "run_id", "node", "bounty_key", "message"]
            ],
            hide_index=True, width="stretch",
        )
    st.subheader("Decision log")
    if not decisions.empty:
        st.dataframe(
            decisions.sort_values("created_at", ascending=False)[[
                "created_at", "run_id", "marketplace", "title", "action",
                "score", "net_ev_usd", "skip_reason", "estimator",
            ]],
            hide_index=True, width="stretch",
        )
