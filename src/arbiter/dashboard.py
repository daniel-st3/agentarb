"""Streamlit dashboard: open bounties, scores, and the decision log.

Read-mostly over SQLite. The one action is "run a scan", which is alert-only
in Week 1 -- there is no approve/reject queue yet because there is nothing to
approve. That arrives in Week 2 with the claim gate.
"""

from __future__ import annotations

import asyncio

import pandas as pd
import streamlit as st
from sqlmodel import select

from arbiter.config import get_settings
from arbiter.connectors import MockMarketplaceConnector, OpenTaskConnector
from arbiter.db import init_db, session_scope
from arbiter.logging import configure_logging
from arbiter.models import BountyRow, DecisionRow, ScanRow
from arbiter.pipeline import run_scan

st.set_page_config(page_title="Agent Arbiter", page_icon="🧭", layout="wide")

settings = get_settings()
configure_logging(settings.log_level, settings.log_json)
init_db()


@st.cache_data(ttl=5)
def load(table: str) -> pd.DataFrame:
    models = {"bounties": BountyRow, "decisions": DecisionRow, "scans": ScanRow}
    with session_scope() as session:
        rows = session.exec(select(models[table])).all()
        return pd.DataFrame([r.model_dump() for r in rows])


def do_scan(markets: list[str], limit: int) -> None:
    available = {"opentask": OpenTaskConnector, "mock": MockMarketplaceConnector}
    connectors = [available[m]() for m in markets]

    async def _run():
        try:
            return await run_scan(connectors, limit=limit, settings=settings)
        finally:
            for connector in connectors:
                await connector.aclose()

    result = asyncio.run(_run())
    st.cache_data.clear()
    for name, error in result.errors.items():
        st.warning(f"{name}: {error}")
    st.success(
        f"Scan {result.run_id}: {len(result.scored)} found · "
        f"{len(result.actionable)} actionable · {len(result.skipped)} skipped"
    )


# --------------------------------------------------------------------------

st.title("🧭 Agent Arbiter")
st.caption(
    "A router across AI-agent task marketplaces. "
    "**Week 1: alert-only** — it scores and ranks, it does not claim or pay."
)

with st.sidebar:
    st.header("Scan")
    markets = st.multiselect("Marketplaces", ["opentask", "mock"], default=["opentask", "mock"])
    limit = st.slider("Bounties per marketplace", 5, 100, 25, step=5)
    if st.button("Run scan", type="primary", use_container_width=True, disabled=not markets):
        with st.spinner("Scanning…"):
            do_scan(markets, limit)

    st.divider()
    st.caption("**Filters**")
    st.write(f"min payout · ${settings.min_payout_usd:.2f}")
    st.write(f"max effort · {settings.max_effort_hours * 60:.0f} min")
    st.write(f"cost margin · {settings.cost_safety_margin:g}×")
    st.write(f"daily budget · ${settings.daily_budget_usd:.2f}")
    st.write(f"estimator · `{settings.llm_provider}`")

decisions = load("decisions")
bounties = load("bounties")
scans = load("scans")

if decisions.empty:
    st.info("No scans yet. Run one from the sidebar, or `uv run arbiter scan`.")
    st.stop()

latest = scans.sort_values("started_at", ascending=False).iloc[0]
current = decisions[decisions["run_id"] == latest["run_id"]]
scored = current[current["action"] == "scored"].sort_values("score", ascending=False)
skipped = current[current["action"] == "skipped"]

c1, c2, c3, c4 = st.columns(4)
c1.metric("Bounties found", int(latest["n_found"]))
c2.metric("Actionable", int(latest["n_scored"]))
c3.metric("Skipped", int(latest["n_skipped"]))
c4.metric("Best net EV", f"${scored['net_ev_usd'].max():.2f}" if not scored.empty else "—")
st.caption(f"Latest run `{latest['run_id']}` · {latest['started_at']} · {latest['marketplaces']}")

tab_ranked, tab_skipped, tab_open, tab_log = st.tabs(
    ["Ranked", "Skipped (with reasons)", "Open bounties", "Decision log"]
)

with tab_ranked:
    st.subheader("Ranked by score")
    if scored.empty:
        st.info("Nothing cleared the filters in this run.")
    else:
        st.dataframe(
            scored[[
                "rank", "marketplace", "title", "payout_usd", "score", "net_ev_usd",
                "p_success", "feasibility", "confidence", "est_effort_hours",
                "est_api_cost_usd", "estimator", "rationale",
            ]],
            hide_index=True,
            use_container_width=True,
            column_config={
                "payout_usd": st.column_config.NumberColumn("payout", format="$%.2f"),
                "net_ev_usd": st.column_config.NumberColumn("net EV", format="$%.2f"),
                "score": st.column_config.NumberColumn("score", format="%.2f"),
                "est_effort_hours": st.column_config.NumberColumn("effort (h)", format="%.3f"),
                "est_api_cost_usd": st.column_config.NumberColumn("est cost", format="$%.4f"),
            },
        )
        st.bar_chart(scored.set_index("title")["score"].head(10))

with tab_skipped:
    st.subheader("Why bounties were skipped")
    st.caption("The judgment is the product — the skip reason matters as much as the ranking.")
    if skipped.empty:
        st.info("Nothing was skipped.")
    else:
        st.dataframe(
            skipped[["marketplace", "title", "payout_usd", "skip_reason"]],
            hide_index=True,
            use_container_width=True,
        )
        st.markdown("**Skip reasons by frequency**")
        st.bar_chart(
            skipped["skip_reason"]
            .str.split("(", regex=False).str[0].str.split(":", regex=False).str[0]
            .value_counts()
        )

with tab_open:
    st.subheader("Open bounties seen")
    cols = [c for c in ["marketplace", "title", "category", "payout_usd", "payout_text",
                        "currency", "deadline", "url", "last_seen_at"] if c in bounties.columns]
    st.dataframe(
        bounties.sort_values("last_seen_at", ascending=False)[cols],
        hide_index=True,
        use_container_width=True,
        column_config={"url": st.column_config.LinkColumn("link")},
    )

with tab_log:
    st.subheader("Decision log (append-only)")
    st.caption("Every decision across every run. This is the audit trail.")
    st.dataframe(
        decisions.sort_values("created_at", ascending=False)[[
            "created_at", "run_id", "marketplace", "title", "action",
            "score", "net_ev_usd", "skip_reason", "estimator",
        ]],
        hide_index=True,
        use_container_width=True,
    )
