"""The dashboard must render from SQLite without raising -- both empty and populated."""

from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from arbiter.connectors import MockMarketplaceConnector
from arbiter.pipeline import run_scan

APP = str(Path(__file__).resolve().parents[1] / "src" / "arbiter" / "dashboard.py")


@pytest.fixture
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("ARBITER_DB_PATH", str(tmp_path / "t.db"))
    import streamlit as st

    import arbiter.config as config
    import arbiter.db as db
    config._settings = None
    db._engine = None
    # @st.cache_data persists across AppTest runs in one process.
    st.cache_data.clear()
    yield
    config._settings = None
    db._engine = None


def test_renders_empty_state(temp_db):
    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception
    assert any("No scans yet" in i.value for i in app.info)


async def test_renders_with_data(temp_db, settings):
    await run_scan([MockMarketplaceConnector()], settings=settings)

    app = AppTest.from_file(APP, default_timeout=60).run()
    assert not app.exception

    labels = [m.label for m in app.metric]
    assert {"Bounties found", "Actionable", "Skipped"} <= set(labels)
    assert int(app.metric[0].value) > 0
    assert len(app.tabs) == 4
    assert app.dataframe, "tables should render"
