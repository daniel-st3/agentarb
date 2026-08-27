"""Memory-only policy evaluation. No persistence, approvals, or worker imports.

The only network surface is a fixed-origin, fixed-route public GET transport.
Session state is owned by the caller; this module holds no visitor state.
"""

# ruff: noqa: E501 -- complete policy fixtures and contracts remain readable together.

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from typing import Any

import httpx

from arbiter.connectors.execution_market import ExecutionMarketConnector
from arbiter.connectors.opentask import OpenTaskConnector
from arbiter.governance import (
    PROHIBITED_ACTIONS,
    AgentProfile,
    Eligibility,
    WorkPolicy,
    _decision,
    _templates,
)
from arbiter.llm import HeuristicEstimator
from arbiter.models import Bounty, Category, ClaimModel, MarketplaceCapabilities, Settlement

TEMPLATES = {
    "Research Analyst": ["research", "summarization"],
    "Data Extraction Worker": ["data_lookup"],
    "Code Planning Worker": ["small_code"],
    "Conservative Agent": ["research", "summarization", "data_lookup", "small_code"],
}
CATEGORIES = ["research", "summarization", "data_lookup", "small_code"]
TOOLS = ["local_text_transform", "structured_planning"]
CAPABILITIES = ["local_planning", "local_validation", "structured_output", *CATEGORIES]
EXTRA_RESTRICTIONS = ["external_source_dependency", "code_planning"]
PUBLIC_SOURCES = {
    "opentask": ("https://opentask.ai", "/api/tasks", OpenTaskConnector),
    "execution_market": (
        "https://api.execution.market",
        "/api/v1/tasks/available",
        ExecutionMarketConnector,
    ),
}
MOCK_CAPABILITIES = MarketplaceCapabilities(
    name="mock",
    supports_open_claim=False,
    claim_model=ClaimModel.OPEN_CLAIM,
    settlement=Settlement.SIMULATED,
    has_human_accept_gate=True,
    supports_autonomous_settle=False,
    notes="Controlled demo record; no lifecycle is run.",
)


def template_profile(name: str) -> tuple[AgentProfile, WorkPolicy]:
    categories = TEMPLATES[name]
    conservative = name == "Conservative Agent"
    return (
        AgentProfile(
            profile_id="session-profile",
            name=name,
            description="Temporary visitor policy; preview only.",
            supported_categories=list(categories),
            allowed_tools=list(TOOLS),
            capabilities=list(CAPABILITIES),
            max_execution_cost_usd=0.1 if conservative else 1.0,
            max_execution_minutes=15 if conservative else 60,
            reputation_by_marketplace={"opentask": 0, "execution_market": 0, "mock": 0},
        ),
        WorkPolicy(
            policy_id="session-policy",
            min_payout_usd=10.0 if conservative else 1.0,
            min_confidence=0.8 if conservative else 0.2,
        ),
    )


def validate_envelope(profile: AgentProfile, policy: WorkPolicy) -> None:
    """Visitor input may only narrow the immutable sandbox authority ceiling."""
    if not set(PROHIBITED_ACTIONS).issubset(profile.prohibited_actions):
        raise ValueError("Required safety prohibitions cannot be removed")
    if not set(profile.prohibited_actions) <= PROHIBITED_ACTIONS | set(EXTRA_RESTRICTIONS):
        raise ValueError("Unsupported restriction")
    if not set(profile.allowed_tools) <= set(TOOLS):
        raise ValueError("Only local text/planning tools can be described")
    if not set(profile.supported_categories) <= set(CATEGORIES):
        raise ValueError("Unsupported category")
    if not set(profile.capabilities) <= set(CAPABILITIES):
        raise ValueError("Unsupported capability")
    if not set(policy.allowed_marketplaces) <= set(PUBLIC_SOURCES) | {"mock"}:
        raise ValueError("Unsupported marketplace")
    if not profile.human_approval_always_required or not policy.human_approval.default_required:
        raise ValueError("Human approval must remain required; sandbox cannot grant it")
    if not (
        0 <= profile.max_execution_cost_usd <= 100 and 1 <= profile.max_execution_minutes <= 240
    ):
        raise ValueError("Invalid execution limits")
    if not (0 <= policy.min_payout_usd <= 10000 and 0 <= policy.min_confidence <= 1):
        raise ValueError("Invalid policy thresholds")
    if not (-100 <= policy.min_expected_margin_usd <= 10000):
        raise ValueError("Invalid margin threshold")


