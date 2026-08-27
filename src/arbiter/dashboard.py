"""Editorial Streamlit UI. Public GET discovery; local governance; no external actions."""

# ruff: noqa: E501, E402 -- hosted routing precedes local-only persistence imports.

from __future__ import annotations

import asyncio
import html
import json
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from arbiter.config import get_settings

# Stop before importing or initializing the local persistence/worker surfaces.
if get_settings().hosted_mode:
    from arbiter.sandbox_ui import render_hosted

    render_hosted()
    st.stop()

from sqlmodel import select

from arbiter import calibration
from arbiter.connectors import (
    ExecutionMarketConnector,
    MockMarketplaceConnector,
    OpenTaskConnector,
)
from arbiter.control_plane import (
    AgentProfile,
    WorkPolicy,
    active_policy,
    active_policy_metadata,
    active_profile,
    active_profile_metadata,
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
    DiscoveryOnlyConnector,
    evaluation_metrics,
    grade_evaluation,
    list_evaluations,
)
from arbiter.golden import run_golden_evaluation
from arbiter.llm import HeuristicEstimator
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
from arbiter.risk import RiskGuard
from arbiter.scoring import top_n_within_budget

st.set_page_config(page_title="Agent Arbiter — Governed Work Routing", page_icon="A", layout="wide")
settings = get_settings()
configure_logging(settings.log_level, settings.log_json)
init_db()
init_control_plane_db(settings)

CONNECTORS = {
    "opentask": OpenTaskConnector,
    "execution_market": ExecutionMarketConnector,
    "mock": MockMarketplaceConnector,
}
NAV_ITEMS = [
    "Overview",
    "Opportunity Feed",
    "Agent Profile",
    "Work Policy",
    "Package Approval",
    "Approved Packages",
    "Worker Artifacts",
    "Evidence & Simulation",
]


def safe(value: Any) -> str:
    return html.escape("—" if value is None or value == "" else str(value))


def money(value: float | None, digits: int = 2) -> str:
    return "—" if value is None else f"${value:,.{digits}f}"


def markup(value: str) -> None:
    st.markdown(value, unsafe_allow_html=True)


def badge(label: str, kind: str = "neutral") -> str:
    return f'<span class="aa-status {safe(kind)}">{safe(label)}</span>'


def page_header(eyebrow: str, title: str, copy: str) -> None:
    markup(
        f'<header class="aa-page-head"><div class="aa-eyebrow">{safe(eyebrow)}</div>'
        f"<h1>{safe(title)}</h1><p>{safe(copy)}</p></header>"
    )


def section(kicker: str, title: str, note: str = "") -> None:
    markup(
        '<div class="aa-section-head"><div>'
        f'<div class="aa-section-kicker">{safe(kicker)}</div>'
        f'<div class="aa-section-title">{safe(title)}</div></div>'
        f'<div class="aa-section-note">{safe(note)}</div></div>'
    )


def metric_grid(metrics: list[tuple[str, str, str]]) -> None:
    cards = "".join(
        '<div class="aa-metric">'
        f'<div class="aa-metric-label">{safe(label)}</div>'
        f'<div class="aa-metric-value">{safe(value)}</div>'
        f'<div class="aa-metric-note">{safe(note)}</div></div>'
        for label, value, note in metrics
    )
    markup(f'<div class="aa-metric-grid">{cards}</div>')


def kv(items: list[tuple[str, Any]]) -> None:
    cells = "".join(
        f'<div class="aa-kv"><span>{safe(label)}</span><strong>{safe(value)}</strong></div>'
        for label, value in items
    )
    markup(f'<div class="aa-kv-grid">{cells}</div>')


def numbered(items: list[str]) -> None:
    rows = "".join(
        f'<li><span class="aa-list-index">{index:02d}</span>{safe(item)}</li>'
        for index, item in enumerate(items, 1)
    )
    markup(f'<ol class="aa-list">{rows}</ol>')


def boundary(title: str, detail: str) -> None:
    markup(
        f'<div class="aa-boundary"><strong>{safe(title)}</strong><span>{safe(detail)}</span></div>'
    )


def cards(items: list[tuple[str, str, str]]) -> None:
    content = "".join(
        '<div class="aa-card">'
        f'<div class="aa-card-label">{safe(label)}</div>'
        f'<div class="aa-card-value">{safe(value)}</div>'
        f'<div class="aa-card-copy">{safe(copy)}</div></div>'
        for label, value, copy in items
    )
    markup(f'<div class="aa-card-grid">{content}</div>')


@st.cache_data(ttl=3)
def load(table: str) -> pd.DataFrame:
    models = {
        "bounties": BountyRow,
        "decisions": DecisionRow,
        "scans": ScanRow,
        "tasks": TaskRow,
        "ledger": LedgerRow,
        "events": EventRow,
        "outcomes": OutcomeRow,
    }
    with session_scope() as session:
        rows = session.exec(select(models[table])).all()
        return pd.DataFrame([row.model_dump() for row in rows])


