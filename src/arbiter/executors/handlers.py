"""The four Week 2 handlers.

Each is a thin, honest wrapper around one prompt shape. They share a base that
handles the no-key path so a missing key degrades to a labelled stub rather
than a crash.
"""

from __future__ import annotations

from arbiter.config import get_settings
from arbiter.executors.base import ExecutionResult
from arbiter.llm import GroqEstimator
from arbiter.logging import get_logger
from arbiter.models import Bounty, Category

log = get_logger(__name__)

#: Rough Groq pricing for cost accounting. Deliberately an over-estimate --
#: the RiskGuard should err toward thinking things cost more than they do.
_COST_PER_CALL_USD = 0.002


class _LLMHandler:
    """Shared machinery: build a prompt, call the LLM, or stub it out."""

    name: str = "base"
    category: Category = Category.UNKNOWN
    system: str = "You are a careful assistant."

    def __init__(self, client=None) -> None:
        settings = get_settings()
        self._llm: GroqEstimator | None = (
            GroqEstimator(settings.groq_api_key, settings.groq_model, client=client)
            if settings.groq_api_key
            else None
        )

    def build_prompt(self, bounty: Bounty) -> str:
        return (
            f"Task title: {bounty.title}\n"
            f"Payout: {bounty.payout_usd} {bounty.currency or 'USD'}\n"
            f"Tags: {', '.join(bounty.tags) or 'none'}\n\n"
            f"Task description:\n{bounty.description[:6000]}\n"
        )

    def _stub(self, bounty: Bounty) -> ExecutionResult:
        return ExecutionResult(
            ok=True,
            handler=self.name,
            output=(
                f"[STUB DELIVERABLE -- no LLM key configured]\n\n"
                f"Handler `{self.name}` would produce a {self.category.value} "
                f"deliverable for: {bounty.title}\n\n"
                "This placeholder exists so the orchestrator loop is runnable "
                "offline. It is not real work and must not be submitted to a "
                "real marketplace."
            ),
            cost_usd=0.0,
            stubbed=True,
        )

    async def run(self, bounty: Bounty) -> ExecutionResult:
        if self._llm is None:
            log.info("executor.stubbed", handler=self.name, bounty=bounty.key)
            return self._stub(bounty)

        try:
            output = await self._llm.complete(self.system, self.build_prompt(bounty))
        except Exception as exc:  # noqa: BLE001 -- a handler failure is data, not a crash
            log.error("executor.failed", handler=self.name, bounty=bounty.key, error=str(exc))
            return ExecutionResult(
                ok=False, handler=self.name, cost_usd=_COST_PER_CALL_USD, error=str(exc)
            )

        if not output.strip():
            return ExecutionResult(
                ok=False, handler=self.name, cost_usd=_COST_PER_CALL_USD,
                error="model returned empty output",
            )

        log.info("executor.done", handler=self.name, bounty=bounty.key, chars=len(output))
        return ExecutionResult(
            ok=True, handler=self.name, output=output, cost_usd=_COST_PER_CALL_USD
        )


class ResearchHandler(_LLMHandler):
    name = "research"
    category = Category.RESEARCH
    system = (
        "You are a research analyst. Produce a concise, sourced brief. State "
        "plainly what you could not verify rather than filling gaps with "
        "plausible-sounding claims. Structure: Summary, Findings, Open questions."
    )


class SummarizationHandler(_LLMHandler):
    name = "summarization"
    category = Category.SUMMARIZATION
    system = (
        "You are an editor. Summarize faithfully and compactly. Preserve "
        "numbers, names, and caveats exactly. Never introduce claims absent "
        "from the source."
    )


class SmallCodeHandler(_LLMHandler):
    name = "small_code"
    category = Category.SMALL_CODE
    system = (
        "You are a careful software engineer. Produce a minimal, correct, "
        "self-contained change. Include the code and a one-paragraph "
        "explanation. If the request is underspecified, say exactly what is "
        "missing instead of guessing."
    )


class DataLookupHandler(_LLMHandler):
    name = "data_lookup"
    category = Category.DATA_LOOKUP
    system = (
        "You extract structured data. Return exactly the requested schema. "
        "Use null for values you cannot determine -- never invent a value to "
        "fill a field."
    )
