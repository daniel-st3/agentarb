"""Grading a produced deliverable.

Handlers produce content; this module decides how far that content may be
trusted. The single invariant everything else relies on:

    a stubbed deliverable can never rise above SIMULATED,
    and only a validated, non-stub deliverable may be SUBMISSION_READY.

`grade()` is the only place that returns SUBMISSION_READY, so that rule is
enforced in one spot rather than scattered across handlers.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from arbiter.models import Category, DeliverableState

#: Deliverables shorter than this are treated as non-answers.
_MIN_OUTPUT_CHARS = 120

#: Hedging that signals the model did not actually do the task.
_NON_ANSWER_PATTERNS = [
    r"^\s*(i\s+(can'?t|cannot|am\s+unable)|as\s+an\s+ai\b)",
    r"\b(i\s+don'?t\s+have\s+(access|enough\s+information)|insufficient\s+information)\b",
    r"\b(please\s+provide\s+(more|the)\s+(details|information|context))\b",
]

_URL_RE = re.compile(r"https?://[^\s)\]<>\"']+")


@dataclass
class Validation:
    ok: bool
    notes: list[str] = field(default_factory=list)

    @property
    def summary(self) -> str:
        return "; ".join(self.notes)


def _base_checks(output: str) -> list[str]:
    problems: list[str] = []
    text = output.strip()
    if len(text) < _MIN_OUTPUT_CHARS:
        problems.append(f"output too short ({len(text)} chars)")
    lowered = text.lower()
    for pattern in _NON_ANSWER_PATTERNS:
        if re.search(pattern, lowered):
            problems.append("output is a refusal or a request for more information")
            break
    return problems


def _require_sections(output: str, required: list[str], label: str) -> list[str]:
    lowered = output.lower()
    missing = [s for s in required if s.lower() not in lowered]
    return [f"{label} missing section(s): {', '.join(missing)}"] if missing else []


def validate_research(output: str) -> Validation:
    """A brief needs an answer, findings, sources, and stated uncertainty."""
    problems = _base_checks(output)
    problems += _require_sections(
        output, ["answer", "findings", "sources", "uncertain"], "research brief"
    )
    if not _URL_RE.search(output):
        problems.append("research brief cites no source URLs")
    return Validation(not problems, problems)


def validate_summarization(output: str, source_text: str = "") -> Validation:
    """A summary must be grounded: no URLs the source did not contain.

    This is the check that catches the classic failure -- inventing a citation
    to make a summary look authoritative.
    """
    problems = _base_checks(output)

    source_urls = set(_URL_RE.findall(source_text or ""))
    invented = [u for u in _URL_RE.findall(output) if u not in source_urls]
    if invented:
        problems.append(f"summary invented {len(invented)} source URL(s) not in the input")

    if source_text and len(output.strip()) > len(source_text) * 1.2:
        problems.append("summary is longer than its source")

    return Validation(not problems, problems)


def validate_data_lookup(output: str) -> Validation:
    """Extraction must be machine-readable and carry provenance."""
    problems = _base_checks(output)

    payload = _extract_json(output)
    if payload is None:
        problems.append("data lookup output is not parseable JSON")
        return Validation(False, problems)

    if not isinstance(payload, dict):
        problems.append("data lookup JSON is not an object")
        return Validation(False, problems)

    for key in ("records", "sources", "retrieved_at"):
        if key not in payload:
            problems.append(f"data lookup JSON missing '{key}'")

    if not isinstance(payload.get("records"), list):
        problems.append("'records' is not a list")
    if not payload.get("sources"):
        problems.append("data lookup cites no sources")

    return Validation(not problems, problems)


def validate_small_code(output: str) -> Validation:
    """Code deliverables need the code, an explanation, and validation notes."""
    problems = _base_checks(output)

    if "```" not in output:
        problems.append("no fenced code block in output")
    problems += _require_sections(output, ["explanation", "validation"], "code deliverable")

    return Validation(not problems, problems)


def _extract_json(output: str) -> object | None:
    """Pull a JSON object out of raw text or a fenced block."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", output, re.DOTALL)
    candidates = [fenced.group(1)] if fenced else []
    brace = re.search(r"\{.*\}", output, re.DOTALL)
    if brace:
        candidates.append(brace.group(0))
    candidates.append(output)

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except (ValueError, TypeError):
            continue
    return None


_VALIDATORS = {
    Category.RESEARCH: validate_research,
    Category.SUMMARIZATION: validate_summarization,
    Category.DATA_LOOKUP: validate_data_lookup,
    Category.SMALL_CODE: validate_small_code,
}


def validate(category: Category, output: str, source_text: str = "") -> Validation:
    validator = _VALIDATORS.get(category)
    if validator is None:
        return Validation(False, [f"no validator for category {category.value}"])
    if validator is validate_summarization:
        return validator(output, source_text)
    return validator(output)


def grade(
    category: Category,
    output: str,
    stubbed: bool,
    ok: bool,
    marketplace_accepts_submission: bool,
    source_text: str = "",
) -> tuple[DeliverableState, Validation]:
    """Map a handler's output onto a `DeliverableState`.

    The only function that may return SUBMISSION_READY.
    """
    if stubbed:
        # Hard floor. A stub is never a draft, never validated, never ready.
        return DeliverableState.SIMULATED, Validation(
            False, ["stubbed deliverable: no LLM ran, not submittable"]
        )

    if not ok:
        return DeliverableState.DRAFT, Validation(False, ["handler reported failure"])

    result = validate(category, output, source_text)
    if not result.ok:
        return DeliverableState.DRAFT, result

    if not marketplace_accepts_submission:
        return DeliverableState.VALIDATED, result

    return DeliverableState.SUBMISSION_READY, result
