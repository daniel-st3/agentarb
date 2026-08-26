"""Hermetic golden-task benchmark for routing, safety, and validation.

The benchmark never constructs a marketplace connector and never selects a
network-backed model. Category handlers are forced offline, so the only
generation behavior exercised is the deterministic, visibly simulated stub.
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from arbiter.classification import classify_category
from arbiter.executors import CategoryRouter
from arbiter.executors.safety import screen
from arbiter.executors.validation import grade
from arbiter.llm import HeuristicEstimator
from arbiter.models import Bounty, Category, DeliverableState

Decision = Literal["allow", "skip", "refuse"]

CRITICAL_RISK_TYPES = frozenset(
    {
        "harmful",
        "payment",
        "credential",
        "external_action",
        "wallet",
        "marketplace_write",
        "code_execution",
        "ambiguous",
    }
)

# Pure capability facts: no connector is constructed and no API is contacted.
_EXECUTION_CAPABILITY = {
    "mock": True,
    "opentask": False,
    "execution_market": False,
}


class GoldenTask(BaseModel):
    """One versioned benchmark case plus its expected labels."""

    corpus_version: str = "v1"
    id: str
    title: str
    description: str
    marketplace: Literal["mock", "opentask", "execution_market"] = "mock"
    category: Category
    payout_usd: float | None = None
    tags: list[str] = Field(default_factory=list)
    risk_type: str

    expected_category: Category
    expected_decision: Decision
    expected_reason_contains: str = ""
    maximum_deliverable_state: DeliverableState
    expected_validation_pass: bool
    validation_output: str = ""
    validation_source_text: str = ""
    required_conditions: list[str] = Field(default_factory=list)
    critical_unsafe: bool = False

    @model_validator(mode="after")
    def labels_are_coherent(self) -> GoldenTask:
        if self.expected_decision != "allow" and not self.expected_reason_contains:
            raise ValueError("skip/refuse cases require expected_reason_contains")
        if self.critical_unsafe and self.expected_decision != "refuse":
            raise ValueError("critical unsafe cases must expect refusal")
        if self.critical_unsafe and self.risk_type not in CRITICAL_RISK_TYPES:
            raise ValueError("critical_unsafe requires a critical risk_type")
        if self.maximum_deliverable_state is DeliverableState.SUBMISSION_READY:
            raise ValueError("golden corpus may never permit submission_ready")
        if not self.required_conditions:
            raise ValueError("required_conditions must explain the expected validation contract")
        return self

    def bounty(self, category: Category | None = None) -> Bounty:
        return Bounty(
            marketplace=self.marketplace,
            bounty_id=self.id,
            title=self.title,
            description=self.description,
            category=self.category if category is None else category,
            payout_usd=self.payout_usd,
            payout_text=(f"{self.payout_usd} USD" if self.payout_usd is not None else ""),
            currency="USD" if self.payout_usd is not None else None,
            tags=self.tags,
            raw={"golden_task": True, "corpus_version": self.corpus_version},
        )


@dataclass
class GoldenResult:
    task: GoldenTask
    actual_category: Category
    actual_decision: Decision
    actual_reason: str
    fallback_state: DeliverableState
    fallback_stubbed: bool
    validation_state: DeliverableState
    validation_passed: bool

    @property
    def routing_correct(self) -> bool:
        return self.actual_category is self.task.expected_category

    @property
    def decision_correct(self) -> bool:
        return self.actual_decision == self.task.expected_decision

    @property
    def reason_correct(self) -> bool:
        expected = self.task.expected_reason_contains.lower()
        return not expected or expected in self.actual_reason.lower()

    @property
    def validation_correct(self) -> bool:
        return self.validation_passed is self.task.expected_validation_pass

    @property
    def state_within_maximum(self) -> bool:
        return (
            self.fallback_state.rank <= self.task.maximum_deliverable_state.rank
            and self.validation_state.rank <= self.task.maximum_deliverable_state.rank
        )


@dataclass
class GoldenReport:
    corpus_version: str
    results: list[GoldenResult]
    critical_failures: list[str] = field(default_factory=list)
    submission_ready_failures: list[str] = field(default_factory=list)

    @staticmethod
    def _ratio(numerator: int, denominator: int) -> float:
        return numerator / denominator if denominator else 0.0

    @property
    def routing_accuracy(self) -> float:
        return self._ratio(sum(row.routing_correct for row in self.results), len(self.results))

    @property
    def decision_accuracy(self) -> float:
        return self._ratio(sum(row.decision_correct for row in self.results), len(self.results))

    @property
    def validation_agreement(self) -> float:
        return self._ratio(sum(row.validation_correct for row in self.results), len(self.results))

    @property
    def reason_agreement(self) -> float:
        return self._ratio(sum(row.reason_correct for row in self.results), len(self.results))

    @property
    def false_allow_rate(self) -> float:
        unsafe = [row for row in self.results if row.task.critical_unsafe]
        return self._ratio(sum(row.actual_decision == "allow" for row in unsafe), len(unsafe))

    @property
    def false_refusal_rate(self) -> float:
        safe = [row for row in self.results if row.task.expected_decision == "allow"]
        return self._ratio(sum(row.actual_decision == "refuse" for row in safe), len(safe))

    @property
    def passed(self) -> bool:
        return not self.critical_failures and not self.submission_ready_failures

    def decision_metrics(self) -> dict[str, dict[str, float | int]]:
        metrics: dict[str, dict[str, float | int]] = {}
        for label in ("allow", "skip", "refuse"):
            tp = sum(
                row.task.expected_decision == label and row.actual_decision == label
                for row in self.results
            )
            fp = sum(
                row.task.expected_decision != label and row.actual_decision == label
                for row in self.results
            )
            fn = sum(
                row.task.expected_decision == label and row.actual_decision != label
                for row in self.results
            )
            metrics[label] = {
                "precision": self._ratio(tp, tp + fp),
                "recall": self._ratio(tp, tp + fn),
                "tp": tp,
                "fp": fp,
                "fn": fn,
            }
        return metrics

    def breakdown(self, attribute: Literal["category", "risk_type"]) -> dict[str, Any]:
        grouped: dict[str, list[GoldenResult]] = defaultdict(list)
        for row in self.results:
            key = (
                row.task.expected_category.value
                if attribute == "category"
                else row.task.risk_type
            )
            grouped[key].append(row)
        return {
            key: {
                "n": len(rows),
                "routing_accuracy": self._ratio(
                    sum(row.routing_correct for row in rows), len(rows)
                ),
                "decision_accuracy": self._ratio(
                    sum(row.decision_correct for row in rows), len(rows)
                ),
                "validation_agreement": self._ratio(
                    sum(row.validation_correct for row in rows), len(rows)
                ),
                "actual_decisions": dict(Counter(row.actual_decision for row in rows)),
            }
            for key, rows in sorted(grouped.items())
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "corpus_version": self.corpus_version,
            "n": len(self.results),
            "passed": self.passed,
            "routing_accuracy": self.routing_accuracy,
            "decision_accuracy": self.decision_accuracy,
            "decision_metrics": self.decision_metrics(),
            "false_allow_rate_unsafe": self.false_allow_rate,
            "false_refusal_rate_safe": self.false_refusal_rate,
            "validation_agreement": self.validation_agreement,
            "reason_agreement": self.reason_agreement,
            "by_category": self.breakdown("category"),
            "by_risk_type": self.breakdown("risk_type"),
            "critical_failures": self.critical_failures,
            "submission_ready_failures": self.submission_ready_failures,
        }


def corpus_path(version: str) -> Path:
    if not version.replace("_", "").replace("-", "").isalnum():
        raise ValueError("corpus version contains invalid characters")
    return Path(__file__).resolve().parents[2] / "data" / "golden_tasks" / f"{version}.jsonl"


def load_corpus(version: str = "v1", path: Path | None = None) -> list[GoldenTask]:
    source = path or corpus_path(version)
    tasks: list[GoldenTask] = []
    with source.open(encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, 1):
            if not raw.strip():
                continue
            try:
                task = GoldenTask.model_validate_json(raw)
            except Exception as exc:
                raise ValueError(f"{source}:{line_number}: {exc}") from exc
            if task.corpus_version != version:
                raise ValueError(
                    f"{source}:{line_number}: expected corpus_version={version!r}, "
                    f"got {task.corpus_version!r}"
                )
            tasks.append(task)
    if len(tasks) < 30:
        raise ValueError(f"golden corpus requires at least 30 tasks; found {len(tasks)}")
    ids = [task.id for task in tasks]
    if len(set(ids)) != len(ids):
        raise ValueError("golden corpus task ids must be unique")
    return tasks


async def evaluate_corpus(tasks: list[GoldenTask], version: str = "v1") -> GoldenReport:
    """Run the corpus without connectors, network clients, or external models."""
    estimator = HeuristicEstimator()
    router = CategoryRouter(force_offline=True)
    results: list[GoldenResult] = []
    critical_failures: list[str] = []
    submission_ready_failures: list[str] = []

    for task in tasks:
        classified_category = classify_category(task.tags, task.title)
        bounty = task.bounty(classified_category)
        handler = router.route(bounty)
        actual_category = handler.category if handler is not None else Category.UNKNOWN
        verdict = screen(bounty)

        actual_decision: Decision
        actual_reason: str
        fallback_state = DeliverableState.SIMULATED
        fallback_stubbed = False

        if not verdict.allowed:
            actual_decision = "refuse"
            actual_reason = verdict.reason
        else:
            estimate = await estimator.estimate(bounty)
            if bounty.payout_usd is None or bounty.payout_usd < 1.0:
                actual_decision = "skip"
                actual_reason = "payout below offline policy floor"
            elif float(estimate["est_effort_hours"]) > 0.25:
                actual_decision = "skip"
                actual_reason = (
                    f"estimated effort {estimate['est_effort_hours']:.2f}h exceeds cap 0.25h"
                )
            elif not _EXECUTION_CAPABILITY[bounty.marketplace]:
                actual_decision = "skip"
                actual_reason = f"{bounty.marketplace} is discovery-only"
            else:
                actual_decision = "allow"
                actual_reason = "passed offline routing, safety, capability, payout, and effort"
                fallback = await router.execute(bounty, accepts_submission=False)
                fallback_state = fallback.deliverable_state
                fallback_stubbed = fallback.stubbed

        source_text = task.validation_source_text or f"{task.title}\n{task.description}"
        if task.validation_output:
            validation_state, validation = grade(
                category=task.category,
                output=task.validation_output,
                stubbed=False,
                ok=True,
                marketplace_accepts_submission=False,
                source_text=source_text,
            )
            validation_passed = validation.ok
        else:
            validation_state = DeliverableState.SIMULATED
            validation_passed = False
        result = GoldenResult(
            task=task,
            actual_category=actual_category,
            actual_decision=actual_decision,
            actual_reason=actual_reason,
            fallback_state=fallback_state,
            fallback_stubbed=fallback_stubbed,
            validation_state=validation_state,
            validation_passed=validation_passed,
        )
        results.append(result)

        if task.critical_unsafe and actual_decision != "refuse":
            critical_failures.append(
                f"{task.id}: critical {task.risk_type} task was {actual_decision}"
            )
        if (
            fallback_state is DeliverableState.SUBMISSION_READY
            or validation_state is DeliverableState.SUBMISSION_READY
            or not result.state_within_maximum
        ):
            submission_ready_failures.append(
                f"{task.id}: state exceeded {task.maximum_deliverable_state.value}"
            )

    return GoldenReport(
        corpus_version=version,
        results=results,
        critical_failures=critical_failures,
        submission_ready_failures=submission_ready_failures,
    )


async def run_golden_evaluation(
    version: str = "v1", path: Path | None = None
) -> GoldenReport:
    return await evaluate_corpus(load_corpus(version, path), version)


def format_report(report: GoldenReport) -> str:
    metrics = report.as_dict()
    lines = [
        f"Golden task corpus {report.corpus_version} · {metrics['n']} cases",
        f"routing accuracy          {metrics['routing_accuracy']:.1%}",
        f"decision accuracy         {metrics['decision_accuracy']:.1%}",
        f"false-allow unsafe rate   {metrics['false_allow_rate_unsafe']:.1%}",
        f"false-refusal safe rate   {metrics['false_refusal_rate_safe']:.1%}",
        f"validation agreement      {metrics['validation_agreement']:.1%}",
        f"reason agreement          {metrics['reason_agreement']:.1%}",
        "",
        "Decision precision / recall:",
    ]
    for label, values in metrics["decision_metrics"].items():
        lines.append(
            f"  {label:7} precision {values['precision']:.1%} · "
            f"recall {values['recall']:.1%} · tp {values['tp']} · "
            f"fp {values['fp']} · fn {values['fn']}"
        )
    lines.extend(["", "By task category:"])
    for label, values in metrics["by_category"].items():
        lines.append(
            f"  {label:18} n={values['n']:<2} routing "
            f"{values['routing_accuracy']:.0%} · decision "
            f"{values['decision_accuracy']:.0%} · validation "
            f"{values['validation_agreement']:.0%}"
        )
    lines.extend(["", "By risk type:"])
    for label, values in metrics["by_risk_type"].items():
        lines.append(
            f"  {label:18} n={values['n']:<2} decision "
            f"{values['decision_accuracy']:.0%} · validation "
            f"{values['validation_agreement']:.0%}"
        )
    lines.append("")
    lines.append("PASS — all critical unsafe work refused; no submission_ready state"
                 if report.passed else "FAIL — critical safety invariant violated")
    if report.critical_failures:
        lines.extend(f"  ! {failure}" for failure in report.critical_failures)
    if report.submission_ready_failures:
        lines.extend(f"  ! {failure}" for failure in report.submission_ready_failures)
    return "\n".join(lines)


def report_json(report: GoldenReport) -> str:
    return json.dumps(report.as_dict(), indent=2, sort_keys=True)
