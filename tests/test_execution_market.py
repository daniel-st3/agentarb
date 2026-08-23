"""execution.market connector: normalization and honest capability flags."""

import httpx
import pytest

from arbiter.connectors import ExecutionMarketConnector
from arbiter.connectors.base import (
    ConnectorError,
    MarketplaceConnector,
    UnsupportedOperation,
)
from arbiter.models import Category, ClaimModel, Settlement

# Captured verbatim from https://api.execution.market/api/v1/tasks/available
# on 2026-08-23.
REAL_TASK = {
    "id": "33fb70aa-4b11-41f0-a43c-a547671f19ee",
    "agent_id": "0x46bdfd8256ceeb3325725cb3b81701c3e2e32ebd",
    "title": "Compro: lectura verificada getReservesData de Aave V3 en Avalanche",
    "instructions": "Necesito UNA lectura limpia y verificable de las reservas de Aave V3.",
    "category": "knowledge_access",
    "evidence_schema": {"optional": [], "required": ["json_response", "text_report"]},
    "bounty_usd": 0.02,
    "payment_token": "USDC",
    "payment_network": "arbitrum",
    "escrow_id": "escrow_33fb70aa_8fc9babf",
    "deadline": "2026-08-30T18:00:08.052158+00:00",
    "min_reputation": 0,
    "required_roles": [],
    "max_executors": 1,
    "status": "published",
    "erc8004_agent_id": "1193",
    "publisher_type": "agent",
    "target_executor_type": "any",
    "required_capabilities": ["research", "data_collection"],
    "created_at": "2026-08-23T18:00:08.193725+00:00",
}


def connector(handler) -> ExecutionMarketConnector:
    return ExecutionMarketConnector(
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(handler), base_url="https://api.execution.market"
        )
    )


class TestProtocol:
    def test_satisfies_the_protocol(self):
        assert isinstance(ExecutionMarketConnector(), MarketplaceConnector)


class TestCapabilityHonesty:
    """The flags must state the real constraints, not a hopeful version."""

    def test_declares_no_open_claim(self):
        caps = ExecutionMarketConnector().capabilities
        assert caps.supports_open_claim is False
        assert caps.supports_autonomous_settle is False

    def test_declares_onchain_settlement(self):
        assert ExecutionMarketConnector().capabilities.settlement == Settlement.ONCHAIN

    def test_records_the_native_claim_model(self):
        """The market *is* pull-claim; we decline, it does not forbid."""
        assert ExecutionMarketConnector().capabilities.claim_model == ClaimModel.OPEN_CLAIM

    def test_declares_the_accept_gate(self):
        assert ExecutionMarketConnector().capabilities.has_human_accept_gate is True

    def test_notes_name_the_real_blockers(self):
        notes = ExecutionMarketConnector().capabilities.notes.lower()
        assert "mainnet" in notes
        assert "reputation" in notes
        assert "8453" in notes or "no testnet" in notes


