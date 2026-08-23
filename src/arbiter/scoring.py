"""The scoring agent: hard skip-filter, then estimate, then arithmetic.

The skip-filter runs first and is pure Python, so no LLM tokens are ever spent
on a bounty we already know we cannot or should not do. Everything that
survives gets an estimate, and the score is plain arithmetic over it:

    EV     = payout_usd * p_success
    net_EV = EV - (est_api_cost + est_gas_cost)
    score  = net_EV * feasibility * confidence / effort_hours

Week 1 is alert-only: this module ranks and logs. It never claims.
"""

from __future__ import annotations

from dataclasses import dataclass

from arbiter.config import Settings, get_settings
from arbiter.llm import Estimator, get_estimator
from arbiter.logging import get_logger
from arbiter.models import (
    SUPPORTED_CATEGORIES,
    Bounty,
    Category,
    MarketplaceCapabilities,
    Score,
)

log = get_logger(__name__)

#: Effort floor, in hours. Guards the divide and stops a "0-minute" estimate
#: from producing an infinite score.
MIN_EFFORT_HOURS = 1.0 / 60.0


@dataclass(frozen=True)
class ScoredBounty:
    bounty: Bounty
    score: Score

    @property
    def value(self) -> float:
        return self.score.score


def check_skip(
    bounty: Bounty,
    capabilities: MarketplaceCapabilities | None = None,
    settings: Settings | None = None,
) -> str | None:
    """Return a skip reason, or None if the bounty is worth scoring.

    Ordered cheapest-and-most-decisive first.
    """
    settings = settings or get_settings()

    if bounty.category not in SUPPORTED_CATEGORIES:
        return f"unsupported category: {bounty.category.value}"

    if bounty.payout_usd is None:
        return f"payout not machine-readable: {bounty.payout_text!r}"

    if bounty.payout_usd < settings.min_payout_usd:
        return (
            f"payout ${bounty.payout_usd:.2f} below floor ${settings.min_payout_usd:.2f}"
        )

    if capabilities is not None and not capabilities.supports_open_claim:
        # Surfaced in the dashboard, excluded from the autonomous loop.
        return (
            f"{capabilities.name} has no open claim "
            f"(claim_model={capabilities.claim_model.value}, "
            f"settlement={capabilities.settlement.value})"
        )

    return None


def compute_score(bounty: Bounty, estimate: dict, estimator_name: str) -> Score:
    """Apply the score formula to an estimate. Pure and deterministic."""
    payout = bounty.payout_usd or 0.0
    p_success = float(estimate["p_success"])
    feasibility = float(estimate["feasibility"])
    confidence = float(estimate["confidence"])
    api_cost = float(estimate["est_api_cost_usd"])
    gas_cost = float(estimate["est_gas_cost_usd"])
    effort = max(float(estimate["est_effort_hours"]), MIN_EFFORT_HOURS)

    ev = payout * p_success
    net_ev = ev - (api_cost + gas_cost)
    score = net_ev * feasibility * confidence / effort

    return Score(
        bounty_key=bounty.key,
        skipped=False,
        feasibility=feasibility,
        p_success=p_success,
        confidence=confidence,
        est_effort_hours=effort,
        est_api_cost_usd=api_cost,
        est_gas_cost_usd=gas_cost,
        ev_usd=round(ev, 4),
        net_ev_usd=round(net_ev, 4),
        score=round(score, 4),
        estimator=estimator_name,
        rationale=str(estimate.get("rationale", "")),
    )


class ScoringAgent:
    """Scores bounties. Alert-only in Week 1 -- it ranks, it does not act."""

    def __init__(
        self,
        estimator: Estimator | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.estimator = estimator or get_estimator()

    async def score_one(
        self, bounty: Bounty, capabilities: MarketplaceCapabilities | None = None
    ) -> Score:
        reason = check_skip(bounty, capabilities, self.settings)
        if reason is not None:
            log.info("score.skip", bounty=bounty.key, reason=reason)
            return Score(
                bounty_key=bounty.key,
                skipped=True,
                skip_reason=reason,
                estimator=self.estimator.name,
            )

        estimate = await self.estimator.estimate(bounty)
        score = compute_score(bounty, estimate, self.estimator.name)

        # A post-estimate cap: effort is only knowable after the estimate, so
        # this cannot live in the pre-LLM filter.
        if score.est_effort_hours > self.settings.max_effort_hours:
            score.skipped = True
            score.skip_reason = (
                f"estimated effort {score.est_effort_hours:.2f}h exceeds cap "
                f"{self.settings.max_effort_hours:.2f}h"
            )
        elif (bounty.payout_usd or 0.0) < (
            score.est_api_cost_usd + score.est_gas_cost_usd
        ) * self.settings.cost_safety_margin:
            score.skipped = True
            score.skip_reason = (
                f"payout ${bounty.payout_usd:.2f} under est. cost "
                f"${score.est_api_cost_usd + score.est_gas_cost_usd:.4f} x margin "
                f"{self.settings.cost_safety_margin:g}"
            )

        if score.skipped:
            log.info("score.skip", bounty=bounty.key, reason=score.skip_reason)
        else:
            log.info(
                "score.scored",
                bounty=bounty.key,
                score=score.score,
                net_ev=score.net_ev_usd,
                effort_h=score.est_effort_hours,
            )
        return score

    async def score_many(
        self,
        bounties: list[Bounty],
        capabilities: dict[str, MarketplaceCapabilities] | None = None,
    ) -> list[ScoredBounty]:
        """Score every bounty and return them ranked, best first.

        Skipped bounties sort last but are kept -- the dashboard shows the
        judgment, and the skip reason is the interesting part.
        """
        capabilities = capabilities or {}
        results: list[ScoredBounty] = []
        for bounty in bounties:
            score = await self.score_one(bounty, capabilities.get(bounty.marketplace))
            results.append(ScoredBounty(bounty=bounty, score=score))

        return rank(results)


def rank(scored: list[ScoredBounty]) -> list[ScoredBounty]:
    """Descending by score; skipped bounties always sort below scored ones."""
    return sorted(scored, key=lambda s: (not s.score.skipped, s.score.score), reverse=True)


def top_n_within_budget(
    scored: list[ScoredBounty], budget_usd: float, n: int = 5
) -> list[ScoredBounty]:
    """Take the best `n` scored bounties whose combined est. cost fits `budget_usd`."""
    picked: list[ScoredBounty] = []
    spent = 0.0
    for item in rank(scored):
        if item.score.skipped or len(picked) >= n:
            continue
        cost = item.score.est_api_cost_usd + item.score.est_gas_cost_usd
        if spent + cost > budget_usd:
            continue
        picked.append(item)
        spent += cost
    return picked


__all__ = [
    "Category",
    "ScoredBounty",
    "ScoringAgent",
    "check_skip",
    "compute_score",
    "rank",
    "top_n_within_budget",
]
