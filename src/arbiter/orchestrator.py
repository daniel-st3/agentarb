"""Driving the graph: start a bounty, suspend at the gate, resume on a decision.

The LangGraph thread id is the bounty key (`marketplace:bounty_id`). That is
the same idempotency key used for claim/submit/settle, so re-running a bounty
resumes its existing thread instead of starting a second attempt.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from langgraph.types import Command
from sqlmodel import select

from arbiter.config import Settings, get_settings
from arbiter.connectors.base import MarketplaceConnector
from arbiter.db import init_db, session_scope
from arbiter.graph import ArbiterGraph, sqlite_checkpointer
from arbiter.logging import get_logger
from arbiter.models import Bounty, TaskRow, TaskState

log = get_logger(__name__)


@dataclass
class Pending:
    """A bounty suspended at the claim gate, awaiting a human."""

    thread_id: str
    payload: dict[str, Any]


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _interrupt_payload(result: dict) -> dict[str, Any] | None:
    """Pull the interrupt payload out of a graph result, if it suspended."""
    interrupts = result.get("__interrupt__")
    if not interrupts:
        return None
    first = interrupts[0]
    return getattr(first, "value", first)


class Orchestrator:
    """Starts and resumes bounty runs against a checkpointed graph."""

    def __init__(
        self,
        connectors: dict[str, MarketplaceConnector],
        checkpointer: Any,
        settings: Settings | None = None,
        **graph_kwargs,
    ) -> None:
        self.settings = settings or get_settings()
        init_db()
        self.checkpointer = checkpointer
        self.arbiter = ArbiterGraph(
            connectors=connectors,
            settings=self.settings,
            checkpointer=checkpointer,
            **graph_kwargs,
        )

    @classmethod
    async def create(
        cls,
        connectors: dict[str, MarketplaceConnector],
        settings: Settings | None = None,
        checkpointer: Any | None = None,
        **graph_kwargs,
    ) -> Orchestrator:
        """Build an orchestrator with a checkpointer bound to this event loop."""
        saver = checkpointer or await sqlite_checkpointer()
        return cls(connectors, saver, settings=settings, **graph_kwargs)

    async def start(self, bounty: Bounty, run_id: str | None = None) -> Pending | dict:
        """Run a bounty up to the claim gate.

        Returns a `Pending` if it suspended awaiting approval, otherwise the
        terminal state (skipped, risk-refused, or -- with approval disabled --
        fully settled).
        """
        run_id = run_id or uuid.uuid4().hex[:12]
        result = await self.arbiter.graph.ainvoke(
            {"run_id": run_id, "bounty": bounty.model_dump(mode="json")},
            config=_config(bounty.key),
        )
        payload = _interrupt_payload(result)
        if payload is not None:
            log.info("orchestrator.awaiting_approval", bounty=bounty.key)
            return Pending(thread_id=bounty.key, payload=payload)
        return result

    async def resume(
        self,
        thread_id: str,
        approved: bool,
        approver: str = "human",
        reason: str | None = None,
    ) -> dict:
        """Resume a suspended gate with a human decision."""
        log.info(
            "orchestrator.resume", thread=thread_id, approved=approved, approver=approver
        )
        return await self.arbiter.graph.ainvoke(
            Command(resume={"approved": approved, "approver": approver, "reason": reason}),
            config=_config(thread_id),
        )

    async def aclose(self) -> None:
        """Close the checkpointer's connection so the process can exit."""
        conn = getattr(self.checkpointer, "conn", None)
        if conn is not None:
            try:
                await conn.close()
            except Exception:  # noqa: BLE001 - closing must never raise
                log.warning("orchestrator.close_failed", exc_info=True)

    async def state(self, thread_id: str) -> dict[str, Any]:
        snapshot = await self.arbiter.graph.aget_state(_config(thread_id))
        return dict(snapshot.values) if snapshot and snapshot.values else {}


def pending_tasks() -> list[TaskRow]:
    """Bounties sitting at the claim gate, for the dashboard queue."""
    init_db()
    with session_scope() as session:
        return list(
            session.exec(
                select(TaskRow)
                .where(TaskRow.state == TaskState.PENDING_APPROVAL.value)
                .where(TaskRow.approved.is_(None))
                .order_by(TaskRow.score.desc())
            ).all()
        )