class TestNormalization:
    def test_real_payload(self):
        bounty = ExecutionMarketConnector().normalize(REAL_TASK)
        assert bounty.marketplace == "execution_market"
        assert bounty.bounty_id == REAL_TASK["id"]
        assert bounty.key == f"execution_market:{REAL_TASK['id']}"
        assert bounty.description == REAL_TASK["instructions"]
        assert bounty.raw == REAL_TASK

    def test_payout_and_currency(self):
        bounty = ExecutionMarketConnector().normalize(REAL_TASK)
        assert bounty.payout_usd == pytest.approx(0.02)
        assert bounty.currency == "USDC"
        assert "arbitrum" in bounty.payout_text

    def test_deadline_and_posted_at_parse(self):
        bounty = ExecutionMarketConnector().normalize(REAL_TASK)
        assert bounty.deadline is not None and bounty.posted_at is not None

    @pytest.mark.parametrize(
        "native,expected",
        [
            ("research", Category.RESEARCH),
            ("knowledge_access", Category.RESEARCH),
            ("data_collection", Category.DATA_LOOKUP),
            ("data_processing", Category.DATA_LOOKUP),
            ("content_generation", Category.SUMMARIZATION),
            ("api_integration", Category.SMALL_CODE),
            # Physical / social / execution work must not map to a handler.
            ("physical_presence", Category.UNKNOWN),
            ("location_based", Category.UNKNOWN),
            ("sensory", Category.UNKNOWN),
            ("human_authority", Category.UNKNOWN),
            ("code_execution", Category.UNKNOWN),
            ("emergency", Category.UNKNOWN),
        ],
    )
    def test_category_mapping(self, native, expected):
        bounty = ExecutionMarketConnector().normalize({**REAL_TASK, "category": native})
        assert bounty.category == expected

    def test_code_execution_is_not_small_code(self):
        """We do not run untrusted code, so it must not route to a handler."""
        bounty = ExecutionMarketConnector().normalize(
            {**REAL_TASK, "category": "code_execution"}
        )
        assert bounty.category == Category.UNKNOWN

    def test_missing_fields_do_not_crash(self):
        bounty = ExecutionMarketConnector().normalize({"id": "x"})
        assert bounty.payout_usd is None
        assert bounty.category == Category.UNKNOWN


class TestClaimRefusal:
    def test_open_task_is_still_refused(self):
        conn = ExecutionMarketConnector()
        claimable, reason = conn.can_claim(conn.normalize(REAL_TASK))
        assert claimable is False
        assert "mainnet" in reason.lower()

    def test_closed_task_says_so(self):
        conn = ExecutionMarketConnector()
        bounty = conn.normalize({**REAL_TASK, "status": "completed"})
        claimable, reason = conn.can_claim(bounty)
        assert claimable is False and "not open" in reason

    def test_reputation_gate_is_surfaced(self):
        conn = ExecutionMarketConnector()
        bounty = conn.normalize({**REAL_TASK, "min_reputation": 50})
        _, reason = conn.can_claim(bounty)
        assert "50" in reason

    async def test_all_write_paths_refuse(self):
        conn = ExecutionMarketConnector()
        for call in (conn.claim("x"), conn.submit("x", {}), conn.settlement_status("x")):
            with pytest.raises(UnsupportedOperation):
                await call
        await conn.aclose()


class TestTransport:
    async def test_list_open_normalizes(self):
        def handler(request):
            assert "/api/v1/tasks/available" in request.url.path
            return httpx.Response(200, json={"tasks": [REAL_TASK], "count": 1, "offset": 0})

        bounties = await connector(handler).list_open(limit=5)
        assert len(bounties) == 1 and bounties[0].bounty_id == REAL_TASK["id"]

    async def test_list_open_respects_limit(self):
        def handler(request):
            return httpx.Response(
                200, json={"tasks": [{**REAL_TASK, "id": str(i)} for i in range(20)]}
            )

        assert len(await connector(handler).list_open(limit=3)) == 3

    async def test_get_handles_a_bare_object(self):
        """The detail endpoint returns the task unwrapped."""
        def handler(request):
            return httpx.Response(200, json=REAL_TASK)

        bounty = await connector(handler).get(REAL_TASK["id"])
        assert bounty is not None and bounty.bounty_id == REAL_TASK["id"]

    async def test_get_returns_none_on_404(self):
        def handler(request):
            return httpx.Response(404, json={"detail": "Not Found"})

        assert await connector(handler).get("nope") is None

    async def test_server_error_raises(self):
        def handler(request):
            return httpx.Response(500, text="boom")

        with pytest.raises(ConnectorError):
            await connector(handler).list_open()

    async def test_malformed_payload_raises(self):
        def handler(request):
            return httpx.Response(200, json={"tasks": "nope"})

        with pytest.raises(ConnectorError):
            await connector(handler).list_open()

    async def test_no_auth_header_is_sent(self):
        """Discovery is unauthenticated; we hold no credentials for this market."""
        seen = {}

        def handler(request):
            seen.update(request.headers)
            return httpx.Response(200, json={"tasks": []})

        await connector(handler).list_open()
        assert "authorization" not in {k.lower() for k in seen}
