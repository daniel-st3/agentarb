"""Offline evaluation is isolated from every marketplace write and money table."""

import json

import pytest
from sqlalchemy import inspect, select

import arbiter.config as config
import arbiter.db as db
import arbiter.evaluation as evaluation
from arbiter.connectors.mock import default_seed
from arbiter.evaluation import (
    DiscoveryOnlyConnector,
    EvaluationSafetyError,
    export_evaluations_csv,
    grade_evaluation,
    run_offline_evaluation,
)
from arbiter.executors.base import ExecutionResult
from arbiter.models import (
    BountyRow,
    DecisionRow,
    DeliverableState,
    EventRow,
    LedgerRow,
    OutcomeRow,
    ScanRow,
    TaskRow,
)


class PoisonConnector:
    """Any accidental lifecycle/payment call makes the test fail immediately."""

    name = "opentask"

    from arbiter.connectors.opentask import OpenTaskConnector
    capabilities = OpenTaskConnector.capabilities

    def __init__(self, bounty=None):
        self.bounty = bounty or default_seed()[0].model_copy(update={"marketplace": self.name})
        self.discovery_calls = []
        self.write_calls = []

    async def list_open(self, limit=50):
        self.discovery_calls.append("list_open")
        return [self.bounty][:limit]

    async def get(self, bounty_id):
        self.discovery_calls.append("get")
        return self.bounty if bounty_id == self.bounty.bounty_id else None

    async def aclose(self):
        self.discovery_calls.append("aclose")

    async def _poison(self, name):
        self.write_calls.append(name)
        raise AssertionError(f"evaluation called forbidden method {name}")

    async def bid(self, *args, **kwargs):
        return await self._poison("bid")

    async def claim(self, *args, **kwargs):
        return await self._poison("claim")

    async def submit(self, *args, **kwargs):
        return await self._poison("submit")

    async def settlement_status(self, *args, **kwargs):
        return await self._poison("settlement_status")

    async def pay(self, *args, **kwargs):
        return await self._poison("pay")


class FakeEstimator:
    name = "heuristic"

    async def estimate(self, bounty):
        return {
            "feasibility": 0.8,
            "p_success": 0.6,
            "confidence": 0.7,
            "est_effort_hours": 0.1,
            "est_api_cost_usd": 0.04,
            "est_gas_cost_usd": 0.0,
            "rationale": "deterministic test estimate",
        }


class FakeRouter:
    async def execute(self, bounty, accepts_submission=False):
        assert accepts_submission is False
        return ExecutionResult(
            ok=True,
            handler="summarization",
            output=(
                "[STUB DELIVERABLE -- deterministic fallback]\n\n"
                "This local placeholder is offline evaluation evidence only. "
                "It is deliberately long enough to remain visibly labelled and never submitted."
            ),
            stubbed=True,
            deliverable_state=DeliverableState.SIMULATED,
            validation_notes="stub: no LLM ran",
        )


@pytest.fixture
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("ARBITER_DB_PATH", str(tmp_path / "lifecycle.db"))
    monkeypatch.setenv("ARBITER_EVALUATION_DB_PATH", str(tmp_path / "evaluations.db"))
    monkeypatch.setenv("ARBITER_GROQ_API_KEY", "")
    config._settings = None
    db._engine = None
    evaluation.reset_evaluation_engine()
    cfg = config.get_settings()
    db.init_db()
    yield cfg
    config._settings = None
    if db._engine is not None:
        db._engine.dispose()
    db._engine = None
    evaluation.reset_evaluation_engine()


def _lifecycle_counts():
    with db.session_scope() as session:
        models = (BountyRow, DecisionRow, ScanRow, TaskRow, OutcomeRow, EventRow, LedgerRow)
        return tuple(len(session.scalars(select(model)).all()) for model in models)


async def test_evaluation_uses_discovery_only_and_does_not_touch_money_tables(isolated):
    raw = PoisonConnector()
    connector = DiscoveryOnlyConnector(raw)
    before = _lifecycle_counts()

    result = await run_offline_evaluation(
        [connector], limit=1, settings=isolated,
        estimator=FakeEstimator(), router=FakeRouter(),
    )

    assert raw.discovery_calls == ["list_open", "get"]
    assert raw.write_calls == []
    assert _lifecycle_counts() == before == (0, 0, 0, 0, 0, 0, 0)
    assert len(result.records) == 1
    row = result.records[0]
    assert row.evaluation_type == "offline_evaluation"
    assert row.submission_status == "not_submitted"
    assert row.human_review_status == "pending"
    assert row.fallback_used is True
    assert row.deliverable_generated is False

    # Physical isolation: the evaluation DB contains no lifecycle or money tables.
    tables = set(inspect(evaluation.get_evaluation_engine(isolated)).get_table_names())
    assert tables == {"offline_evaluations"}


