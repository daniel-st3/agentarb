"""RiskGuard: the circuit breaker checked before every claim and paid action.

Week 2 moves no real money, so every figure here is either an estimated API
cost or a simulated settlement. The guard is written against real dollars
anyway -- it must already be correct and tested by the time a wallet exists,
not retrofitted around one.

Three independent limits, checked in order of severity:

1. **Circuit breaker** -- net loss today past `max_loss_per_day_usd` halts all
   claims until the day rolls over or it is manually reset.
2. **Daily spend cap** -- cumulative estimated cost today may not exceed
   `daily_budget_usd`.
3. **Per-task ceiling** -- one task may not cost more than
   `max_cost_per_task_usd`, and its payout must clear cost x margin.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, func, select

from arbiter.config import Settings, get_settings
from arbiter.db import session_scope
from arbiter.logging import get_logger
from arbiter.models import Bounty, LedgerRow, Score, TaskRow, utcnow

log = get_logger(__name__)


@dataclass(frozen=True)
class RiskDecision:
    allowed: bool
    reason: str
    limit: str | None = None

    def __bool__(self) -> bool:
        return self.allowed


ALLOWED = RiskDecision(True, "within limits")


def _day_start(now: datetime | None = None) -> datetime:
    now = now or utcnow()
    return now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)


@dataclass
class DailyTotals:
    spent_usd: float = 0.0
    earned_usd: float = 0.0
    tasks: int = 0

    @property
    def net_usd(self) -> float:
        return self.earned_usd - self.spent_usd


class RiskGuard:
    """Spend limits and the circuit breaker, backed by the ledger."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._tripped: bool = False
        self._tripped_reason: str = ""

    # ---------------- state ----------------

    def totals_today(
        self, session: Session | None = None, now: datetime | None = None
    ) -> DailyTotals:
        """Spend and earnings since 00:00 UTC, read from the ledger."""
        since = _day_start(now)

        def _read(s: Session) -> DailyTotals:
            debit, credit = 0.0, 0.0
            rows = s.exec(select(LedgerRow).where(LedgerRow.created_at >= since)).all()
            for row in rows:
                if row.kind == "debit":
                    debit += row.amount_usd
                else:
                    credit += row.amount_usd
            tasks = s.exec(
                select(func.count(TaskRow.bounty_key)).where(TaskRow.created_at >= since)
            ).one()
            return DailyTotals(spent_usd=debit, earned_usd=credit, tasks=int(tasks or 0))

        if session is not None:
            return _read(session)
        with session_scope() as owned:
            return _read(owned)

    @property
    def tripped(self) -> bool:
        return self._tripped

    @property
    def tripped_reason(self) -> str:
        return self._tripped_reason

    def trip(self, reason: str) -> None:
        """Halt all claims. Surfaced as a dashboard banner."""
        if not self._tripped:
            log.error("risk.circuit_breaker_tripped", reason=reason)
        self._tripped = True
        self._tripped_reason = reason

    def reset(self) -> None:
        log.warning("risk.circuit_breaker_reset", previous_reason=self._tripped_reason)
        self._tripped = False
        self._tripped_reason = ""

    # ---------------- checks ----------------

    def check(
        self,
        bounty: Bounty,
        score: Score,
        session: Session | None = None,
        now: datetime | None = None,
    ) -> RiskDecision:
        """Decide whether this bounty may be claimed. Called before every claim."""
        settings = self.settings
        est_cost = score.est_api_cost_usd + score.est_gas_cost_usd

        if self._tripped:
            return RiskDecision(
                False, f"circuit breaker tripped: {self._tripped_reason}", "breaker"
            )

        totals = self.totals_today(session=session, now=now)

        # 1. Circuit breaker -- have we already lost too much today?
        if -totals.net_usd >= settings.max_loss_per_day_usd:
            reason = (
                f"net loss today ${-totals.net_usd:.2f} at or past cap "
                f"${settings.max_loss_per_day_usd:.2f}"
            )
            self.trip(reason)
            return RiskDecision(False, reason, "max_loss_per_day")

        # 2. Per-task ceiling.
        if est_cost > settings.max_cost_per_task_usd:
            return RiskDecision(
                False,
                f"est. cost ${est_cost:.4f} exceeds per-task ceiling "
                f"${settings.max_cost_per_task_usd:.2f}",
                "max_cost_per_task",
            )

        # 3. Min-margin floor.
        payout = bounty.payout_usd or 0.0
        if payout < est_cost * settings.cost_safety_margin:
            return RiskDecision(
                False,
                f"payout ${payout:.2f} under est. cost ${est_cost:.4f} x margin "
                f"{settings.cost_safety_margin:g}",
                "cost_safety_margin",
            )

        # 4. Daily spend cap -- would this task push us over?
        if totals.spent_usd + est_cost > settings.daily_budget_usd:
            return RiskDecision(
                False,
                f"daily spend ${totals.spent_usd:.4f} + ${est_cost:.4f} would exceed "
                f"budget ${settings.daily_budget_usd:.2f}",
                "daily_budget",
            )

        # 5. Task-count cap -- a cheap backstop against runaway loops.
        if totals.tasks >= settings.max_tasks_per_day:
            return RiskDecision(
                False,
                f"{totals.tasks} tasks today at or past cap {settings.max_tasks_per_day}",
                "max_tasks_per_day",
            )

        return ALLOWED

    def record_spend(
        self,
        bounty_key: str,
        amount_usd: float,
        reason: str,
        marketplace: str = "",
        session: Session | None = None,
    ) -> None:
        self._append(bounty_key, "debit", amount_usd, reason, marketplace, session)

    def record_earning(
        self,
        bounty_key: str,
        amount_usd: float,
        reason: str,
        marketplace: str = "",
        reference: str | None = None,
        session: Session | None = None,
    ) -> None:
        self._append(bounty_key, "credit", amount_usd, reason, marketplace, session, reference)

    def _append(
        self,
        bounty_key: str,
        kind: str,
        amount_usd: float,
        reason: str,
        marketplace: str,
        session: Session | None,
        reference: str | None = None,
    ) -> None:
        row = LedgerRow(
            bounty_key=bounty_key,
            marketplace=marketplace,
            kind=kind,
            amount_usd=round(amount_usd, 6),
            reason=reason,
            reference=reference,
            simulated=True,  # Week 2 has no wallet; nothing here is real money.
        )
        if session is not None:
            session.add(row)
        else:
            with session_scope() as owned:
                owned.add(row)
        log.info("ledger.append", bounty=bounty_key, kind=kind, amount=amount_usd, reason=reason)


def next_reset(now: datetime | None = None) -> datetime:
    """When the daily counters roll over (00:00 UTC)."""
    return _day_start(now) + timedelta(days=1)
