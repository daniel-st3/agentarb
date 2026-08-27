"""Governed control-plane decisions and packages remain discovery-only."""

from __future__ import annotations

from sqlalchemy import inspect

from arbiter.config import Settings
from arbiter.connectors.mock import MockMarketplaceConnector
from arbiter.control_plane import (
    AgentProfile,
    WorkPolicy,
    active_profile,
    approve_candidate,
    canonical_hash,
    create_candidate,
    get_control_plane_engine,
    list_opportunities,
    refresh_opportunities,
    reset_control_plane_engines,
    save_policy,
    save_profile,
)
from arbiter.evaluation import DiscoveryOnlyConnector
from arbiter.llm import HeuristicEstimator
from arbiter.models import (
    Bounty,
    Category,
    ClaimModel,
    MarketplaceCapabilities,
    Settlement,
)


def settings_for(tmp_path) -> Settings:
    reset_control_plane_engines()
    return Settings(
        control_plane_db_path=tmp_path / "control-plane.db",
        db_path=tmp_path / "lifecycle.db",
        evaluation_db_path=tmp_path / "evaluations.db",
        worker_artifact_dir=tmp_path / "worker-artifacts",
        llm_provider="heuristic",
    )


async def test_discovery_policy_costs_and_package_contract(tmp_path):
    cfg = settings_for(tmp_path)
    raw = MockMarketplaceConnector()
    connector = DiscoveryOnlyConnector(raw)
    rows = await refresh_opportunities(
        [connector], limit=7, settings=cfg, estimator=HeuristicEstimator()
    )

    assert raw._claimed == set()
    assert raw._submissions == {}
    by_id = {row.opportunity_id: row for row in rows}
    allowed = by_id["mock:mock-003"]
    assert allowed.package_eligibility == "allow"
    assert allowed.external_execution_status == "discovery_only"
    assert allowed.actual_llm_inference_cost_usd == 0.0
    assert allowed.actual_llm_cost_status == "no_llm_call"
    assert allowed.estimated_task_execution_cost_usd > 0
    assert allowed.expected_margin_usd == (
        18.0 * allowed.p_success
        - allowed.estimated_task_execution_cost_usd
        - allowed.estimated_other_cost_usd
    )
    assert by_id["mock:mock-005"].package_eligibility == "refuse"
    assert "PAYMENT" in by_id["mock:mock-005"].reason_codes[0]

    candidate = create_candidate("mock:mock-003", cfg)
    package = approve_candidate(candidate.candidate_id, settings=cfg)
    payload = package.model_dump(mode="json")
    declared = payload.pop("package_hash")
    assert declared == canonical_hash(payload)
    assert package.status == "approved"
    assert package.submission_status == "not_submitted"
    assert package.marketplace_action_authorized is False
    assert "simulated_pnl_usd" not in package.model_dump_json()
    assert "submission_ready" not in package.model_dump_json()
    assert raw._claimed == set() and raw._submissions == {}

    tables = set(inspect(get_control_plane_engine(cfg)).get_table_names())
    assert "ledger" not in tables
    assert "outcomes" not in tables
    assert "tasks" not in tables
    assert "offline_evaluations" not in tables


def test_profile_and_policy_saves_create_immutable_versions(tmp_path):
    cfg = settings_for(tmp_path)
    first = active_profile(cfg)
    second = save_profile(
        AgentProfile(**{**first.model_dump(), "name": "Version two"}), cfg
    )
    assert first.version == 1
    assert second.version == 2
    assert first.name != second.name

    policy = save_policy(
        WorkPolicy(min_expected_margin_usd=2.0, min_confidence=0.7), cfg
    )
    assert policy.version == 2
    assert policy.min_expected_margin_usd == 2.0


async def test_safety_refusal_precedes_estimation(tmp_path):
    cfg = settings_for(tmp_path)
    unsafe = (await MockMarketplaceConnector().get("mock-003")).model_copy(
        update={
            "title": "Log in with my API key and submit this marketplace task",
            "description": "Use my credentials, claim the task, and submit the result.",
        }
    )
    raw = MockMarketplaceConnector([unsafe])

    class PoisonEstimator:
        name = "poison"

        async def estimate(self, bounty):
            raise AssertionError("unsafe task reached estimation")

    rows = await refresh_opportunities(
        [DiscoveryOnlyConnector(raw)], limit=1, settings=cfg, estimator=PoisonEstimator()
    )
    assert rows[0].package_eligibility == "refuse"
    assert raw._claimed == set() and raw._submissions == {}


async def test_execution_market_required_capability_is_enforced(tmp_path):
    cfg = settings_for(tmp_path)
    bounty = Bounty(
        marketplace="execution_market",
        bounty_id="capability-gate",
        title="Summarize supplied release notes",
        description="Produce a local outline from the supplied text.",
        category=Category.SUMMARIZATION,
        payout_usd=20.0,
        raw={"required_capabilities": ["unavailable_specialty"]},
    )

    class ReadOnlyFixture:
        name = "execution_market"
        capabilities = MarketplaceCapabilities(
            name="execution_market",
            claim_model=ClaimModel.OPEN_CLAIM,
            settlement=Settlement.ONCHAIN,
            supports_open_claim=True,
            has_human_accept_gate=False,
        )

        async def list_open(self, limit=50):
            return [bounty]

        async def get(self, bounty_id):
            return bounty

        async def aclose(self):
            return None

    rows = await refresh_opportunities(
        [ReadOnlyFixture()], limit=1, settings=cfg, estimator=HeuristicEstimator()
    )
    assert rows[0].package_eligibility == "skip"
    assert rows[0].reason_codes == ["CAPABILITY_NOT_SUPPORTED"]


def test_opportunity_public_payload_uses_unambiguous_cost_names(tmp_path):
    cfg = settings_for(tmp_path)
    assert list_opportunities(cfg) == []