@st.cache_data(ttl=3)
def load_evaluations() -> pd.DataFrame:
    return pd.DataFrame([row.as_dict() for row in list_evaluations(settings)])


@st.cache_data
def load_golden_metrics() -> dict[str, Any]:
    return asyncio.run(run_golden_evaluation("v1")).as_dict()


def artifact_records() -> list[dict[str, Any]]:
    directory = Path(settings.worker_artifact_dir)
    if not directory.exists():
        return []
    records = []
    for path in sorted(directory.glob("*.json"), reverse=True):
        try:
            records.append(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            continue
    return records


def do_control_plane_refresh(markets: list[str], limit: int) -> None:
    """Source failures degrade independently; no marketplace write surface is available."""
    statuses = {}
    total = 0
    for market in markets:
        connector = DiscoveryOnlyConnector(CONNECTORS[market]())

        async def run_one(connector=connector):
            try:
                return await refresh_opportunities(
                    [connector],
                    limit=limit,
                    settings=settings,
                    estimator=HeuristicEstimator() if settings.hosted_mode else None,
                )
            finally:
                await connector.aclose()

        try:
            rows = asyncio.run(run_one())
            total += len(rows)
            statuses[market] = {"state": "available", "count": len(rows)}
        except Exception as exc:
            # Never render exception bodies: they may contain request details.
            statuses[market] = {"state": "unavailable", "count": 0, "type": type(exc).__name__}
    st.session_state["connector_status"] = statuses
    st.cache_data.clear()
    if total:
        st.success(f"Stored {total} governed decisions from public GET-only discovery.")
    unavailable = [name for name, row in statuses.items() if row["state"] == "unavailable"]
    if unavailable:
        st.warning(
            "Public discovery temporarily unavailable: "
            + ", ".join(unavailable)
            + ". Stored control-plane evidence remains available."
        )


def do_simulated_scan(limit: int, enqueue: int) -> None:
    connector = MockMarketplaceConnector()

    async def run():
        orchestrator = await Orchestrator.create({"mock": connector}, settings=settings)
        try:
            result = await run_scan([connector], limit=limit, settings=settings)
            for item in top_n_within_budget(result.scored, settings.daily_budget_usd, n=enqueue):
                await orchestrator.start(item.bounty, run_id=result.run_id)
        finally:
            await orchestrator.aclose()
            await connector.aclose()

    asyncio.run(run())
    st.cache_data.clear()


def decide_simulation(bounty_key: str, approved: bool) -> None:
    if not bounty_key.startswith("mock:"):
        raise ValueError("dashboard lifecycle actions are MockMarketplace-only")
    connector = MockMarketplaceConnector()

    async def run():
        orchestrator = await Orchestrator.create({"mock": connector}, settings=settings)
        try:
            await orchestrator.resume(
                bounty_key, approved, "local-simulation", None if approved else "local rejection"
            )
        finally:
            await orchestrator.aclose()
            await connector.aclose()

    asyncio.run(run())
    st.cache_data.clear()


def render_overview() -> None:
    opportunities = list_opportunities(settings)
    candidates = list_candidates(settings)
    packages = list_packages(settings)
    live = sum(row["source_type"] == "live_discovery" for row in opportunities)
    allowed = sum(row["package_eligibility"] == "allow" for row in opportunities)
    pending = sum(row["status"] == "pending" for row in candidates)
    markup(
        '<section class="aa-hero"><div class="aa-eyebrow">AGENT ARBITER / CONTROL PLANE</div>'
        "<h1>Governed work routing for the agent economy.</h1>"
        '<div class="aa-hero-copy">Normalizes marketplace opportunities, applies operator '
        "cost, risk, and capability policy, then publishes immutable work packages for "
        'bounded local workers.</div><div class="aa-proof">Live discovery only. '
        "No marketplace actions or payments are enabled.</div></section>"
    )
    metric_grid(
        [
            ("Live opportunities discovered", str(live), "Public GET sources"),
            ("Allowed for local package", str(allowed), "Policy eligibility only"),
            ("Pending local approval", str(pending), "Human gate remains active"),
            ("Real marketplace outcomes", "0", "No participation authorized"),
        ]
    )
    section(
        "System path",
        "From marketplace signal to bounded local work",
        "Every step narrows authority.",
    )
    flow = "".join(
        f'<div class="aa-flow-step"><div class="aa-flow-index">0{i}</div>'
        f'<div class="aa-flow-name">{name}</div></div>'
        for i, name in enumerate(
            ["Discover", "Normalize", "Govern", "Approve", "Package", "Local worker"], 1
        )
    )
    markup(f'<div class="aa-flow">{flow}</div><div style="height:2.8rem"></div>')
    section(
        "Evidence model",
        "Four meanings. No category drift.",
        "Projected value is never realized value.",
    )
    markup(
        '<div class="aa-evidence-grid">'
        '<div class="aa-evidence live"><strong>Live discovery</strong><span>Public marketplace data fetched through GET-only connectors.</span></div>'
        '<div class="aa-evidence offline"><strong>Offline evaluation</strong><span>Local generation and human grading. Never submitted.</span></div>'
        '<div class="aa-evidence simulated"><strong>Controlled simulation</strong><span>Mock lifecycle and simulated P&amp;L in an isolated lab.</span></div>'
        '<div class="aa-evidence real"><strong>Real outcomes</strong><span>Zero. No marketplace participation authorized.</span></div>'
        '</div><div style="height:2.8rem"></div>'
    )
    profile, policy = active_profile(settings), active_policy(settings)
    section("Active governance", "The policy envelope in force")
    cards(
        [
            (
                "Agent profile",
                f"{profile.name} · v{profile.version}",
                f"{len(profile.supported_categories)} categories · bounded local tools",
            ),
            (
                "Work policy",
                f"Policy v{policy.version}",
                f"{policy.min_confidence:.0%} confidence minimum · {money(policy.min_payout_usd)} floor",
            ),
            (
                "Governed packages",
                str(len(packages)),
                "Immutable · not submitted · marketplace actions disabled",
            ),
        ]
    )


def render_opportunity_feed() -> None:
    page_header(
        "DISCOVERY / GOVERNANCE",
        "Opportunity feed",
        "A read-only terminal for normalized work, exact eligibility decisions, and operator-policy rationale.",
    )
    boundary(
        "EXTERNAL EXECUTION: DISCOVERY ONLY",
        "Allow authorizes a local candidate—not a bid, claim, acceptance, or submission.",
    )
    with st.expander("Refresh public discovery"):
        markets = st.multiselect("GET-only sources", list(CONNECTORS), default=list(CONNECTORS))
        limit = st.slider("Maximum tasks per source", 1, 25, 10)
        if st.button("Refresh governed opportunities", type="primary", disabled=not markets):
            with st.spinner("Fetching public listings and applying local policy…"):
                do_control_plane_refresh(markets, limit)
    opportunities = list_opportunities(settings)
    statuses = st.session_state.get("connector_status", {})
    source_cards = []
    for market in CONNECTORS:
        count = sum(row["marketplace"] == market for row in opportunities)
        label = "CONTROLLED MOCK" if market == "mock" else "LIVE DISCOVERY"
        if statuses.get(market, {}).get("state") == "unavailable":
            detail = "Temporarily unavailable; stored evidence retained"
        elif count:
            detail = f"{count} normalized opportunities in local evidence"
        elif market == "execution_market":
            detail = "No public tasks currently available; connector remains GET-only"
        else:
            detail = "No stored opportunities; public refresh requires no credentials"
        source_cards.append((label, market.replace("_", "."), detail))
    cards(source_cards)
    section(
        "Normalized terminal",
        "Current policy decisions",
        "Actual inference and projected execution remain separate.",
    )
    if not opportunities:
        st.info(
            "No stored governed opportunities. Refresh public discovery; source outages do not prevent local UI use."
        )
        return
    frame = pd.DataFrame(
        [
            {
                "Source": "CONTROLLED MOCK"
                if row["source_type"] == "controlled_mock"
                else "LIVE DISCOVERY",
                "Marketplace": row["marketplace"],
                "Opportunity": row["task"]["title"],
                "Decision": row["package_eligibility"].title(),
                "Payout": row["task"].get("payout_usd"),
                "Confidence": row["confidence"],
                "Projected execution cost": row["estimated_task_execution_cost_usd"],
                "Projected expected margin": row["expected_margin_usd"],
                "Execution boundary": row["external_execution_status"],
            }
            for row in opportunities
        ]
    )
    st.dataframe(
        frame,
        hide_index=True,
        width="stretch",
        column_config={
            "Payout": st.column_config.NumberColumn(format="$%.2f"),
            "Confidence": st.column_config.ProgressColumn(min_value=0, max_value=1),
            "Projected execution cost": st.column_config.NumberColumn(format="$%.4f"),
            "Projected expected margin": st.column_config.NumberColumn(format="$%.2f"),
        },
    )
    labels = {
        row["opportunity_id"]: f"{row['marketplace']} / {row['task']['title']}"
        for row in opportunities
    }
    selected_id = st.selectbox("Inspect opportunity", list(labels), format_func=labels.get)
    row = next(item for item in opportunities if item["opportunity_id"] == selected_id)
    source = "CONTROLLED MOCK" if row["source_type"] == "controlled_mock" else "LIVE DISCOVERY"
    status, metadata = row["package_eligibility"], row["source_metadata"]
    with st.container(border=True):
        markup(
            f'<div class="aa-contract-header"><div><div class="aa-eyebrow">{source}</div>'
            f'<h2>{safe(row["task"]["title"])}</h2><div class="aa-contract-id">{safe(selected_id)}</div>'
            f"</div>{badge(status, status)}</div>"
        )
        kv(
            [
                ("Payout", money(row["task"].get("payout_usd"))),
                ("Confidence", f"{row['confidence']:.0%}"),
                ("Required reputation", metadata.get("required_reputation") or "None declared"),
                (
                    "Claim / settlement",
                    f"{metadata.get('claim_model')} / {metadata.get('settlement')}",
                ),
                ("Actual LLM inference cost", money(row["actual_llm_inference_cost_usd"], 6)),
                (
                    "Projected task execution cost",
                    money(row["estimated_task_execution_cost_usd"], 4),
                ),
                ("Projected other cost", money(row["estimated_other_cost_usd"], 4)),
                ("Projected expected margin", money(row["expected_margin_usd"])),
            ]
        )
        section("Exact decision reason", row["explanation"])
        st.caption("external_execution_status: discovery_only")
        with st.expander("Source constraints and task specification"):
            st.write(row["task"].get("description", ""))
            st.write(metadata.get("settlement_constraints", ""))
        if status == "allow" and st.button(
            "Create local package candidate", type="primary", disabled=settings.hosted_mode
        ):
            candidate = create_candidate(selected_id, settings)
            st.success(f"{candidate.candidate_id} is pending local human approval.")


def render_agent_profile() -> None:
    profile, metadata = active_profile(settings), active_profile_metadata(settings)
    page_header(
        "OPERATOR CONFIGURATION",
        "Agent profile",
        "The immutable capability declaration used to decide what a local worker may receive.",
    )
    boundary(
        f"ACTIVE VERSION {profile.version}",
        f"Effective {metadata['created_at'][:10]} · saving creates a new immutable version.",
    )
    kv(
        [
            ("Profile ID", profile.profile_id),
            ("Status", "Active"),
            ("Maximum execution cost", money(profile.max_execution_cost_usd)),
            ("Maximum duration", f"{profile.max_execution_minutes} minutes"),
        ]
    )
    with st.form("agent-profile-form"):
        section("Identity", "Worker identity and scope")
        left, right = st.columns([1, 1.4])
        name = left.text_input("Agent name", profile.name)
        description = right.text_area("Description", profile.description)
        section("Capability", "Permitted work envelope")
        categories = st.multiselect(
            "Supported task categories",
            ["research", "summarization", "data_lookup", "small_code"],
            default=profile.supported_categories,
        )
        tools = st.multiselect(
            "Available local tools",
            ["local_text_transform", "structured_planning", "local_json_write"],
            default=profile.allowed_tools,
        )
        c1, c2 = st.columns(2)
        cost = c1.number_input(
            "Maximum projected task execution cost (USD)",
            min_value=0.0,
            value=float(profile.max_execution_cost_usd),
        )
        minutes = c2.number_input(
            "Maximum execution time (minutes)", min_value=1, value=profile.max_execution_minutes
        )
        approval = st.checkbox(
            "Human approval is always required", profile.human_approval_always_required
        )
        if st.form_submit_button(
            "Save as new profile version", type="primary", disabled=settings.hosted_mode
        ):
            save_profile(
                AgentProfile(
                    **{
                        **profile.model_dump(),
                        "name": name,
                        "description": description,
                        "supported_categories": categories,
                        "allowed_tools": tools,
                        "max_execution_cost_usd": cost,
                        "max_execution_minutes": int(minutes),
                        "human_approval_always_required": approval,
                    }
                ),
                settings,
            )
            st.rerun()
    section("Hard boundaries", "Prohibited actions", "Enforced before estimation.")
    numbered([item.replace("_", " ") for item in profile.prohibited_actions])
    with st.expander("Capability and reputation detail"):
        kv(
            [("Capabilities", ", ".join(profile.capabilities))]
            + list(profile.reputation_by_marketplace.items())
        )


def render_work_policy() -> None:
    policy, metadata = active_policy(settings), active_policy_metadata(settings)
    page_header(
        "OPERATOR CONFIGURATION",
        "Work policy",
        "Economic thresholds, marketplace scope, risk exclusions, and approval rules for local package eligibility.",
    )
    boundary(
        f"ACTIVE VERSION {policy.version}",
        f"Effective {metadata['created_at'][:10]} · historical decisions retain their version reference.",
    )
    markup(
        '<div class="aa-hosted-note"><strong>Projected expected margin</strong> = payout × '
        "p_success − estimated task execution cost − estimated other cost. Never realized earnings or P&amp;L.</div>"
    )
    with st.form("work-policy-form"):
        section("Economics", "Projected value thresholds")
        c1, c2, c3 = st.columns(3)
        payout = c1.number_input(
            "Minimum payout (USD)", min_value=0.0, value=float(policy.min_payout_usd)
        )
        margin = c2.number_input(
            "Minimum projected expected margin (USD)", value=float(policy.min_expected_margin_usd)
        )
        confidence = c3.slider(
            "Minimum confidence", 0.0, 1.0, float(policy.min_confidence), step=0.05
        )
        daily = st.number_input(
            "Maximum approved projected daily execution cost (USD)",
            min_value=0.0,
            value=float(policy.max_approved_projected_daily_cost_usd),
        )
        section("Scope", "Marketplace and approval policy")
        markets = st.multiselect(
            "Allowed discovery marketplaces", list(CONNECTORS), default=policy.allowed_marketplaces
        )
        st.checkbox(
            "Human approval required by default",
            value=policy.human_approval.default_required,
            disabled=True,
        )
        if st.form_submit_button(
            "Save as new work policy version", type="primary", disabled=settings.hosted_mode
        ):
            save_policy(
                WorkPolicy(
                    **{
                        **policy.model_dump(),
                        "min_payout_usd": payout,
                        "min_expected_margin_usd": margin,
                        "min_confidence": confidence,
                        "allowed_marketplaces": markets,
                        "max_approved_projected_daily_cost_usd": daily,
                    }
                ),
                settings,
            )
            st.rerun()
    section("Risk policy", "Blocked categories", "A match is refused, not merely deprioritized.")
    numbered([item.replace("_", " ") for item in policy.blocked_risk_categories])


def render_package_approval() -> None:
    pending = [row for row in list_candidates(settings) if row["status"] == "pending"]
    page_header(
        "HUMAN GATE",
        "Package approval",
        "Review locally eligible candidates before materializing the immutable Arbiter-to-worker contract.",
    )
    boundary(
        "LOCAL APPROVAL ONLY",
        "Approval creates a governed package. It never interacts with a marketplace.",
    )
    if not pending:
        st.info(
            "No candidates await approval. Promote an allowed opportunity from the feed to create one."
        )
    for candidate in pending:
        draft = candidate["draft_payload"]
        with st.container(border=True):
            markup(
                f'<div class="aa-contract-header"><div><div class="aa-eyebrow">PENDING CONTRACT</div>'
                f'<h2>{safe(draft["task"]["title"])}</h2><div class="aa-contract-id">{safe(candidate["candidate_id"])}</div>'
                f"</div>{badge('Pending', 'pending')}</div>"
            )
            kv(
                [
                    ("Marketplace", draft["source"]["marketplace"]),
                    ("Profile", f"v{draft['agent_profile']['version']}"),
                    ("Policy", f"v{draft['work_policy']['version']}"),
                    ("Projected expected margin", money(draft["expected_margin_usd"])),
                ]
            )
            st.write(draft["decision"]["rationale"])
            left, right = st.columns(2)
            if left.button(
                "Approve for local worker",
                key=f"approve-{candidate['candidate_id']}",
                type="primary",
                disabled=settings.hosted_mode,
            ):
                approve_candidate(candidate["candidate_id"], settings=settings)
                st.rerun()
            if right.button(
                "Reject candidate",
                key=f"reject-{candidate['candidate_id']}",
                disabled=settings.hosted_mode,
            ):
                reject_candidate(candidate["candidate_id"], "rejected by local operator", settings)
                st.rerun()


def render_approved_packages() -> None:
    packages = list_packages(settings)
    page_header(
        "CANONICAL CONTRACT",
        "Approved packages",
        "Immutable, hash-verifiable work contracts for the bounded local worker—not marketplace submissions.",
    )
    if not packages:
        st.info("No governed packages have been approved locally.")
        return
    labels = {item.package_id: f"{item.package_id} / {item.task['title']}" for item in packages}
    selected = st.selectbox("Select governed package", list(labels), format_func=labels.get)
    package = next(item for item in packages if item.package_id == selected)
    with st.container(border=True):
        markup(
            f'<div class="aa-contract-header"><div><div class="aa-eyebrow">GOVERNED WORK PACKAGE / SCHEMA {safe(package.schema_version)}</div>'
            f'<h2>{safe(package.task["title"])}</h2><div class="aa-contract-id">{safe(package.package_id)}</div></div>'
            f"{badge('Approved for local worker', 'approved')}</div>"
        )
        boundary(
            "NOT SUBMITTED / MARKETPLACE ACTIONS DISABLED", "marketplace_action_authorized = false"
        )
        markup(
            f'<div class="aa-card-label">Canonical SHA-256 package hash</div><div class="aa-hash">{safe(package.package_hash)}</div>'
        )
        kv(
            [
                ("Status", package.status),
                ("Submission status", package.submission_status),
                (
                    "Profile version",
                    f"{package.agent_profile['id']} v{package.agent_profile['version']}",
                ),
                (
                    "Policy version",
                    f"{package.work_policy['id']} v{package.work_policy['version']}",
                ),
                ("Approved by", package.approval.get("approved_by")),
                ("Approval timestamp", package.approval.get("approved_at")),
                ("Source marketplace", package.source.get("marketplace")),
                ("External execution", package.decision.get("external_execution_status")),
            ]
        )
        section("Decision", "Policy rationale")
        st.write(package.decision.get("rationale"))
        section("Execution contract", "Deterministic task plan")
        numbered([step.get("operation", "unknown").replace("_", " ") for step in package.task_plan])
        section("Validation", "Required criteria")
        numbered(
            [item.get("id", "criterion").replace("_", " ") for item in package.validation_criteria]
        )
        section("Authority", "Tools and prohibited actions")
        kv(
            [
                ("Allowed tools", ", ".join(package.safety_constraints["allowed_tools"])),
                ("Network scope", package.safety_constraints["network_scope"]),
            ]
        )
        with st.expander("Prohibited action register"):
            numbered(
                [
                    item.replace("_", " ")
                    for item in package.safety_constraints["prohibited_actions"]
                ]
            )
        section("Accounting", "Observed and projected costs")
        kv(
            [
                ("Actual LLM inference cost", money(package.actual_llm_inference_cost_usd, 6)),
                ("Actual LLM cost status", package.actual_llm_cost_status),
                (
                    "Projected task execution cost",
                    money(package.estimated_task_execution_cost_usd, 4),
                ),
                ("Projected other cost", money(package.estimated_other_cost_usd, 4)),
                ("Projected expected margin", money(package.expected_margin_usd)),
                ("Simulated P&L", "Not part of this contract"),
            ]
        )
    with st.expander("Technical access / canonical JSON"):
        if settings.hosted_mode:
            st.info(
                "The localhost REST API and worker demo remain local-only and are not exposed by the hosted app."
            )
        else:
            st.code(f"GET http://127.0.0.1:8765/v1/work-packages/{package.package_id}")
        st.json(package.model_dump(mode="json"))


def render_worker_artifacts() -> None:
    artifacts = artifact_records()
    page_header(
        "LOCAL EXECUTION EVIDENCE",
        "Worker artifacts",
        "Append-only receipts proving package verification, bounded dry-run behavior, and zero external action.",
    )
    if settings.hosted_mode:
        st.info(
            "Hosted artifact storage is ephemeral. The REST API and worker demo remain local-only."
        )
    if not artifacts:
        st.info(
            "No local WorkerExecutionArtifact is present. Ephemeral hosted storage is not durable evidence."
        )
        return
    labels = {
        item["execution_id"]: f"{item['execution_id']} / {item['state']}" for item in artifacts
    }
    selected = st.selectbox("Select worker receipt", list(labels), format_func=labels.get)
    artifact = next(item for item in artifacts if item["execution_id"] == selected)
    state = artifact.get("state", "refused")
    verified, validated = (
        artifact.get("verification_results", []),
        artifact.get("validation_results", []),
    )
    with st.container(border=True):
        markup(
            f'<div class="aa-receipt-head"><div><div class="aa-eyebrow">WORKER EXECUTION ARTIFACT / {safe(artifact.get("artifact_schema_version"))}</div>'
            f'<div class="aa-receipt-title">{safe(selected)}</div><div class="aa-contract-id">Package {safe(artifact.get("package_id"))}</div></div>'
            f"{badge(state.replace('_', ' '), 'validated' if state == 'validated_local_artifact' else 'refused')}</div>"
        )
        hash_ok = any(
            item.get("check") == "package_hash" and item.get("passed") for item in verified
        )
        kv(
            [
                ("Package hash verified", "Yes" if hash_ok else "No"),
                (
                    "Local dry-run",
                    "Completed" if state == "validated_local_artifact" else "Refused",
                ),
                (
                    "Validation outcome",
                    "Passed"
                    if validated and all(item.get("passed") for item in validated)
                    else "Refused / incomplete",
                ),
                (
                    "External actions taken",
                    str(artifact.get("external_actions_taken", False)).lower(),
                ),
                ("Marketplace submission status", artifact.get("marketplace_submission_status")),
                ("Completed at", artifact.get("completed_at")),
                ("Profile version", artifact.get("profile_reference", {}).get("version")),
                ("Policy version", artifact.get("policy_reference", {}).get("version")),
            ]
        )
        section("Verification trail", "Package envelope checks")
        for item in verified:
            mark = "✓" if item.get("passed") else "×"
            markup(
                f'<div class="aa-check"><div class="aa-check-mark">{mark}</div><div class="aa-check-copy">'
                f"<strong>{safe(item.get('check', 'check').replace('_', ' '))}</strong>"
                f"<span>{safe(item.get('reason') or 'verified')}</span></div></div>"
            )
        section("Dry-run", "Bounded steps performed")
        numbered([item.replace("_", " ") for item in artifact.get("dry_run_steps_performed", [])])
        if artifact.get("refusal_reasons"):
            section("Refusal", "Constraints encountered")
            numbered(artifact["refusal_reasons"])
        with st.expander("Technical artifact JSON"):
            st.json(artifact)


def render_golden() -> None:
    report = load_golden_metrics()
    section(
        "Hermetic benchmark",
        f"Golden task corpus {report['corpus_version']}",
        "Synthetic offline regression evidence—not marketplace success.",
    )
    metric_grid(
        [
            ("Corpus cases", str(report["n"]), "Versioned synthetic tasks"),
            (
                "Routing accuracy",
                f"{report['routing_accuracy']:.0%}",
                "Deterministic category path",
            ),
            (
                "Unsafe false-allow",
                f"{report['false_allow_rate_unsafe']:.0%}",
                "Critical safety gate",
            ),
            (
                "Validation agreement",
                f"{report['validation_agreement']:.0%}",
                "Expected vs. observed",
            ),
        ]
    )
    boundary(
        "PASS / NO SUBMISSION-READY STATE" if report["passed"] else "BENCHMARK FAILURE",
        "No connector, network provider, database write, or code execution is available here.",
    )
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Risk type": name,
                    "Cases": values["n"],
                    "Decision agreement": values["decision_accuracy"],
                    "Validation agreement": values["validation_agreement"],
                }
                for name, values in report["by_risk_type"].items()
            ]
        ),
        hide_index=True,
        width="stretch",
    )


