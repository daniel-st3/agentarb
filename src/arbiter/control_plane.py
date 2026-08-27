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
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from arbiter.config import Settings, get_settings
from arbiter.executors.safety import screen
from arbiter.governance import (
    _CONTROL_PLANE_PROHIBITED_PATTERNS as _CONTROL_PLANE_PROHIBITED_PATTERNS,
)
from arbiter.governance import (
    ARTIFACT_SCHEMA_VERSION as ARTIFACT_SCHEMA_VERSION,
)
from arbiter.governance import (
    DEFAULT_TOOLS as DEFAULT_TOOLS,
)
from arbiter.governance import (
    EXTERNAL_EXECUTION_STATUS as EXTERNAL_EXECUTION_STATUS,
)
from arbiter.governance import (
    PACKAGE_SCHEMA_VERSION as PACKAGE_SCHEMA_VERSION,
)
from arbiter.governance import (
    PROHIBITED_ACTIONS as PROHIBITED_ACTIONS,
)
from arbiter.governance import (
    SUBMISSION_STATUS as SUBMISSION_STATUS,
)
from arbiter.governance import (
    AgentProfile as AgentProfile,
)
from arbiter.governance import (
    CandidateStatus as CandidateStatus,
)
from arbiter.governance import (
    Eligibility as Eligibility,
)
from arbiter.governance import (
    GovernedWorkPackage as GovernedWorkPackage,
)
from arbiter.governance import (
    HumanApprovalRules as HumanApprovalRules,
)
from arbiter.governance import (
    ReadOnlyConnector as ReadOnlyConnector,
)
from arbiter.governance import (
    WorkPolicy as WorkPolicy,
)
from arbiter.governance import (
    _approval_required as _approval_required,
)
from arbiter.governance import (
    _decision as _decision,
)
from arbiter.governance import (
    _templates as _templates,
)
from arbiter.llm import Estimator, get_estimator
from arbiter.models import Bounty, MarketplaceCapabilities, utcnow


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
    if cfg.hosted_mode:
        raise RuntimeError("Persistent control plane is unavailable in hosted sandbox mode")
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
        row = (
            session.query(AgentProfileRecord)
            .filter_by(active=True)
            .order_by(AgentProfileRecord.version.desc())
            .first()
        )
        assert row is not None
        return AgentProfile.model_validate(row.payload)


def active_policy(settings: Settings | None = None) -> WorkPolicy:
    with control_plane_session(settings) as session:
        _ensure_defaults(session)
        row = (
            session.query(WorkPolicyRecord)
            .filter_by(active=True)
            .order_by(WorkPolicyRecord.version.desc())
            .first()
        )
        assert row is not None
        return WorkPolicy.model_validate(row.payload)


def active_profile_metadata(settings: Settings | None = None) -> dict[str, Any]:
    """Return non-secret version metadata for the active immutable profile."""
    with control_plane_session(settings) as session:
        _ensure_defaults(session)
        row = (
            session.query(AgentProfileRecord)
            .filter_by(active=True)
            .order_by(AgentProfileRecord.version.desc())
            .first()
        )
        assert row is not None
        return {
            "id": row.profile_id,
            "version": row.version,
            "active": row.active,
            "created_at": row.created_at.isoformat(),
        }


def active_policy_metadata(settings: Settings | None = None) -> dict[str, Any]:
    """Return non-secret version metadata for the active immutable policy."""
    with control_plane_session(settings) as session:
        _ensure_defaults(session)
        row = (
            session.query(WorkPolicyRecord)
            .filter_by(active=True)
            .order_by(WorkPolicyRecord.version.desc())
            .first()
        )
        assert row is not None
        return {
            "id": row.policy_id,
            "version": row.version,
            "active": row.active,
            "created_at": row.created_at.isoformat(),
        }


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
        row = (
            session.query(AgentProfileRecord)
            .filter_by(profile_id=profile_id, version=version)
            .first()
        )
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
            for row in session.query(GovernedWorkPackageRecord)
            .filter(GovernedWorkPackageRecord.created_at >= day_start)
            .all()
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
        decisions = (
            session.query(OpportunityDecisionRecord)
            .order_by(OpportunityDecisionRecord.created_at.desc())
            .all()
        )
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
        decision = (
            session.query(OpportunityDecisionRecord)
            .filter_by(opportunity_id=opportunity_id)
            .order_by(OpportunityDecisionRecord.created_at.desc())
            .first()
        )
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
    profile = _profile_version(opportunity["profile"]["id"], opportunity["profile"]["version"], cfg)
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
        "estimated_task_execution_cost_usd": opportunity["estimated_task_execution_cost_usd"],
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
        decision = (
            session.query(OpportunityDecisionRecord)
            .filter_by(opportunity_id=opportunity_id)
            .order_by(OpportunityDecisionRecord.created_at.desc())
            .first()
        )
        assert decision is not None
        existing = (
            session.query(WorkPackageCandidateRecord).filter_by(decision_id=decision.id).first()
        )
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


def reject_candidate(candidate_id: str, reason: str, settings: Settings | None = None) -> None:
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
        rows = (
            session.query(WorkPackageCandidateRecord)
            .order_by(WorkPackageCandidateRecord.created_at.desc())
            .all()
        )
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
        rows = (
            session.query(GovernedWorkPackageRecord)
            .order_by(GovernedWorkPackageRecord.created_at.desc())
            .all()
        )
        return [GovernedWorkPackage.model_validate(row.payload) for row in rows]


def get_package(package_id: str, settings: Settings | None = None) -> GovernedWorkPackage | None:
    with control_plane_session(settings) as session:
        row = session.get(GovernedWorkPackageRecord, package_id)
        return GovernedWorkPackage.model_validate(row.payload) if row else None
