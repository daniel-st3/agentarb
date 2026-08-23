"""MockMarketplace -- a local, deterministic marketplace.

Two jobs: prove the `MarketplaceConnector` abstraction holds for a market
whose model differs from OpenTask's (open pull-claim, simulated on-chain
settlement, no accept gate), and give the demo and the test-suite data that
does not depend on what strangers happened to post today.

State is in-memory. Week 1 exercises list/get only; claim/submit/settle are
implemented because a mock is exactly where the full loop should be testable
without a network or a wallet.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from arbiter.logging import get_logger
from arbiter.models import (
    Bounty,
    Category,
    ClaimModel,
    MarketplaceCapabilities,
    Settlement,
    utcnow,
)

log = get_logger(__name__)


def default_seed() -> list[Bounty]:
    """Representative bounties spanning every skip-filter branch.

    Deliberately mixed: things worth doing, things too cheap, things too big,
    and things we have no handler for -- so a demo scan shows judgment, not a
    list of uniformly-good tasks.
    """
    now = utcnow()
    specs: list[dict[str, Any]] = [
        {
            "bounty_id": "mock-001",
            "title": "Summarize 12 competitor pricing pages into a one-page brief",
            "description": (
                "Read 12 supplied URLs and produce a single-page markdown brief "
                "comparing pricing tiers, free-tier limits, and overage rates."
            ),
            "category": Category.SUMMARIZATION,
            "payout_usd": 12.0,
            "tags": ["summarization", "research", "markdown"],
            "deadline": now + timedelta(hours=6),
        },
        {
            "bounty_id": "mock-002",
            "title": "Extract every board member from 40 SEC filings into CSV",
            "description": "Parse 40 linked filings; emit name, role, appointment date as CSV.",
            "category": Category.DATA_LOOKUP,
            "payout_usd": 25.0,
            "tags": ["data-extraction", "csv", "sec"],
            "deadline": now + timedelta(days=1),
        },
        {
            "bounty_id": "mock-003",
            "title": "Fix a failing pytest case in a 200-line Python module",
            "description": (
                "One test fails on a timezone edge case. Repo and failing test supplied."
            ),
            "category": Category.SMALL_CODE,
            "payout_usd": 18.0,
            "tags": ["python", "pytest", "bug-fix"],
            "deadline": now + timedelta(hours=12),
        },
        {
            "bounty_id": "mock-004",
            "title": "Rename a variable in a README code block",
            "description": "Trivial edit. Included to exercise the payout floor.",
            "category": Category.SMALL_CODE,
            "payout_usd": 0.25,
            "tags": ["docs", "typo"],
            "deadline": now + timedelta(hours=2),
        },
        {
            "bounty_id": "mock-005",
            "title": "Build and deploy a full multi-tenant billing service",
            "description": (
                "Greenfield service with Stripe integration, migrations, IaC and "
                "on-call runbook. Included to exercise the effort cap."
            ),
            "category": Category.SMALL_CODE,
            "payout_usd": 4000.0,
            "tags": ["python", "infrastructure", "stripe"],
            "deadline": now + timedelta(days=30),
        },
        {
            "bounty_id": "mock-006",
            "title": "Photograph the storefront at 4th and Main and geotag it",
            "description": "Physical-world task. Included to exercise the category filter.",
            "category": Category.UNKNOWN,
            "payout_usd": 30.0,
            "tags": ["physical", "photo", "gps"],
            "deadline": now + timedelta(days=2),
        },
        {
            "bounty_id": "mock-007",
            "title": "Research the top 5 x402 facilitators and their fee models",
            "description": "Short comparative research note with sources for each claim.",
            "category": Category.RESEARCH,
            "payout_usd": 40.0,
            "tags": ["research", "x402", "payments"],
            "deadline": now + timedelta(hours=18),
        },
    ]

    return [
        Bounty(
            marketplace="mock",
            payout_text=f"{spec['payout_usd']} USDC",
            currency="USDC",
            posted_at=now - timedelta(minutes=17 * i),
            url=f"https://mock.local/bounties/{spec['bounty_id']}",
            raw={"seed": True, **{k: str(v) for k, v in spec.items() if k != "raw"}},
            **spec,
        )
        for i, spec in enumerate(specs)
    ]


class MockMarketplaceConnector:
    """Open pull-claim marketplace with simulated on-chain settlement."""

    name = "mock"

    capabilities = MarketplaceCapabilities(
        name="mock",
        supports_open_claim=True,
        claim_model=ClaimModel.OPEN_CLAIM,
        settlement=Settlement.SIMULATED,
        has_human_accept_gate=False,
        supports_autonomous_settle=True,
        notes="Local deterministic marketplace for demos and tests. Moves no real funds.",
    )

    def __init__(self, bounties: list[Bounty] | None = None) -> None:
        seed = bounties if bounties is not None else default_seed()
        self._bounties: dict[str, Bounty] = {b.bounty_id: b for b in seed}
        self._claimed: set[str] = set()
        self._submissions: dict[str, dict[str, Any]] = {}

    async def list_open(self, limit: int = 50) -> list[Bounty]:
        open_ones = [b for bid, b in self._bounties.items() if bid not in self._claimed]
        log.info("mock.list_open", found=len(open_ones))
        return open_ones[:limit]

    async def get(self, bounty_id: str) -> Bounty | None:
        return self._bounties.get(bounty_id)

    def can_claim(self, bounty: Bounty) -> tuple[bool, str]:
        if bounty.bounty_id not in self._bounties:
            return False, "unknown bounty"
        if bounty.bounty_id in self._claimed:
            return False, "already claimed"
        return True, "open pull-claim"

    async def claim(self, bounty_id: str) -> dict[str, Any]:
        # Idempotent by bounty_id, mirroring the real-connector requirement.
        if bounty_id in self._claimed:
            return {"status": "already_claimed", "bounty_id": bounty_id}
        if bounty_id not in self._bounties:
            raise KeyError(bounty_id)
        self._claimed.add(bounty_id)
        return {"status": "claimed", "bounty_id": bounty_id}

    async def submit(self, bounty_id: str, result: dict[str, Any]) -> dict[str, Any]:
        if bounty_id not in self._claimed:
            raise ValueError(f"{bounty_id} not claimed")
        self._submissions[bounty_id] = result
        return {"status": "submitted", "bounty_id": bounty_id}

    async def settlement_status(self, bounty_id: str) -> dict[str, Any]:
        if bounty_id in self._submissions:
            bounty = self._bounties[bounty_id]
            return {
                "status": "settled",
                "amount_usd": bounty.payout_usd,
                "tx": f"0xsimulated{bounty_id}",
                "simulated": True,
            }
        return {"status": "pending", "simulated": True}

    async def aclose(self) -> None:
        return None