def render_offline_evaluation() -> None:
    metrics, records = evaluation_metrics(settings), load_evaluations()
    section("Human quality review", "Offline evaluations", "offline_evaluation / not_submitted")
    metric_grid(
        [
            ("Evaluated tasks", str(metrics["evaluated"]), "Offline only"),
            ("Safety refusals", str(metrics["safety_refusals"]), "Pre-generation gate"),
            ("Human reviewed", str(metrics["human_reviewed"]), "Local review state"),
            (
                "Average quality",
                f"{metrics['average_human_quality']:.1f}",
                "Human score, not acceptance",
            ),
        ]
    )
    if records.empty:
        st.info("No offline evaluation records in this environment.")
        return
    labels = {int(row["id"]): f"#{row['id']} / {row['title']}" for _, row in records.iterrows()}
    selected_id = st.selectbox("Select offline evaluation", list(labels), format_func=labels.get)
    row = records[records["id"] == selected_id].iloc[0]
    with st.container(border=True):
        st.subheader(row["title"])
        st.caption(f"offline_evaluation · not_submitted · {row['marketplace']} · {row['category']}")
        kv(
            [
                ("Capability decision", row["capability_reason"]),
                ("Safety", row["safety_reason"]),
                ("Validation", row["validation_notes"] or "—"),
                ("Review", row["human_review_status"]),
            ]
        )
        with st.expander("Generated deliverable"):
            st.code(row["deliverable"] or "No deliverable generated.", language="markdown")
        with st.expander("Grounding and source metadata"):
            st.json(row["grounding_metadata"])
    with st.form("evaluation-review-form"):
        st.subheader("Human offline quality review")
        cols = st.columns(3)
        fit = cols[0].slider("Task fit / feasibility", 1, 5, 3)
        correctness = cols[1].slider("Correctness", 1, 5, 3)
        grounding = cols[2].slider("Grounding / source quality", 1, 5, 3)
        cols = st.columns(3)
        completeness = cols[0].slider("Completeness", 1, 5, 3)
        safety = cols[1].slider("Safety", 1, 5, 3)
        quality = cols[2].slider("Writing / code quality", 1, 5, 3)
        recommendation = st.selectbox("Overall recommendation", REVIEW_RECOMMENDATIONS)
        notes = st.text_area("Reviewer notes")
        if st.form_submit_button(
            "Save offline human review", type="primary", disabled=settings.hosted_mode
        ):
            grade_evaluation(
                selected_id,
                task_fit=fit,
                correctness=correctness,
                grounding=grounding,
                completeness=completeness,
                safety=safety,
                quality=quality,
                recommendation=recommendation,
                notes=notes,
                settings=settings,
            )
            st.cache_data.clear()
            st.rerun()