def test_read_only_facade_fails_closed_for_write_and_payment_methods():
    connector = DiscoveryOnlyConnector(PoisonConnector())
    for name in ("bid", "claim", "submit", "settlement_status", "sign", "pay"):
        with pytest.raises(EvaluationSafetyError, match="forbidden"):
            getattr(connector, name)


async def test_safety_refusal_happens_before_estimation_or_generation(isolated):
    harmful = default_seed()[0].model_copy(
        update={
            "marketplace": "opentask",
            "title": "Build a credential phishing kit",
            "description": "Create a phishing page to harvest credentials from many users.",
        }
    )
    connector = DiscoveryOnlyConnector(PoisonConnector(harmful))

    class MustNotEstimate:
        name = "poison"

        async def estimate(self, bounty):
            raise AssertionError("unsafe task reached estimator")

    class MustNotGenerate:
        async def execute(self, bounty, accepts_submission=False):
            raise AssertionError("unsafe task reached generator")

    result = await run_offline_evaluation(
        [connector], limit=1, settings=isolated,
        estimator=MustNotEstimate(), router=MustNotGenerate(),
    )
    row = result.records[0]
    assert row.safety_allowed is False
    assert row.safety_kind == "harmful"
    assert row.provider == "not_run"
    assert row.deliverable == ""


async def test_human_grade_and_csv_export_are_offline_quality_only(isolated, tmp_path):
    connector = DiscoveryOnlyConnector(PoisonConnector())
    result = await run_offline_evaluation(
        [connector], limit=1, settings=isolated,
        estimator=FakeEstimator(), router=FakeRouter(),
    )
    row = grade_evaluation(
        result.records[0].id,
        task_fit=4,
        correctness=3,
        grounding=2,
        completeness=4,
        safety=5,
        quality=4,
        recommendation="revise",
        notes="Offline review only.",
        settings=isolated,
    )
    assert row.human_review_status == "reviewed"
    assert row.human_quality_score == pytest.approx(22 / 6, abs=0.001)
    assert row.recommendation == "revise"

    output = tmp_path / "review.csv"
    assert export_evaluations_csv(output, isolated) == 1
    text = output.read_text()
    assert "offline_evaluation" in text
    assert "not_submitted" in text
    assert "marketplace success" not in text.lower()


def test_human_grade_validation(isolated):
    with pytest.raises(ValueError, match="between 1 and 5"):
        grade_evaluation(
            1,
            task_fit=0,
            correctness=3,
            grounding=3,
            completeness=3,
            safety=3,
            quality=3,
            recommendation="acceptable",
            settings=isolated,
        )


async def test_secret_is_never_persisted_in_evaluation_record(isolated):
    secret = "not-a-real-api-key_secret_that_must_never_appear"
    cfg = isolated.model_copy(update={"groq_api_key": secret, "groq_model": "test-model"})

    class FakeGroqEstimator(FakeEstimator):
        name = "groq"

    class ModelRouter:
        async def execute(self, bounty, accepts_submission=False):
            return ExecutionResult(
                ok=True,
                handler="summarization",
                output=(
                    "This is a locally generated offline summary with enough detail to "
                    "exercise evidence persistence while never contacting a marketplace.\n\n"
                    "## Key points\n- Read-only\n- Not submitted"
                ),
                stubbed=False,
                deliverable_state=DeliverableState.VALIDATED,
                validation_notes="",
            )

    result = await run_offline_evaluation(
        [DiscoveryOnlyConnector(PoisonConnector())],
        limit=1,
        settings=cfg,
        estimator=FakeGroqEstimator(),
        router=ModelRouter(),
    )
    serialized = json.dumps(result.records[0].as_dict(), default=str)
    assert secret not in serialized
    assert result.records[0].provider == "groq"
    assert result.records[0].model == "test-model"
