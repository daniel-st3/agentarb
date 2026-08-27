"""Reputation / calibration: was the scorer actually right?

The scorer predicts `p_success` for every bounty it takes. This module
records what happened and measures the gap. Two distinct questions:

- **Calibration** -- when the scorer says 0.7, does roughly 70% succeed?
  Measured as Brier score (lower is better) and signed bias (positive means
  over-confident), bucketed so you can see *where* it is wrong.
- **Decision quality** -- of the bounties it chose, how many worked out, and
  what did that cost versus earn?

Every metric can be sliced by category and marketplace, and simulated
outcomes are tracked separately so mock results are never mistaken for real
market evidence.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlmodel import Session, select

from arbiter.db import session_scope
from arbiter.logging import get_logger
from arbiter.models import Category, DeliverableState, OutcomeRow, Score, TaskRow

log = get_logger(__name__)

#: Prediction buckets for the reliability table.
BUCKETS: list[tuple[float, float]] = [
    (0.0, 0.2), (0.2, 0.4), (0.4, 0.6), (0.6, 0.8), (0.8, 1.0001)
]


def record_outcome(
    bounty_key: str,
    marketplace: str,
    category: str,
    score: Score,
    accepted: bool,
    deliverable_state: str | None,
    actual_cost_usd: float,
    actual_payout_usd: float,
    handler: str | None,
    simulated: bool,
    failure_reason: str | None = None,
    session: Session | None = None,
) -> None:
    """Record predicted-vs-actual for one attempt. Idempotent per bounty."""

    def _write(s: Session) -> None:
        existing = s.exec(
            select(OutcomeRow).where(OutcomeRow.bounty_key == bounty_key)
        ).first()
        row = existing or OutcomeRow(bounty_key=bounty_key)
        row.marketplace = marketplace
        row.category = category
        row.predicted_p_success = score.p_success
        row.predicted_feasibility = score.feasibility
        row.predicted_confidence = score.confidence
        row.predicted_effort_hours = score.est_effort_hours
        row.predicted_cost_usd = (
            score.estimated_task_execution_cost_usd + score.estimated_other_cost_usd
        )
        row.accepted = accepted
        row.deliverable_state = deliverable_state
        row.actual_cost_usd = actual_cost_usd
        row.actual_payout_usd = actual_payout_usd
        row.handler = handler
        row.failure_reason = failure_reason
        row.simulated = simulated
        s.add(row)

    if session is not None:
        _write(session)
    else:
        with session_scope() as owned:
            _write(owned)

    log.info(
        "calibration.outcome", bounty=bounty_key, predicted=score.p_success,
        accepted=accepted, simulated=simulated,
    )


@dataclass
class Bucket:
    low: float
    high: float
    n: int = 0
    predicted_mean: float = 0.0
    actual_rate: float = 0.0

    @property
    def label(self) -> str:
        return f"{self.low:.1f}–{self.high if self.high <= 1 else 1.0:.1f}"

    @property
    def gap(self) -> float:
        """Positive = over-confident."""
        return self.predicted_mean - self.actual_rate


@dataclass
class Calibration:
    n: int = 0
    accepted: int = 0
    brier: float | None = None
    bias: float | None = None
    mean_predicted: float = 0.0
    buckets: list[Bucket] = field(default_factory=list)

    total_cost_usd: float = 0.0
    total_payout_usd: float = 0.0
    cost_error: float | None = None       # actual - predicted, mean

    @property
    def acceptance_rate(self) -> float | None:
        return (self.accepted / self.n) if self.n else None

    @property
    def net_usd(self) -> float:
        return self.total_payout_usd - self.total_cost_usd

    @property
    def verdict(self) -> str:
        """Plain-language read of the bias, for the dashboard."""
        if self.bias is None or self.n < 3:
            return "not enough data"
        if abs(self.bias) < 0.05:
            return "well calibrated"
        return "over-confident" if self.bias > 0 else "under-confident"


def _summarize(rows: list[OutcomeRow]) -> Calibration:
    result = Calibration(n=len(rows))
    if not rows:
        return result

    result.accepted = sum(1 for r in rows if r.accepted)
    result.mean_predicted = sum(r.predicted_p_success for r in rows) / len(rows)
    # Brier score: mean squared error between prediction and outcome.
    result.brier = sum(
        (r.predicted_p_success - (1.0 if r.accepted else 0.0)) ** 2 for r in rows
    ) / len(rows)
    result.bias = result.mean_predicted - (result.accepted / len(rows))

    result.total_cost_usd = sum(r.actual_cost_usd for r in rows)
    result.total_payout_usd = sum(r.actual_payout_usd for r in rows)
    result.cost_error = sum(
        r.actual_cost_usd - r.predicted_cost_usd for r in rows
    ) / len(rows)

    for low, high in BUCKETS:
        members = [r for r in rows if low <= r.predicted_p_success < high]
        if not members:
            continue
        result.buckets.append(
            Bucket(
                low=low,
                high=high,
                n=len(members),
                predicted_mean=sum(r.predicted_p_success for r in members) / len(members),
                actual_rate=sum(1 for r in members if r.accepted) / len(members),
            )
        )
    return result


def _load(
    session: Session | None = None,
    simulated: bool | None = None,
    marketplace: str | None = None,
    category: str | None = None,
) -> list[OutcomeRow]:
    def _read(s: Session) -> list[OutcomeRow]:
        statement = select(OutcomeRow)
        if simulated is not None:
            statement = statement.where(OutcomeRow.simulated == simulated)
        if marketplace is not None:
            statement = statement.where(OutcomeRow.marketplace == marketplace)
        if category is not None:
            statement = statement.where(OutcomeRow.category == category)
        return list(s.exec(statement).all())

    if session is not None:
        return _read(session)
    with session_scope() as owned:
        return _read(owned)


def overall(session: Session | None = None, simulated: bool | None = None) -> Calibration:
    return _summarize(_load(session, simulated=simulated))


def by_category(session: Session | None = None, simulated: bool | None = None
                ) -> dict[str, Calibration]:
    rows = _load(session, simulated=simulated)
    categories = {r.category for r in rows}
    return {c: _summarize([r for r in rows if r.category == c]) for c in sorted(categories)}


def by_marketplace(session: Session | None = None, simulated: bool | None = None
                   ) -> dict[str, Calibration]:
    rows = _load(session, simulated=simulated)
    markets = {r.marketplace for r in rows}
    return {m: _summarize([r for r in rows if r.marketplace == m]) for m in sorted(markets)}


def adjustment_for(
    category: Category | str,
    marketplace: str | None = None,
    session: Session | None = None,
    min_samples: int = 5,
) -> float:
    """A multiplier to fold measured bias back into future p_success estimates.

    Returns 1.0 until there is enough evidence -- a calibration layer that
    reacts to two data points is noise, not learning. Clamped so one bad run
    cannot swing scoring wildly.
    """
    key = category.value if isinstance(category, Category) else str(category)
    rows = _load(session, marketplace=marketplace, category=key)
    if len(rows) < min_samples:
        return 1.0

    summary = _summarize(rows)
    if not summary.mean_predicted:
        return 1.0

    actual = summary.accepted / summary.n
    ratio = actual / summary.mean_predicted
    return max(0.5, min(1.5, ratio))


def backfill_from_tasks(session: Session | None = None) -> int:
    """Derive outcomes from finished tasks that predate the outcomes table."""
    def _run(s: Session) -> int:
        written = 0
        for task in s.exec(select(TaskRow)).all():
            if task.state not in {"settled", "failed"}:
                continue
            if s.exec(
                select(OutcomeRow).where(OutcomeRow.bounty_key == task.bounty_key)
            ).first():
                continue
            s.add(
                OutcomeRow(
                    bounty_key=task.bounty_key,
                    marketplace=task.marketplace,
                    category=task.category,
                    predicted_p_success=0.0,
                    accepted=task.state == "settled",
                    deliverable_state=task.deliverable_state,
                    actual_cost_usd=task.actual_cost_usd,
                    actual_payout_usd=task.settled_amount_usd,
                    handler=task.handler,
                    failure_reason=task.error,
                    simulated=task.simulated,
                )
            )
            written += 1
        return written

    if session is not None:
        return _run(session)
    with session_scope() as owned:
        return _run(owned)


__all__ = [
    "Bucket",
    "Calibration",
    "DeliverableState",
    "adjustment_for",
    "backfill_from_tasks",
    "by_category",
    "by_marketplace",
    "overall",
    "record_outcome",
]