def render_simulation() -> None:
    totals = RiskGuard(settings).totals_today()
    section(
        "Isolated lab", "Controlled MockMarketplace lifecycle", "Every amount below is simulated."
    )
    boundary(
        "CONTROLLED SIMULATION / NOT LIVE",
        "No wallet exists. No real marketplace outcome is created.",
    )
    metric_grid(
        [
            ("Simulated spent", money(totals.spent_usd, 4), "Mock ledger only"),
            ("Simulated earned", money(totals.earned_usd), "Mock settlement only"),
            ("Simulated P&L", money(totals.net_usd), "Never control-plane margin"),
            ("Real outcomes", "0", "No participation authorized"),
        ]
    )
    with st.expander("Run controlled fixture scan"):
        limit = st.slider("Mock fixtures", 1, 10, 7)
        enqueue = st.slider("Send top fixtures to local simulation gate", 0, 5, 2)
        if st.button("Run controlled simulation", type="primary", disabled=settings.hosted_mode):
            do_simulated_scan(limit, enqueue)
            st.rerun()
    section("Local gate", "Simulation approvals")
    queue = pending_tasks()
    if not queue:
        st.info("No controlled fixtures wait at the simulation gate.")
    for row in queue:
        with st.container(border=True):
            st.markdown(f"**{safe(row.title)}**")
            st.caption(f"{row.bounty_key} · controlled simulation")
            if not row.bounty_key.startswith("mock:"):
                st.error("Non-mock lifecycle entries are disabled in this UI.")
            else:
                left, right = st.columns(2)
                if left.button(
                    "Approve simulation",
                    key=f"sim-approve-{row.bounty_key}",
                    disabled=settings.hosted_mode,
                ):
                    decide_simulation(row.bounty_key, True)
                    st.rerun()
                if right.button(
                    "Reject simulation",
                    key=f"sim-reject-{row.bounty_key}",
                    disabled=settings.hosted_mode,
                ):
                    decide_simulation(row.bounty_key, False)
                    st.rerun()
    tasks, ledger = load("tasks"), load("ledger")
    if not tasks.empty:
        section("Evidence", "Controlled task outcomes")
        st.dataframe(
            tasks.sort_values("updated_at", ascending=False), hide_index=True, width="stretch"
        )
    if not ledger.empty:
        with st.expander("Simulated ledger"):
            st.dataframe(
                ledger.sort_values("created_at", ascending=False), hide_index=True, width="stretch"
            )
    section("Calibration", "Prediction evidence")
    only_real = st.toggle("Exclude simulated outcomes", value=False)
    summary = calibration.overall(simulated=False if only_real else None)
    if summary.n == 0:
        st.info(
            "No real marketplace outcomes." if only_real else "No simulated calibration outcomes."
        )
    else:
        kv(
            [
                ("Outcomes", summary.n),
                (
                    "Acceptance rate",
                    f"{summary.acceptance_rate:.0%}"
                    if summary.acceptance_rate is not None
                    else "—",
                ),
                ("Brier score", f"{summary.brier:.3f}" if summary.brier is not None else "—"),
                ("Bias", f"{summary.bias:+.3f}" if summary.bias is not None else "—"),
            ]
        )
        st.caption("Simulation calibration is not live marketplace success evidence.")
        if summary.buckets:
            st.dataframe(
                pd.DataFrame(
                    [
                        {
                            "Band": item.label,
                            "Cases": item.n,
                            "Predicted": item.predicted_mean,
                            "Observed": item.actual_rate,
                        }
                        for item in summary.buckets
                    ]
                ),
                hide_index=True,
                width="stretch",
            )


