"""Execution sub-agents: typed handlers, one per supported category.

Every handler takes a `Bounty` and returns an `ExecutionResult` carrying a
`DeliverableState`. Handlers are deliberately narrow: one that cannot do a job
says so by returning `ok=False` rather than improvising, because a
confidently-wrong deliverable is worse than a declined one in a market with
reputation.

Without an LLM key handlers still run and return a clearly-labelled stub, so
the loop stays demoable offline. A stub is pinned to `DeliverableState.
SIMULATED` and can never be marked submittable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from arbiter.models import Bounty, Category, DeliverableState


@dataclass
class ExecutionResult:
    ok: bool
    handler: str
    output: str = ""
    artifacts: dict[str, str] = field(default_factory=dict)
    cost_usd: float = 0.0
    stubbed: bool = False
    error: str | None = None
    deliverable_state: DeliverableState = DeliverableState.SIMULATED
    validation_notes: str = ""
    refusal_kind: str | None = None      # unsupported | harmful | out_of_scope | ambiguous

    @property
    def submission_ready(self) -> bool:
        return self.deliverable_state is DeliverableState.SUBMISSION_READY

    def to_payload(self) -> dict[str, object]:
        """The shape handed to `connector.submit`."""
        return {
            "handler": self.handler,
            "output": self.output,
            "artifacts": self.artifacts,
            "stubbed": self.stubbed,
            "deliverable_state": self.deliverable_state.value,
            "validation_notes": self.validation_notes,
        }


class Handler(Protocol):
    name: str
    category: Category

    async def run(self, bounty: Bounty) -> ExecutionResult: ...
