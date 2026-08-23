"""Calibration metrics: predicted p_success vs. what actually happened."""

import pytest
from sqlmodel import Session, SQLModel, create_engine

import arbiter.db as db
from arbiter import calibration
from arbiter.models import Category, Score


@pytest.fixture
def memory_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db, "_engine", engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    return engine


def add(key, predicted, accepted, category=Category.RESEARCH, marketplace="mock",
        simulated=True, cost=0.01, payout=10.0):
    calibration.record_outcome(
        bounty_key=key, marketplace=marketplace, category=category.value,
        score=Score(bounty_key=key, p_success=predicted, est_api_cost_usd=cost),
        accepted=accepted, deliverable_state="validated",
        actual_cost_usd=cost, actual_payout_usd=payout if accepted else 0.0,
        handler="research", simulated=simulated,
    )


class TestRecording:
    def test_records_an_outcome(self, memory_db):
        add("mock:a", 0.7, True)
        assert calibration.overall().n == 1

    def test_is_idempotent_per_bounty(self, memory_db):
        add("mock:a", 0.7, True)
        add("mock:a", 0.7, False)
        summary = calibration.overall()
        assert summary.n == 1, "one row per bounty, updated not duplicated"
        assert summary.accepted == 0, "the later outcome wins"


class TestCalibrationMetrics:
    def test_perfect_prediction_scores_zero_brier(self, memory_db):
        add("mock:a", 1.0, True)
        add("mock:b", 0.0, False)
        assert calibration.overall().brier == pytest.approx(0.0)

    def test_worst_prediction_scores_one(self, memory_db):
        add("mock:a", 1.0, False)
        add("mock:b", 0.0, True)
        assert calibration.overall().brier == pytest.approx(1.0)

    def test_over_confidence_is_positive_bias(self, memory_db):
        for i in range(10):
            add(f"mock:{i}", 0.9, accepted=i < 3)   # predicted 90%, actual 30%
        summary = calibration.overall()
        assert summary.bias == pytest.approx(0.6)
        assert summary.verdict == "over-confident"

    def test_under_confidence_is_negative_bias(self, memory_db):
        for i in range(10):
            add(f"mock:{i}", 0.2, accepted=i < 8)   # predicted 20%, actual 80%
        summary = calibration.overall()
        assert summary.bias == pytest.approx(-0.6)
        assert summary.verdict == "under-confident"

    def test_well_calibrated_says_so(self, memory_db):
        for i in range(10):
            add(f"mock:{i}", 0.5, accepted=i < 5)
        assert calibration.overall().verdict == "well calibrated"

    def test_small_samples_are_not_judged(self, memory_db):
        add("mock:a", 0.9, False)
        assert calibration.overall().verdict == "not enough data"

    def test_acceptance_rate(self, memory_db):
        for i in range(4):
            add(f"mock:{i}", 0.5, accepted=i < 3)
        assert calibration.overall().acceptance_rate == pytest.approx(0.75)

    def test_empty_is_safe(self, memory_db):
        summary = calibration.overall()
        assert summary.n == 0
        assert summary.brier is None
        assert summary.acceptance_rate is None
        assert summary.verdict == "not enough data"


class TestBuckets:
    def test_groups_predictions_into_bands(self, memory_db):
        add("mock:a", 0.1, False)
        add("mock:b", 0.5, True)
        add("mock:c", 0.9, True)
        buckets = calibration.overall().buckets
        assert len(buckets) == 3
        assert all(b.n == 1 for b in buckets)

    def test_bucket_gap_shows_direction(self, memory_db):
        for i in range(4):
            add(f"mock:{i}", 0.9, accepted=False)
        bucket = calibration.overall().buckets[0]
        assert bucket.gap == pytest.approx(0.9), "over-confident band has a positive gap"


