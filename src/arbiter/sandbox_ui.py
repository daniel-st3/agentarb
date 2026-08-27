"""Streamlit Community Cloud surface: session-only, memory-only policy sandbox."""

# ruff: noqa: E501 -- complete editorial HTML fragments remain readable together.

from __future__ import annotations

import asyncio
import html
import time
from pathlib import Path
from typing import Any

import pandas as pd
import streamlit as st

from arbiter.governance import AgentProfile, HumanApprovalRules, WorkPolicy
from arbiter.sandbox import (
    CAPABILITIES,
    CATEGORIES,
    EXTRA_RESTRICTIONS,
    PUBLIC_SOURCES,
    TEMPLATES,
    TOOLS,
    discover,
    evaluate,
    package_preview,
    template_profile,
)


def esc(value: Any) -> str:
    return html.escape("—" if value is None or value == "" else str(value))


def money(value: float | None, digits: int = 2) -> str:
    return "—" if value is None else f"${value:,.{digits}f}"


def markup(value: str) -> None:
    st.markdown(value, unsafe_allow_html=True)


def header(eyebrow: str, title: str, copy: str) -> None:
    markup(
        f'<header class="aa-page-head aa-scroll-reveal"><div class="aa-eyebrow">{esc(eyebrow)}</div>'
        f"<h1>{esc(title)}</h1><p>{esc(copy)}</p></header>"
    )


def boundary(title: str, detail: str) -> None:
    markup(
        f'<div class="aa-boundary aa-sticky-boundary"><strong>{esc(title)}</strong>'
        f"<span>{esc(detail)}</span></div>"
    )


def section(kicker: str, title: str, note: str = "") -> None:
    markup(
        f'<div class="aa-section-head aa-scroll-reveal"><div><div class="aa-section-kicker">{esc(kicker)}</div>'
        f'<div class="aa-section-title">{esc(title)}</div></div>'
        f'<div class="aa-section-note">{esc(note)}</div></div>'
    )


def cards(items: list[tuple[str, str, str]]) -> None:
    cells = "".join(
        f'<div class="aa-card aa-scroll-reveal"><div class="aa-card-label">{esc(a)}</div>'
        f'<div class="aa-card-value">{esc(b)}</div><div class="aa-card-copy">{esc(c)}</div></div>'
        for a, b, c in items
    )
    markup(f'<div class="aa-card-grid">{cells}</div>')


def ensure_session() -> None:
    if "sandbox_template" not in st.session_state:
        st.session_state.sandbox_template = "Research Analyst"
    if "sandbox_profile" not in st.session_state:
        profile, policy = template_profile(st.session_state.sandbox_template)
        st.session_state.sandbox_profile = profile.model_dump(mode="json")
        st.session_state.sandbox_policy = policy.model_dump(mode="json")
        st.session_state.sandbox_applied_template = st.session_state.sandbox_template
    st.session_state.setdefault("sandbox_cache", {})
    st.session_state.setdefault("sandbox_results", [])
    st.session_state.setdefault("sandbox_statuses", [])
    st.session_state.setdefault("sandbox_entries", [])
    st.session_state.setdefault("sandbox_last_fetch", 0.0)


def route_to_sandbox() -> None:
    st.session_state.hosted_page = "Policy Sandbox"


def apply_selected_template() -> None:
    profile, policy = template_profile(st.session_state.sandbox_template)
    st.session_state.sandbox_profile = profile.model_dump(mode="json")
    st.session_state.sandbox_policy = policy.model_dump(mode="json")
    st.session_state.sandbox_results = []
    st.session_state.sandbox_applied_template = st.session_state.sandbox_template


