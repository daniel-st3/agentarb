"""Read-only, offline evaluation of discovered marketplace tasks.

This module is deliberately outside the lifecycle graph. It has no imports
from the orchestrator, risk guard, calibration, ledger, or outcome modules.
Evaluation evidence lives in its own SQLite database and every record is
labelled ``offline_evaluation`` / ``not_submitted``.
"""

from __future__ import annotations

import csv
import json
import re
import time
import uuid
from collections.abc import Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from arbiter.config import Settings, get_settings
from arbiter.executors import CategoryRouter
from arbiter.executors.safety import SafetyVerdict, screen
from arbiter.llm import Estimator, get_estimator
from arbiter.models import Bounty, DeliverableState, MarketplaceCapabilities, utcnow

EVALUATION_TYPE = "offline_evaluation"
SUBMISSION_STATUS = "not_submitted"
REVIEW_RECOMMENDATIONS = ("reject", "revise", "acceptable", "excellent")
_FORBIDDEN_METHODS = {
    "bid", "claim", "accept", "submit", "cancel", "settle", "settlement_status",
    "sign", "pay", "deposit", "release", "refund", "reclaim",
}
_URL_RE = re.compile(r"https?://[^\s)\]<>\"']+")


class EvaluationSafetyError(RuntimeError):
    """Evaluation attempted to reach a marketplace write/payment surface."""


class ReadOnlyConnector(Protocol):
    """The only connector surface available to evaluation code."""

    name: str
    capabilities: MarketplaceCapabilities

    async def list_open(self, limit: int = 50) -> list[Bounty]: ...
    async def get(self, bounty_id: str) -> Bounty | None: ...
    async def aclose(self) -> None: ...


class DiscoveryOnlyConnector:
    """Capability-reducing façade around a marketplace connector.

    The wrapped object is held in a private slot and only list/get/close are
    exposed. Attempts to access any known write, signing, or payment method
    fail closed with a dedicated safety error.
    """

    __slots__ = ("__connector",)

    def __init__(self, connector: Any) -> None:
        self.__connector = connector

    @property
    def name(self) -> str:
        return self.__connector.name

    @property
    def capabilities(self) -> MarketplaceCapabilities:
        return self.__connector.capabilities

    async def list_open(self, limit: int = 50) -> list[Bounty]:
        return await self.__connector.list_open(limit=limit)

    async def get(self, bounty_id: str) -> Bounty | None:
        return await self.__connector.get(bounty_id)

    async def aclose(self) -> None:
        await self.__connector.aclose()

    def __getattr__(self, name: str) -> Any:
        if name.lower() in _FORBIDDEN_METHODS:
            raise EvaluationSafetyError(
                f"'{name}' is forbidden in offline evaluation mode; discovery only"
            )
        raise AttributeError(name)


class EvaluationBase(DeclarativeBase):
    pass