def render_capabilities_and_audit() -> None:
    section("Connector truth", "Marketplace capability differences")
    st.dataframe(
        pd.DataFrame(
            [
                {
                    "Marketplace": name,
                    "Source": "CONTROLLED MOCK" if name == "mock" else "LIVE DISCOVERY",
                    "Claim model": cls.capabilities.claim_model.value,
                    "Settlement": cls.capabilities.settlement.value,
                    "Role": "simulated lifecycle" if name == "mock" else "GET-only discovery",
                }
                for name, cls in CONNECTORS.items()
            ]
        ),
        hide_index=True,
        width="stretch",
    )
    for name, cls in CONNECTORS.items():
        with st.expander(f"{name.replace('_', '.')} / connector constraint"):
            st.write(cls.capabilities.notes)
    section("Append-only evidence", "Audit trail")
    events, decisions = load("events"), load("decisions")
    if events.empty and decisions.empty:
        st.info("No lifecycle or scorer audit records in this environment.")
    if not events.empty:
        st.dataframe(
            events.sort_values("created_at", ascending=False), hide_index=True, width="stretch"
        )
    if not decisions.empty:
        with st.expander("Scoring decision log / ranked and skipped"):
            st.dataframe(
                decisions.sort_values("score", ascending=False), hide_index=True, width="stretch"
            )


