"""Bounded local work-package verifier and dry-run executor.

This module deliberately imports no Agent Arbiter implementation module. Its
only input is the canonical JSON returned by the localhost REST API.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

SUPPORTED_PACKAGE_SCHEMA = "1.0"
ARTIFACT_SCHEMA_VERSION = "1.0"
SUPPORTED_CATEGORIES = {"research", "summarization", "data_lookup", "small_code"}
SUPPORTED_TOOLS = {"local_text_transform", "structured_planning", "local_json_write"}
SUPPORTED_OPERATIONS = {
    "structure_task_specification",
    "produce_research_plan",
    "produce_local_summary_outline",
    "produce_extraction_schema",
    "produce_code_change_plan",
    "validate_local_plan",
}
REQUIRED_PROHIBITIONS = {
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
_PROHIBITED_REQUESTS = (
    r"\b(password|api key|private key|seed phrase|credential|login)\b",
    r"\b(pay|payment|wallet|sign transaction|x402|escrow)\b",
    r"\b(bid|claim|accept|submit|settle|cancel)\b.{0,30}\b(task|marketplace|bounty)\b",
    r"\b(run|execute)\b.{0,30}\b(code|script|command|binary)\b",
    r"\b(private|personal|confidential)\s+(data|record|information)\b",
    r"\b(log in|browser login|send email|post message|make a call)\b",
)


class WorkerRefusal(RuntimeError):
    """Package cannot be safely consumed by the bounded worker."""


def _canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash_without_declared_hash(package: dict[str, Any]) -> str:
    unhashed = {key: value for key, value in package.items() if key != "package_hash"}
    return "sha256:" + hashlib.sha256(_canonical_json(unhashed).encode()).hexdigest()


def _loopback_base(api_url: str) -> str:
    parsed = urlparse(api_url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise WorkerRefusal("package API must be plain HTTP on loopback")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise WorkerRefusal("package API URL contains unsupported credentials or parameters")
    return api_url.rstrip("/")


def retrieve_package(
    api_url: str,
    package_id: str,
    *,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Retrieve one approved package from the loopback API only."""
    base = _loopback_base(api_url)
    if not re.fullmatch(r"wp_[a-f0-9]{8,32}", package_id):
        raise WorkerRefusal("invalid package identifier")
    owned = client is None
    http = client or httpx.Client(timeout=10.0, follow_redirects=False)
    try:
        response = http.get(f"{base}/v1/work-packages/{package_id}")
        if response.is_redirect:
            raise WorkerRefusal("package API redirects are forbidden")
        if response.status_code != 200:
            raise WorkerRefusal("approved package is unavailable")
        payload = response.json()
        if not isinstance(payload, dict):
            raise WorkerRefusal("package response is not a JSON object")
        return payload
    except (httpx.HTTPError, ValueError) as exc:
        raise WorkerRefusal("could not retrieve a valid package from loopback") from exc
    finally:
        if owned:
            http.close()


