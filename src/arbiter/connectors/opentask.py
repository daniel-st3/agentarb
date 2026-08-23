"""OpenTask connector -- read-only (list/get).

Verified against the live API on 2026-08-23:

  GET {base}/api/tasks?limit=&cursor=  -> {"tasks": [...], "nextCursor": str|null}
  GET {base}/api/tasks/{id}            -> {"task": {...}}

Both public discovery routes answer unauthenticated. The authenticated
`/api/agent/*` routes (bid, contract, submit) need a bearer token from
`POST /api/agent/register` and are deliberately NOT implemented here.

Why read-only is the right shape for OpenTask, not a shortcut: OpenTask is
explicitly non-custodial -- its terms state it "does not custody funds, hold
escrow, control private keys, or sign wallet transactions for you." Settlement
happens off-platform between buyer and seller. Every live task also comes back
with `executionMode: "pitch"`, i.e. bid-and-wait with a buyer selection step,
not an open pull-claim. So OpenTask is a *discovery* source: it feeds the
scorer, and cannot close an autonomous claim->execute->settle loop.
"""

from __future__ import annotations

import re
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

#: skillsTags -> our handler categories. First match wins, in this order.
_CATEGORY_TAGS: list[tuple[Category, set[str]]] = [
    (Category.SMALL_CODE, {"python", "javascript", "typescript", "code", "coding",
                           "script", "automation", "api-integration", "bug-fix",
                           "refactor", "sql"}),
    (Category.SUMMARIZATION, {"summarization", "summary", "report-writing",
                              "content-writing", "copywriting", "editing",
                              "transcription"}),
    (Category.DATA_LOOKUP, {"data-extraction", "web-scraping", "csv", "json",
                            "data-entry", "scraping", "lookup", "enrichment"}),
    (Category.RESEARCH, {"research", "competitive-analysis", "market-research",
                         "analysis", "due-diligence", "openapi"}),
]

#: "From 15 USDC", "5 USDC", "$20", "10-20 USDC" -> a conservative lower bound.
_AMOUNT_RE = re.compile(
    r"(?:(?P<sym>\$)\s*(?P<sym_amt>\d[\d,]*(?:\.\d+)?))"
    r"|(?:(?P<amt>\d[\d,]*(?:\.\d+)?)\s*(?P<cur>USDC|USD|USDT|EURC))",
    re.IGNORECASE,
)

#: "10-20 USDC", "$10 - $20". Matched before the single-amount pattern so a
#: range resolves to its low end rather than to whichever side parses first.
_RANGE_RE = re.compile(
    r"\$?\s*(?P<lo>\d[\d,]*(?:\.\d+)?)\s*(?:-|\u2013|\u2014|to)\s*"
    r"\$?\s*(?P<hi>\d[\d,]*(?:\.\d+)?)\s*(?P<cur>USDC|USD|USDT|EURC)?",
    re.IGNORECASE,
)

#: Stablecoins we treat as 1:1 with USD for scoring purposes.
_USD_PEGGED = {"USDC", "USD", "USDT", "EURC"}


def _parse_amount(text: str | None) -> tuple[float | None, str | None]:
    """Pull a conservative USD figure out of free-form budget text.

    Ranges resolve to the low end -- the scorer should never be optimistic
    about payout.
    """
    if not text:
        return None, None

    # A range means "somewhere between"; take the low end.
    range_match = _RANGE_RE.search(text)
    if range_match:
        try:
            lo = float(range_match.group("lo").replace(",", ""))
            hi = float(range_match.group("hi").replace(",", ""))
        except ValueError:
            lo = hi = None
        if lo is not None and hi is not None and hi >= lo:
            cur = range_match.group("cur")
            return min(lo, hi), (cur.upper() if cur else "USD")

    amounts: list[float] = []
    currency: str | None = None
    for m in _AMOUNT_RE.finditer(text):
        raw = m.group("sym_amt") or m.group("amt")
        if raw is None:
            continue
        try:
            amounts.append(float(raw.replace(",", "")))
        except ValueError:
            continue
        cur = m.group("cur")
        currency = cur.upper() if cur else (currency or "USD")
    if not amounts:
        return None, None
    return min(amounts), currency


def _classify(tags: list[str], title: str) -> Category:
    haystack = {t.lower().strip() for t in tags}
    for category, keywords in _CATEGORY_TAGS:
        if haystack & keywords:
            return category
    lowered = title.lower()
    for category, keywords in _CATEGORY_TAGS:
        if any(k in lowered for k in keywords):
            return category
    return Category.UNKNOWN


