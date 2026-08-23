"""Category router: bounty -> handler.

Unknown categories are a hard skip, not a best-effort guess. That rule is the
whole reason the router exists as its own component: it is the last place
before real work where the system can decline honestly.
"""

from __future__ import annotations

from arbiter.executors.base import ExecutionResult, Handler
from arbiter.executors.handlers import (
    DataLookupHandler,
    ResearchHandler,
    SmallCodeHandler,
    SummarizationHandler,
)
from arbiter.logging import get_logger
from arbiter.models import Bounty, Category

log = get_logger(__name__)


class CategoryRouter:
    """Picks the handler for a bounty's category."""

    def __init__(self, handlers: list[Handler] | None = None) -> None:
        built: list[Handler] = handlers or [
            ResearchHandler(),
            SummarizationHandler(),
            SmallCodeHandler(),
            DataLookupHandler(),
        ]
        self._by_category: dict[Category, Handler] = {h.category: h for h in built}

    @property
    def supported(self) -> set[Category]:
        return set(self._by_category)

    def route(self, bounty: Bounty) -> Handler | None:
        return self._by_category.get(bounty.category)

    async def execute(self, bounty: Bounty) -> ExecutionResult:
        handler = self.route(bounty)
        if handler is None:
            reason = f"no handler for category {bounty.category.value}"
            log.warning("router.no_handler", bounty=bounty.key, category=bounty.category.value)
            return ExecutionResult(ok=False, handler="none", error=reason)

        log.info("router.dispatch", bounty=bounty.key, handler=handler.name)
        return await handler.run(bounty)
