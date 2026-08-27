"""The worker-facing API exposes approved packages through GET only."""

from fastapi.testclient import TestClient

from arbiter.api import create_app, is_loopback_host
from arbiter.config import Settings
from arbiter.connectors.mock import MockMarketplaceConnector
from arbiter.control_plane import (
    approve_candidate,
    create_candidate,
    refresh_opportunities,
    reject_candidate,
    reset_control_plane_engines,
)
from arbiter.evaluation import DiscoveryOnlyConnector
from arbiter.llm import HeuristicEstimator


def settings_for(tmp_path) -> Settings:
    reset_control_plane_engines()
    return Settings(
        control_plane_db_path=tmp_path / "control-plane.db",
        db_path=tmp_path / "lifecycle.db",
        evaluation_db_path=tmp_path / "evaluations.db",
        worker_artifact_dir=tmp_path / "worker-artifacts",
        llm_provider="heuristic",
    )


async def _candidate(tmp_path):
    cfg = settings_for(tmp_path)
    connector = DiscoveryOnlyConnector(MockMarketplaceConnector())
    await refresh_opportunities(
        [connector], limit=7, settings=cfg, estimator=HeuristicEstimator()
    )
    return cfg, create_candidate("mock:mock-003", cfg)


async def test_pending_and_rejected_candidates_are_not_retrievable(tmp_path):
    cfg, candidate = await _candidate(tmp_path)
    client = TestClient(create_app(cfg))
    assert client.get(f"/v1/work-packages/{candidate.candidate_id}").status_code == 404
    reject_candidate(candidate.candidate_id, "local rejection", cfg)
    assert client.get(f"/v1/work-packages/{candidate.candidate_id}").status_code == 404


async def test_approved_package_is_retrievable_and_openapi_is_get_only(tmp_path):
    cfg, candidate = await _candidate(tmp_path)
    package = approve_candidate(candidate.candidate_id, settings=cfg)
    client = TestClient(create_app(cfg))
    response = client.get(f"/v1/work-packages/{package.package_id}")
    assert response.status_code == 200
    assert response.json()["submission_status"] == "not_submitted"

    schema = client.get("/openapi.json").json()
    methods = {
        method
        for operations in schema["paths"].values()
        for method in operations
    }
    assert methods == {"get"}


def test_server_binding_is_loopback_only():
    assert is_loopback_host("127.0.0.1")
    assert is_loopback_host("::1")
    assert is_loopback_host("localhost")
    assert not is_loopback_host("0.0.0.0")
    assert not is_loopback_host("example.com")


def teardown_module():
    reset_control_plane_engines()
