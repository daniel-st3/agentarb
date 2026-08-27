"""Streamlit navigation, evidence boundaries, and hosted-mode safety."""

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
    monkeypatch.setenv("ARBITER_CONTROL_PLANE_DB_PATH", str(tmp_path / "control-plane.db"))
    monkeypatch.setenv("ARBITER_WORKER_ARTIFACT_DIR", str(tmp_path / "worker-artifacts"))
    monkeypatch.setenv("ARBITER_LLM_PROVIDER", "heuristic")
    monkeypatch.setenv("ARBITER_GROQ_API_KEY", "")
    monkeypatch.setenv("ARBITER_HOSTED_MODE", "false")
    import streamlit as st

    import arbiter.config as config
    import arbiter.control_plane as control_plane
    import arbiter.db as db
    import arbiter.evaluation as evaluation

    config._settings = None
    db._engine = None
    evaluation.reset_evaluation_engine()
    control_plane.reset_control_plane_engines()
    st.cache_data.clear()
    yield
    config._settings = None
    db._engine = None
    evaluation.reset_evaluation_engine()
    control_plane.reset_control_plane_engines()


def go(app: AppTest, page: str) -> AppTest:
    return app.radio[0].set_value(page).run()


def rendered_text(app: AppTest) -> str:
    values = [item.value for item in app.markdown]
    values += [item.value for item in app.caption]
    values += [item.value for item in app.info]
    return " ".join(str(value) for value in values)


def test_overview_has_product_navigation_and_safety_boundary(temp_db):
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    assert app.radio[0].value == "Overview"
    assert app.radio[0].options == [
        "Overview",
        "Opportunity Feed",
        "Agent Profile",
        "Work Policy",
        "Package Approval",
        "Approved Packages",
        "Worker Artifacts",
        "Evidence & Simulation",
    ]
    text = rendered_text(app)
    assert "Governed work routing for the agent economy" in text
    assert "Real marketplace outcomes" in text
    assert "No marketplace actions or payments are enabled" in text


async def test_all_primary_screens_render_with_data(temp_db, settings):
    await run_scan([MockMarketplaceConnector()], settings=settings)
    app = AppTest.from_file(APP, default_timeout=60).run()
    for page in app.radio[0].options:
        app = go(app, page)
        assert not app.exception, page
    assert "simulated" in rendered_text(app).lower()


async def test_controlled_approval_queue_is_mock_only(temp_db, settings):
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
    app = go(AppTest.from_file(APP, default_timeout=60).run(), "Evidence & Simulation")
    labels = [button.label for button in app.button]
    assert not app.exception
    assert "Approve simulation" in labels and "Reject simulation" in labels
    assert "Approve" not in labels


async def test_simulated_money_is_visibly_separate(temp_db, settings):
    await run_scan([MockMarketplaceConnector()], settings=settings)
    app = go(AppTest.from_file(APP, default_timeout=60).run(), "Evidence & Simulation")
    text = rendered_text(app).lower()
    assert "simulated p&amp;l" in text
    assert "real marketplace outcomes: 0" in text
    assert "no wallet exists" in text


async def test_calibration_and_marketplace_constraints_render(temp_db, settings):
    from arbiter import calibration
    from arbiter.db import init_db
    from arbiter.models import Score

    init_db()
    for i in range(6):
        calibration.record_outcome(
            bounty_key=f"mock:{i}",
            marketplace="mock",
            category="research",
            score=Score(bounty_key=f"mock:{i}", p_success=0.8, est_api_cost_usd=0.01),
            accepted=i < 3,
            deliverable_state="validated",
            actual_cost_usd=0.01,
            actual_payout_usd=10.0 if i < 3 else 0.0,
            handler="research",
            simulated=True,
        )
    app = go(AppTest.from_file(APP, default_timeout=60).run(), "Evidence & Simulation")
    text = rendered_text(app)
    assert not app.exception
    assert "Brier score" in text and "Marketplace capability differences" in text
    assert app.dataframe


async def test_offline_evaluation_is_not_submitted(temp_db, settings):
    from arbiter.config import get_settings
    from arbiter.evaluation import DiscoveryOnlyConnector, run_offline_evaluation

    await run_offline_evaluation(
        [DiscoveryOnlyConnector(MockMarketplaceConnector())], limit=1, settings=get_settings()
    )
    app = go(AppTest.from_file(APP, default_timeout=60).run(), "Evidence & Simulation")
    text = rendered_text(app).lower()
    assert "offline_evaluation / not_submitted" in text
    assert "human score, not acceptance" in text
    assert "unsafe false-allow" in text


def test_hosted_mode_disables_operator_mutations(temp_db, monkeypatch):
    monkeypatch.setenv("ARBITER_HOSTED_MODE", "true")
    import arbiter.config as config

    config._settings = None
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert app.radio[0].options == ["Overview", "Policy Sandbox"]
    app = go(app, "Policy Sandbox")
    assert not app.exception
    labels = {button.label for button in app.button}
    assert "Approve for local worker" not in labels
    assert "Reject candidate" not in labels
    assert "Evaluate public opportunities" in labels


def test_css_has_responsive_and_reduced_motion_contract():
    css = Path(APP).with_name("dashboard.css").read_text(encoding="utf-8")
    assert "prefers-reduced-motion" in css
    assert "max-width: 600px" in css
    assert "--aa-canvas" in css and "--aa-blue" in css