def _parse_dt(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


class OpenTaskConnector:
    """Read-only discovery against OpenTask's public task API."""

    name = "opentask"

    capabilities = MarketplaceCapabilities(
        name="opentask",
        supports_open_claim=False,
        claim_model=ClaimModel.BID,
        settlement=Settlement.OFFPLATFORM,
        has_human_accept_gate=True,
        supports_autonomous_settle=False,
        notes=(
            "Non-custodial: no platform escrow, settlement is off-platform between "
            "buyer and seller. Live tasks use executionMode='pitch' (bid, buyer "
            "selects). Discovery-only for the autonomous loop."
        ),
    )

    def __init__(
        self,
        base_url: str | None = None,
        client: httpx.AsyncClient | None = None,
        timeout: float = 20.0,
    ) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.opentask_base_url).rstrip("/")
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers={"Accept": "application/json", "User-Agent": "agent-arbiter/0.1"},
        )

    # ---------------- read paths ----------------

    async def list_open(self, limit: int = 50) -> list[Bounty]:
        """Page through /api/tasks until `limit` bounties or the cursor runs out."""
        bounties: list[Bounty] = []
        cursor: str | None = None

        while len(bounties) < limit:
            params: dict[str, Any] = {"limit": min(50, limit - len(bounties))}
            if cursor:
                params["cursor"] = cursor
            payload = await self._get_json("/api/tasks", params=params)

            page = payload.get("tasks") or []
            if not isinstance(page, list):
                raise ConnectorError(f"unexpected /api/tasks payload: {type(page)}")

            for raw in page:
                if isinstance(raw, dict):
                    bounties.append(self.normalize(raw))

            cursor = payload.get("nextCursor")
            if not cursor or not page:
                break

        log.info("opentask.list_open", found=len(bounties))
        return bounties[:limit]

    async def get(self, bounty_id: str) -> Bounty | None:
        try:
            payload = await self._get_json(f"/api/tasks/{bounty_id}")
        except ConnectorError as exc:
            if "404" in str(exc):
                return None
            raise
        raw = payload.get("task")
        if not isinstance(raw, dict):
            return None
        return self.normalize(raw)

    async def _get_json(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = await self._client.get(path, params=params)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            raise ConnectorError(
                f"opentask GET {path} failed: {exc.response.status_code}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ConnectorError(f"opentask GET {path} failed: {exc}") from exc
        except ValueError as exc:
            raise ConnectorError(f"opentask GET {path} returned non-JSON") from exc

        if not isinstance(data, dict):
            raise ConnectorError(f"opentask GET {path} returned {type(data)}, expected object")
        return data

    # ---------------- normalization ----------------

    def normalize(self, raw: dict[str, Any]) -> Bounty:
        """Map one OpenTask task payload into a `Bounty`."""
        tags = [t for t in (raw.get("skillsTags") or []) if isinstance(t, str)]
        title = raw.get("title") or ""

        payout = raw.get("budgetAmount")
        currency = raw.get("budgetCurrency")
        payout_usd = float(payout) if isinstance(payout, (int, float)) else None

        budget_text = raw.get("budgetText") or ""
        if payout_usd is None:
            payout_usd, parsed_currency = _parse_amount(budget_text)
            currency = currency or parsed_currency

        # Only treat USD-pegged stablecoins as dollars; anything else stays
        # unpriced so the skip-filter drops it rather than guessing an FX rate.
        if currency and currency.upper() not in _USD_PEGGED:
            payout_usd = None

        bounty_id = str(raw.get("id") or "")
        return Bounty(
            marketplace=self.name,
            bounty_id=bounty_id,
            title=title,
            description=raw.get("description") or "",
            category=_classify(tags, title),
            payout_usd=payout_usd,
            payout_text=budget_text,
            currency=(currency.upper() if isinstance(currency, str) else None),
            deadline=_parse_dt(raw.get("deadline")),
            tags=tags,
            url=f"{self.base_url}/tasks/{bounty_id}" if bounty_id else None,
            posted_at=_parse_dt(raw.get("createdAt")),
            raw=raw,
        )

    # ---------------- capability gates ----------------

    def can_claim(self, bounty: Bounty) -> tuple[bool, str]:
        mode = (bounty.raw or {}).get("executionMode")
        return False, (
            f"opentask is bid-based (executionMode={mode!r}) with off-platform, "
            "non-custodial settlement -- no autonomous open claim"
        )

    # ---------------- write paths: not available ----------------

    async def claim(self, bounty_id: str) -> dict[str, Any]:
        raise UnsupportedOperation(
            "OpenTask has no open pull-claim: work is won by submitting a bid that "
            "the buyer selects. Bidding needs an authenticated agent token and is "
            "out of scope for the read-only Week 1 connector."
        )

    async def submit(self, bounty_id: str, result: dict[str, Any]) -> dict[str, Any]:
        raise UnsupportedOperation(
            "OpenTask submission requires an authenticated contract (Week 2+)."
        )

    async def settlement_status(self, bounty_id: str) -> dict[str, Any]:
        raise UnsupportedOperation(
            "OpenTask does not custody funds; settlement happens off-platform and "
            "cannot be observed through the API."
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()
