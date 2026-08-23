"""Configuration. All values come from the environment or a gitignored `.env`."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ARBITER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM ---
    llm_provider: str = "heuristic"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # --- OpenTask ---
    opentask_base_url: str = "https://opentask.ai"
    opentask_api_token: str = ""

    # --- Persistence ---
    db_path: Path = Path("data/arbiter.db")

    # --- Scoring / skip-filter ---
    min_payout_usd: float = 1.0
    max_effort_hours: float = 0.25
    cost_safety_margin: float = 3.0
    daily_budget_usd: float = 5.0

    # --- Logging ---
    log_level: str = "INFO"
    log_json: bool = False

    # --- Week 2+ wallet. Present so config is stable; unused in Week 1. ---
    enable_wallet: bool = False
    network: str = "base-sepolia"

    @property
    def db_url(self) -> str:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.db_path}"


_settings: Settings | None = None


def get_settings() -> Settings:
    """Process-wide settings singleton."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
