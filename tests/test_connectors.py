"""Connector normalization and capability honesty."""

import httpx
import pytest

from arbiter.connectors import MockMarketplaceConnector, OpenTaskConnector
from arbiter.connectors.base import (
    ConnectorError,
    MarketplaceConnector,
    UnsupportedOperation,
)
from arbiter.connectors.opentask import _parse_amount
from arbiter.models import Bounty, Category, ClaimModel, Settlement

# Captured verbatim from https://opentask.ai/api/tasks on 2026-08-23.
REAL_TASK = {
    "id": "cmt57wuwt00kj04l2u7tv38pn",
    "title": "Hermes2 — Local-LLM AI Agent · Research / Data / Docs (USDC)",
    "skillsTags": ["research", "competitive-analysis", "data-extraction",
                   "web-scraping", "csv", "json", "report-writing", "python"],
    "budgetText": "From 15 USDC (fixed scope, quoted before start)",
    "budgetAmount": None,
    "budgetCurrency": None,
    "deadline": None,
    "executionMode": "pitch",
    "deliveryStructure": "single",
    "rewardTerms": None,
    "createdAt": "2026-08-23T02:58:39.101Z",
    "capabilityRequirements": [],
    "attachments": [],
    "owner": {"id": "x", "handle": "jhscreeton", "displayName": "Hermes2"},
}


class TestProtocolConformance:
    @pytest.mark.parametrize(
        "connector", [OpenTaskConnector(), MockMarketplaceConnector()], ids=["opentask", "mock"]
    )
    def test_satisfies_protocol(self, connector):
        assert isinstance(connector, MarketplaceConnector)
        assert connector.capabilities.name == connector.name


class TestOpenTaskNormalization:
    def test_real_payload(self):
        bounty = OpenTaskConnector().normalize(REAL_TASK)
        assert isinstance(bounty, Bounty)
        assert bounty.marketplace == "opentask"
        assert bounty.bounty_id == REAL_TASK["id"]
        assert bounty.key == f"opentask:{REAL_TASK['id']}"
        assert bounty.posted_at is not None
        assert bounty.raw == REAL_TASK

    def test_budget_text_parsed_when_amount_is_null(self):
        bounty = OpenTaskConnector().normalize(REAL_TASK)
        assert bounty.payout_usd == 15.0
        assert bounty.currency == "USDC"

    def test_structured_amount_wins(self):
        bounty = OpenTaskConnector().normalize(
            {**REAL_TASK, "budgetAmount": 5, "budgetCurrency": "USDC", "budgetText": "5 USDC"}
        )
        assert bounty.payout_usd == 5.0

    def test_non_usd_currency_is_left_unpriced(self):
        """Better to skip than invent an FX rate."""
        bounty = OpenTaskConnector().normalize(
            {**REAL_TASK, "budgetAmount": 5, "budgetCurrency": "SOL"}
        )
        assert bounty.payout_usd is None

    def test_missing_fields_do_not_crash(self):
        bounty = OpenTaskConnector().normalize({"id": "x"})
        assert bounty.payout_usd is None
        assert bounty.category == Category.UNKNOWN

    @pytest.mark.parametrize(
        "tags,expected",
        [
            (["python", "bug-fix"], Category.SMALL_CODE),
            (["summarization"], Category.SUMMARIZATION),
            (["web-scraping", "csv"], Category.DATA_LOOKUP),
            (["market-research"], Category.RESEARCH),
            (["gardening"], Category.UNKNOWN),
        ],
    )
    def test_classification(self, tags, expected):
        bounty = OpenTaskConnector().normalize({"id": "x", "skillsTags": tags, "title": ""})
        assert bounty.category == expected

    @pytest.mark.parametrize(
        "text,amount,currency",
        [
            ("From 15 USDC", 15.0, "USDC"),
            ("5 USDC", 5.0, "USDC"),
            ("$20", 20.0, "USD"),
            ("10-20 USDC", 10.0, "USDC"),      # ranges resolve conservatively
            ("$10 - $20", 10.0, "USD"),
            ("20-10 USDC", 10.0, "USDC"),      # reversed range still takes the low end
            ("50 to 90 USDC", 50.0, "USDC"),
            ("1,500 USDC", 1500.0, "USDC"),
            ("negotiable", None, None),
            ("", None, None),
            (None, None, None),
        ],
    )
    def test_amount_parsing(self, text, amount, currency):
        assert _parse_amount(text) == (amount, currency)


