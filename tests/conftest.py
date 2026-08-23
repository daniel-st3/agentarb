import pytest

from arbiter.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        min_payout_usd=1.0,
        max_effort_hours=0.25,
        cost_safety_margin=3.0,
        daily_budget_usd=5.0,
        llm_provider="heuristic",
    )
