"""Read-only integration against the live OpenTask API.

Network-dependent, so opt-in: `uv run pytest -m live`.
"""

import pytest

from arbiter.connectors import OpenTaskConnector
from arbiter.models import Bounty

pytestmark = pytest.mark.live


async def test_list_and_get_normalize():
    connector = OpenTaskConnector()
    try:
        bounties = await connector.list_open(limit=5)
        assert bounties, "OpenTask should have open tasks"
        assert all(isinstance(b, Bounty) for b in bounties)
        assert all(b.marketplace == "opentask" and b.bounty_id for b in bounties)

        fetched = await connector.get(bounties[0].bounty_id)
        assert fetched is not None
        assert fetched.bounty_id == bounties[0].bounty_id
        # The detail endpoint carries the description the list view omits.
        assert len(fetched.description) >= len(bounties[0].description)
    finally:
        await connector.aclose()


# The 404 -> None contract is covered deterministically in
# tests/test_connectors.py::test_get_returns_none_on_404. It is deliberately
# not retested against the live API: some sandboxed egress proxies surface a
# 404 to httpx as a transport-level ConnectError, which tests the proxy rather
# than the connector.


async def test_execution_market_discovery_is_live():
    """Read-only discovery against the live execution.market API."""
    from arbiter.connectors import ExecutionMarketConnector

    connector = ExecutionMarketConnector()
    try:
        bounties = await connector.list_open(limit=5)
        for bounty in bounties:
            assert bounty.marketplace == "execution_market"
            assert bounty.bounty_id
            # Every live task must be refused for claiming.
            claimable, reason = connector.can_claim(bounty)
            assert claimable is False and reason
    finally:
        await connector.aclose()


async def test_execution_market_escrow_is_still_mainnet_only():
    """Guards the Week 3 decision: if this ever changes, a test should say so."""
    import httpx

    async with httpx.AsyncClient(timeout=20.0) as client:
        escrow = (await client.get(
            "https://api.execution.market/api/v1/escrow/config"
        )).json()
        info = (await client.get(
            "https://api.execution.market/api/v1/x402/info"
        )).json()

    assert escrow["chain_id"] == 8453, "escrow moved off Base mainnet -- revisit Week 3"
    enabled = set(info["enabled_networks"])
    testnets = {n for n in enabled if "sepolia" in n or "testnet" in n or "amoy" in n}
    assert not testnets, f"testnets are now enabled ({testnets}) -- revisit the paid loop"
