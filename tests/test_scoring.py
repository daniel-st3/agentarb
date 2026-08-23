"""Skip-filter, score formula, and ranking."""

import pytest

from arbiter.llm import HeuristicEstimator
from arbiter.models import Bounty, Category, ClaimModel, MarketplaceCapabilities, Settlement
from arbiter.scoring import (
    MIN_EFFORT_HOURS,
    ScoredBounty,
    ScoringAgent,
    check_skip,
    compute_score,
    rank,
    top_n_within_budget,
)

PULL = MarketplaceCapabilities(
    name="mock", supports_open_claim=True, claim_model=ClaimModel.OPEN_CLAIM,
    settlement=Settlement.SIMULATED, has_human_accept_gate=False,
)
BID = MarketplaceCapabilities(
    name="opentask", supports_open_claim=False, claim_model=ClaimModel.BID,
    settlement=Settlement.OFFPLATFORM, has_human_accept_gate=True,
)


def make(**kw) -> Bounty:
    return Bounty(**{
        "marketplace": "mock", "bounty_id": "b1", "title": "t",
        "description": "d" * 60, "category": Category.RESEARCH, "payout_usd": 20.0,
        **kw,
    })


ESTIMATE = {
    "feasibility": 0.8, "p_success": 0.5, "confidence": 0.6,
    "est_effort_hours": 0.1, "est_api_cost_usd": 0.05, "est_gas_cost_usd": 0.0,
    "rationale": "r",
}


class TestSkipFilter:
    def test_passes_a_good_bounty(self, settings):
        assert check_skip(make(), PULL, settings) is None

    def test_unsupported_category(self, settings):
        reason = check_skip(make(category=Category.UNKNOWN), PULL, settings)
        assert "unsupported category" in reason

    def test_payout_below_floor(self, settings):
        assert "below floor" in check_skip(make(payout_usd=0.5), PULL, settings)

    def test_unparseable_payout(self, settings):
        reason = check_skip(make(payout_usd=None, payout_text="ask us"), PULL, settings)
        assert "not machine-readable" in reason

    def test_no_open_claim_is_skipped(self, settings):
        reason = check_skip(make(), BID, settings)
        assert "no open claim" in reason

    def test_capabilities_optional(self, settings):
        assert check_skip(make(), None, settings) is None

    def test_category_checked_before_payout(self, settings):
        """Cheapest, most decisive filter first — and never spends tokens."""
        reason = check_skip(make(category=Category.UNKNOWN, payout_usd=0.01), PULL, settings)
        assert "unsupported category" in reason


class TestFormula:
    def test_matches_the_spec(self):
        score = compute_score(make(payout_usd=20.0), ESTIMATE, "test")
        assert score.ev_usd == pytest.approx(10.0)          # 20 * 0.5
        assert score.net_ev_usd == pytest.approx(9.95)      # - 0.05
        # 9.95 * 0.8 * 0.6 / 0.1
        assert score.score == pytest.approx(47.76, rel=1e-3)

    def test_zero_effort_cannot_produce_infinity(self):
        score = compute_score(make(), {**ESTIMATE, "est_effort_hours": 0.0}, "test")
        assert score.est_effort_hours == MIN_EFFORT_HOURS
        assert score.score < float("inf")

    def test_costs_can_drive_net_ev_negative(self):
        score = compute_score(
            make(payout_usd=1.0), {**ESTIMATE, "est_api_cost_usd": 5.0}, "test"
        )
        assert score.net_ev_usd < 0 and score.score < 0

    def test_gas_is_subtracted(self):
        base = compute_score(make(), ESTIMATE, "t")
        gassy = compute_score(make(), {**ESTIMATE, "est_gas_cost_usd": 1.0}, "t")
        assert gassy.net_ev_usd == pytest.approx(base.net_ev_usd - 1.0)


class TestRanking:
    def _item(self, value, skipped=False):
        bounty = make(bounty_id=f"b{value}")
        score = compute_score(bounty, ESTIMATE, "t")
        score.score = value
        score.skipped = skipped
        return ScoredBounty(bounty=bounty, score=score)

    def test_descending(self):
        ranked = rank([self._item(1.0), self._item(9.0), self._item(5.0)])
        assert [s.score.score for s in ranked] == [9.0, 5.0, 1.0]

    def test_skipped_sort_last_even_if_high(self):
        ranked = rank([self._item(99.0, skipped=True), self._item(1.0)])
        assert ranked[0].score.score == 1.0

    def test_top_n_respects_budget(self):
        items = [self._item(float(i)) for i in range(10)]
        for item in items:
            item.score.est_api_cost_usd = 1.0
        picked = top_n_within_budget(items, budget_usd=2.5, n=10)
        assert len(picked) == 2       # 3rd would exceed 2.5
        assert picked[0].score.score > picked[1].score.score

    def test_top_n_excludes_skipped(self):
        picked = top_n_within_budget([self._item(99.0, skipped=True)], 100.0)
        assert picked == []


class TestScoringAgent:
    async def test_effort_cap_applies_after_estimate(self, settings):
        agent = ScoringAgent(estimator=HeuristicEstimator(), settings=settings)
        score = await agent.score_one(
            make(title="Build and deploy a full multi-tenant billing service",
                 category=Category.SMALL_CODE, payout_usd=4000.0),
            PULL,
        )
        assert score.skipped and "exceeds cap" in score.skip_reason

    async def test_margin_floor(self, settings):
        settings.cost_safety_margin = 1000.0
        agent = ScoringAgent(estimator=HeuristicEstimator(), settings=settings)
        score = await agent.score_one(make(payout_usd=2.0), PULL)
        assert score.skipped and "margin" in score.skip_reason

    async def test_skip_returns_before_estimating(self, settings):
        class Boom:
            name = "boom"
            async def estimate(self, bounty):
                raise AssertionError("estimator must not run on a skipped bounty")

        agent = ScoringAgent(estimator=Boom(), settings=settings)
        score = await agent.score_one(make(category=Category.UNKNOWN), PULL)
        assert score.skipped

    async def test_score_many_returns_ranked(self, settings):
        agent = ScoringAgent(estimator=HeuristicEstimator(), settings=settings)
        results = await agent.score_many(
            [make(bounty_id="a", payout_usd=5.0), make(bounty_id="b", payout_usd=50.0)],
            {"mock": PULL},
        )
        values = [r.score.score for r in results if not r.score.skipped]
        assert values == sorted(values, reverse=True)
