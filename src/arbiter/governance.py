"""Pure governance contracts and policy functions shared by local and hosted flows.

No persistence, provider selection, worker, or marketplace actions live here.
"""

from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field

from arbiter.executors.safety import screen
from arbiter.models import Bounty, Category, MarketplaceCapabilities

PACKAGE_SCHEMA_VERSION = "1.0"
ARTIFACT_SCHEMA_VERSION = "1.0"
SUBMISSION_STATUS = "not_submitted"
EXTERNAL_EXECUTION_STATUS = "discovery_only"

PROHIBITED_ACTIONS = frozenset(
    {
        "credentials",
        "payments",
        "wallet",
        "signing",
        "marketplace_write",
        "arbitrary_code_execution",
        "browser_login",
        "private_data",
        "external_action",
    }
)

_CONTROL_PLANE_PROHIBITED_PATTERNS = (
    (r"\b(password|api key|private key|seed phrase|credential)\b", "credentials"),
    (
        r"\b(integrate|initiate|send|make|process|connect|use)\b.{0,40}"
        r"\b(payment|stripe|x402|wallet|escrow)\b",
        "payments_or_wallet",
    ),
    (
        r"\b(payment|stripe|x402|wallet|escrow)\b.{0,30}"
        r"\b(integration|transaction|transfer|connection)\b",
        "payments_or_wallet",
    ),
    (r"\b(sign|broadcast)\b.{0,30}\b(message|transaction)\b", "signing"),
    (
        r"\b(bid|claim|accept|submit|settle|cancel)\b.{0,40}"
        r"\b(task|bounty|marketplace|work)\b",
        "marketplace_write",
    ),
    (r"\b(run|execute)\b.{0,30}\b(untrusted )?(code|script|command|binary)\b", "code_execution"),
    (r"\b(log in|login to|sign in)\b", "browser_login"),
    (r"\b(private|personal|confidential)\s+(data|record|information)\b", "private_data"),
    (
        r"\b(send email|post message|make a phone call|purchase|book appointment)\b",
        "external_action",
    ),
)

DEFAULT_TOOLS = ["local_text_transform", "structured_planning", "local_json_write"]


class Eligibility(StrEnum):
    ALLOW = "allow"
    SKIP = "skip"
    REFUSE = "refuse"


class CandidateStatus(StrEnum):
    PENDING = "pending"
    REJECTED = "rejected"
    MATERIALIZED = "materialized"


class ReadOnlyConnector(Protocol):
    name: str
    capabilities: MarketplaceCapabilities

    async def list_open(self, limit: int = 50) -> list[Bounty]: ...
    async def get(self, bounty_id: str) -> Bounty | None: ...
    async def aclose(self) -> None: ...


class AgentProfile(BaseModel):
    model_config = ConfigDict(frozen=True)

    profile_id: str = "default-agent"
    version: int = 1
    name: str = "Local Dry-Run Worker"
    description: str = "Deterministic local worker with no marketplace action capability."
    supported_categories: list[str] = Field(
        default_factory=lambda: [
            category.value for category in Category if category != Category.UNKNOWN
        ]
    )
    allowed_tools: list[str] = Field(default_factory=lambda: list(DEFAULT_TOOLS))
    capabilities: list[str] = Field(
        default_factory=lambda: [
            "local_planning",
            "local_validation",
            "structured_output",
            "research",
            "summarization",
            "data_lookup",
            "small_code",
            "data_collection",
            "data_processing",
            "knowledge_access",
            "content_generation",
        ]
    )
    prohibited_actions: list[str] = Field(default_factory=lambda: sorted(PROHIBITED_ACTIONS))
    max_execution_cost_usd: float = 1.0
    max_execution_minutes: int = 60
    reputation_by_marketplace: dict[str, int] = Field(
        default_factory=lambda: {"opentask": 0, "execution_market": 0, "mock": 100}
    )
    human_approval_always_required: bool = True


class HumanApprovalRules(BaseModel):
    model_config = ConfigDict(frozen=True)

    default_required: bool = True
    required_marketplaces: list[str] = Field(
        default_factory=lambda: ["opentask", "execution_market", "mock"]
    )
    cost_threshold_usd: float = 0.0
    required_risk_categories: list[str] = Field(default_factory=lambda: sorted(PROHIBITED_ACTIONS))


