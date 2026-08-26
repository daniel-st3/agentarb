"""Estimator behind the score: one interface, two implementations.

`GroqEstimator` asks a cheap model for a structured JSON estimate.
`HeuristicEstimator` produces the same fields deterministically from bounty
text -- it needs no API key and no network, so the whole Week 1 scan is
demoable and testable offline. Both are biased conservative: an unparseable
or unfamiliar bounty gets a low p_success, never a hopeful one.
"""

from __future__ import annotations

import asyncio
import json
import random
import re
from typing import Any, Protocol

import httpx

from arbiter.config import get_settings
from arbiter.logging import get_logger
from arbiter.models import Bounty, Category

log = get_logger(__name__)

ESTIMATE_FIELDS = (
    "feasibility",
    "p_success",
    "confidence",
    "est_effort_hours",
    "est_api_cost_usd",
    "est_gas_cost_usd",
)

SYSTEM_PROMPT = """You estimate whether an autonomous LLM agent can complete a \
marketplace bounty. The agent has these handlers only: research, summarization, \
small_code, data_lookup. It has web search and can write files. It cannot act in \
the physical world, cannot use credentials it was not given, and cannot run jobs \
longer than about 15 minutes.

Return ONLY a JSON object with these keys:
  feasibility       0-1, can this agent do this task at all
  p_success         0-1, probability the buyer accepts the deliverable
  confidence        0-1, your confidence in your own estimate
  est_effort_hours  float, wall-clock hours of agent compute
  est_api_cost_usd  float, LLM/API spend to complete it
  est_gas_cost_usd  float, on-chain gas, 0 for off-chain work
  rationale         one short sentence

Be conservative. Vague or underspecified bounties get low p_success."""


class LLMError(RuntimeError):
    """The model could not be reached, or answered unusably."""


def _retry_after(response: httpx.Response) -> float | None:
    """Honour a Retry-After header when the server sends one."""
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        return max(0.0, float(raw))
    except ValueError:
        return None


class Estimate(dict):
    """Plain dict of the estimate fields plus `rationale`."""


class Estimator(Protocol):
    name: str

    async def estimate(self, bounty: Bounty) -> Estimate: ...


# --------------------------------------------------------------------------