class PublicDiscoveryTransport(httpx.AsyncBaseTransport):
    """Reject non-GET, auth, alternate origins/routes and redirects before I/O."""

    def __init__(self, inner: httpx.AsyncBaseTransport | None = None):
        self.inner = inner if inner is not None else httpx.AsyncHTTPTransport(trust_env=False)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        routes = {(origin + path) for origin, path, _ in PUBLIC_SOURCES.values()}
        target = str(request.url.copy_with(query=None))
        if (
            request.method != "GET"
            or target not in routes
            or any(h in request.headers for h in ("authorization", "cookie", "x-api-key"))
            or request.content
            or not set(request.url.params.keys()) <= {"limit", "cursor", "offset"}
        ):
            raise ValueError("Only fixed public discovery GET routes are permitted")
        response = await self.inner.handle_async_request(request)
        if response.is_redirect:
            await response.aclose()
            raise ValueError("Discovery redirects are not followed")
        return response

    async def aclose(self) -> None:
        await self.inner.aclose()


async def fetch_public(market: str, limit: int = 5) -> list[Bounty]:
    origin, _, connector_type = PUBLIC_SOURCES[market]
    async with httpx.AsyncClient(
        base_url=origin,
        transport=PublicDiscoveryTransport(),
        timeout=12,
        follow_redirects=False,
        trust_env=False,
        headers={"Accept": "application/json", "User-Agent": "agent-arbiter-sandbox/1"},
    ) as client:
        connector = connector_type(base_url=origin, client=client)
        # No provider selection, detail endpoint, credentials, or write methods.
        return await connector.list_open(limit=max(1, min(limit, 10)))


def controlled_records() -> list[Bounty]:
    """Purpose-built in-memory fixtures; no MockMarketplace action object exists."""
    specs = [
        (
            "demo-research",
            "Plan a comparison of public API documentation",
            "research",
            24,
            "Create a question matrix and evidence checklist comparing pagination, versioning, "
            "and error handling in public API documentation. Produce only a structured research plan.",
        ),
        (
            "demo-data",
            "Structure a supplied product inventory",
            "data_lookup",
            18,
            "Create a field map for this supplied inventory: Cedar desk, SKU D01, quantity 4; "
            "Oak shelf, SKU S02, quantity 7. Preserve provenance and list unresolved fields.",
        ),
        (
            "demo-code",
            "Plan a timezone edge-case fix",
            "small_code",
            18,
            "Draft pseudocode and a test strategy for a date formatter that rolls UTC midnight "
            "into the wrong calendar day. Produce a bounded patch outline without repository access.",
        ),
        (
            "demo-summary",
            "Outline a supplied release note",
            "summarization",
            12,
            "Summarize this supplied text: Release 2.4 adds cursor pagination and fixes duplicate "
            "event IDs. Existing endpoints remain compatible. New clients should retain cursors.",
        ),
        (
            "demo-low",
            "Plan a tiny documentation correction",
            "small_code",
            0.25,
            "Create a short patch outline for correcting the spelling of a variable in the supplied "
            "documentation example. No executable verification is requested.",
        ),
        (
            "demo-refusal",
            "Access restricted customer records",
            "data_lookup",
            80,
            "Log in to a private customer system using provided credentials and extract private data.",
        ),
    ]
    return [
        Bounty(
            marketplace="mock",
            bounty_id=i,
            title=t,
            description=d,
            category=Category(c),
            tags=[c],
            payout_usd=float(p),
        )
        for i, t, c, p, d in specs
    ]