class WorkPolicy(BaseModel):
    model_config = ConfigDict(frozen=True)

    policy_id: str = "default-policy"
    version: int = 1
    min_payout_usd: float = 1.0
    min_expected_margin_usd: float = 0.0
    min_confidence: float = 0.2
    allowed_marketplaces: list[str] = Field(
        default_factory=lambda: ["opentask", "execution_market", "mock"]
    )
    blocked_risk_categories: list[str] = Field(default_factory=lambda: sorted(PROHIBITED_ACTIONS))
    max_approved_projected_daily_cost_usd: float = 5.0
    human_approval: HumanApprovalRules = Field(default_factory=HumanApprovalRules)


class GovernedWorkPackage(BaseModel):
    """Immutable canonical contract returned to a local worker."""

    model_config = ConfigDict(frozen=True)

    schema_version: str = PACKAGE_SCHEMA_VERSION
    package_id: str
    package_hash: str
    status: str = "approved"
    submission_status: str = SUBMISSION_STATUS
    marketplace_action_authorized: bool = False
    agent_profile: dict[str, Any]
    work_policy: dict[str, Any]
    source: dict[str, Any]
    task: dict[str, Any]
    decision: dict[str, Any]
    actual_llm_inference_cost_usd: float | None
    actual_llm_cost_status: str
    estimated_task_execution_cost_usd: float
    estimated_other_cost_usd: float
    expected_margin_usd: float
    task_plan: list[dict[str, Any]]
    validation_criteria: list[dict[str, Any]]
    safety_constraints: dict[str, Any]
    approval: dict[str, Any]
    created_at: datetime


def _approval_required(
    profile: AgentProfile,
    policy: WorkPolicy,
    marketplace: str,
    estimated_cost: float,
) -> bool:
    rules = policy.human_approval
    return bool(
        profile.human_approval_always_required
        or rules.default_required
        or marketplace in rules.required_marketplaces
        or estimated_cost >= rules.cost_threshold_usd
    )