class TestOpenTaskCapabilities:
    """OpenTask is discovery-only. That must be stated, not implied."""

    def test_declares_no_open_claim(self):
        caps = OpenTaskConnector().capabilities
        assert caps.supports_open_claim is False
        assert caps.claim_model == ClaimModel.BID
        assert caps.settlement == Settlement.OFFPLATFORM
        assert caps.supports_autonomous_settle is False

    def test_can_claim_is_false_with_a_reason(self):
        connector = OpenTaskConnector()
        claimable, reason = connector.can_claim(connector.normalize(REAL_TASK))
        assert claimable is False and reason

    async def test_write_paths_refuse_loudly(self):
        connector = OpenTaskConnector()
        for call in (
            connector.claim("x"),
            connector.submit("x", {}),
            connector.settlement_status("x"),
        ):
            with pytest.raises(UnsupportedOperation):
                await call
        await connector.aclose()


class TestOpenTaskTransport:
    def _connector(self, handler):
        transport = httpx.MockTransport(handler)
        client = httpx.AsyncClient(transport=transport, base_url="https://opentask.ai")
        return OpenTaskConnector(client=client)

    async def test_list_open_paginates(self):
        pages = {
            None: {"tasks": [{**REAL_TASK, "id": "a"}], "nextCursor": "c2"},
            "c2": {"tasks": [{**REAL_TASK, "id": "b"}], "nextCursor": None},
        }

        def handler(request):
            return httpx.Response(200, json=pages[request.url.params.get("cursor")])

        bounties = await self._connector(handler).list_open(limit=10)
        assert [b.bounty_id for b in bounties] == ["a", "b"]

    async def test_list_open_respects_limit(self):
        def handler(request):
            return httpx.Response(
                200,
                json={"tasks": [{**REAL_TASK, "id": str(i)} for i in range(50)],
                      "nextCursor": "more"},
            )

        assert len(await self._connector(handler).list_open(limit=3)) == 3

    async def test_get_unwraps_task_key(self):
        def handler(request):
            return httpx.Response(200, json={"task": REAL_TASK})

        bounty = await self._connector(handler).get(REAL_TASK["id"])
        assert bounty is not None and bounty.bounty_id == REAL_TASK["id"]

    async def test_get_returns_none_on_404(self):
        def handler(request):
            return httpx.Response(404, json={"error": "Not found"})

        assert await self._connector(handler).get("nope") is None

    async def test_server_error_raises_connector_error(self):
        def handler(request):
            return httpx.Response(500, text="boom")

        with pytest.raises(ConnectorError):
            await self._connector(handler).list_open()

    async def test_malformed_payload_raises(self):
        def handler(request):
            return httpx.Response(200, json={"tasks": "not-a-list"})

        with pytest.raises(ConnectorError):
            await self._connector(handler).list_open()


class TestMockMarketplace:
    async def test_seed_spans_every_filter_branch(self):
        bounties = await MockMarketplaceConnector().list_open()
        assert len(bounties) >= 5
        assert {b.category for b in bounties} > {Category.UNKNOWN}
        assert any(b.payout_usd < 1.0 for b in bounties)

    async def test_declares_open_claim(self):
        caps = MockMarketplaceConnector().capabilities
        assert caps.supports_open_claim is True
        assert caps.settlement == Settlement.SIMULATED

    async def test_claim_then_submit_then_settle(self):
        connector = MockMarketplaceConnector()
        assert (await connector.claim("mock-001"))["status"] == "claimed"
        assert (await connector.submit("mock-001", {"out": "x"}))["status"] == "submitted"
        settled = await connector.settlement_status("mock-001")
        assert settled["status"] == "settled" and settled["simulated"] is True

    async def test_claim_is_idempotent(self):
        connector = MockMarketplaceConnector()
        await connector.claim("mock-001")
        assert (await connector.claim("mock-001"))["status"] == "already_claimed"

    async def test_claimed_bounties_leave_the_open_list(self):
        connector = MockMarketplaceConnector()
        before = len(await connector.list_open())
        await connector.claim("mock-001")
        assert len(await connector.list_open()) == before - 1

    async def test_submit_requires_a_claim(self):
        with pytest.raises(ValueError):
            await MockMarketplaceConnector().submit("mock-001", {})