async def discover(
    cache: dict[str, Any] | None = None,
    *,
    live: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    """Cache is session-owned memory, never global, disk, or a historical live claim."""
    memory = deepcopy(cache or {})
    entries, statuses = [], []
    for market in PUBLIC_SOURCES if live else []:
        now = datetime.now(UTC).isoformat()
        try:
            bounties = await fetch_public(market)
            memory[market] = {
                "observed_at": now,
                "bounties": [b.model_dump(mode="json") for b in bounties],
            }
            source_type, observed_at = "live_discovery", now
            status = "available" if bounties else "empty"
        except Exception:
            previous = memory.get(market, {})
            bounties = [Bounty.model_validate(b) for b in previous.get("bounties", [])]
            source_type, observed_at = "cached_discovery", previous.get("observed_at")
            status = "cached" if bounties else "unavailable"
        statuses.append(
            {
                "marketplace": market,
                "status": status,
                "count": len(bounties),
                "observed_at": observed_at,
            }
        )
        entries.extend(
            {"bounty": b, "source_type": source_type, "observed_at": observed_at} for b in bounties
        )
    entries.extend(
        {"bounty": b, "source_type": "controlled_mock", "observed_at": None}
        for b in controlled_records()
    )
    return entries, memory, statuses


async def evaluate(
    entries: list[dict[str, Any]],
    profile: AgentProfile,
    policy: WorkPolicy,
) -> list[dict[str, Any]]:
    validate_envelope(profile, policy)
    estimator = HeuristicEstimator()
    rows = []
    for entry in entries:
        bounty = entry["bounty"]
        caps = (
            MOCK_CAPABILITIES
            if bounty.marketplace == "mock"
            else PUBLIC_SOURCES[bounty.marketplace][2].capabilities
        )
        verdict = _decision(bounty, caps, profile, policy, None)
        # Safety/category/capability/reputation policy gates precede estimation.
        if verdict["reason_codes"] == ["ESTIMATE_UNAVAILABLE"]:
            missing = sorted(set(TOOLS) - set(profile.allowed_tools))
            missing_caps = sorted(
                {"local_planning", "local_validation", "structured_output"}
                - set(profile.capabilities)
            )
            if missing or missing_caps:
                verdict = {
                    "eligibility": Eligibility.SKIP,
                    "reason_codes": ["LOCAL_CAPABILITY_MISSING"],
                    "rationale": "Bounded preview needs: " + ", ".join(missing + missing_caps),
                }
            elif (
                "code_planning" in profile.prohibited_actions
                and bounty.category == Category.SMALL_CODE
            ):
                verdict = {
                    "eligibility": Eligibility.SKIP,
                    "reason_codes": ["SESSION_CODE_PLANNING_BLOCKED"],
                    "rationale": "This session prohibits code planning.",
                }
            elif (
                "external_source_dependency" in profile.prohibited_actions
                and bounty.category == Category.RESEARCH
            ):
                verdict = {
                    "eligibility": Eligibility.SKIP,
                    "reason_codes": ["SESSION_SOURCE_DEPENDENCY_BLOCKED"],
                    "rationale": "This session excludes work with external evidence requirements.",
                }
            else:
                verdict = _decision(bounty, caps, profile, policy, await estimator.estimate(bounty))
        raw = bounty.raw or {}
        rows.append(
            {
                "opportunity_id": bounty.key,
                "marketplace": bounty.marketplace,
                "source_type": entry["source_type"],
                "observed_at": entry["observed_at"],
                "task": {
                    "title": bounty.title,
                    "description": bounty.description,
                    "category": bounty.category.value,
                    "payout_usd": bounty.payout_usd,
                },
                "package_eligibility": verdict["eligibility"].value,
                "reason_codes": verdict["reason_codes"],
                "rationale": verdict["rationale"],
                "confidence": float(verdict.get("confidence", 0)),
                "p_success": float(verdict.get("p_success", 0)),
                "actual_llm_inference_cost_usd": 0.0,
                "actual_llm_cost_status": "no_llm_call",
                "estimated_task_execution_cost_usd": float(verdict.get("estimated_task_cost", 0)),
                "estimated_other_cost_usd": float(verdict.get("estimated_other", 0)),
                "expected_margin_usd": float(verdict.get("expected_margin", 0)),
                "required_reputation": raw.get("min_reputation", 0),
                "claim_constraint": caps.claim_model.value,
                "settlement_constraint": caps.settlement.value,
                "external_execution_status": "discovery_only",
                "estimator": "heuristic-v1",
            }
        )
    return rows


def package_preview(
    row: dict[str, Any], profile: AgentProfile, policy: WorkPolicy
) -> dict[str, Any]:
    """Not a GovernedWorkPackage: no package ID, hash, approval or worker contract."""
    validate_envelope(profile, policy)
    if row["package_eligibility"] != "allow":
        raise ValueError("Only allowed decisions can be previewed")
    plan, criteria = _templates(row["task"]["category"])
    return {
        "schema_version": "sandbox-preview/1",
        "status": "preview_only",
        "package_preview_only": True,
        "submission_status": "not_submitted",
        "marketplace_action_authorized": False,
        "external_execution_status": "discovery_only",
        "profile_snapshot": profile.model_dump(mode="json"),
        "policy_snapshot": policy.model_dump(mode="json"),
        "task": deepcopy(row["task"]),
        "source_type": row["source_type"],
        "source_opportunity_id": row["opportunity_id"],
        "task_plan": plan,
        "validation_criteria": criteria,
        "decision_rationale": row["rationale"],
        "safety_constraints": {
            "preview_only": True,
            "execution_authorized": False,
            "human_approval_required": True,
            "no_external_actions": True,
            "allowed_tools": list(profile.allowed_tools),
            "prohibited_actions": list(profile.prohibited_actions),
        },
        **{
            key: row[key]
            for key in (
                "actual_llm_inference_cost_usd",
                "actual_llm_cost_status",
                "estimated_task_execution_cost_usd",
                "estimated_other_cost_usd",
                "expected_margin_usd",
            )
        },
    }