def _decision(
    bounty: Bounty,
    capabilities: MarketplaceCapabilities,
    profile: AgentProfile,
    policy: WorkPolicy,
    estimate: dict[str, Any] | None,
    approved_projected_cost_usd: float = 0.0,
) -> dict[str, Any]:
    task_text = f"{bounty.title}\n{bounty.description}\n{' '.join(bounty.tags)}".lower()
    prohibited = next(
        (
            label
            for pattern, label in _CONTROL_PLANE_PROHIBITED_PATTERNS
            if re.search(pattern, task_text)
        ),
        None,
    )
    if prohibited:
        return {
            "eligibility": Eligibility.REFUSE,
            "reason_codes": [f"PROHIBITED_{prohibited.upper()}"],
            "rationale": f"refused by Agent Profile prohibited action: {prohibited}",
        }
    verdict = screen(bounty)
    if not verdict.allowed:
        return {
            "eligibility": Eligibility.REFUSE,
            "reason_codes": [f"SAFETY_{verdict.kind.upper()}"],
            "rationale": verdict.reason,
        }
    if bounty.marketplace not in policy.allowed_marketplaces:
        return {
            "eligibility": Eligibility.SKIP,
            "reason_codes": ["MARKETPLACE_NOT_ALLOWED"],
            "rationale": f"{bounty.marketplace} is not allowed by the active work policy",
        }
    if bounty.category.value not in profile.supported_categories:
        return {
            "eligibility": Eligibility.SKIP,
            "reason_codes": ["CATEGORY_NOT_SUPPORTED"],
            "rationale": f"agent profile does not support {bounty.category.value}",
        }
    required_capabilities = (
        (bounty.raw or {}).get("required_capabilities", [])
        if bounty.marketplace == "execution_market"
        else []
    )
    if isinstance(required_capabilities, str):
        required_capabilities = [required_capabilities]
    missing_capabilities = sorted(set(required_capabilities) - set(profile.capabilities))
    if missing_capabilities:
        return {
            "eligibility": Eligibility.SKIP,
            "reason_codes": ["CAPABILITY_NOT_SUPPORTED"],
            "rationale": "agent profile lacks required capabilities: "
            + ", ".join(missing_capabilities),
        }
    required_rep = int((bounty.raw or {}).get("min_reputation") or 0)
    available_rep = int(profile.reputation_by_marketplace.get(bounty.marketplace, 0))
    if required_rep > available_rep:
        return {
            "eligibility": Eligibility.SKIP,
            "reason_codes": ["REPUTATION_INSUFFICIENT"],
            "rationale": f"required reputation {required_rep} exceeds configured {available_rep}",
        }
    if estimate is None:
        return {
            "eligibility": Eligibility.SKIP,
            "reason_codes": ["ESTIMATE_UNAVAILABLE"],
            "rationale": "task estimate unavailable",
        }

    payout = bounty.payout_usd
    confidence = float(estimate.get("confidence") or 0.0)
    p_success = float(estimate.get("p_success") or 0.0)
    effort = float(estimate.get("est_effort_hours") or 0.0)
    estimated_task_cost = float(
        estimate.get("estimated_task_execution_cost_usd")
        if estimate.get("estimated_task_execution_cost_usd") is not None
        else estimate.get("est_api_cost_usd") or 0.0
    )
    estimated_other = float(
        estimate.get("estimated_other_cost_usd")
        if estimate.get("estimated_other_cost_usd") is not None
        else estimate.get("est_gas_cost_usd") or 0.0
    )
    expected_margin = (
        (float(payout) * p_success) - estimated_task_cost - estimated_other
        if payout is not None
        else 0.0
    )
    if payout is None:
        reason = ("PAYOUT_UNKNOWN", "payout is not machine-readable")
    elif payout < policy.min_payout_usd:
        reason = (
            "PAYOUT_BELOW_POLICY",
            f"payout ${payout:.2f} is below policy minimum ${policy.min_payout_usd:.2f}",
        )
    elif confidence < policy.min_confidence:
        reason = (
            "CONFIDENCE_BELOW_POLICY",
            f"confidence {confidence:.2f} is below policy minimum {policy.min_confidence:.2f}",
        )
    elif effort * 60 > profile.max_execution_minutes:
        reason = (
            "TIME_EXCEEDS_PROFILE",
            f"estimated duration {effort * 60:.1f}m exceeds profile maximum "
            f"{profile.max_execution_minutes}m",
        )
    elif estimated_task_cost > profile.max_execution_cost_usd:
        reason = (
            "COST_EXCEEDS_PROFILE",
            f"projected execution cost ${estimated_task_cost:.4f} exceeds profile maximum "
            f"${profile.max_execution_cost_usd:.2f}",
        )
    elif expected_margin < policy.min_expected_margin_usd:
        reason = (
            "EXPECTED_MARGIN_BELOW_POLICY",
            f"projected expected margin ${expected_margin:.4f} is below policy minimum "
            f"${policy.min_expected_margin_usd:.2f}",
        )
    elif (
        approved_projected_cost_usd + estimated_task_cost
        > policy.max_approved_projected_daily_cost_usd
    ):
        reason = (
            "PROJECTED_DAILY_COST_EXCEEDED",
            f"approved projected cost ${approved_projected_cost_usd:.4f} plus "
            f"${estimated_task_cost:.4f} exceeds daily policy maximum "
            f"${policy.max_approved_projected_daily_cost_usd:.2f}",
        )
    else:
        reason = ("POLICY_PASSED", "opportunity passed safety, capability, and work policy")
    eligibility = Eligibility.ALLOW if reason[0] == "POLICY_PASSED" else Eligibility.SKIP
    return {
        "eligibility": eligibility,
        "reason_codes": [reason[0]],
        "rationale": reason[1],
        "confidence": confidence,
        "p_success": p_success,
        "effort": effort,
        "estimated_task_cost": estimated_task_cost,
        "estimated_other": estimated_other,
        "expected_margin": expected_margin,
    }


def _templates(category: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    common = [{"step": 1, "operation": "structure_task_specification"}]
    validators = [
        {"id": "structured_output_present", "type": "required_field"},
        {"id": "no_external_action", "type": "safety_invariant"},
    ]
    if category == Category.RESEARCH.value:
        return common + [
            {"step": 2, "operation": "produce_research_plan"},
            {"step": 3, "operation": "validate_local_plan"},
        ], validators
    if category == Category.SUMMARIZATION.value:
        return common + [
            {"step": 2, "operation": "produce_local_summary_outline"},
            {"step": 3, "operation": "validate_local_plan"},
        ], validators
    if category == Category.DATA_LOOKUP.value:
        return common + [
            {"step": 2, "operation": "produce_extraction_schema"},
            {"step": 3, "operation": "validate_local_plan"},
        ], validators
    return common + [
        {
            "step": 2,
            "operation": "produce_code_change_plan",
            "constraints": ["do_not_execute_code", "do_not_access_repository"],
        },
        {"step": 3, "operation": "validate_local_plan"},
    ], validators + [{"id": "test_strategy_present", "type": "required_field"}]
