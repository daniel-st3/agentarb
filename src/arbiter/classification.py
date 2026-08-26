"""Deterministic task-category normalization shared by connectors and benchmarks."""

from __future__ import annotations

from arbiter.models import Category

# First match wins, in this order. Exact tags take precedence over title text.
_CATEGORY_TAGS: list[tuple[Category, set[str]]] = [
    (
        Category.SMALL_CODE,
        {
            "python", "javascript", "typescript", "code", "coding", "script",
            "automation", "api-integration", "bug-fix", "refactor", "sql",
        },
    ),
    (
        Category.SUMMARIZATION,
        {
            "summarization", "summary", "report-writing", "content-writing",
            "copywriting", "editing", "transcription",
        },
    ),
    (
        Category.DATA_LOOKUP,
        {
            "data-extraction", "web-scraping", "csv", "json", "data-entry",
            "scraping", "lookup", "enrichment",
        },
    ),
    (
        Category.RESEARCH,
        {
            "research", "competitive-analysis", "market-research", "analysis",
            "due-diligence", "openapi",
        },
    ),
]


def classify_category(tags: list[str], title: str) -> Category:
    """Map heterogeneous tags/title text into one supported handler category."""
    haystack = {tag.lower().strip() for tag in tags}
    for category, keywords in _CATEGORY_TAGS:
        if haystack & keywords:
            return category
    lowered = title.lower()
    for category, keywords in _CATEGORY_TAGS:
        if any(keyword in lowered for keyword in keywords):
            return category
    return Category.UNKNOWN
