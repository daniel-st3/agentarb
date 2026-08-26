"""The dashboard must render from SQLite without raising -- both empty and populated."""

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from arbiter.connectors import MockMarketplaceConnector
from arbiter.pipeline import run_scan

APP = str(Path(__file__).resolve().parents[1] / "src" / "arbiter" / "dashboard.py")


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("ARBITER_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("ARBITER_EVALUATION_DB_PATH", str(tmp_path / "evaluations.db"))
    import streamlit as st

    import arbiter.config as config
    import arbiter.db as db
    import arbiter.evaluation as evaluation
    config._settings = None
    db._engine = None
    evaluation.reset_evaluation_engine()
    # @st.cache_data persists across AppTest runs in one process.
    st.cache_data.clear()
    yield
    config._settings = None
    db._engine = None
    evaluation.reset_evaluation_engine()


def test_renders_empty_state(temp_db):
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    assert any("No scans yet" in i.value for i in app.info)


async def test_renders_with_data(temp_db, settings):
    await run_scan([MockMarketplaceConnector()], settings=settings)

    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception

    labels = [m.label for m in app.metric]
    assert {"Spent today", "Earned today", "Net today", "Tasks today"} <= set(labels)
    assert len(app.tabs) == 8
    assert app.dataframe, "tables should render"


async def test_renders_the_approval_queue(temp_db, settings):
    """A bounty suspended at the gate must show up with Approve/Reject."""
    from langgraph.checkpoint.memory import MemorySaver

    from arbiter.orchestrator import Orchestrator

    settings.max_effort_hours = 1.0
    settings.cost_safety_margin = 1.0
    settings.require_approval = True
    mock = MockMarketplaceConnector()
    orchestrator = await Orchestrator.create(
        {"mock": mock}, settings=settings, checkpointer=MemorySaver()
    )
    pending = await orchestrator.start(await mock.get("mock-007"))
    assert pending.payload["kind"] == "claim_approval"

    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception

    assert any("Approval queue (1)" in t.label for t in app.tabs)
    labels = [b.label for b in app.button]
    assert "Approve" in labels and "Reject" in labels


async def test_simulated_money_is_labelled(temp_db, settings):
    """Nothing on the page may read as real earnings."""
    await run_scan([MockMarketplaceConnector()], settings=settings)
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    captions = " ".join(c.value for c in app.caption)
    assert "simulated" in captions.lower()
    assert "no wallet" in captions.lower()


async def test_calibration_tab_renders_with_outcomes(temp_db, settings):
    """Calibration metrics render once outcomes exist."""
    from arbiter import calibration
    from arbiter.db import init_db
    from arbiter.models import Score

    init_db()
    for i in range(6):
        calibration.record_outcome(
            bounty_key=f"mock:{i}", marketplace="mock", category="research",
            score=Score(bounty_key=f"mock:{i}", p_success=0.8, est_api_cost_usd=0.01),
            accepted=i < 3, deliverable_state="validated",
            actual_cost_usd=0.01, actual_payout_usd=10.0 if i < 3 else 0.0,
            handler="research", simulated=True,
        )

    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    labels = [m.label for m in app.metric]
    assert {"Outcomes", "Acceptance rate", "Brier score", "Bias"} <= set(labels)


async def test_marketplace_tab_states_capabilities(temp_db, settings):
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    assert any("Marketplaces" in t.label for t in app.tabs)
    text = " ".join(i.value for i in app.info)
    assert "MockMarketplace" in text and "mainnet" in text.lower()


async def test_evaluation_tab_is_explicitly_offline_and_not_submitted(temp_db, settings):
    from arbiter.config import get_settings
    from arbiter.evaluation import DiscoveryOnlyConnector, run_offline_evaluation

    await run_offline_evaluation(
        [DiscoveryOnlyConnector(MockMarketplaceConnector())],
        limit=1,
        settings=get_settings(),
    )
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    assert any("Evaluation Review" in tab.label for tab in app.tabs)
    labels = [metric.label for metric in app.metric]
    assert {"Evaluated tasks", "Safety refusals", "Deterministic fallback"} <= set(labels)
    subheaders = " ".join(item.value for item in app.subheader).lower()
    assert "never submitted" in subheaders
