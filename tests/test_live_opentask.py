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


async def test_missing_task_returns_none():
    connector = OpenTaskConnector()
    try:
        assert await connector.get("definitely-not-a-real-task-id") is None
    finally:
        await connector.aclose()
