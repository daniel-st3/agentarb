"""End-to-end alert-only loop against the mock marketplace, plus persistence."""

import pytest
from sqlmodel import Session, SQLModel, create_engine, select

import arbiter.db as db
from arbiter.connectors import MockMarketplaceConnector
from arbiter.connectors.base import ConnectorError
from arbiter.models import BountyRow, DecisionRow, ScanRow
from arbiter.pipeline import collect, run_scan
from arbiter.scoring import ScoringAgent


@pytest.fixture
def memory_db(monkeypatch):
    """Swap the engine for an in-memory SQLite so tests never touch data/."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    monkeypatch.setattr(db, "_engine", engine)
    monkeypatch.setattr(db, "get_engine", lambda: engine)
    monkeypatch.setattr("arbiter.pipeline.init_db", lambda: None)
    return engine


class Boom:
    """A connector whose list_open always fails."""

    name = "boom"
    capabilities = MockMarketplaceConnector().capabilities

    async def list_open(self, limit=50):
        raise ConnectorError("marketplace down")

    async def aclose(self):
        return None


class TestCollect:
    async def test_gathers_across_connectors(self):
        bounties, errors = await collect([MockMarketplaceConnector()])
        assert bounties and not errors

    async def test_one_failure_does_not_sink_the_run(self):
        bounties, errors = await collect([MockMarketplaceConnector(), Boom()])
        assert bounties, "healthy connector still returns results"
        assert "boom" in errors and "marketplace down" in errors["boom"]


class TestRunScan:
    async def test_scan_scores_and_ranks(self, memory_db, settings):
        result = await run_scan(
            [MockMarketplaceConnector()],
            settings=settings,
            agent=ScoringAgent(settings=settings),
        )
        assert result.run_id
        assert result.actionable, "some seeded bounties should clear the filters"
        assert result.skipped, "some seeded bounties should be skipped"
        assert all(s.score.skip_reason for s in result.skipped)
        values = [s.score.score for s in result.actionable]
        assert values == sorted(values, reverse=True)

    async def test_persists_full_audit_trail(self, memory_db, settings):
        result = await run_scan([MockMarketplaceConnector()], settings=settings)

        with Session(memory_db) as session:
            decisions = session.exec(select(DecisionRow)).all()
            bounties = session.exec(select(BountyRow)).all()
            scans = session.exec(select(ScanRow)).all()

        assert len(decisions) == len(result.scored), "one decision row per bounty"
        assert len(bounties) == len(result.scored)
        assert len(scans) == 1
        assert scans[0].n_found == len(result.scored)
        assert {d.action for d in decisions} == {"scored", "skipped"}
        # Skip reasons are the interesting half of the audit trail.
        assert all(d.skip_reason for d in decisions if d.action == "skipped")

    async def test_rescan_upserts_rather_than_duplicating(self, memory_db, settings):
        await run_scan([MockMarketplaceConnector()], settings=settings)
        await run_scan([MockMarketplaceConnector()], settings=settings)

        with Session(memory_db) as session:
            bounties = session.exec(select(BountyRow)).all()
            scans = session.exec(select(ScanRow)).all()
            decisions = session.exec(select(DecisionRow)).all()

        assert len(scans) == 2, "each run is recorded"
        assert len(decisions) == 2 * len(bounties), "decisions are append-only"
        keys = [b.key for b in bounties]
        assert len(keys) == len(set(keys)), "bounties are upserted, not duplicated"

    async def test_persist_false_writes_nothing(self, memory_db, settings):
        await run_scan([MockMarketplaceConnector()], settings=settings, persist=False)
        with Session(memory_db) as session:
            assert session.exec(select(DecisionRow)).all() == []

    async def test_week1_never_claims(self, memory_db, settings):
        """The alert-only guarantee, enforced by test."""
        connector = MockMarketplaceConnector()
        await run_scan([connector], settings=settings)
        assert connector._claimed == set()
        assert len(await connector.list_open()) == len(MockMarketplaceConnector()._bounties)
