"""Week 1 pipeline: scan -> score -> rank -> record. No claiming, no wallet.

This is the alert-only precursor to the Week 2 LangGraph orchestrator. It
keeps the same shape (a run id, an append-only decision row per bounty) so
the state machine can be dropped in without changing the audit schema.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass

from sqlmodel import select

from arbiter.config import Settings, get_settings
from arbiter.connectors.base import ConnectorError, MarketplaceConnector
from arbiter.db import init_db, session_scope
from arbiter.logging import get_logger
from arbiter.models import Bounty, BountyRow, DecisionRow, ScanRow, utcnow
from arbiter.scoring import ScoredBounty, ScoringAgent

log = get_logger(__name__)


@dataclass
class ScanResult:
    run_id: str
    scored: list[ScoredBounty]
    errors: dict[str, str]

    @property
    def actionable(self) -> list[ScoredBounty]:
        return [s for s in self.scored if not s.score.skipped]

    @property
    def skipped(self) -> list[ScoredBounty]:
        return [s for s in self.scored if s.score.skipped]


async def collect(connectors: list[MarketplaceConnector], limit: int = 50):
    """Fetch from every connector concurrently. One failure never sinks a run."""
    async def _one(connector: MarketplaceConnector) -> tuple[str, list[Bounty] | str]:
        try:
            return connector.name, await connector.list_open(limit=limit)
        except (ConnectorError, Exception) as exc:  # noqa: BLE001
            log.error("scan.connector_failed", marketplace=connector.name, error=str(exc))
            return connector.name, f"{type(exc).__name__}: {exc}"

    bounties: list[Bounty] = []
    errors: dict[str, str] = {}
    for name, outcome in await asyncio.gather(*(_one(c) for c in connectors)):
        if isinstance(outcome, str):
            errors[name] = outcome
        else:
            bounties.extend(outcome)
    return bounties, errors


async def run_scan(
    connectors: list[MarketplaceConnector],
    limit: int = 50,
    settings: Settings | None = None,
    agent: ScoringAgent | None = None,
    persist: bool = True,
) -> ScanResult:
    """One full alert-only cycle."""
    settings = settings or get_settings()
    agent = agent or ScoringAgent(settings=settings)
    run_id = uuid.uuid4().hex[:12]

    log.info("scan.start", run_id=run_id, marketplaces=[c.name for c in connectors])

    bounties, errors = await collect(connectors, limit=limit)
    capabilities = {c.name: c.capabilities for c in connectors}
    scored = await agent.score_many(bounties, capabilities)

    result = ScanResult(run_id=run_id, scored=scored, errors=errors)

    if persist:
        persist_scan(result, [c.name for c in connectors])

    log.info(
        "scan.done",
        run_id=run_id,
        found=len(bounties),
        actionable=len(result.actionable),
        skipped=len(result.skipped),
        errors=len(errors),
    )
    return result


def persist_scan(result: ScanResult, marketplaces: list[str]) -> None:
    """Upsert bounty snapshots and append one decision row per bounty."""
    init_db()
    now = utcnow()

    with session_scope() as session:
        for rank_index, item in enumerate(result.scored):
            bounty, score = item.bounty, item.score

            row = session.get(BountyRow, bounty.key)
            if row is None:
                session.add(
                    BountyRow(
                        key=bounty.key,
                        marketplace=bounty.marketplace,
                        bounty_id=bounty.bounty_id,
                        title=bounty.title,
                        description=bounty.description,
                        category=bounty.category.value,
                        payout_usd=bounty.payout_usd,
                        payout_text=bounty.payout_text,
                        currency=bounty.currency,
                        deadline=bounty.deadline,
                        tags=bounty.tags,
                        url=bounty.url,
                        posted_at=bounty.posted_at,
                        raw=bounty.raw,
                        first_seen_at=now,
                        last_seen_at=now,
                    )
                )
            else:
                row.last_seen_at = now
                row.title = bounty.title
                row.payout_usd = bounty.payout_usd
                session.add(row)

            session.add(
                DecisionRow(
                    run_id=result.run_id,
                    bounty_key=bounty.key,
                    marketplace=bounty.marketplace,
                    title=bounty.title,
                    payout_usd=bounty.payout_usd,
                    action="skipped" if score.skipped else "scored",
                    skip_reason=score.skip_reason,
                    feasibility=score.feasibility,
                    p_success=score.p_success,
                    confidence=score.confidence,
                    est_effort_hours=score.est_effort_hours,
                    est_api_cost_usd=score.est_api_cost_usd,
                    est_gas_cost_usd=score.est_gas_cost_usd,
                    ev_usd=score.ev_usd,
                    net_ev_usd=score.net_ev_usd,
                    score=score.score,
                    rank=None if score.skipped else rank_index + 1,
                    estimator=score.estimator,
                    rationale=score.rationale,
                    created_at=now,
                )
            )

        session.add(
            ScanRow(
                run_id=result.run_id,
                started_at=now,
                marketplaces=",".join(marketplaces),
                n_found=len(result.scored),
                n_scored=len(result.actionable),
                n_skipped=len(result.skipped),
            )
        )


def latest_run_id() -> str | None:
    init_db()
    with session_scope() as session:
        row = session.exec(select(ScanRow).order_by(ScanRow.started_at.desc())).first()
        return row.run_id if row else None
