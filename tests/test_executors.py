"""Execution sub-agents, the category router, and the Groq code path."""

import httpx
import pytest

from arbiter.executors import CategoryRouter, ExecutionResult, ResearchHandler
from arbiter.executors.handlers import (
    DataLookupHandler,
    SmallCodeHandler,
    SummarizationHandler,
    _LLMHandler,
)
from arbiter.models import Bounty, Category


def make(category=Category.RESEARCH, **kw) -> Bounty:
    return Bounty(**{
        "marketplace": "mock", "bounty_id": "b1", "title": "Research x402 fees",
        "description": "Compare facilitator fee models.", "category": category,
        "payout_usd": 20.0, **kw,
    })


def groq_client(content: str, status: int = 200) -> httpx.AsyncClient:
    def handler(request):
        if status != 200:
            return httpx.Response(status, text="upstream error")
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


class TestRouter:
    def test_routes_each_supported_category(self):
        router = CategoryRouter()
        for category, name in [
            (Category.RESEARCH, "research"),
            (Category.SUMMARIZATION, "summarization"),
            (Category.SMALL_CODE, "small_code"),
            (Category.DATA_LOOKUP, "data_lookup"),
        ]:
            handler = router.route(make(category))
            assert handler is not None and handler.name == name

    def test_unknown_category_has_no_handler(self):
        assert CategoryRouter().route(make(Category.UNKNOWN)) is None

    async def test_unknown_category_declines_rather_than_improvising(self):
        result = await CategoryRouter().execute(make(Category.UNKNOWN))
        assert result.ok is False
        assert "no handler" in result.error
        assert result.output == ""

    def test_supported_set(self):
        assert CategoryRouter().supported == {
            Category.RESEARCH, Category.SUMMARIZATION,
            Category.SMALL_CODE, Category.DATA_LOOKUP,
        }

    async def test_dispatches_to_the_right_handler(self):
        result = await CategoryRouter().execute(make(Category.SMALL_CODE))
        assert result.handler == "small_code"


class TestStubPath:
    """With no key the loop must still run, and must never claim to be real."""

    async def test_stub_is_labelled(self, monkeypatch):
        monkeypatch.setenv("ARBITER_GROQ_API_KEY", "")
        import arbiter.config as config
        config._settings = None
        result = await ResearchHandler().run(make())
        config._settings = None

        assert result.ok and result.stubbed
        assert "STUB" in result.output
        assert "not real work" in result.output
        assert result.cost_usd == 0.0

    async def test_all_four_handlers_stub_cleanly(self, monkeypatch):
        monkeypatch.setenv("ARBITER_GROQ_API_KEY", "")
        import arbiter.config as config
        config._settings = None
        for cls in (ResearchHandler, SummarizationHandler, SmallCodeHandler, DataLookupHandler):
            result = await cls().run(make(cls.category))
            assert result.ok and result.stubbed
        config._settings = None


class TestGroqPath:
    """The real LLM path, exercised without a key via a mock transport."""

    @pytest.fixture
    def keyed(self, monkeypatch):
        monkeypatch.setenv("ARBITER_GROQ_API_KEY", "test-key")
        import arbiter.config as config
        config._settings = None
        yield
        config._settings = None

    async def test_returns_model_output(self, keyed):
        handler = ResearchHandler(client=groq_client("## Summary\nFees vary."))
        result = await handler.run(make())
        assert result.ok and not result.stubbed
        assert "Fees vary." in result.output
        assert result.cost_usd > 0

    async def test_upstream_failure_is_data_not_a_crash(self, keyed):
        handler = ResearchHandler(client=groq_client("", status=500))
        result = await handler.run(make())
        assert result.ok is False and result.error
        assert result.cost_usd > 0, "a failed call still costs"

    async def test_empty_output_is_a_failure(self, keyed):
        handler = ResearchHandler(client=groq_client("   \n  "))
        result = await handler.run(make())
        assert result.ok is False and "empty" in result.error

    async def test_prompt_carries_the_bounty(self, keyed):
        captured = {}

        def handler_fn(request):
            import json
            captured.update(json.loads(request.content))
            return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

        handler = ResearchHandler(client=httpx.AsyncClient(
            transport=httpx.MockTransport(handler_fn)
        ))
        await handler.run(make(title="Unique title here"))
        assert "Unique title here" in captured["messages"][1]["content"]
        assert captured["messages"][0]["role"] == "system"

    async def test_handlers_have_distinct_system_prompts(self):
        prompts = {
            cls.system
            for cls in (ResearchHandler, SummarizationHandler, SmallCodeHandler,
                        DataLookupHandler)
        }
        assert len(prompts) == 4
        assert all(p != _LLMHandler.system for p in prompts)


class TestExecutionResult:
    def test_payload_shape(self):
        result = ExecutionResult(ok=True, handler="research", output="x", stubbed=True)
        payload = result.to_payload()
        assert payload["handler"] == "research"
        assert payload["stubbed"] is True
