"""execution.market connector -- read-only discovery. No auth, no signing.

Verified against the live API on 2026-08-23:

  GET {base}/api/v1/tasks/available?limit=&offset=  -> {"tasks":[...], "count", "offset"}
  GET {base}/api/v1/tasks?limit=&offset=            -> same shape, all statuses
  GET {base}/api/v1/tasks/{id}                      -> the task object

All three answer unauthenticated. Nothing else here is used: this connector
deliberately implements only discovery, and every write path raises
`UnsupportedOperation`.

Why discovery-only, and not a temporary limitation:

- **The escrow is Base mainnet only.** `GET /api/v1/escrow/config` returns
  `chain_id: 8453` with mainnet USDC and a single deployed escrow address;
  `GET /api/v1/x402/info` lists ten mainnets enabled and zero testnets. Live
  tasks settle on arbitrum, optimism, avalanche and ethereum -- all mainnet.
  Participating in the paid loop would mean real funds, which is out of scope
  until the Week 4 gated task.
- **Acceptance is reputation-gated.** Tasks carry `min_reputation`, and
  `em_accept_agent_task` enforces it along with capability matching.
- Accepting work also requires EIP-3009 signing, which is wallet territory.

So: `supports_open_claim=False`, and scoring treats it as discovery. It still
earns its place -- it is a second *real* marketplace with a genuinely
different model from OpenTask's, which is the whole point of the router.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from arbiter.config import get_settings
from arbiter.connectors.base import ConnectorError, UnsupportedOperation
from arbiter.logging import get_logger
from arbiter.models import (
    Bounty,
    Category,
    ClaimModel,
    MarketplaceCapabilities,
    Settlement,
)

log = get_logger(__name__)

#: execution.market's own taxonomy -> our handler categories.
#: Anything physical, social, or requiring code *execution* maps to UNKNOWN so
#: the skip-filter and safety screen decline it rather than improvising.
_CATEGORY_MAP: dict[str, Category] = {
    "research": Category.RESEARCH,
    "knowledge_access": Category.RESEARCH,
    "data_collection": Category.DATA_LOOKUP,
    "data_processing": Category.DATA_LOOKUP,
    "content_generation": Category.SUMMARIZATION,
    "api_integration": Category.SMALL_CODE,
    # Deliberately unmapped (-> UNKNOWN): physical_presence, location_based,
    # sensory, social_proof, social, human_authority, proxy, bureaucratic,
    # emergency, verification, simple_action, creative, digital_physical,
    # multi_step_workflow, and code_execution (we do not run untrusted code).
}

#: Statuses that mean "still open to an executor".
_OPEN_STATUSES = {"published", "assigning"}


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class ExecutionMarketConnector:
    """Read-only discovery against execution.market's public task API."""

    name = "execution_market"

    capabilities = MarketplaceCapabilities(
        name="execution_market",
        supports_open_claim=False,
        claim_model=ClaimModel.OPEN_CLAIM,
        settlement=Settlement.ONCHAIN,
        has_human_accept_gate=True,
        supports_autonomous_settle=False,
        notes=(
            "Discovery-only. Real x402r AuthCaptureEscrow, but Base MAINNET only "
            "(chain_id 8453; zero testnets enabled) -- so it cannot join a "
            "testnet-first paid loop. Acceptance additionally requires EIP-3009 "
            "signing and clearing a per-task min_reputation gate. Natively an "
            "open pull-claim market; we decline the claim, the market does not "
            "forbid it."
        ),
    )

    def __init__(
        self,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
        timeout: float = 20.0,
    ) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.execution_market_base_url).rstrip("/")
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Accept": "application/json", "User-Agent": "agent-arbiter/0.1"},
        )

    # ---------------- read paths ----------------

    async def list_open(self, limit: int = 50) -> list[Bounty]:
        payload = await self._get_json(
            "/api/v1/tasks/available", params={"limit": min(limit, 100)}
        )
        tasks = payload.get("tasks") or []
        if not isinstance(tasks, list):
            raise ConnectorError(f"unexpected tasks payload: {type(tasks)}")

        bounties = [self.normalize(t) for t in tasks if isinstance(t, dict)]
        log.info("execution_market.list_open", found=len(bounties))
        return bounties[:limit]

    async def get(self, bounty_id: str) -> Bounty | None:
        try:
            payload = await self._get_json(f"/api/v1/tasks/{bounty_id}")
        except ConnectorError as exc:
            if "404" in str(exc):
                return None
            raise
        # This endpoint returns the task object directly, not wrapped.
        raw = payload.get("task") if "task" in payload else payload
        if not isinstance(raw, dict) or not raw.get("id"):
            return None
        return self.normalize(raw)

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = await self._client.get(path, params=params)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"execution.market GET {path} failed: {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ConnectorError(f"execution.market GET {path} failed: {exc}") from exc
        except ValueError as exc:
            raise ConnectorError(f"execution.market GET {path} returned non-JSON") from exc

        if not isinstance(data, dict):
            raise ConnectorError(f"execution.market GET {path} returned {type(data)}")
        return data

    # ---------------- normalization ----------------

    def normalize(self, raw: dict[str, Any]) -> Bounty:
        """Map one execution.market task into a `Bounty`."""
        bounty_id = str(raw.get("id") or "")
        native_category = str(raw.get("category") or "")
        payout = raw.get("bounty_usd")
        payout_usd = float(payout) if isinstance(payout, (int, float)) else None

        tags = [t for t in (raw.get("required_capabilities") or []) if isinstance(t, str)]
        if native_category:
            tags = [native_category, *tags]

        token = raw.get("payment_token") or "USDC"
        network = raw.get("payment_network") or "unknown"

        return Bounty(
            marketplace=self.name,
            bounty_id=bounty_id,
            title=raw.get("title") or "",
            description=raw.get("instructions") or "",
            category=_CATEGORY_MAP.get(native_category, Category.UNKNOWN),
            payout_usd=payout_usd,
            payout_text=(f"{payout} {token} on {network}" if payout is not None else ""),
            currency=str(token).upper(),
            deadline=_parse_dt(raw.get("deadline")),
            tags=tags,
            url=f"https://execution.market/tasks/{bounty_id}" if bounty_id else None,
            posted_at=_parse_dt(raw.get("created_at")),
            raw=raw,
        )

    # ---------------- capability gates ----------------

    def can_claim(self, bounty: Bounty) -> tuple[bool, str]:
        raw = bounty.raw or {}
        status = raw.get("status")
        network = raw.get("payment_network", "unknown")
        min_reputation = raw.get("min_reputation", 0)

        if status not in _OPEN_STATUSES:
            return False, f"task status is {status!r}, not open"

        return False, (
            f"execution.market settles on {network} MAINNET escrow (no testnet); "
            f"accepting requires EIP-3009 signing"
            + (f" and min_reputation {min_reputation}" if min_reputation else "")
            + " -- discovery-only by design"
        )

    # ---------------- write paths: deliberately absent ----------------

    async def claim(self, bounty_id: str) -> dict[str, Any]:
        raise UnsupportedOperation(
            "execution.market acceptance is disabled: it requires EIP-3009 signing "
            "and settles against mainnet escrow. Discovery-only until a gated "
            "mainnet task is explicitly approved."
        )

    async def submit(self, bounty_id: str, result: dict[str, Any]) -> dict[str, Any]:
        raise UnsupportedOperation(
            "execution.market submission is disabled: it presupposes an accepted "
            "task, which this connector never creates."
        )

    async def settlement_status(self, bounty_id: str) -> dict[str, Any]:
        raise UnsupportedOperation(
            "execution.market settlement is mainnet-only and out of scope; this "
            "connector never participates in escrow."
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()