def overview() -> None:
    markup(
        '<section class="aa-hero aa-sandbox-hero"><div class="aa-eyebrow">AGENT ARBITER / HOSTED SANDBOX</div>'
        "<h1>Test the policy<br>before the agent.</h1>"
        '<div class="aa-hero-copy">Shape a temporary capability and risk envelope, then evaluate '
        "public marketplace opportunities without granting any authority.</div>"
        '<div class="aa-proof"><span></span>Session memory only. Public GET discovery. Zero marketplace actions.</div></section>'
    )
    if st.button(
        "Try the policy sandbox",
        type="primary",
        on_click=route_to_sandbox,
        use_container_width=False,
    ):
        st.rerun()
    cards(
        [
            (
                "01 / Configure",
                "Capability envelope",
                "Choose categories, bounded local tools, cost, time, and risk constraints.",
            ),
            (
                "02 / Evaluate",
                "Policy decisions",
                "Normalize public listings and show exact allow, skip, or refusal reasons.",
            ),
            (
                "03 / Preview",
                "Governed contract",
                "Inspect a non-persistent work-package preview with execution disabled.",
            ),
        ]
    )
    section(
        "Authority path",
        "Every stage narrows permission",
        "Nothing in hosted mode grants approval.",
    )
    markup(
        '<div class="aa-flow">'
        + "".join(
            f"<div><span>{i:02d}</span><strong>{v}</strong></div>"
            for i, v in enumerate(
                ["Discover", "Normalize", "Screen", "Match", "Decide", "Preview"], 1
            )
        )
        + "</div>"
    )
    boundary(
        "WHAT THIS PROVES",
        "Agent Arbiter applies a capability and risk policy before an agent is permitted to act. This simulation does not bid, claim, submit, pay, or modify marketplace data.",
    )


def policy_console() -> tuple[AgentProfile, WorkPolicy]:
    profile = AgentProfile.model_validate(st.session_state.sandbox_profile)
    policy = WorkPolicy.model_validate(st.session_state.sandbox_policy)
    section(
        "Session policy", "Operator console", "Temporary browser-session state · never persisted"
    )
    selected = st.selectbox(
        "Worker template",
        list(TEMPLATES),
        key="sandbox_template",
        help="Selecting a template resets this session's temporary fields.",
    )
    if selected != st.session_state.sandbox_applied_template:
        apply_selected_template()
        st.rerun()
    with st.form("sandbox-policy-form"):
        left, right = st.columns(2)
        with left:
            markup('<div class="aa-form-kicker">CAPABILITY ENVELOPE</div>')
            categories = st.multiselect(
                "Supported categories", CATEGORIES, profile.supported_categories
            )
            tools = st.multiselect(
                "Allowed local tools",
                TOOLS,
                profile.allowed_tools,
                help="Descriptions only; hosted mode never invokes a worker.",
            )
            capabilities = st.multiselect(
                "Declared local capabilities", CAPABILITIES, profile.capabilities
            )
            restrictions = st.multiselect(
                "Additional prohibited actions",
                EXTRA_RESTRICTIONS,
                [x for x in profile.prohibited_actions if x in EXTRA_RESTRICTIONS],
            )
            max_cost = st.number_input(
                "Maximum projected task execution cost (USD)",
                0.0,
                100.0,
                float(profile.max_execution_cost_usd),
                0.05,
            )
            max_duration = st.number_input(
                "Maximum duration (minutes)", 1, 240, int(profile.max_execution_minutes), 5
            )
        with right:
            markup('<div class="aa-form-kicker">WORK POLICY</div>')
            min_payout = st.number_input(
                "Minimum payout (USD)", 0.0, 10000.0, float(policy.min_payout_usd), 1.0
            )
            min_margin = st.number_input(
                "Minimum projected expected margin (USD)",
                -100.0,
                10000.0,
                float(policy.min_expected_margin_usd),
                1.0,
            )
            min_conf = st.slider("Minimum confidence", 0.0, 1.0, float(policy.min_confidence), 0.05)
            marketplaces = st.multiselect(
                "Allowed marketplaces",
                [*PUBLIC_SOURCES, "mock"],
                policy.allowed_marketplaces,
                format_func=lambda x: "Controlled demo" if x == "mock" else x.replace("_", "."),
            )
            human = st.checkbox("Human approval always required", value=True, disabled=True)
            st.caption("The hosted sandbox cannot remove this boundary.")
        submitted = st.form_submit_button(
            "Evaluate public opportunities", type="primary", use_container_width=True
        )
    configured_profile = profile.model_copy(
        update={
            "name": selected,
            "supported_categories": categories,
            "allowed_tools": tools,
            "capabilities": capabilities,
            "prohibited_actions": sorted(
                set(profile.prohibited_actions) - set(EXTRA_RESTRICTIONS) | set(restrictions)
            ),
            "max_execution_cost_usd": max_cost,
            "max_execution_minutes": max_duration,
            "human_approval_always_required": human,
        }
    )
    configured_policy = policy.model_copy(
        update={
            "min_payout_usd": min_payout,
            "min_expected_margin_usd": min_margin,
            "min_confidence": min_conf,
            "allowed_marketplaces": marketplaces,
            "human_approval": HumanApprovalRules(default_required=True),
        }
    )
    st.session_state.sandbox_profile = configured_profile.model_dump(mode="json")
    st.session_state.sandbox_policy = configured_policy.model_dump(mode="json")
    if submitted:
        with st.spinner("Fetching public GET listings and applying the session policy…"):
            if (
                st.session_state.sandbox_entries
                and time.monotonic() - st.session_state.sandbox_last_fetch < 30
            ):
                entries, statuses = (
                    st.session_state.sandbox_entries,
                    st.session_state.sandbox_statuses,
                )
            else:
                entries, cache, statuses = asyncio.run(discover(st.session_state.sandbox_cache))
                st.session_state.sandbox_cache = cache
                st.session_state.sandbox_entries = entries
                st.session_state.sandbox_last_fetch = time.monotonic()
            st.session_state.sandbox_results = asyncio.run(
                evaluate(entries, configured_profile, configured_policy)
            )
            st.session_state.sandbox_statuses = statuses
    return configured_profile, configured_policy


