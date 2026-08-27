"""Local, GET-only API for approved governed work packages."""

from __future__ import annotations

import ipaddress
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query

from arbiter.config import Settings, get_settings
from arbiter.control_plane import (
    active_policy,
    active_profile,
    get_opportunity,
    get_package,
    init_control_plane_db,
    list_opportunities,
    list_packages,
)


def is_loopback_host(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()
    init_control_plane_db(cfg)
    app = FastAPI(
        title="Agent Arbiter Governed Work Package API",
        version="1.0.0",
        description=(
            "Local GET-only access to approved, immutable, not-submitted work packages."
        ),
    )

    @app.get("/v1/health")
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "mode": "localhost_get_only",
            "marketplace_writes_enabled": False,
            "real_marketplace_outcomes": 0,
        }

    @app.get("/v1/agent-profile")
    def profile() -> dict[str, object]:
        return active_profile(cfg).model_dump(mode="json")

    @app.get("/v1/work-policy")
    def policy() -> dict[str, object]:
        return active_policy(cfg).model_dump(mode="json")

    @app.get("/v1/opportunities")
    def opportunities(
        marketplace: Annotated[str | None, Query()] = None,
        decision: Annotated[str | None, Query()] = None,
    ) -> list[dict[str, object]]:
        rows = list_opportunities(cfg)
        if marketplace:
            rows = [row for row in rows if row["marketplace"] == marketplace]
        if decision:
            rows = [row for row in rows if row["package_eligibility"] == decision]
        return rows

    @app.get("/v1/opportunities/{opportunity_id:path}")
    def opportunity(opportunity_id: str) -> dict[str, object]:
        row = get_opportunity(opportunity_id, cfg)
        if row is None:
            raise HTTPException(status_code=404, detail="opportunity not found")
        return row

    @app.get("/v1/work-packages")
    def packages() -> list[dict[str, object]]:
        return [package.model_dump(mode="json") for package in list_packages(cfg)]

    @app.get("/v1/work-packages/{package_id}")
    def package(package_id: str) -> dict[str, object]:
        found = get_package(package_id, cfg)
        if found is None:
            # Candidate identifiers deliberately receive the same response as
            # unknown identifiers: workers can retrieve approved packages only.
            raise HTTPException(status_code=404, detail="approved package not found")
        return found.model_dump(mode="json")

    return app


app = create_app()