def render_evidence() -> None:
    page_header(
        "EVIDENCE BOUNDARIES",
        "Evidence & simulation",
        "Offline benchmarks, human quality review, controlled lifecycle evidence, and connector constraints—separate from live discovery.",
    )
    boundary(
        "REAL MARKETPLACE OUTCOMES: 0",
        "Simulated P&L and offline review never imply external success.",
    )
    tabs = st.tabs(
        ["Golden corpus", "Offline evaluation", "Controlled simulation", "Capabilities & audit"]
    )
    with tabs[0]:
        render_golden()
    with tabs[1]:
        render_offline_evaluation()
    with tabs[2]:
        render_simulation()
    with tabs[3]:
        render_capabilities_and_audit()


markup(f"<style>{Path(__file__).with_name('dashboard.css').read_text(encoding='utf-8')}</style>")
with st.sidebar:
    markup(
        '<div class="aa-brand"><div class="aa-brand-mark">A</div><div>'
        '<div class="aa-brand-name">Agent Arbiter</div><div class="aa-brand-meta">Control plane</div></div></div>'
    )
    page = st.radio("Navigation", NAV_ITEMS, label_visibility="collapsed")
    markup(
        '<div class="aa-sidebar-boundary"><strong>DISCOVERY-ONLY BOUNDARY</strong><br>'
        "No bids, claims, submissions, settlements, wallets, payments, signing, or login paths.</div>"
    )
    st.caption(
        "Hosted visualization · ephemeral evidence"
        if settings.hosted_mode
        else "Local control-plane workspace"
    )
    if settings.hosted_mode:
        st.caption("The localhost REST API and worker demo remain local-only.")

renderers = {
    "Overview": render_overview,
    "Opportunity Feed": render_opportunity_feed,
    "Agent Profile": render_agent_profile,
    "Work Policy": render_work_policy,
    "Package Approval": render_package_approval,
    "Approved Packages": render_approved_packages,
    "Worker Artifacts": render_worker_artifacts,
    "Evidence & Simulation": render_evidence,
}
renderers[page]()