def verify_package(package: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    def require(name: str, condition: bool, reason: str) -> None:
        checks.append({"check": name, "passed": condition, "reason": "" if condition else reason})
        if not condition:
            raise WorkerRefusal(reason)

    require(
        "schema_version",
        package.get("schema_version") == SUPPORTED_PACKAGE_SCHEMA,
        "unsupported package schema",
    )
    require("status", package.get("status") == "approved", "package is not approved")
    require(
        "submission_status",
        package.get("submission_status") == "not_submitted",
        "package is not explicitly not_submitted",
    )
    require(
        "marketplace_action_authorized",
        package.get("marketplace_action_authorized") is False,
        "package authorizes a marketplace action",
    )
    require(
        "package_hash",
        package.get("package_hash") == _hash_without_declared_hash(package),
        "package hash mismatch",
    )
    task = package.get("task") if isinstance(package.get("task"), dict) else {}
    category = task.get("category")
    require("category", category in SUPPORTED_CATEGORIES, "unsupported task category")
    require(
        "profile_policy_refs",
        bool(package.get("agent_profile", {}).get("version"))
        and bool(package.get("work_policy", {}).get("version")),
        "profile or policy version reference missing",
    )
    safety = package.get("safety_constraints")
    require("safety_constraints", isinstance(safety, dict), "safety constraints missing")
    allowed_tools = set(safety.get("allowed_tools") or [])
    require(
        "allowed_tools",
        bool(allowed_tools) and allowed_tools <= SUPPORTED_TOOLS,
        "package requests an unsupported tool",
    )
    prohibited = set(safety.get("prohibited_actions") or [])
    require(
        "prohibited_actions",
        REQUIRED_PROHIBITIONS <= prohibited,
        "package omits required prohibitions",
    )
    require(
        "network_scope",
        safety.get("network_scope") == "localhost_package_api_only",
        "package permits non-loopback network access",
    )
    operations = [step.get("operation") for step in package.get("task_plan", [])]
    require(
        "task_plan",
        bool(operations) and all(operation in SUPPORTED_OPERATIONS for operation in operations),
        "package contains an unsupported plan operation",
    )
    task_text = f"{task.get('title', '')}\n{task.get('description', '')}".lower()
    prohibited_match = next(
        (pattern for pattern in _PROHIBITED_REQUESTS if re.search(pattern, task_text)), None
    )
    require(
        "task_request_safety",
        prohibited_match is None,
        "task requires a prohibited credential, financial, execution, login, private-data, "
        "marketplace-write, or external action",
    )
    return checks


def _structure_task(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "objective": str(task.get("title") or "").strip(),
        "specification": str(task.get("description") or "").strip(),
        "category": task.get("category"),
        "known_inputs": ["title", "description", "category"],
        "unresolved_inputs": [],
    }


def _dry_run(package: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    task = package["task"]
    structured = _structure_task(task)
    category = task["category"]
    steps = ["structure_task_specification"]
    if category == "research":
        output = {
            "structured_task": structured,
            "research_questions": [structured["objective"]],
            "evidence_requirements": ["Public source URL", "claim-to-source mapping"],
            "uncertainty": "No external research performed in local dry-run.",
        }
        steps.append("produce_research_plan")
    elif category == "summarization":
        sentences = [part.strip() for part in re.split(r"[.!?]+", structured["specification"])]
        output = {
            "structured_task": structured,
            "local_outline": [sentence for sentence in sentences if sentence][:5],
            "grounding": "Package-supplied task text only.",
        }
        steps.append("produce_local_summary_outline")
    elif category == "data_lookup":
        output = {
            "structured_task": structured,
            "extraction_schema": {"records": "list", "sources": "list", "retrieved_at": "iso8601"},
            "provenance_required": True,
            "unresolved_inputs": ["Source documents are not included in the package."],
        }
        steps.append("produce_extraction_schema")
    else:
        output = {
            "structured_task": structured,
            "problem_statement": structured["specification"],
            "patch_outline": [
                "Identify the timezone boundary and expected behavior.",
                "Propose the smallest localized correction.",
                "Do not access a repository or execute code in this dry-run.",
            ],
            "test_strategy": [
                "Add cases immediately before and after the timezone boundary.",
                "Check naive and timezone-aware inputs.",
                "Run tests only in a separately authorized execution environment.",
            ],
        }
        steps.append("produce_code_change_plan")
    steps.append("validate_local_plan")
    return output, steps


def _validate(package: dict[str, Any], output: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for criterion in package.get("validation_criteria", []):
        criterion_id = criterion.get("id")
        if criterion_id == "structured_output_present":
            passed = bool(output.get("structured_task"))
        elif criterion_id == "test_strategy_present":
            passed = bool(output.get("test_strategy"))
        elif criterion_id == "no_external_action":
            passed = True
        else:
            passed = False
        results.append({"criterion_id": criterion_id, "passed": passed})
    return results


def execute_package(package: dict[str, Any]) -> dict[str, Any]:
    """Verify and execute a bounded local dry-run; never raise past the artifact."""
    started = datetime.now(UTC)
    execution_id = "wex_" + uuid.uuid4().hex[:16]
    checks: list[dict[str, Any]] = []
    dry_steps: list[str] = []
    validation: list[dict[str, Any]] = []
    output: dict[str, Any] = {}
    refusal_reasons: list[str] = []
    state = "refused"
    try:
        checks = verify_package(package)
        output, dry_steps = _dry_run(package)
        validation = _validate(package, output)
        if not validation or not all(item["passed"] for item in validation):
            raise WorkerRefusal("one or more deterministic validation criteria failed")
        state = "validated_local_artifact"
    except WorkerRefusal as exc:
        refusal_reasons.append(str(exc))
    completed = datetime.now(UTC)
    return {
        "artifact_schema_version": ARTIFACT_SCHEMA_VERSION,
        "execution_id": execution_id,
        "package_id": package.get("package_id"),
        "received_package_hash": package.get("package_hash"),
        "profile_reference": package.get("agent_profile"),
        "policy_reference": package.get("work_policy"),
        "state": state,
        "verification_results": checks,
        "dry_run_steps_performed": dry_steps,
        "local_output": output,
        "validation_results": validation,
        "refusal_reasons": refusal_reasons,
        "constraints_encountered": [],
        "started_at": started.isoformat(),
        "completed_at": completed.isoformat(),
        "actual_llm_inference_cost_usd": 0.0,
        "external_actions_taken": False,
        "marketplace_submission_status": "not_submitted",
    }


def write_artifact(artifact: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{artifact['execution_id']}.json"
    # Exclusive creation makes the artifact store append-only.
    with path.open("x", encoding="utf-8") as handle:
        json.dump(artifact, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return path

