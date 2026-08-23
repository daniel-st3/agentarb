"""RiskGuard limits and the circuit breaker."""

from datetime import timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine

import arbiter.db as db
from arbiter.models import Bounty, Category, LedgerRow, Score, TaskRow, utcnow
from arbiter.risk import RiskGuard, next_reset


@pytest.fixture
def memory_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db, "_engine", engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    return engine


@pytest.fixture
def guard(settings):
    settings.max_loss_per_day_usd = 5.0
    settings.max_cost_per_task_usd = 1.0
    settings.daily_budget_usd = 5.0
    settings.max_tasks_per_day = 20
    settings.cost_safety_margin = 3.0
    return RiskGuard(settings)


def bounty(payout=100.0) -> Bounty:
    return Bounty(
        marketplace="mock", bounty_id="b1", title="t",
        category=Category.RESEARCH, payout_usd=payout,
    )


def score(api=0.05, gas=0.0) -> Score:
    return Score(bounty_key="mock:b1", est_api_cost_usd=api, est_gas_cost_usd=gas)


class TestLimits:
    def test_allows_a_reasonable_task(self, memory_db, guard):
        assert guard.check(bounty(), score()).allowed

    def test_per_task_ceiling(self, memory_db, guard):
        decision = guard.check(bounty(payout=1000.0), score(api=5.0))
        assert not decision.allowed and decision.limit == "max_cost_per_task"

    def test_margin_floor(self, memory_db, guard):
        # payout 0.10 vs cost 0.05 x margin 3 = 0.15
        decision = guard.check(bounty(payout=0.10), score(api=0.05))
        assert not decision.allowed and decision.limit == "cost_safety_margin"

    def test_gas_counts_toward_cost(self, memory_db, guard):
        decision = guard.check(bounty(payout=1000.0), score(api=0.5, gas=0.9))
        assert not decision.allowed and decision.limit == "max_cost_per_task"

    def test_daily_budget_blocks_when_exhausted(self, memory_db, guard):
        guard.record_spend("mock:prior", 4.99, "earlier work")
        decision = guard.check(bounty(), score(api=0.5))
        assert not decision.allowed and decision.limit == "daily_budget"

    def test_task_count_cap(self, memory_db, guard):
        guard.settings.max_tasks_per_day = 2
        with Session(memory_db) as session:
            for i in range(2):
                session.add(TaskRow(bounty_key=f"mock:{i}", run_id="r", marketplace="mock",
                                    bounty_id=str(i)))
            session.commit()
        decision = guard.check(bounty(), score())
        assert not decision.allowed and decision.limit == "max_tasks_per_day"


class TestCircuitBreaker:
    def test_trips_on_daily_loss(self, memory_db, guard):
        guard.record_spend("mock:x", 6.0, "expensive failure")
        decision = guard.check(bounty(), score())
        assert not decision.allowed
        assert decision.limit == "max_loss_per_day"
        assert guard.tripped

    def test_stays_tripped_for_subsequent_checks(self, memory_db, guard):
        guard.trip("manual")
        decision = guard.check(bounty(), score())
        assert not decision.allowed and decision.limit == "breaker"

    def test_reset_clears_it(self, memory_db, guard):
        guard.trip("manual")
        guard.reset()
        assert not guard.tripped
        assert guard.check(bounty(), score()).allowed

    def test_earnings_offset_the_loss_breaker(self, memory_db, guard):
        """The breaker is about *net* loss, so earnings keep it from tripping."""
        guard.settings.daily_budget_usd = 100.0   # isolate the breaker
        guard.record_spend("mock:x", 6.0, "cost")
        guard.record_earning("mock:x", 6.0, "settled")
        assert guard.check(bounty(), score()).allowed
        assert not guard.tripped

    def test_spend_cap_is_gross_not_net(self, memory_db, guard):
        """Earnings do NOT refill the daily spend budget.

        The two limits answer different questions: the breaker asks "are we
        losing money today", the budget asks "how much have we spent today".
        A profitable run should still not be able to spend without bound.
        """
        guard.record_spend("mock:x", 4.99, "cost")
        guard.record_earning("mock:x", 500.0, "big win")
        decision = guard.check(bounty(), score(api=0.5))
        assert not decision.allowed and decision.limit == "daily_budget"


class TestTotals:
    def test_counts_credits_and_debits(self, memory_db, guard):
        guard.record_spend("mock:a", 1.5, "x")
        guard.record_earning("mock:a", 4.0, "y")
        totals = guard.totals_today()
        assert totals.spent_usd == pytest.approx(1.5)
        assert totals.earned_usd == pytest.approx(4.0)
        assert totals.net_usd == pytest.approx(2.5)

    def test_yesterday_is_excluded(self, memory_db, guard):
        with Session(memory_db) as session:
            session.add(LedgerRow(bounty_key="mock:old", kind="debit", amount_usd=99.0,
                                  created_at=utcnow() - timedelta(days=2)))
            session.commit()
        assert guard.totals_today().spent_usd == pytest.approx(0.0)

    def test_ledger_entries_are_flagged_simulated(self, memory_db, guard):
        """Week 2 has no wallet -- nothing may look like real money."""
        guard.record_earning("mock:a", 10.0, "settled")
        with Session(memory_db) as session:
            assert all(r.simulated for r in session.exec(LedgerRow.__table__.select()).all())

    def test_next_reset_is_utc_midnight(self):
        reset = next_reset()
        assert (reset.hour, reset.minute, reset.second) == (0, 0, 0)
        assert reset > utcnow()