def _clamp(value: Any, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def _plausible(estimate: Estimate) -> bool:
    """Reject structurally-valid but nonsensical estimates.

    `_coerce` clamps every field into range, so a garbage response comes back
    looking well-formed. This catches the cases clamping hides.
    """
    if not all(0.0 <= estimate[k] <= 1.0 for k in ("feasibility", "p_success", "confidence")):
        return False
    if estimate["est_effort_hours"] <= 0:
        return False
    if estimate["est_effort_hours"] > 500:
        return False
    return True


def _coerce(payload: dict[str, Any]) -> Estimate:
    """Force a model response into the estimate contract, conservatively."""
    return Estimate(
        feasibility=_clamp(payload.get("feasibility"), 0.0, 1.0, 0.0),
        p_success=_clamp(payload.get("p_success"), 0.0, 1.0, 0.0),
        confidence=_clamp(payload.get("confidence"), 0.0, 1.0, 0.1),
        est_effort_hours=_clamp(payload.get("est_effort_hours"), 0.0, 1000.0, 1.0),
        est_api_cost_usd=_clamp(payload.get("est_api_cost_usd"), 0.0, 1e6, 0.05),
        est_gas_cost_usd=_clamp(payload.get("est_gas_cost_usd"), 0.0, 1e6, 0.0),
        rationale=str(payload.get("rationale") or "")[:400],
    )


class HeuristicEstimator:
    """Deterministic estimator. No network, no key, no tokens spent."""

    name = "heuristic"

    #: category -> (base feasibility, base p_success, base effort hours)
    _BASE: dict[Category, tuple[float, float, float]] = {
        Category.SUMMARIZATION: (0.90, 0.72, 0.05),
        Category.RESEARCH: (0.85, 0.65, 0.12),
        Category.DATA_LOOKUP: (0.80, 0.62, 0.15),
        Category.SMALL_CODE: (0.70, 0.55, 0.20),
        Category.UNKNOWN: (0.05, 0.05, 2.0),
    }

    #: Text that signals work an autonomous agent should not promise.
    _RED_FLAGS = (
        "deploy", "production", "on-call", "multi-tenant", "infrastructure",
        "photograph", "in person", "on-site", "notarize", "phone call",
        "long-term", "ongoing", "full-time",
    )

    # Treat a number as workload scale only when it modifies a work-item noun.
    # Bare years, prices, dates, and identifiers are data—not evidence of volume.
    _SCALE_RE = re.compile(
        r"\b(\d{2,})\s+(?:(?:public|annual|lengthy|individual)\s+){0,3}(?:"
        r"reports?|records?|filings?|pages?|items?|rows?|documents?|entries?|"
        r"tables?|companies|urls?|sites?|files?|tasks?|articles?"
        r")\b"
    )

    async def estimate(self, bounty: Bounty) -> Estimate:
        feasibility, p_success, effort = self._BASE.get(
            bounty.category, self._BASE[Category.UNKNOWN]
        )
        text = f"{bounty.title} {bounty.description}".lower()
        notes: list[str] = [f"category={bounty.category.value}"]

        flags = [f for f in self._RED_FLAGS if f in text]
        if flags:
            feasibility *= 0.25
            p_success *= 0.3
            effort *= 4
            notes.append(f"red flags: {', '.join(flags[:3])}")

        # Contextual quantities such as "40 filings" indicate real volume.
        scale = max((int(n) for n in self._SCALE_RE.findall(text)), default=0)
        if scale >= 100:
            effort *= 3.0
            notes.append(f"large scale (~{scale})")
        elif scale >= 20:
            effort *= 1.8
            notes.append(f"moderate scale (~{scale})")

        # A bounty with no description is a bounty we do not understand.
        if len(bounty.description) < 40:
            p_success *= 0.7
            confidence = 0.35
            notes.append("thin description")
        else:
            confidence = 0.6

        if bounty.payout_usd is None:
            confidence *= 0.6
            notes.append("payout not machine-readable")

        # Token spend tracks effort; nothing here touches a chain.
        est_api_cost = round(0.35 * effort + 0.01, 4)

        return Estimate(
            feasibility=round(min(1.0, feasibility), 3),
            p_success=round(min(1.0, p_success), 3),
            confidence=round(min(1.0, confidence), 3),
            est_effort_hours=round(effort, 3),
            est_api_cost_usd=est_api_cost,
            est_gas_cost_usd=0.0,
            rationale="; ".join(notes),
        )


class GroqEstimator:
    """Cheap-model estimator via Groq's OpenAI-compatible chat endpoint."""

    name = "groq"
    _URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
        max_attempts: int = 3,
        backoff: float = 0.5,
        max_backoff: float = 8.0,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self._client = client  # injectable for tests
        self._max_attempts = max_attempts
        self._backoff = backoff
        self._max_backoff = max_backoff
        self._fallback = HeuristicEstimator()

    async def _post_once(self, body: dict[str, Any]) -> str:
        headers = {"Authorization": f"Bearer {self._api_key}"}
        if self._client is not None:
            response = await self._client.post(self._URL, json=body, headers=headers)
            response.raise_for_status()
            return self._content(response)

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(self._URL, json=body, headers=headers)
            response.raise_for_status()
            return self._content(response)

    @staticmethod
    def _content(response: httpx.Response) -> str:
        """Pull the message content out, tolerating a malformed envelope."""
        try:
            return response.json()["choices"][0]["message"]["content"] or ""
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMError(f"unexpected response envelope: {exc}") from exc

    async def _post(self, body: dict[str, Any]) -> str:
        """POST a chat completion, retrying transient failures.

        Retries 429 and 5xx (honouring Retry-After when present) and network
        timeouts, with jittered exponential backoff. A 4xx other than 429 is
        not retried -- a bad request will not fix itself. Raises `LLMError`
        once retries are exhausted; callers fall back deterministically.
        """
        delay = self._backoff
        last: Exception | None = None

        for attempt in range(1, self._max_attempts + 1):
            try:
                return await self._post_once(body)
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                last = exc
                if status != 429 and status < 500:
                    raise LLMError(f"non-retryable HTTP {status}") from exc
                wait = _retry_after(exc.response) or delay
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = exc
                wait = delay
            except LLMError:
                raise

            if attempt == self._max_attempts:
                break
            wait = min(wait, self._max_backoff) * (1 + random.random() * 0.25)
            log.warning(
                "llm.retry", attempt=attempt, of=self._max_attempts,
                sleeping=round(wait, 2), error=str(last),
            )
            await asyncio.sleep(wait)
            delay = min(delay * 2, self._max_backoff)

        raise LLMError(f"exhausted {self._max_attempts} attempts: {last}")

    async def complete(self, system: str, user: str, max_tokens: int = 1200) -> str:
        """Free-form completion. Used by the execution sub-agents."""
        return await self._post(
            {
                "model": self._model,
                "temperature": 0.2,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            }
        )

    async def estimate(self, bounty: Bounty) -> Estimate:
        prompt = (
            f"Marketplace: {bounty.marketplace}\n"
            f"Title: {bounty.title}\n"
            f"Category (pre-classified): {bounty.category.value}\n"
            f"Payout: {bounty.payout_usd} {bounty.currency or ''} "
            f"(raw: {bounty.payout_text!r})\n"
            f"Tags: {', '.join(bounty.tags) or 'none'}\n"
            f"Description:\n{bounty.description[:3000]}"
        )
        body = {
            "model": self._model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }
        try:
            content = await self._post(body)
            payload = json.loads(content)
            if not isinstance(payload, dict):
                raise LLMError(f"expected a JSON object, got {type(payload).__name__}")
            estimate = _coerce(payload)
            if not _plausible(estimate):
                raise LLMError(f"implausible estimate: {dict(estimate)}")
            return estimate
        except Exception as exc:  # noqa: BLE001 -- never let scoring die on the LLM
            log.warning(
                "llm.estimate_failed",
                bounty=bounty.key,
                error=str(exc),
                falling_back_to="heuristic",
            )
            estimate = await self._fallback.estimate(bounty)
            estimate["rationale"] = f"[fell back to heuristic: {exc}] {estimate['rationale']}"
            estimate["fallback"] = True
            return estimate


def get_estimator() -> Estimator:
    """Pick an estimator from config.

    The default provider is "auto": use Groq when a key is present, otherwise
    fall back to the offline heuristic. Dropping a key into `.env` is
    therefore the only step needed to switch to the real LLM. "groq" and
    "heuristic" force the choice explicitly.
    """
    settings = get_settings()
    provider = settings.llm_provider.lower()

    if provider == "heuristic":
        return HeuristicEstimator()

    if provider in {"auto", "groq"}:
        if settings.groq_api_key:
            log.info("llm.estimator", provider="groq", model=settings.groq_model)
            return GroqEstimator(settings.groq_api_key, settings.groq_model)
        if provider == "groq":
            log.warning("llm.no_api_key", provider="groq", using="heuristic")
        return HeuristicEstimator()

    log.warning("llm.unknown_provider", provider=provider, using="heuristic")
    return HeuristicEstimator()
