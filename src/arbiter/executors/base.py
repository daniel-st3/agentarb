"""Execution sub-agents: typed handlers, one per supported category.

Every handler takes a `Bounty` and returns an `ExecutionResult`. Handlers are
deliberately narrow -- a handler that cannot do a job says so by returning
`ok=False` rather than improvising, because a confidently-wrong deliverable is
worse than a declined one in a market with reputation.

Without an LLM key the handlers still run and return a clearly-labelled stub
deliverable, so the whole Week 2 loop is demoable offline. Stubs set
`stubbed=True` and never claim to be real work.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from arbiter.models import Bounty, Category


@dataclass
class ExecutionResult:
    ok: bool
    handler: str
    output: str = ""
    artifacts: dict[str, str] = field(default_factory=dict)
    cost_usd: float = 0.0
    stubbed: bool = False
    error: str | None = None

    def to_payload(self) -> dict[str, object]:
        """The shape handed to `connector.submit`."""
        return {
            "handler": self.handler,
            "output": self.output,
            "artifacts": self.artifacts,
            "stubbed": self.stubbed,
        }


class Handler(Protocol):
    name: str
    category: Category

    async def run(self, bounty: Bounty) -> ExecutionResult: ...
