"""Deliverable grading, and the invariant that stubs are never submittable."""

import json

import pytest

from arbiter.executors.validation import (
    grade,
    validate,
    validate_data_lookup,
    validate_research,
    validate_small_code,
    validate_summarization,
)
from arbiter.models import Category, DeliverableState

GOOD_RESEARCH = """
## Answer
Facilitator fees cluster around 0.5% per settled call.

## Findings
- Ultravioleta charges no per-call fee (https://facilitator.ultravioletadao.xyz).
- Coinbase's CDP facilitator is free on Base (https://docs.cdp.coinbase.com).

## Sources
1. https://facilitator.ultravioletadao.xyz
2. https://docs.cdp.coinbase.com

## Uncertainty
Pricing pages may be stale; I could not verify enterprise tiers. Confidence: medium.
"""

GOOD_CODE = """
## Code
```python
def add(a: int, b: int) -> int:
    return a + b
```

## Explanation
A minimal addition helper with explicit integer typing for clarity.

## Validation
Run `pytest`. Expected: add(2, 2) == 4. I did not execute this code.
Edge cases considered but untested: very large integers, non-int input.
"""

GOOD_LOOKUP = json.dumps({
    "records": [{"name": "Alice", "role": "Chair"}],
    "sources": ["https://example.com/filing"],
    "retrieved_at": "2026-08-23T12:00:00Z",
    "notes": "role for Bob could not be determined",
})


class TestResearch:
    def test_accepts_a_complete_brief(self):
        assert validate_research(GOOD_RESEARCH).ok

    def test_requires_sources_section(self):
        result = validate_research(GOOD_RESEARCH.replace("## Sources", "## Refs"))
        assert not result.ok and "sources" in result.summary.lower()

    def test_requires_uncertainty(self):
        result = validate_research(GOOD_RESEARCH.replace("## Uncertainty", "## Notes"))
        assert not result.ok

    def test_requires_at_least_one_url(self):
        stripped = GOOD_RESEARCH.replace("https://facilitator.ultravioletadao.xyz", "somewhere")
        stripped = stripped.replace("https://docs.cdp.coinbase.com", "elsewhere")
        result = validate_research(stripped)
        assert not result.ok and "no source urls" in result.summary.lower()

    def test_rejects_a_refusal(self):
        result = validate_research("I cannot help with that request." * 10)
        assert not result.ok


class TestSummarization:
    def test_grounded_summary_passes(self):
        source = "Revenue rose 12% to $4M. " * 20
        summary = "Revenue rose 12% to $4M.\n\n## Key points\n- 12% growth\n- $4M total" * 2
        assert validate_summarization(summary, source).ok

    def test_invented_url_is_caught(self):
        """The classic failure: a citation that was never in the source."""
        source = "Revenue rose 12% to $4M. " * 20
        summary = (
            "Revenue rose 12%, per the annual report at https://invented.example/report. "
            "Growth was broad-based across segments and regions this year."
        )
        result = validate_summarization(summary, source)
        assert not result.ok and "invented" in result.summary

    def test_url_present_in_source_is_fine(self):
        source = "See https://real.example/report for detail. " * 20
        summary = (
            "The report at https://real.example/report describes the year's results "
            "and covers each operating segment in turn, with no restatements."
        )
        assert validate_summarization(summary, source).ok

    def test_summary_longer_than_source_is_rejected(self):
        source = "Short source text that is not very long at all."
        result = validate_summarization("Padding. " * 200, source)
        assert not result.ok and "longer than its source" in result.summary


class TestDataLookup:
    def test_accepts_valid_json(self):
        assert validate_data_lookup(GOOD_LOOKUP).ok

    def test_accepts_fenced_json(self):
        assert validate_data_lookup(f"```json\n{GOOD_LOOKUP}\n```").ok

    def test_rejects_non_json(self):
        result = validate_data_lookup("Here are the records: Alice is the chair." * 5)
        assert not result.ok and "not parseable json" in result.summary.lower()

    def test_requires_provenance(self):
        payload = json.dumps({"records": [], "retrieved_at": "2026-08-23T12:00:00Z"})
        result = validate_data_lookup(payload + " " * 200)
        assert not result.ok
        assert "sources" in result.summary.lower()

    def test_requires_timestamp(self):
        payload = json.dumps({"records": [], "sources": ["https://x.example"]})
        result = validate_data_lookup(payload + " " * 200)
        assert not result.ok and "retrieved_at" in result.summary


class TestSmallCode:
    def test_accepts_a_complete_artifact(self):
        assert validate_small_code(GOOD_CODE).ok

    def test_requires_a_code_block(self):
        result = validate_small_code(GOOD_CODE.replace("```python", "").replace("```", ""))
        assert not result.ok and "fenced code block" in result.summary

    def test_requires_validation_notes(self):
        result = validate_small_code(GOOD_CODE.replace("## Validation", "## Misc"))
        assert not result.ok


class TestGradeInvariants:
    """The rules everything else depends on."""

    def test_a_stub_is_never_more_than_simulated(self):
        state, validation = grade(
            Category.RESEARCH, GOOD_RESEARCH, stubbed=True, ok=True,
            marketplace_accepts_submission=True,
        )
        assert state is DeliverableState.SIMULATED
        assert not validation.ok

    def test_a_perfect_stub_still_cannot_be_submission_ready(self):
        """Even flawless stub content stays SIMULATED."""
        for accepts in (True, False):
            state, _ = grade(
                Category.SMALL_CODE, GOOD_CODE, stubbed=True, ok=True,
                marketplace_accepts_submission=accepts,
            )
            assert state is DeliverableState.SIMULATED

    def test_failed_handler_is_a_draft_at_best(self):
        state, _ = grade(
            Category.RESEARCH, GOOD_RESEARCH, stubbed=False, ok=False,
            marketplace_accepts_submission=True,
        )
        assert state is DeliverableState.DRAFT

    def test_invalid_output_stays_a_draft(self):
        state, validation = grade(
            Category.RESEARCH, "too short", stubbed=False, ok=True,
            marketplace_accepts_submission=True,
        )
        assert state is DeliverableState.DRAFT and not validation.ok

    def test_valid_output_is_validated_when_market_cannot_accept(self):
        state, _ = grade(
            Category.RESEARCH, GOOD_RESEARCH, stubbed=False, ok=True,
            marketplace_accepts_submission=False,
        )
        assert state is DeliverableState.VALIDATED

    def test_submission_ready_needs_everything(self):
        state, validation = grade(
            Category.RESEARCH, GOOD_RESEARCH, stubbed=False, ok=True,
            marketplace_accepts_submission=True,
        )
        assert state is DeliverableState.SUBMISSION_READY and validation.ok

    def test_states_are_ordered(self):
        assert (
            DeliverableState.SIMULATED.rank
            < DeliverableState.DRAFT.rank
            < DeliverableState.VALIDATED.rank
            < DeliverableState.SUBMISSION_READY.rank
        )

    @pytest.mark.parametrize("category", list(Category))
    def test_every_category_has_a_verdict(self, category):
        """Including UNKNOWN, which must fail rather than raise."""
        result = validate(category, GOOD_RESEARCH)
        assert isinstance(result.ok, bool)
        if category is Category.UNKNOWN:
            assert not result.ok