def result_terminal(profile: AgentProfile, policy: WorkPolicy) -> None:
    rows = st.session_state.sandbox_results
    if not rows:
        boundary(
            "READY FOR EVALUATION",
            "Configure the session policy above. Controlled demo records remain visibly separate from public discovery.",
        )
        return
    statuses = st.session_state.sandbox_statuses
    cards(
        [
            (
                s["marketplace"].replace("_", "."),
                s["status"].upper(),
                f"{s['count']} public records · {s['observed_at'] or 'no observation'}",
            )
            for s in statuses
        ]
        + [("controlled demo", "AVAILABLE", "Synthetic in-memory records · never labelled live")]
    )
    counts = {
        d: sum(r["package_eligibility"] == d for r in rows) for d in ("allow", "skip", "refuse")
    }
    section(
        "Policy output",
        "Decision terminal",
        f"{counts['allow']} allowed · {counts['skip']} skipped · {counts['refuse']} refused",
    )
    view = st.segmented_control(
        "Decision view", ["All", "Allowed", "Skipped", "Refused"], default="All"
    )
    mapping = {"Allowed": "allow", "Skipped": "skip", "Refused": "refuse"}
    filtered = [r for r in rows if view == "All" or r["package_eligibility"] == mapping[view]]
    frame = pd.DataFrame(
        [
            {
                "Evidence": "CONTROLLED DEMO"
                if r["source_type"] == "controlled_mock"
                else r["source_type"].replace("_", " ").upper(),
                "Marketplace": r["marketplace"].replace("_", "."),
                "Opportunity": r["task"]["title"],
                "Decision": r["package_eligibility"].title(),
                "Payout": r["task"]["payout_usd"],
                "Confidence": r["confidence"],
                "Projected task cost": r["estimated_task_execution_cost_usd"],
                "Projected margin": r["expected_margin_usd"],
                "Reason code": r["reason_codes"][0],
            }
            for r in filtered
        ]
    )
    if frame.empty:
        st.info("No opportunities match this decision view.")
    else:
        st.dataframe(
            frame,
            hide_index=True,
            width="stretch",
            column_config={
                "Payout": st.column_config.NumberColumn(format="$%.2f"),
                "Confidence": st.column_config.ProgressColumn(min_value=0, max_value=1),
                "Projected task cost": st.column_config.NumberColumn(format="$%.4f"),
                "Projected margin": st.column_config.NumberColumn(format="$%.2f"),
            },
        )
    labels = {r["opportunity_id"]: f"{r['marketplace']} / {r['task']['title']}" for r in filtered}
    if not labels:
        return
    chosen = st.selectbox("Inspect policy decision", list(labels), format_func=labels.get)
    row = next(r for r in filtered if r["opportunity_id"] == chosen)
    evidence = (
        "CONTROLLED DEMO"
        if row["source_type"] == "controlled_mock"
        else row["source_type"].replace("_", " ").upper()
    )
    with st.container(border=True):
        markup(
            f'<div class="aa-contract-header"><div><div class="aa-eyebrow">{esc(evidence)}</div>'
            f'<h2>{esc(row["task"]["title"])}</h2><div class="aa-contract-id">{esc(row["opportunity_id"])}</div></div>'
            f'<span class="aa-status {row["package_eligibility"]}">{row["package_eligibility"]}</span></div>'
        )
        values = [
            ("Reason code", row["reason_codes"][0]),
            ("Plain-language rationale", row["rationale"]),
            ("Payout", money(row["task"]["payout_usd"])),
            ("Confidence", f"{row['confidence']:.0%}"),
            ("Projected task execution cost", money(row["estimated_task_execution_cost_usd"], 4)),
            ("Projected expected margin", money(row["expected_margin_usd"])),
            ("Required reputation", row["required_reputation"]),
            ("Claim / settlement", f"{row['claim_constraint']} / {row['settlement_constraint']}"),
            ("External execution status", "discovery_only"),
        ]
        markup(
            '<div class="aa-kv-grid">'
            + "".join(
                f'<div class="aa-kv"><span>{esc(k)}</span><strong>{esc(v)}</strong></div>'
                for k, v in values
            )
            + "</div>"
        )
    if row["package_eligibility"] == "allow":
        preview = package_preview(row, profile, policy)
        section(
            "Read-only contract",
            "Governed Work Package Preview",
            "Preview only · not approved · never persisted",
        )
        boundary(
            "NOT SUBMITTED / MARKETPLACE ACTIONS DISABLED",
            "package_preview_only = true · marketplace_action_authorized = false",
        )
        with st.container(border=True):
            markup('<div class="aa-preview-stamp">PREVIEW ONLY</div>')
            values = [
                ("Status", preview["status"]),
                ("Submission status", preview["submission_status"]),
                ("Worker template", profile.name),
                ("Policy scope", ", ".join(policy.allowed_marketplaces)),
                ("Actual LLM inference cost", "$0.000000"),
                (
                    "Projected task execution cost",
                    money(preview["estimated_task_execution_cost_usd"], 4),
                ),
                ("Projected expected margin", money(preview["expected_margin_usd"])),
            ]
            markup(
                '<div class="aa-kv-grid">'
                + "".join(
                    f'<div class="aa-kv"><span>{esc(k)}</span><strong>{esc(v)}</strong></div>'
                    for k, v in values
                )
                + "</div>"
            )
            left, right = st.columns(2)
            with left:
                st.markdown("**Deterministic task plan**")
                for step in preview["task_plan"]:
                    st.write(f"{step['step']:02d}  {step['operation'].replace('_', ' ')}")
            with right:
                st.markdown("**Validation criteria**")
                for criterion in preview["validation_criteria"]:
                    st.write(criterion["id"].replace("_", " "))
            st.caption(
                "Allowed local descriptions: "
                + ", ".join(profile.allowed_tools)
                + " · human approval remains required · no external actions"
            )