class EvaluationRecord(EvaluationBase):
    """One local quality evaluation. Never a marketplace task or outcome."""

    __tablename__ = "offline_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    evaluation_run_id: Mapped[str] = mapped_column(String(32), index=True)
    evaluation_type: Mapped[str] = mapped_column(String(32), default=EVALUATION_TYPE)
    submission_status: Mapped[str] = mapped_column(String(32), default=SUBMISSION_STATUS)

    marketplace: Mapped[str] = mapped_column(String(80), index=True)
    task_identifier: Mapped[str] = mapped_column(String(255), index=True)
    bounty_key: Mapped[str] = mapped_column(String(340), index=True)
    title: Mapped[str] = mapped_column(Text, default="")
    task_description: Mapped[str] = mapped_column(Text, default="")
    task_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    task_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(80), index=True)

    execution_capability_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    capability_reason: Mapped[str] = mapped_column(Text, default="")
    safety_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    safety_kind: Mapped[str] = mapped_column(String(80), default="")
    safety_reason: Mapped[str] = mapped_column(Text, default="")
    skip_or_refusal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    handler: Mapped[str | None] = mapped_column(String(80), nullable=True)
    deliverable: Mapped[str] = mapped_column(Text, default="")
    deliverable_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    deliverable_state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    validation_passed: Mapped[bool] = mapped_column(Boolean, default=False)
    validation_notes: Mapped[str] = mapped_column(Text, default="")
    grounding_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    estimated_api_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    estimation_latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    generation_latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    total_latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    provider: Mapped[str] = mapped_column(String(80), default="not_run", index=True)
    model: Mapped[str] = mapped_column(String(160), default="not_run")
    fallback_used: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    estimator_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    human_review_status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    task_fit_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    correctness_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grounding_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completeness_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    safety_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quality_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    human_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    review_notes: Mapped[str] = mapped_column(Text, default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    def as_dict(self) -> dict[str, Any]:
        return {column.name: getattr(self, column.name) for column in self.__table__.columns}


_engine = None


def get_evaluation_engine(settings: Settings | None = None):
    global _engine
    if _engine is None:
        cfg = settings or get_settings()
        _engine = create_engine(
            cfg.evaluation_db_url,
            connect_args={"check_same_thread": False, "timeout": 30.0},
        )
    return _engine


def reset_evaluation_engine() -> None:
    """Drop the cached engine binding. Primarily useful for isolated tests."""
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


def init_evaluation_db(settings: Settings | None = None) -> None:
    EvaluationBase.metadata.create_all(get_evaluation_engine(settings))


@contextmanager
def evaluation_session(settings: Settings | None = None) -> Iterator[Session]:
    init_evaluation_db(settings)
    with Session(get_evaluation_engine(settings), expire_on_commit=False) as session:
        yield session
        session.commit()


@dataclass(frozen=True)
class EvaluationRun:
    run_id: str
    records: list[EvaluationRecord]


def _capability_decision(
    connector: ReadOnlyConnector, bounty: Bounty
) -> tuple[bool, str]:
    capabilities = connector.capabilities
    allowed = capabilities.supports_open_claim and capabilities.supports_autonomous_settle
    reason = capabilities.notes or (
        "connector declares autonomous execution support"
        if allowed else "connector is discovery-only"
    )
    if connector.name == "opentask":
        reason = (
            f"executionMode={bounty.raw.get('executionMode')!r}; pitch/bid and buyer "
            "review required; connector is discovery-only"
        )
    elif connector.name == "execution_market":
        reason = (
            f"network={bounty.raw.get('payment_network', 'unknown')}; "
            f"min_reputation={bounty.raw.get('min_reputation', 0)}; mainnet signing "
            "and escrow are disabled; connector is discovery-only"
        )
    return allowed, reason


def _grounding_metadata(bounty: Bounty, deliverable: str, handler: str | None) -> dict[str, Any]:
    source_text = f"{bounty.title}\n{bounty.description}"
    input_urls = sorted(set(_URL_RE.findall(source_text)))
    output_urls = sorted(set(_URL_RE.findall(deliverable)))
    metadata: dict[str, Any] = {
        "category": bounty.category.value,
        "handler": handler,
        "input_source_urls": input_urls,
        "output_source_urls": output_urls,
        "output_urls_grounded_in_input": all(url in input_urls for url in output_urls),
        "source_metadata_status": "captured" if deliverable else "no_deliverable",
    }
    if handler == "research":
        metadata["research_source_requirement"] = "URL required for validation"
    elif handler == "summarization":
        metadata["summarization_grounding_rule"] = "output URLs must exist in task text"
    elif handler == "data_lookup":
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", deliverable, re.DOTALL)
        candidate = fenced.group(1) if fenced else deliverable
        try:
            payload = json.loads(candidate)
        except (TypeError, ValueError):
            payload = {}
        metadata["declared_sources"] = (
            payload.get("sources", []) if isinstance(payload, dict) else []
        )
        metadata["retrieved_at"] = (
            payload.get("retrieved_at") if isinstance(payload, dict) else None
        )
    elif handler == "small_code":
        metadata["code_grounding_rule"] = "task text only; code is never executed"
        metadata["validation_section_present"] = "validation" in deliverable.lower()
    return metadata


async def _evaluate_one(
    connector: ReadOnlyConnector,
    bounty: Bounty,
    run_id: str,
    settings: Settings,
    estimator: Estimator,
    router: CategoryRouter,
) -> EvaluationRecord:
    started = time.perf_counter()
    capability_allowed, capability_reason = _capability_decision(connector, bounty)
    verdict: SafetyVerdict = screen(bounty)

    record = EvaluationRecord(
        evaluation_run_id=run_id,
        evaluation_type=EVALUATION_TYPE,
        submission_status=SUBMISSION_STATUS,
        marketplace=bounty.marketplace,
        task_identifier=bounty.bounty_id,
        bounty_key=bounty.key,
        title=bounty.title,
        task_description=bounty.description,
        task_snapshot=bounty.model_dump(mode="json"),
        task_url=bounty.url,
        category=bounty.category.value,
        execution_capability_allowed=capability_allowed,
        capability_reason=capability_reason,
        safety_allowed=verdict.allowed,
        safety_kind=verdict.kind,
        safety_reason=verdict.reason,
        human_review_status="pending",
    )

    if not verdict.allowed:
        record.skip_or_refusal_reason = verdict.reason
        record.total_latency_ms = round((time.perf_counter() - started) * 1000, 3)
        return record

    estimate_started = time.perf_counter()
    estimate = await estimator.estimate(bounty)
    record.estimation_latency_ms = round((time.perf_counter() - estimate_started) * 1000, 3)
    record.estimated_api_cost_usd = float(estimate.get("est_api_cost_usd") or 0.0)
    record.estimator_metadata = dict(estimate)

    estimator_name = getattr(estimator, "name", "unknown")
    record.fallback_used = estimator_name == "heuristic" or bool(estimate.get("fallback"))
    record.provider = "deterministic_fallback" if record.fallback_used else estimator_name
    record.model = str(
        estimate.get("model_used")
        or ("heuristic-v1" if record.fallback_used else settings.groq_model)
    )

    generation_started = time.perf_counter()
    result = await router.execute(bounty, accepts_submission=False)
    record.generation_latency_ms = round((time.perf_counter() - generation_started) * 1000, 3)
    record.handler = result.handler
    record.deliverable = result.output
    record.deliverable_generated = bool(result.output) and not result.stubbed
    record.deliverable_state = result.deliverable_state.value
    record.validation_passed = result.deliverable_state in {
        DeliverableState.VALIDATED,
        DeliverableState.SUBMISSION_READY,
    }
    record.validation_notes = result.validation_notes
    record.skip_or_refusal_reason = result.error
    record.grounding_metadata = _grounding_metadata(bounty, result.output, result.handler)
    if result.stubbed:
        record.fallback_used = True
        record.provider = "deterministic_fallback"
        record.model = "deterministic-stub-v1"
    record.total_latency_ms = round((time.perf_counter() - started) * 1000, 3)
    return record


async def run_offline_evaluation(
    connectors: Iterable[ReadOnlyConnector],
    *,
    limit: int = 10,
    settings: Settings | None = None,
    estimator: Estimator | None = None,
    router: CategoryRouter | None = None,
    persist: bool = True,
) -> EvaluationRun:
    """Discover, screen, and locally evaluate tasks without lifecycle actions."""
    cfg = settings or get_settings()
    chosen_estimator = estimator or get_estimator()
    chosen_router = router or CategoryRouter()
    run_id = uuid.uuid4().hex[:12]
    records: list[EvaluationRecord] = []

    for connector in connectors:
        listed = await connector.list_open(limit=limit)
        for listed_bounty in listed[:limit]:
            detailed = await connector.get(listed_bounty.bounty_id)
            bounty = detailed or listed_bounty
            record = await _evaluate_one(
                connector, bounty, run_id, cfg, chosen_estimator, chosen_router
            )
            records.append(record)

    if persist and records:
        with evaluation_session(cfg) as session:
            session.add_all(records)
            session.flush()
    return EvaluationRun(run_id=run_id, records=records)


def list_evaluations(settings: Settings | None = None) -> list[EvaluationRecord]:
    from sqlalchemy import select

    with evaluation_session(settings) as session:
        return list(
            session.scalars(select(EvaluationRecord).order_by(EvaluationRecord.created_at.desc()))
        )


def get_evaluation(evaluation_id: int, settings: Settings | None = None) -> EvaluationRecord | None:
    with evaluation_session(settings) as session:
        return session.get(EvaluationRecord, evaluation_id)


def grade_evaluation(
    evaluation_id: int,
    *,
    task_fit: int,
    correctness: int,
    grounding: int,
    completeness: int,
    safety: int,
    quality: int,
    recommendation: str,
    notes: str = "",
    settings: Settings | None = None,
) -> EvaluationRecord:
    grades = (task_fit, correctness, grounding, completeness, safety, quality)
    if any(grade < 1 or grade > 5 for grade in grades):
        raise ValueError("all human grades must be between 1 and 5")
    if recommendation not in REVIEW_RECOMMENDATIONS:
        raise ValueError(f"recommendation must be one of {REVIEW_RECOMMENDATIONS}")

    with evaluation_session(settings) as session:
        record = session.get(EvaluationRecord, evaluation_id)
        if record is None:
            raise KeyError(evaluation_id)
        record.task_fit_grade = task_fit
        record.correctness_grade = correctness
        record.grounding_grade = grounding
        record.completeness_grade = completeness
        record.safety_grade = safety
        record.quality_grade = quality
        record.human_quality_score = round(sum(grades) / len(grades), 3)
        record.recommendation = recommendation
        record.review_notes = notes
        record.human_review_status = "reviewed"
        record.reviewed_at = utcnow()
        session.add(record)
        session.flush()
        return record


def export_evaluations_csv(
    output: Path,
    settings: Settings | None = None,
) -> int:
    records = list_evaluations(settings)
    output.parent.mkdir(parents=True, exist_ok=True)
    columns = [column.name for column in EvaluationRecord.__table__.columns]
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for record in records:
            writer.writerow(record.as_dict())
    return len(records)


def evaluation_metrics(settings: Settings | None = None) -> dict[str, float | int]:
    rows = list_evaluations(settings)
    reviewed = [row for row in rows if row.human_review_status == "reviewed"]
    quality = [row.human_quality_score for row in reviewed if row.human_quality_score is not None]
    return {
        "evaluated": len(rows),
        "safety_refusals": sum(not row.safety_allowed for row in rows),
        "deliverables_generated": sum(row.deliverable_generated for row in rows),
        "validated": sum(row.validation_passed for row in rows),
        "human_reviewed": len(reviewed),
        "average_human_quality": round(sum(quality) / len(quality), 2) if quality else 0.0,
        "estimated_api_cost_usd": round(sum(row.estimated_api_cost_usd for row in rows), 6),
        "average_latency_ms": round(
            sum(row.total_latency_ms for row in rows) / len(rows), 2
        ) if rows else 0.0,
        "model_used": sum(not row.fallback_used and row.provider != "not_run" for row in rows),
        "fallback_used": sum(row.fallback_used for row in rows),
    }
