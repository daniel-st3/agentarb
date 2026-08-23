"""The crux abstraction: one Protocol every marketplace connector implements.

Marketplaces are genuinely heterogeneous -- open-pull vs. bid vs. buyer-push,
on-chain escrow vs. off-platform invoicing, with or without a human accept
gate. Rather than pretend them all into one loop, each connector declares its
`capabilities` and raises `UnsupportedOperation` for anything its marketplace
does not actually offer. The orchestrator reads capabilities and routes
accordingly.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from arbiter.models import Bounty, MarketplaceCapabilities


class ConnectorError(RuntimeError):
    """Transport or API-level failure talking to a marketplace."""


class UnsupportedOperation(ConnectorError):
    """The marketplace has no such operation (e.g. no open pull-claim)."""


@runtime_checkable
class MarketplaceConnector(Protocol):
    """Uniform surface over one marketplace."""

    name: str
    capabilities: MarketplaceCapabilities

    async def list_open(self, limit: int = 50) -> list[Bounty]:
        """Open bounties, normalized. Read-only."""
        ...

    async def get(self, bounty_id: str) -> Bounty | None:
        """One bounty by native id, normalized. Read-only."""
        ...

    def can_claim(self, bounty: Bounty) -> tuple[bool, str]:
        """(claimable, reason). Reason explains a False so it can be logged."""
        ...

    async def claim(self, bounty_id: str) -> dict[str, Any]:
        """Claim/bid. Week 2+. Raises UnsupportedOperation where impossible."""
        ...

    async def submit(self, bounty_id: str, result: dict[str, Any]) -> dict[str, Any]:
        """Submit a deliverable. Week 2+."""
        ...

    async def settlement_status(self, bounty_id: str) -> dict[str, Any]:
        """Where payment stands. Week 2+."""
        ...

    async def aclose(self) -> None:
        """Release transport resources."""
        ...
