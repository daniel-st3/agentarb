"""The local worker is a bounded package consumer, not a marketplace agent."""

from __future__ import annotations

import inspect
import json

from fastapi.testclient import TestClient

from arbiter.api import create_app
from arbiter.config import Settings
from arbiter.connectors.mock import MockMarketplaceConnector
from arbiter.control_plane import approve_candidate, create_candidate, refresh_opportunities
from arbiter.evaluation import DiscoveryOnlyConnector
from arbiter.llm import HeuristicEstimator
from arbiter_worker import runtime


def settings_for(tmp_path) -> Settings:
    from arbiter.control_plane import reset_control_plane_engines

    reset_control_plane_engines()
    return Settings(
        control_plane_db_path=tmp_path / "control-plane.db",
        db_path=tmp_path / "lifecycle.db",
        evaluation_db_path=tmp_path / "evaluations.db",
        worker_artifact_dir=tmp_path / "worker-artifacts",
        llm_provider="heuristic",
    )


async def _approved(tmp_path):
    cfg = settings_for(tmp_path)
    raw = MockMarketplaceConnector()
    await refresh_opportunities(
        [DiscoveryOnlyConnector(raw)],
        limit=7,
        settings=cfg,
        estimator=HeuristicEstimator(),
    )
    candidate = create_candidate("mock:mock-003", cfg)
    package = approve_candidate(candidate.candidate_id, settings=cfg)
    return cfg, raw, package


async def test_worker_retrieves_via_rest_and_writes_append_only_artifact(tmp_path):
    cfg, raw, package = await _approved(tmp_path)
    client = TestClient(create_app(cfg))
    received = runtime.retrieve_package(
        "http://127.0.0.1:8765", package.package_id, client=client
    )
    artifact = runtime.execute_package(received)
    assert artifact["state"] == "validated_local_artifact"
    assert artifact["received_package_hash"] == package.package_hash
    assert artifact["external_actions_taken"] is False
    assert artifact["marketplace_submission_status"] == "not_submitted"
    assert artifact["actual_llm_inference_cost_usd"] == 0.0
    assert "submission_ready" not in json.dumps(artifact)
    assert "simulated_pnl_usd" not in json.dumps(artifact)
    path = runtime.write_artifact(artifact, tmp_path / "artifacts")
    assert path.exists()
    assert raw._claimed == set() and raw._submissions == {}


async def test_worker_refuses_malformed_and_prohibited_packages(tmp_path):
    _, _, package = await _approved(tmp_path)
    malformed = package.model_dump(mode="json")
    malformed["package_hash"] = "sha256:bad"
    assert runtime.execute_package(malformed)["state"] == "refused"

    prohibited = package.model_dump(mode="json")
    prohibited["task"]["description"] = "Log in with a private key and submit the task."
    prohibited["package_hash"] = runtime._hash_without_declared_hash(prohibited)
    artifact = runtime.execute_package(prohibited)
    assert artifact["state"] == "refused"
    assert artifact["dry_run_steps_performed"] == []


def test_worker_is_structurally_isolated_from_connectors_and_execution_surfaces():
    source = inspect.getsource(runtime)
    forbidden = (
        "arbiter.connectors",
        "arbiter.db",
        "arbiter.orchestrator",
        "subprocess",
        "playwright",
        "selenium",
    )
    assert not any(name in source for name in forbidden)
    assert "eval(" not in source and "exec(" not in source


def test_worker_rejects_non_loopback_api():
    try:
        runtime.retrieve_package("https://example.com", "wp_12345678")
    except runtime.WorkerRefusal as exc:
        assert "loopback" in str(exc)
    else:  # pragma: no cover
        raise AssertionError("non-loopback API was accepted")
