"""Streamlit dashboard: opportunity intelligence and offline quality evidence.

Read-mostly over SQLite, plus the one thing that is not read-only: the
approve/reject queue that resumes a LangGraph run suspended at the claim gate.

Everything money-shaped on this page is **simulated** in Week 2 — there is no
wallet module and nothing here signs a transaction.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

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
from arbiter.control_plane import (
    AgentProfile,
    WorkPolicy,
    active_policy,
    active_profile,
    approve_candidate,
    create_candidate,
    init_control_plane_db,
    list_candidates,
    list_opportunities,
    list_packages,
    refresh_opportunities,
    reject_candidate,
    save_policy,
    save_profile,
)
from arbiter.db import init_db, session_scope
from arbiter.evaluation import (
    REVIEW_RECOMMENDATIONS,
    evaluation_metrics,
    grade_evaluation,
    list_evaluations,
)
from arbiter.golden import run_golden_evaluation
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
init_control_plane_db(settings)

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


@st.cache_data(ttl=3)
def load_evaluations() -> pd.DataFrame:
    """Read physically separate offline-evaluation evidence."""
    return pd.DataFrame([row.as_dict() for row in list_evaluations(settings)])


@st.cache_data
def load_golden_metrics() -> dict:
    """Run the versioned corpus locally; this code path is hermetic by design."""
    return asyncio.run(run_golden_evaluation("v1")).as_dict()


def _connectors(markets: list[str]):
    return [CONNECTORS[m]() for m in markets]


def do_control_plane_refresh(markets: list[str], limit: int) -> None:
    """GET-only discovery and governed policy evaluation."""
    from arbiter.evaluation import DiscoveryOnlyConnector

    raw = _connectors(markets)
    connectors = [DiscoveryOnlyConnector(connector) for connector in raw]

    async def _run():
        try:
            return await refresh_opportunities(connectors, limit=limit, settings=settings)
        finally:
            for connector in connectors:
                await connector.aclose()

    rows = asyncio.run(_run())
    st.cache_data.clear()
    st.success(
        f"Refreshed {len(rows)} governed decisions using discovery-only connector access."
    )


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
    "**Agent Arbiter is a capability-aware control plane for the agent labor "
    "market. It normalizes opportunities across task marketplaces, applies an "
    "operator's cost/risk/capability policy, and produces governed, agent-ready "
    "work packages.**"
)

with st.expander("Evidence model — what each number means", expanded=True):
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "category": "Live discovery",
                    "meaning": "Public marketplace task data fetched read-only",
                },
                {
                    "category": "Offline evaluation",
                    "meaning": "Local generation and human grading; never submitted",
                },
                {
                    "category": "Simulated lifecycle",
                    "meaning": "MockMarketplace scan → approval → execution → settlement",
                },
                {
                    "category": "Real marketplace outcome",
                    "meaning": "Zero — no real participation has been authorized",
                },
            ]
        ),
        hide_index=True,
        width="stretch",
    )

guard = RiskGuard(settings)
totals = guard.totals_today()

with st.sidebar:
    st.header("Control plane")
    markets = st.multiselect(
        "Marketplaces", list(CONNECTORS), default=list(CONNECTORS)
    )
    limit = st.slider("Bounties per marketplace", 5, 100, 25, step=5)
    if st.button(
        "Refresh public opportunities",
        type="primary",
        width="stretch",
        disabled=not markets,
    ):
        with st.spinner("GET-only discovery and policy evaluation…"):
            do_control_plane_refresh(markets, limit)

    st.caption("Discovery only. This cannot bid, claim, accept, submit, or settle.")
    st.divider()
    st.caption("**Simulated lifecycle lab**")
    enqueue = st.slider("Send top N to approval queue", 0, 5, 2)
    if st.button("Run simulated scan", width="stretch", disabled=not markets):
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
st.caption(
    "💡 All P&L amounts are **simulated** MockMarketplace settlement. Offline "
    "evaluation cost is a projection, not spend. No wallet exists."
)

queue_rows = pending_tasks()
(
    tab_profile,
    tab_policy,
    tab_opportunities,
    tab_packages,
    tab_worker,
    tab_queue,
    tab_ranked,
    tab_skipped,
    tab_eval,
    tab_tasks,
    tab_cal,
    tab_markets,
    tab_log,
) = st.tabs(
    [
        "Agent Profile",
        "Work Policy",
        "Opportunity Feed",
        "Governed Packages",
        "Worker Artifacts",
        f"⏸ Approval queue ({len(queue_rows)})",
        "Ranked", "Skipped (with reasons)", "Evaluation Review", "Tasks & P&L",
        "Calibration", "Marketplaces", "Audit log",
    ]
)

with tab_profile:
    profile = active_profile(settings)
    st.subheader(f"Active Agent Profile · v{profile.version}")
    st.caption("Saving creates a new immutable version; historical decisions do not change.")
    with st.form("agent-profile-form"):
        name = st.text_input("Agent name", profile.name)
        description = st.text_area("Description", profile.description)
        categories = st.multiselect(
            "Supported categories",
            ["research", "summarization", "data_lookup", "small_code"],
            default=profile.supported_categories,
        )
        tools = st.multiselect(
            "Available tools",
            ["local_text_transform", "structured_planning", "local_json_write"],
            default=profile.allowed_tools,
        )
        max_cost = st.number_input(
            "Maximum projected task execution cost (USD)",
            min_value=0.0,
            value=float(profile.max_execution_cost_usd),
        )
        max_minutes = st.number_input(
            "Maximum execution time (minutes)", min_value=1, value=profile.max_execution_minutes
        )
        always_approval = st.checkbox(
            "Human approval is always required", profile.human_approval_always_required
        )
        if st.form_submit_button("Save new Agent Profile version", type="primary"):
            saved = save_profile(
                AgentProfile(
                    profile_id=profile.profile_id,
                    name=name,
                    description=description,
                    supported_categories=categories,
                    allowed_tools=tools,
                    capabilities=profile.capabilities,
                    prohibited_actions=profile.prohibited_actions,
                    max_execution_cost_usd=max_cost,
                    max_execution_minutes=int(max_minutes),
                    reputation_by_marketplace=profile.reputation_by_marketplace,
                    human_approval_always_required=always_approval,
                ),
                settings,
            )
            st.success(f"Activated Agent Profile v{saved.version}")
            st.rerun()
    st.markdown("**Prohibited actions**")
    st.code(" · ".join(profile.prohibited_actions))
    st.json({"reputation_by_marketplace": profile.reputation_by_marketplace})

with tab_policy:
    policy = active_policy(settings)
    st.subheader(f"Active Work Policy · v{policy.version}")
    st.caption(
        "Expected margin is projected: payout × p_success − projected task execution "
        "cost − projected other cost. It is not earnings or P&L."
    )
    with st.form("work-policy-form"):
        min_payout = st.number_input(
            "Minimum payout (USD)", min_value=0.0, value=float(policy.min_payout_usd)
        )
        min_margin = st.number_input(
            "Minimum projected expected margin (USD)",
            value=float(policy.min_expected_margin_usd),
        )
        min_confidence = st.slider(
            "Minimum confidence", 0.0, 1.0, float(policy.min_confidence), step=0.05
        )
        allowed_markets = st.multiselect(
            "Allowed marketplaces", list(CONNECTORS), default=policy.allowed_marketplaces
        )
        daily_cost = st.number_input(
            "Maximum approved projected daily execution cost (USD)",
            min_value=0.0,
            value=float(policy.max_approved_projected_daily_cost_usd),
        )
        if st.form_submit_button("Save new Work Policy version", type="primary"):
            saved = save_policy(
                WorkPolicy(
                    policy_id=policy.policy_id,
                    min_payout_usd=min_payout,
                    min_expected_margin_usd=min_margin,
                    min_confidence=min_confidence,
                    allowed_marketplaces=allowed_markets,
                    blocked_risk_categories=policy.blocked_risk_categories,
                    max_approved_projected_daily_cost_usd=daily_cost,
                    human_approval=policy.human_approval,
                ),
                settings,
            )
            st.success(f"Activated Work Policy v{saved.version}")
            st.rerun()
    st.info("Projected cost limits do not create ledger entries or represent money spent.")

with tab_opportunities:
    st.subheader("Live + controlled opportunity feed")
    st.caption(
        "Live rows are public GET-only discovery. Mock rows are controlled inputs. "
        "Allow means eligible for a local package—not eligible for marketplace execution."
    )
    opportunities = list_opportunities(settings)
    if not opportunities:
        st.info("No governed decisions yet. Use “Refresh public opportunities”.")
    else:
        frame = pd.DataFrame(
            [
                {
                    "opportunity_id": row["opportunity_id"],
                    "source": row["source_type"],
                    "marketplace": row["marketplace"],
                    "title": row["task"]["title"],
                    "decision": row["package_eligibility"],
                    "reason": row["explanation"],
                    "actual_llm_inference_cost_usd": row[
                        "actual_llm_inference_cost_usd"
                    ],
                    "estimated_task_execution_cost_usd": row[
                        "estimated_task_execution_cost_usd"
                    ],
                    "estimated_other_cost_usd": row["estimated_other_cost_usd"],
                    "expected_margin_usd": row["expected_margin_usd"],
                    "external_execution": row["external_execution_status"],
                }
                for row in opportunities
            ]
        )
        st.dataframe(frame, hide_index=True, width="stretch")
        allowed = [row for row in opportunities if row["package_eligibility"] == "allow"]
        for row in allowed:
            with st.expander(
                f"Create local package candidate · {row['marketplace']} · {row['task']['title']}"
            ):
                st.write(row["explanation"])
                st.caption("This action does not bid, claim, accept, submit, or settle.")
                if st.button("Create local candidate", key=f"candidate-{row['opportunity_id']}"):
                    candidate = create_candidate(row["opportunity_id"], settings)
                    st.success(f"{candidate.candidate_id} · pending local approval")
                    st.rerun()

with tab_packages:
    st.subheader("Governed work packages · local worker only")
    st.caption("Immutable after approval · not_submitted · marketplace action unauthorized")
    candidates = list_candidates(settings)
    pending = [candidate for candidate in candidates if candidate["status"] == "pending"]
    if pending:
        st.markdown("**Pending local approval**")
    for candidate in pending:
        with st.container(border=True):
            st.code(candidate["candidate_id"])
            st.write(candidate["draft_payload"]["decision"]["rationale"])
            left, right = st.columns(2)
            if left.button(
                "Approve for local worker",
                key=f"approve-{candidate['candidate_id']}",
                type="primary",
            ):
                package = approve_candidate(candidate["candidate_id"], settings=settings)
                st.success(f"{package.package_id} materialized · not_submitted")
                st.rerun()
            if right.button("Reject local package", key=f"reject-{candidate['candidate_id']}"):
                reject_candidate(candidate["candidate_id"], "rejected by local operator", settings)
                st.rerun()
    packages = list_packages(settings)
    if not packages:
        st.info("No approved governed packages yet.")
    for package in packages:
        with st.expander(f"{package.package_id} · approved · not_submitted"):
            st.code(package.package_hash)
            st.write(
                f"Actual LLM inference cost: {package.actual_llm_inference_cost_usd} "
                f"({package.actual_llm_cost_status})"
            )
            st.write(
                f"Projected task execution cost: "
                f"${package.estimated_task_execution_cost_usd:.4f}"
            )
            st.write(f"Projected expected margin: ${package.expected_margin_usd:.4f}")
            st.code(f"GET http://127.0.0.1:8765/v1/work-packages/{package.package_id}")
            st.json(package.model_dump(mode="json"))

with tab_worker:
    st.subheader("Local WorkerExecutionArtifact evidence")
    st.caption(
        "Append-only deterministic dry-runs. Never marketplace outcomes, calibration, "
        "settlement, or P&L."
    )
    artifact_dir = Path(settings.worker_artifact_dir)
    artifact_files = (
        sorted(artifact_dir.glob("*.json"), reverse=True) if artifact_dir.exists() else []
    )
    if not artifact_files:
        st.info("No worker artifacts yet.")
    for path in artifact_files:
        try:
            artifact = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        with st.expander(f"{artifact.get('execution_id')} · {artifact.get('state')}"):
            st.write(
                f"external_actions_taken={artifact.get('external_actions_taken')} · "
                f"marketplace_submission_status={artifact.get('marketplace_submission_status')}"
            )
            st.json(artifact)

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
            ranked_display = scored[[
                    "rank", "marketplace", "title", "payout_usd", "score", "expected_margin_usd",
                    "p_success", "feasibility", "confidence", "est_effort_hours",
                    "estimator", "rationale",
                ]]
            st.dataframe(
                ranked_display,
                hide_index=True, width="stretch",
                column_config={
                    "payout_usd": st.column_config.NumberColumn("payout", format="$%.2f"),
                    "expected_margin_usd": st.column_config.NumberColumn(
                        "projected expected margin", format="$%.2f"
                    ),
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

with tab_eval:
    st.subheader("Offline evaluation · never submitted")
    st.caption(
        "Generated artifacts and human grades are local quality evidence—not "
        "acceptance rate, marketplace success, revenue, or P&L."
    )
    golden = load_golden_metrics()
    st.markdown("**Golden safety benchmark · `v1` · fully offline**")
    st.caption(
        "40 synthetic, versioned cases. No marketplace connector, network call, "
        "external model, code execution, or submission path is available."
    )
    g1, g2, g3, g4, g5 = st.columns(5)
    g1.metric("Routing accuracy", f"{golden['routing_accuracy']:.1%}")
    g2.metric("Decision accuracy", f"{golden['decision_accuracy']:.1%}")
    g3.metric("Unsafe false-allow", f"{golden['false_allow_rate_unsafe']:.1%}")
    g4.metric("Safe false-refusal", f"{golden['false_refusal_rate_safe']:.1%}")
    g5.metric("Validation agreement", f"{golden['validation_agreement']:.1%}")
    with st.expander("Golden benchmark breakdown by risk type"):
        st.dataframe(
            pd.DataFrame.from_dict(golden["by_risk_type"], orient="index")
            .reset_index(names="risk type"),
            hide_index=True,
            width="stretch",
        )

    st.divider()
    st.markdown("**Live-discovery offline evaluations · local human review**")
    metrics = evaluation_metrics(settings)
    e1, e2, e3, e4, e5 = st.columns(5)
    e1.metric("Evaluated tasks", metrics["evaluated"])
    e2.metric("Safety refusals", metrics["safety_refusals"])
    e3.metric("Deliverables generated", metrics["deliverables_generated"])
    e4.metric("Validated deliverables", metrics["validated"])
    e5.metric("Human-reviewed", metrics["human_reviewed"])
    e6, e7, e8, e9, e10 = st.columns(5)
    e6.metric(
        "Avg. human quality",
        f"{metrics['average_human_quality']:.2f}/5"
        if metrics["human_reviewed"] else "—",
    )
    e7.metric(
        "Projected task execution cost",
        f"${metrics['estimated_task_execution_cost_usd']:.4f}",
        help="Projected bounded-plan cost only; this is not provider spend or P&L.",
    )
    e8.metric("Avg. latency", f"{metrics['average_latency_ms']:.1f} ms")
    e9.metric("Model used", metrics["model_used"])
    e10.metric("Deterministic fallback", metrics["fallback_used"])

    evaluations = load_evaluations()
    if evaluations.empty:
        st.info(
            "No offline evaluations yet. Run `arbiter evaluate --marketplace "
            "opentask --limit 10`."
        )
    else:
        evaluation_display = evaluations[[
                "id", "evaluation_type", "submission_status", "marketplace",
                "task_identifier", "title", "category", "safety_allowed",
                "safety_kind", "deliverable_state", "validation_passed",
                "provider", "fallback_used", "estimated_api_cost_usd",
                "total_latency_ms", "human_review_status", "human_quality_score",
                "recommendation",
            ]].rename(
                columns={"estimated_api_cost_usd": "estimated_task_execution_cost_usd"}
            )
        st.dataframe(
            evaluation_display,
            hide_index=True,
            width="stretch",
        )

        options = evaluations["id"].astype(int).tolist()
        selected_id = st.selectbox(
            "Select an evaluation to inspect or grade",
            options,
            format_func=lambda value: (
                f"#{value} · "
                f"{evaluations.loc[evaluations['id'] == value, 'title'].iloc[0][:72]}"
            ),
        )
        selected = evaluations[evaluations["id"] == selected_id].iloc[0]
        with st.container(border=True):
            st.markdown(f"**{selected['title']}**")
            st.caption(
                f"`offline_evaluation` · `not_submitted` · {selected['marketplace']} · "
                f"{selected['category']} · provider {selected['provider']}"
            )
            with st.expander("Discovered task text"):
                st.write(selected["task_description"] or "No task description supplied.")
            st.write(f"Capability decision: {selected['capability_reason']}")
            st.write(f"Safety: {selected['safety_reason']}")
            if selected["validation_notes"]:
                st.write(f"Validation: {selected['validation_notes']}")
            with st.expander("Grounding/source metadata"):
                st.json(selected["grounding_metadata"])
            with st.expander("Generated deliverable"):
                st.code(selected["deliverable"] or "No deliverable generated.", language="markdown")

        with st.form("evaluation-review-form"):
            st.markdown("**Human offline quality review (1 = poor, 5 = excellent)**")
            g1, g2, g3 = st.columns(3)
            task_fit = g1.slider("Task fit / feasibility", 1, 5, 3)
            correctness = g2.slider("Correctness", 1, 5, 3)
            grounding = g3.slider("Grounding / source quality", 1, 5, 3)
            g4, g5, g6 = st.columns(3)
            completeness = g4.slider("Completeness", 1, 5, 3)
            safety = g5.slider("Safety", 1, 5, 3)
            quality = g6.slider("Writing / code quality", 1, 5, 3)
            recommendation = st.selectbox("Overall recommendation", REVIEW_RECOMMENDATIONS)
            review_notes = st.text_area("Reviewer notes")
            if st.form_submit_button("Save human review", type="primary"):
                grade_evaluation(
                    int(selected_id),
                    task_fit=task_fit,
                    correctness=correctness,
                    grounding=grounding,
                    completeness=completeness,
                    safety=safety,
                    quality=quality,
                    recommendation=recommendation,
                    notes=review_notes,
                    settings=settings,
                )
                st.cache_data.clear()
                st.success("Saved as human offline quality review—not marketplace success.")
                st.rerun()

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
            st.bar_chart(
                frame.set_index("band")[["predicted", "actual"]],
                stack=False,   # two comparable rates, not parts of a whole
                y_label="probability",
            )

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
        audit_display = decisions.sort_values("created_at", ascending=False)[[
                "created_at", "run_id", "marketplace", "title", "action",
                "score", "expected_margin_usd", "skip_reason", "estimator",
            ]]
        st.dataframe(
            audit_display,
            hide_index=True, width="stretch",
        )
