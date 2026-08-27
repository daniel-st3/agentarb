"""Governed, discovery-only control plane for agent labor opportunities.

This module intentionally has no lifecycle, ledger, settlement, or calibration
imports.  Its terminal object is an immutable, approved work package whose
marketplace action flag is always false.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from arbiter.config import Settings, get_settings
from arbiter.executors.safety import screen
from arbiter.llm import Estimator, get_estimator
from arbiter.models import Bounty, Category, MarketplaceCapabilities, utcnow

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


class ControlPlaneBase(DeclarativeBase):
    pass


class AgentProfileRecord(ControlPlaneBase):
    __tablename__ = "agent_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profile_id: Mapped[str] = mapped_column(String(80), index=True)
    version: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkPolicyRecord(ControlPlaneBase):
    __tablename__ = "work_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[str] = mapped_column(String(80), index=True)
    version: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OpportunitySnapshotRecord(ControlPlaneBase):
    __tablename__ = "opportunity_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    opportunity_id: Mapped[str] = mapped_column(String(340), index=True)
    discovery_run_id: Mapped[str] = mapped_column(String(32), index=True)
    marketplace: Mapped[str] = mapped_column(String(80), index=True)
    source_type: Mapped[str] = mapped_column(String(32), index=True)
    bounty_id: Mapped[str] = mapped_column(String(255))
    normalized_task: Mapped[dict[str, Any]] = mapped_column(JSON)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSON)
    source_checksum: Mapped[str] = mapped_column(String(80))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OpportunityDecisionRecord(ControlPlaneBase):
    __tablename__ = "opportunity_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(Integer, index=True)
    opportunity_id: Mapped[str] = mapped_column(String(340), index=True)
    marketplace: Mapped[str] = mapped_column(String(80), index=True)
    profile_id: Mapped[str] = mapped_column(String(80))
    profile_version: Mapped[int] = mapped_column(Integer)
    policy_id: Mapped[str] = mapped_column(String(80))
    policy_version: Mapped[int] = mapped_column(Integer)
    package_eligibility: Mapped[str] = mapped_column(String(20), index=True)
    external_execution_status: Mapped[str] = mapped_column(String(32))
    reason_codes: Mapped[list[str]] = mapped_column(JSON)
    rationale: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    p_success: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_effort_hours: Mapped[float] = mapped_column(Float, default=0.0)
    actual_llm_inference_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_llm_cost_status: Mapped[str] = mapped_column(String(40), default="no_llm_call")
    estimated_task_execution_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_other_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    expected_margin_usd: Mapped[float] = mapped_column(Float, default=0.0)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=True)
    estimator_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkPackageCandidateRecord(ControlPlaneBase):
    __tablename__ = "work_package_candidates"

    candidate_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    decision_id: Mapped[int] = mapped_column(Integer, index=True)
    status: Mapped[str] = mapped_column(
        String(24), default=CandidateStatus.PENDING.value, index=True
    )
    draft_payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GovernedWorkPackageRecord(ControlPlaneBase):
    __tablename__ = "governed_work_packages"

    package_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    candidate_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    package_hash: Mapped[str] = mapped_column(String(80), unique=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


_engines: dict[str, Any] = {}


def get_control_plane_engine(settings: Settings | None = None):
    cfg = settings or get_settings()
    url = cfg.control_plane_db_url
    if url not in _engines:
        _engines[url] = create_engine(
            url, connect_args={"check_same_thread": False, "timeout": 30.0}
        )
    return _engines[url]


def reset_control_plane_engines() -> None:
    for engine in _engines.values():
        engine.dispose()
    _engines.clear()


def init_control_plane_db(settings: Settings | None = None) -> None:
    ControlPlaneBase.metadata.create_all(get_control_plane_engine(settings))
    with control_plane_session(settings) as session:
        _ensure_defaults(session)


@contextmanager
def control_plane_session(settings: Settings | None = None) -> Iterator[Session]:
    engine = get_control_plane_engine(settings)
    ControlPlaneBase.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
        session.commit()


def _ensure_defaults(session: Session) -> None:
    if session.query(AgentProfileRecord).filter_by(active=True).first() is None:
        profile = AgentProfile()
        session.add(
            AgentProfileRecord(
                profile_id=profile.profile_id,
                version=profile.version,
                payload=profile.model_dump(mode="json"),
                active=True,
            )
        )
    if session.query(WorkPolicyRecord).filter_by(active=True).first() is None:
        policy = WorkPolicy()
        session.add(
            WorkPolicyRecord(
                policy_id=policy.policy_id,
                version=policy.version,
                payload=policy.model_dump(mode="json"),
                active=True,
            )
        )


def active_profile(settings: Settings | None = None) -> AgentProfile:
    with control_plane_session(settings) as session:
        _ensure_defaults(session)
        row = session.query(AgentProfileRecord).filter_by(active=True).order_by(
            AgentProfileRecord.version.desc()
        ).first()
        assert row is not None
        return AgentProfile.model_validate(row.payload)


def active_policy(settings: Settings | None = None) -> WorkPolicy:
    with control_plane_session(settings) as session:
        _ensure_defaults(session)
        row = session.query(WorkPolicyRecord).filter_by(active=True).order_by(
            WorkPolicyRecord.version.desc()
        ).first()
        assert row is not None
        return WorkPolicy.model_validate(row.payload)


def save_profile(profile: AgentProfile, settings: Settings | None = None) -> AgentProfile:
    with control_plane_session(settings) as session:
        rows = session.query(AgentProfileRecord).filter_by(profile_id=profile.profile_id).all()
        version = max((row.version for row in rows), default=0) + 1
        for row in rows:
            row.active = False
        saved = profile.model_copy(update={"version": version})
        session.add(
            AgentProfileRecord(
                profile_id=saved.profile_id,
                version=version,
                payload=saved.model_dump(mode="json"),
                active=True,
            )
        )
        return saved


def save_policy(policy: WorkPolicy, settings: Settings | None = None) -> WorkPolicy:
    with control_plane_session(settings) as session:
        rows = session.query(WorkPolicyRecord).filter_by(policy_id=policy.policy_id).all()
        version = max((row.version for row in rows), default=0) + 1
        for row in rows:
            row.active = False
        saved = policy.model_copy(update={"version": version})
        session.add(
            WorkPolicyRecord(
                policy_id=saved.policy_id,
                version=version,
                payload=saved.model_dump(mode="json"),
                active=True,
            )
        )
        return saved


def _profile_version(
    profile_id: str, version: int, settings: Settings | None = None
) -> AgentProfile:
    with control_plane_session(settings) as session:
        row = session.query(AgentProfileRecord).filter_by(
            profile_id=profile_id, version=version
        ).first()
        if row is None:
            raise KeyError((profile_id, version))
        return AgentProfile.model_validate(row.payload)


def _canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_hash(payload: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json(payload).encode()).hexdigest()


def _source_metadata(bounty: Bounty, capabilities: MarketplaceCapabilities) -> dict[str, Any]:
    raw = bounty.raw or {}
    return {
        "marketplace": bounty.marketplace,
        "task_id": bounty.bounty_id,
        "url": bounty.url,
        "claim_model": capabilities.claim_model.value,
        "settlement": capabilities.settlement.value,
        "has_human_accept_gate": capabilities.has_human_accept_gate,
        "required_reputation": raw.get("min_reputation"),
        "required_capabilities": raw.get("required_capabilities", bounty.tags),
        "execution_mode": raw.get("executionMode"),
        "payment_network": raw.get("payment_network"),
        "settlement_constraints": capabilities.notes,
    }


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


def _actual_cost(estimate: dict[str, Any] | None) -> tuple[float | None, str]:
    if not estimate:
        return 0.0, "no_llm_call"
    if estimate.get("actual_llm_cost_status"):
        return estimate.get("actual_llm_inference_cost_usd"), str(
            estimate["actual_llm_cost_status"]
        )
    if estimate.get("model_used") in {None, "heuristic-v1"} or estimate.get("fallback"):
        return 0.0, "no_llm_call"
    return None, "usage_or_pricing_unavailable"


async def refresh_opportunities(
    connectors: Iterable[ReadOnlyConnector],
    *,
    limit: int = 10,
    settings: Settings | None = None,
    estimator: Estimator | None = None,
) -> list[OpportunityDecisionRecord]:
    """Run read-only discovery and persist governed decisions."""
    cfg = settings or get_settings()
    profile = active_profile(cfg)
    policy = active_policy(cfg)
    chosen_estimator = estimator or get_estimator(cfg)
    run_id = uuid.uuid4().hex[:12]
    output: list[OpportunityDecisionRecord] = []

    with control_plane_session(cfg) as session:
        day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
        approved_projected_cost = sum(
            float(row.payload.get("estimated_task_execution_cost_usd") or 0.0)
            for row in session.query(GovernedWorkPackageRecord).filter(
                GovernedWorkPackageRecord.created_at >= day_start
            ).all()
        )
        for connector in connectors:
            listed = await connector.list_open(limit=limit)
            for summary in listed[:limit]:
                bounty = await connector.get(summary.bounty_id) or summary
                normalized = bounty.model_dump(mode="json")
                metadata = _source_metadata(bounty, connector.capabilities)
                snapshot = OpportunitySnapshotRecord(
                    opportunity_id=bounty.key,
                    discovery_run_id=run_id,
                    marketplace=bounty.marketplace,
                    source_type=(
                        "controlled_mock" if bounty.marketplace == "mock" else "live_discovery"
                    ),
                    bounty_id=bounty.bounty_id,
                    normalized_task=normalized,
                    source_metadata=metadata,
                    source_checksum=canonical_hash(normalized),
                )
                session.add(snapshot)
                session.flush()

                task_text = f"{bounty.title}\n{bounty.description}\n{' '.join(bounty.tags)}".lower()
                prohibited = any(
                    re.search(pattern, task_text)
                    for pattern, _ in _CONTROL_PLANE_PROHIBITED_PATTERNS
                )
                verdict = screen(bounty)
                should_estimate = (
                    not prohibited
                    and verdict.allowed
                    and bounty.marketplace in policy.allowed_marketplaces
                    and bounty.category.value in profile.supported_categories
                )
                estimate = await chosen_estimator.estimate(bounty) if should_estimate else None
                evaluated = _decision(
                    bounty,
                    connector.capabilities,
                    profile,
                    policy,
                    estimate,
                    approved_projected_cost,
                )
                actual_cost, cost_status = _actual_cost(estimate)
                estimated_task_cost = float(evaluated.get("estimated_task_cost") or 0.0)
                row = OpportunityDecisionRecord(
                    snapshot_id=snapshot.id,
                    opportunity_id=bounty.key,
                    marketplace=bounty.marketplace,
                    profile_id=profile.profile_id,
                    profile_version=profile.version,
                    policy_id=policy.policy_id,
                    policy_version=policy.version,
                    package_eligibility=evaluated["eligibility"].value,
                    external_execution_status=EXTERNAL_EXECUTION_STATUS,
                    reason_codes=evaluated["reason_codes"],
                    rationale=evaluated["rationale"],
                    confidence=float(evaluated.get("confidence") or 0.0),
                    p_success=float(evaluated.get("p_success") or 0.0),
                    estimated_effort_hours=float(evaluated.get("effort") or 0.0),
                    actual_llm_inference_cost_usd=actual_cost,
                    actual_llm_cost_status=cost_status,
                    estimated_task_execution_cost_usd=estimated_task_cost,
                    estimated_other_cost_usd=float(evaluated.get("estimated_other") or 0.0),
                    expected_margin_usd=float(evaluated.get("expected_margin") or 0.0),
                    approval_required=_approval_required(
                        profile, policy, bounty.marketplace, estimated_task_cost
                    ),
                    estimator_metadata=dict(estimate or {}),
                )
                session.add(row)
                session.flush()
                output.append(row)
    return output


def list_opportunities(settings: Settings | None = None) -> list[dict[str, Any]]:
    with control_plane_session(settings) as session:
        decisions = session.query(OpportunityDecisionRecord).order_by(
            OpportunityDecisionRecord.created_at.desc()
        ).all()
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        for decision in decisions:
            if decision.opportunity_id in seen:
                continue
            seen.add(decision.opportunity_id)
            snapshot = session.get(OpportunitySnapshotRecord, decision.snapshot_id)
            if snapshot:
                result.append(_opportunity_payload(snapshot, decision))
        return result


def get_opportunity(opportunity_id: str, settings: Settings | None = None) -> dict[str, Any] | None:
    with control_plane_session(settings) as session:
        decision = session.query(OpportunityDecisionRecord).filter_by(
            opportunity_id=opportunity_id
        ).order_by(OpportunityDecisionRecord.created_at.desc()).first()
        if not decision:
            return None
        snapshot = session.get(OpportunitySnapshotRecord, decision.snapshot_id)
        return _opportunity_payload(snapshot, decision) if snapshot else None


def _opportunity_payload(
    snapshot: OpportunitySnapshotRecord, decision: OpportunityDecisionRecord
) -> dict[str, Any]:
    task = snapshot.normalized_task
    return {
        "opportunity_id": decision.opportunity_id,
        "marketplace": decision.marketplace,
        "source_type": snapshot.source_type,
        "observed_at": snapshot.observed_at.isoformat(),
        "task": task,
        "source_metadata": snapshot.source_metadata,
        "package_eligibility": decision.package_eligibility,
        "external_execution_status": decision.external_execution_status,
        "reason_codes": decision.reason_codes,
        "explanation": decision.rationale,
        "confidence": decision.confidence,
        "p_success": decision.p_success,
        "actual_llm_inference_cost_usd": decision.actual_llm_inference_cost_usd,
        "actual_llm_cost_status": decision.actual_llm_cost_status,
        "estimated_task_execution_cost_usd": decision.estimated_task_execution_cost_usd,
        "estimated_other_cost_usd": decision.estimated_other_cost_usd,
        "expected_margin_usd": decision.expected_margin_usd,
        "approval_required": decision.approval_required,
        "profile": {"id": decision.profile_id, "version": decision.profile_version},
        "policy": {"id": decision.policy_id, "version": decision.policy_version},
    }


def _templates(category: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    common = [{"step": 1, "operation": "structure_task_specification"}]
    validators = [
        {"id": "structured_output_present", "type": "required_field"},
        {"id": "no_external_action", "type": "safety_invariant"},
    ]
    if category == Category.RESEARCH.value:
        return common + [{"step": 2, "operation": "produce_research_plan"},
                         {"step": 3, "operation": "validate_local_plan"}], validators
    if category == Category.SUMMARIZATION.value:
        return common + [{"step": 2, "operation": "produce_local_summary_outline"},
                         {"step": 3, "operation": "validate_local_plan"}], validators
    if category == Category.DATA_LOOKUP.value:
        return common + [{"step": 2, "operation": "produce_extraction_schema"},
                         {"step": 3, "operation": "validate_local_plan"}], validators
    return common + [
        {
            "step": 2,
            "operation": "produce_code_change_plan",
            "constraints": ["do_not_execute_code", "do_not_access_repository"],
        },
        {"step": 3, "operation": "validate_local_plan"},
    ], validators + [{"id": "test_strategy_present", "type": "required_field"}]


def create_candidate(
    opportunity_id: str, settings: Settings | None = None
) -> WorkPackageCandidateRecord:
    cfg = settings or get_settings()
    opportunity = get_opportunity(opportunity_id, cfg)
    if not opportunity or opportunity["package_eligibility"] != Eligibility.ALLOW.value:
        raise ValueError("only allowed opportunities can become package candidates")
    category = opportunity["task"]["category"]
    if isinstance(category, dict):
        category = category.get("value", "unknown")
    plan, criteria = _templates(str(category))
    profile = _profile_version(
        opportunity["profile"]["id"], opportunity["profile"]["version"], cfg
    )
    draft = {
        "agent_profile": {
            **opportunity["profile"],
            "name": profile.name,
            "supported_categories": profile.supported_categories,
        },
        "work_policy": opportunity["policy"],
        "source": {**opportunity["source_metadata"], "observed_at": opportunity["observed_at"]},
        "task": opportunity["task"],
        "decision": {
            "package_eligibility": opportunity["package_eligibility"],
            "external_execution_status": opportunity["external_execution_status"],
            "confidence": opportunity["confidence"],
            "p_success": opportunity["p_success"],
            "approval_required": opportunity["approval_required"],
            "reason_codes": opportunity["reason_codes"],
            "rationale": opportunity["explanation"],
        },
        "actual_llm_inference_cost_usd": opportunity["actual_llm_inference_cost_usd"],
        "actual_llm_cost_status": opportunity["actual_llm_cost_status"],
        "estimated_task_execution_cost_usd": opportunity[
            "estimated_task_execution_cost_usd"
        ],
        "estimated_other_cost_usd": opportunity["estimated_other_cost_usd"],
        "expected_margin_usd": opportunity["expected_margin_usd"],
        "task_plan": plan,
        "validation_criteria": criteria,
        "safety_constraints": {
            "allowed_tools": profile.allowed_tools,
            "prohibited_actions": profile.prohibited_actions,
            "network_scope": "localhost_package_api_only",
        },
    }
    with control_plane_session(cfg) as session:
        decision = session.query(OpportunityDecisionRecord).filter_by(
            opportunity_id=opportunity_id
        ).order_by(OpportunityDecisionRecord.created_at.desc()).first()
        assert decision is not None
        existing = session.query(WorkPackageCandidateRecord).filter_by(
            decision_id=decision.id
        ).first()
        if existing:
            return existing
        candidate = WorkPackageCandidateRecord(
            candidate_id="wpc_" + uuid.uuid4().hex[:16],
            decision_id=decision.id,
            draft_payload=draft,
        )
        session.add(candidate)
        session.flush()
        return candidate


def reject_candidate(
    candidate_id: str, reason: str, settings: Settings | None = None
) -> None:
    with control_plane_session(settings) as session:
        candidate = session.get(WorkPackageCandidateRecord, candidate_id)
        if not candidate or candidate.status != CandidateStatus.PENDING.value:
            raise KeyError(candidate_id)
        candidate.status = CandidateStatus.REJECTED.value
        candidate.rejection_reason = reason
        candidate.decided_at = utcnow()


def approve_candidate(
    candidate_id: str,
    *,
    approved_by: str = "local-operator",
    settings: Settings | None = None,
) -> GovernedWorkPackage:
    with control_plane_session(settings) as session:
        candidate = session.get(WorkPackageCandidateRecord, candidate_id)
        if not candidate or candidate.status != CandidateStatus.PENDING.value:
            raise KeyError(candidate_id)
        package_id = "wp_" + uuid.uuid4().hex[:16]
        now = datetime.now(UTC)
        unhashed = {
            "schema_version": PACKAGE_SCHEMA_VERSION,
            "package_id": package_id,
            "status": "approved",
            "submission_status": SUBMISSION_STATUS,
            "marketplace_action_authorized": False,
            **candidate.draft_payload,
            "approval": {"approved_by": approved_by, "approved_at": now.isoformat()},
            "created_at": now.isoformat(),
        }
        # Hash the normalized wire representation so the worker sees and hashes
        # exactly the same JSON types and timestamp format as the API emits.
        normalized = GovernedWorkPackage.model_validate(
            {**unhashed, "package_hash": "pending"}
        ).model_dump(mode="json")
        normalized.pop("package_hash")
        package_hash = canonical_hash(normalized)
        payload = {**normalized, "package_hash": package_hash}
        package = GovernedWorkPackage.model_validate(payload)
        session.add(
            GovernedWorkPackageRecord(
                package_id=package_id,
                candidate_id=candidate_id,
                package_hash=package_hash,
                payload=package.model_dump(mode="json"),
                created_at=now,
            )
        )
        candidate.status = CandidateStatus.MATERIALIZED.value
        candidate.decided_at = now
        return package


def list_candidates(settings: Settings | None = None) -> list[dict[str, Any]]:
    with control_plane_session(settings) as session:
        rows = session.query(WorkPackageCandidateRecord).order_by(
            WorkPackageCandidateRecord.created_at.desc()
        ).all()
        return [
            {
                "candidate_id": row.candidate_id,
                "decision_id": row.decision_id,
                "status": row.status,
                "draft_payload": row.draft_payload,
                "rejection_reason": row.rejection_reason,
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]


def list_packages(settings: Settings | None = None) -> list[GovernedWorkPackage]:
    with control_plane_session(settings) as session:
        rows = session.query(GovernedWorkPackageRecord).order_by(
            GovernedWorkPackageRecord.created_at.desc()
        ).all()
        return [GovernedWorkPackage.model_validate(row.payload) for row in rows]


def get_package(
    package_id: str, settings: Settings | None = None
) -> GovernedWorkPackage | None:
    with control_plane_session(settings) as session:
        row = session.get(GovernedWorkPackageRecord, package_id)
        return GovernedWorkPackage.model_validate(row.payload) if row else None
