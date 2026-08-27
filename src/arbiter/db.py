"""SQLite engine + session helpers."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, event, text
from sqlmodel import Session, SQLModel, create_engine

from arbiter.config import get_settings
from arbiter.models import (  # noqa: F401  (table registration)
    BountyRow,
    DecisionRow,
    EventRow,
    LedgerRow,
    OutcomeRow,
    ScanRow,
    TaskRow,
)

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(
            get_settings().db_url,
            # `timeout` makes a busy writer wait rather than fail instantly.
            connect_args={"check_same_thread": False, "timeout": 30.0},
        )

        @event.listens_for(_engine, "connect")
        def _set_pragmas(dbapi_connection, _record):  # pragma: no cover - driver hook
            cursor = dbapi_connection.cursor()
            # WAL lets readers (the dashboard) run alongside a writer.
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

        with _engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    return _engine


def init_db() -> None:
    """Create tables if they don't exist. Safe to call repeatedly."""
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _migrate_decision_cost_names(engine)


def _migrate_decision_cost_names(engine: Engine) -> None:
    """Idempotently add explicit cost columns and copy legacy projections.

    SQLite cannot rename these safely across every historical database shape.
    Deprecated columns may remain physically present, but application models
    and public output use only the explicit names added here.
    """
    additions = {
        "actual_llm_inference_cost_usd": "REAL",
        "actual_llm_cost_status": "TEXT NOT NULL DEFAULT 'no_llm_call'",
        "estimated_task_execution_cost_usd": "REAL NOT NULL DEFAULT 0.0",
        "estimated_other_cost_usd": "REAL NOT NULL DEFAULT 0.0",
        "expected_margin_usd": "REAL NOT NULL DEFAULT 0.0",
    }
    with engine.begin() as conn:
        columns = {
            row[1] for row in conn.execute(text("PRAGMA table_info(decisions)")).fetchall()
        }
        for name, ddl in additions.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE decisions ADD COLUMN {name} {ddl}"))
        if "est_api_cost_usd" in columns:
            conn.execute(
                text(
                    "UPDATE decisions SET estimated_task_execution_cost_usd = "
                    "est_api_cost_usd WHERE estimated_task_execution_cost_usd = 0.0"
                )
            )
        if "est_gas_cost_usd" in columns:
            conn.execute(
                text(
                    "UPDATE decisions SET estimated_other_cost_usd = est_gas_cost_usd "
                    "WHERE estimated_other_cost_usd = 0.0"
                )
            )
        if "net_ev_usd" in columns:
            conn.execute(
                text(
                    "UPDATE decisions SET expected_margin_usd = net_ev_usd "
                    "WHERE expected_margin_usd = 0.0"
                )
            )


@contextmanager
def session_scope() -> Iterator[Session]:
    # expire_on_commit=False keeps returned rows readable after the session
    # closes -- callers (dashboard, queue) use them as plain data.
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session
        session.commit()
