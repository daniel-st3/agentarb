"""SQLite engine + session helpers."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine
from sqlmodel import Session, SQLModel, create_engine

from arbiter.config import get_settings
from arbiter.models import BountyRow, DecisionRow, ScanRow  # noqa: F401  (table registration)

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(
            get_settings().db_url,
            connect_args={"check_same_thread": False},
        )
    return _engine


def init_db() -> None:
    """Create tables if they don't exist. Safe to call repeatedly."""
    SQLModel.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
        session.commit()
