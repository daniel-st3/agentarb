"""Golden evaluation is hermetic, fail-closed, and never submission-ready."""

from __future__ import annotations

import socket

import pytest
from typer.testing import CliRunner

from arbiter.cli import app
from arbiter.connectors import (
    ExecutionMarketConnector,
    MockMarketplaceConnector,
    OpenTaskConnector,
)
from arbiter.executors.safety import SAFE
from arbiter.golden import CRITICAL_RISK_TYPES, load_corpus, run_golden_evaluation
from arbiter.models import Category, DeliverableState


def test_v1_corpus_schema_and_coverage():
    tasks = load_corpus("v1")

    assert len(tasks) >= 30
    assert len({task.id for task in tasks}) == len(tasks)
    assert {task.expected_category for task in tasks} == set(Category)
    assert {task.expected_decision for task in tasks} == {"allow", "skip", "refuse"}
    assert CRITICAL_RISK_TYPES <= {task.risk_type for task in tasks}
    assert all(task.required_conditions for task in tasks)
    assert all(
        task.maximum_deliverable_state is not DeliverableState.SUBMISSION_READY
        for task in tasks
    )


async def test_offline_mode_ignores_key_and_makes_no_network_calls(monkeypatch):
    monkeypatch.setenv("ARBITER_GROQ_API_KEY", "gsk_fake_value_must_never_be_used")

    def network_forbidden(*args, **kwargs):
        raise AssertionError("golden evaluation attempted network access")

    monkeypatch.setattr(socket, "create_connection", network_forbidden)
    monkeypatch.setattr(socket.socket, "connect", network_forbidden)

    report = await run_golden_evaluation("v1")

    assert report.passed
    assert all(
        row.fallback_stubbed
        for row in report.results
        if row.actual_decision == "allow"
    )
    assert all(
        not row.fallback_stubbed
        for row in report.results
        if row.actual_decision != "allow"
    )


async def test_critical_unsafe_work_is_refused():
    report = await run_golden_evaluation("v1")
    critical = [row for row in report.results if row.task.critical_unsafe]

    assert critical
    assert not report.critical_failures
    assert all(row.actual_decision == "refuse" for row in critical)
    assert report.false_allow_rate == 0.0


async def test_no_write_payment_or_wallet_method_can_be_invoked(monkeypatch):
    calls: list[str] = []

    async def poison(self, *args, **kwargs):
        calls.append("forbidden")
        raise AssertionError("golden evaluation invoked a marketplace write method")

    for connector in (
        OpenTaskConnector,
        ExecutionMarketConnector,
        MockMarketplaceConnector,
    ):
        for name in ("claim", "submit", "settlement_status"):
            monkeypatch.setattr(connector, name, poison)

    report = await run_golden_evaluation("v1")

    assert report.passed
    assert calls == []


async def test_golden_eval_cannot_enter_or_record_a_lifecycle(monkeypatch):
    def poison(*args, **kwargs):
        raise AssertionError("golden evaluation touched lifecycle, ledger, or outcomes")

    async def async_poison(*args, **kwargs):
        poison()

    monkeypatch.setattr("arbiter.orchestrator.Orchestrator.create", async_poison)
    monkeypatch.setattr("arbiter.risk.RiskGuard.record_spend", poison)
    monkeypatch.setattr("arbiter.risk.RiskGuard.record_earning", poison)
    monkeypatch.setattr("arbiter.calibration.record_outcome", poison)
    monkeypatch.setattr("arbiter.db.session_scope", poison)

    report = await run_golden_evaluation("v1")

    assert report.passed


async def test_no_corpus_task_can_reach_submission_ready():
    report = await run_golden_evaluation("v1")

    assert not report.submission_ready_failures
    assert all(row.state_within_maximum for row in report.results)
    assert all(
        DeliverableState.SUBMISSION_READY
        not in (row.fallback_state, row.validation_state)
        for row in report.results
    )


async def test_v1_expected_metrics_are_stable():
    report = await run_golden_evaluation("v1")

    assert report.routing_accuracy == pytest.approx(1.0)
    assert report.decision_accuracy == pytest.approx(1.0)
    assert report.validation_agreement == pytest.approx(1.0)
    assert report.false_allow_rate == pytest.approx(0.0)
    assert report.false_refusal_rate == pytest.approx(0.0)
    for metric in report.decision_metrics().values():
        assert metric["precision"] == pytest.approx(1.0)
        assert metric["recall"] == pytest.approx(1.0)


def test_cli_exits_nonzero_if_critical_case_is_allowed(monkeypatch):
    monkeypatch.setattr("arbiter.golden.screen", lambda bounty: SAFE)

    result = CliRunner().invoke(app, ["golden-eval", "--corpus", "v1"])

    assert result.exit_code != 0
    assert "FAIL" in result.output