class TestSlicing:
    def test_by_category(self, memory_db):
        add("mock:a", 0.8, True, category=Category.RESEARCH)
        add("mock:b", 0.8, False, category=Category.SMALL_CODE)
        sliced = calibration.by_category()
        assert sliced["research"].acceptance_rate == 1.0
        assert sliced["small_code"].acceptance_rate == 0.0

    def test_by_marketplace(self, memory_db):
        add("mock:a", 0.8, True, marketplace="mock")
        add("ot:b", 0.8, False, marketplace="opentask")
        sliced = calibration.by_marketplace()
        assert set(sliced) == {"mock", "opentask"}

    def test_simulated_outcomes_are_separable(self, memory_db):
        """Mock results must never be counted as real market evidence."""
        add("mock:a", 0.8, True, simulated=True)
        add("em:b", 0.8, True, simulated=False)
        assert calibration.overall().n == 2
        assert calibration.overall(simulated=True).n == 1
        assert calibration.overall(simulated=False).n == 1


class TestPnL:
    def test_tracks_cost_and_payout(self, memory_db):
        add("mock:a", 0.8, True, cost=0.02, payout=10.0)
        add("mock:b", 0.8, False, cost=0.03, payout=10.0)
        summary = calibration.overall()
        assert summary.total_cost_usd == pytest.approx(0.05)
        assert summary.total_payout_usd == pytest.approx(10.0)
        assert summary.net_usd == pytest.approx(9.95)

    def test_cost_error_is_actual_minus_predicted(self, memory_db):
        calibration.record_outcome(
            bounty_key="mock:a", marketplace="mock", category="research",
            score=Score(bounty_key="mock:a", p_success=0.5, est_api_cost_usd=0.01),
            accepted=True, deliverable_state="validated",
            actual_cost_usd=0.03, actual_payout_usd=5.0, handler="research",
            simulated=True,
        )
        assert calibration.overall().cost_error == pytest.approx(0.02)


class TestAdjustment:
    def test_returns_one_without_enough_evidence(self, memory_db):
        add("mock:a", 0.9, False)
        assert calibration.adjustment_for(Category.RESEARCH) == 1.0

    def test_shrinks_when_over_confident(self, memory_db):
        for i in range(10):
            add(f"mock:{i}", 0.8, accepted=i < 4)   # predicted .8, actual .4
        assert calibration.adjustment_for(Category.RESEARCH) == pytest.approx(0.5)

    def test_grows_when_under_confident(self, memory_db):
        for i in range(10):
            add(f"mock:{i}", 0.4, accepted=i < 8)   # predicted .4, actual .8
        assert calibration.adjustment_for(Category.RESEARCH) == pytest.approx(1.5)

    def test_is_clamped(self, memory_db):
        """One catastrophic run must not swing scoring wildly."""
        for i in range(10):
            add(f"mock:{i}", 0.99, accepted=False)
        assert calibration.adjustment_for(Category.RESEARCH) == 0.5

    def test_is_scoped_to_the_category(self, memory_db):
        for i in range(10):
            add(f"mock:{i}", 0.8, accepted=False, category=Category.SMALL_CODE)
        assert calibration.adjustment_for(Category.RESEARCH) == 1.0
        assert calibration.adjustment_for(Category.SMALL_CODE) < 1.0


class TestBackfill:
    def test_derives_outcomes_from_finished_tasks(self, memory_db):
        from arbiter.models import TaskRow

        with Session(memory_db) as session:
            session.add(TaskRow(
                bounty_key="mock:x", run_id="r", marketplace="mock", bounty_id="x",
                category="research", state="settled", settled_amount_usd=10.0,
            ))
            session.add(TaskRow(
                bounty_key="mock:y", run_id="r", marketplace="mock", bounty_id="y",
                category="research", state="pending_approval",
            ))
            session.commit()

        assert calibration.backfill_from_tasks() == 1
        assert calibration.overall().n == 1
        assert calibration.backfill_from_tasks() == 0, "does not duplicate"