def sandbox_page() -> None:
    header(
        "POLICY SANDBOX / SESSION MEMORY",
        "Govern before you route.",
        "Configure a temporary worker envelope and see how current public or controlled opportunities are routed.",
    )
    boundary(
        "SESSION-ONLY SANDBOX · NO MARKETPLACE ACTIONS",
        "No SQLite, artifacts, approvals, workers, provider calls, or external writes.",
    )
    profile, policy = policy_console()
    result_terminal(profile, policy)
    boundary(
        "WHAT THIS PROVES",
        "Agent Arbiter applies a capability and risk policy before an agent is permitted to act. This simulation does not bid, claim, submit, pay, or modify marketplace data.",
    )


def render_hosted() -> None:
    st.set_page_config(
        page_title="Agent Arbiter — Policy Sandbox",
        page_icon="A",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    ensure_session()
    css = Path(__file__).with_name("dashboard.css").read_text(encoding="utf-8")
    extra = Path(__file__).with_name("sandbox.css").read_text(encoding="utf-8")
    markup(f"<style>{css}\n{extra}</style>")
    with st.sidebar:
        markup(
            '<div class="aa-brand"><div class="aa-brand-mark">A</div><div>'
            '<div class="aa-brand-name">Agent Arbiter</div><div class="aa-brand-meta">Hosted policy lab</div></div></div>'
        )
        page = st.radio(
            "Hosted navigation",
            ["Overview", "Policy Sandbox"],
            key="hosted_page",
            label_visibility="collapsed",
        )
        markup(
            '<div class="aa-sidebar-boundary"><strong>SESSION-ONLY SANDBOX</strong><br>'
            "Temporary policy state expires with this browser session. Public discovery is GET-only.</div>"
        )
        st.caption("Hosted visualization · no persistent or worker surface")
    if page == "Overview":
        overview()
    else:
        sandbox_page()
