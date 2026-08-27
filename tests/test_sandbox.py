"""Hosted policy sandbox isolation and public-GET safety tests."""

from __future__ import annotations

import ast
import asyncio
import importlib
import sys
from pathlib import Path

import httpx
import pytest
from streamlit.testing.v1 import AppTest

from arbiter.config import Settings
from arbiter.sandbox import (
    PublicDiscoveryTransport,
    controlled_records,
    evaluate,
    package_preview,
    template_profile,
)

ROOT = Path(__file__).resolve().parents[1]
APP = str(ROOT / "src" / "arbiter" / "dashboard.py")


@pytest.fixture
def hosted(tmp_path, monkeypatch):
    monkeypatch.setenv("ARBITER_HOSTED_MODE", "true")
    monkeypatch.setenv("ARBITER_LLM_PROVIDER", "heuristic")
    monkeypatch.setenv("ARBITER_GROQ_API_KEY", "")
    monkeypatch.setenv("ARBITER_DB_PATH", str(tmp_path / "arbiter.db"))
    monkeypatch.setenv("ARBITER_EVALUATION_DB_PATH", str(tmp_path / "evaluations.db"))
    monkeypatch.setenv("ARBITER_CONTROL_PLANE_DB_PATH", str(tmp_path / "control-plane.db"))
    monkeypatch.setenv("ARBITER_WORKER_ARTIFACT_DIR", str(tmp_path / "artifacts"))
    import arbiter.config as config

    config._settings = None
    yield tmp_path
    config._settings = None


def labels(app: AppTest) -> list[str]:
    widgets = [
        *app.button,
        *app.selectbox,
        *app.multiselect,
        *app.number_input,
        *app.slider,
        *app.checkbox,
    ]
    return [str(widget.label).lower() for widget in widgets]


def test_hosted_app_starts_without_persistent_writes(hosted):
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    assert not list(hosted.rglob("*"))
    assert "Try the policy sandbox" in [button.label for button in app.button]


def test_hosted_database_and_local_api_fail_closed(hosted):
    cfg = Settings()
    for name in ("db_url", "evaluation_db_url", "control_plane_db_url"):
        with pytest.raises(RuntimeError):
            getattr(cfg, name)
    if "arbiter.api" in sys.modules:
        with pytest.raises(RuntimeError, match="unavailable"):
            sys.modules["arbiter.api"].create_app(cfg)
    else:
        with pytest.raises(RuntimeError, match="unavailable"):
            importlib.import_module("arbiter.api")
    assert not list(hosted.rglob("*"))


def test_hosted_has_no_approval_worker_or_sensitive_controls(hosted):
    app = AppTest.from_file(APP, default_timeout=60).run()
    app.radio[0].set_value("Policy Sandbox").run()
    rendered = labels(app)
    assert not any(
        word in label
        for label in rendered
        for word in (
            "approve",
            "worker invocation",
            "payment",
            "wallet",
            "x402",
            "cdp",
            "sign",
            "submit",
        )
    )
    assert "Human approval always required" in [c.label for c in app.checkbox]
    assert app.checkbox[0].disabled


def test_new_app_session_resets_policy(hosted):
    first = AppTest.from_file(APP, default_timeout=60).run()
    first.radio[0].set_value("Policy Sandbox").run()
    first.selectbox[0].set_value("Code Planning Worker").run()
    assert first.session_state["sandbox_template"] == "Code Planning Worker"
    second = AppTest.from_file(APP, default_timeout=60).run()
    assert second.session_state["sandbox_template"] == "Research Analyst"
    assert not list(hosted.rglob("*"))


class RecordingTransport(httpx.AsyncBaseTransport):
    def __init__(self):
        self.methods = []

    async def handle_async_request(self, request):
        self.methods.append(request.method)
        return httpx.Response(200, json={"tasks": []}, request=request)


def test_discovery_transport_permits_only_fixed_get():
    inner = RecordingTransport()
    transport = PublicDiscoveryTransport(inner)

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            ok = await client.get("https://opentask.ai/api/tasks", params={"limit": 1})
            assert ok.status_code == 200
            with pytest.raises(ValueError):
                await client.post("https://opentask.ai/api/tasks")
            with pytest.raises(ValueError):
                await client.get("https://opentask.ai/api/agent/tasks")

    asyncio.run(run())
    assert inner.methods == ["GET"]


def test_sandbox_source_has_no_persistence_worker_or_write_calls():
    source = (ROOT / "src/arbiter/sandbox.py").read_text()
    tree = ast.parse(source)
    imports = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.Import, ast.ImportFrom))
        for alias in node.names
    }
    assert not any(
        term in item
        for item in imports
        for term in (
            "control_plane",
            "db",
            "evaluation",
            "calibration",
            "orchestrator",
            "arbiter_worker",
        )
    )
    calls = {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert not calls & {"claim", "submit", "settle", "approve", "write_text", "write_bytes"}


def test_evaluation_preview_is_never_approved_or_submission_ready():
    profile, policy = template_profile("Research Analyst")
    entries = [
        {"bounty": b, "source_type": "controlled_mock", "observed_at": None}
        for b in controlled_records()
    ]
    rows = asyncio.run(evaluate(entries, profile, policy))
    assert any(row["package_eligibility"] == "refuse" for row in rows)
    allowed = next(row for row in rows if row["package_eligibility"] == "allow")
    preview = package_preview(allowed, profile, policy)
    rendered = str(preview).lower()
    assert preview["status"] == "preview_only"
    assert preview["submission_status"] == "not_submitted"
    assert preview["marketplace_action_authorized"] is False
    assert preview["package_preview_only"] is True
    assert "submission_ready" not in rendered and "simulated_pnl" not in rendered
