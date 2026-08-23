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
    SQLModel.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    # expire_on_commit=False keeps returned rows readable after the session
    # closes -- callers (dashboard, queue) use them as plain data.
    with Session(get_engine(), expire_on_commit=False) as session:
        yield session
        session.commit()
