"""A failed, slow, rate-limited, or malformed LLM call must never block scanning."""

import httpx
import pytest

from arbiter.llm import GroqEstimator, HeuristicEstimator, LLMError, get_estimator
from arbiter.models import Bounty, Category
from arbiter.scoring import ScoringAgent


def make(**kw) -> Bounty:
    return Bounty(**{
        "marketplace": "mock", "bounty_id": "b1", "title": "Research x402 fees",
        "description": "Compare facilitator fee models across the major providers.",
        "category": Category.RESEARCH, "payout_usd": 20.0, **kw,
    })


def estimator(handler, **kw) -> GroqEstimator:
    return GroqEstimator(
        "k", "m", client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        backoff=0.0, max_backoff=0.0, **kw,
    )


def responder(*responses):
    """Return a handler that yields the given responses in order."""
    calls = {"n": 0}

    def handler(request):
        index = min(calls["n"], len(responses) - 1)
        calls["n"] += 1
        return responses[index]

    handler.calls = calls
    return handler


def ok_json(payload: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": payload}}]})


VALID = (
    '{"feasibility":0.8,"p_success":0.6,"confidence":0.7,"est_effort_hours":0.2,'
    '"est_api_cost_usd":0.05,"est_gas_cost_usd":0,"rationale":"fine"}'
)


class TestFallsBack:
    async def test_on_server_error(self):
        result = await estimator(responder(httpx.Response(500))).estimate(make())
        assert result["fallback"] is True
        assert "fell back to heuristic" in result["rationale"]

    async def test_on_rate_limit(self):
        result = await estimator(responder(httpx.Response(429))).estimate(make())
        assert result["fallback"] is True

    async def test_on_timeout(self):
        def handler(request):
            raise httpx.ReadTimeout("too slow")

        result = await estimator(handler).estimate(make())
        assert result["fallback"] is True

    async def test_on_network_error(self):
        def handler(request):
            raise httpx.ConnectError("no route to host")

        result = await estimator(handler).estimate(make())
        assert result["fallback"] is True

    async def test_on_invalid_json(self):
        result = await estimator(responder(ok_json("not json at all"))).estimate(make())
        assert result["fallback"] is True

    async def test_on_json_that_is_not_an_object(self):
        result = await estimator(responder(ok_json("[1, 2, 3]"))).estimate(make())
        assert result["fallback"] is True

    async def test_on_malformed_envelope(self):
        result = await estimator(responder(httpx.Response(200, json={"nope": 1}))).estimate(make())
        assert result["fallback"] is True

    async def test_on_implausible_estimate(self):
        """Clamping hides garbage; the plausibility check catches it."""
        bad = (
            '{"feasibility":0.9,"p_success":0.9,"confidence":0.9,'
            '"est_effort_hours":0,"est_api_cost_usd":0,"est_gas_cost_usd":0}'
        )
        result = await estimator(responder(ok_json(bad))).estimate(make())
        assert result["fallback"] is True

    async def test_fallback_still_returns_every_field(self):
        result = await estimator(responder(httpx.Response(500))).estimate(make())
        for key in ("feasibility", "p_success", "confidence", "est_effort_hours",
                    "est_api_cost_usd", "est_gas_cost_usd"):
            assert isinstance(result[key], float)


class TestRetries:
    async def test_retries_then_succeeds(self):
        handler = responder(httpx.Response(503), ok_json(VALID))
        result = await estimator(handler).estimate(make())
        assert result.get("fallback") is not True
        assert result["p_success"] == pytest.approx(0.6)
        assert handler.calls["n"] == 2

    async def test_gives_up_after_max_attempts(self):
        handler = responder(httpx.Response(500))
        result = await estimator(handler, max_attempts=3).estimate(make())
        assert handler.calls["n"] == 3
        assert result["fallback"] is True

    async def test_does_not_retry_a_bad_request(self):
        """A 400 will not fix itself; retrying only wastes time."""
        handler = responder(httpx.Response(400))
        result = await estimator(handler).estimate(make())
        assert handler.calls["n"] == 1
        assert result["fallback"] is True

    async def test_honours_retry_after(self):
        handler = responder(
            httpx.Response(429, headers={"retry-after": "0"}), ok_json(VALID)
        )
        result = await estimator(handler).estimate(make())
        assert result.get("fallback") is not True


class TestScanningNeverBlocks:
    async def test_scoring_completes_with_a_dead_llm(self):
        """The end-to-end guarantee: a broken LLM degrades, it does not stop the scan."""
        agent = ScoringAgent(estimator=estimator(responder(httpx.Response(500))))
        scored = await agent.score_many([make(bounty_id=f"b{i}") for i in range(5)])
        assert len(scored) == 5
        assert all(not s.score.skipped for s in scored)
        assert all(s.score.score > 0 for s in scored)

    async def test_complete_raises_rather_than_returning_junk(self):
        """Handlers need a real exception so they can mark the task failed."""
        with pytest.raises(LLMError):
            await estimator(responder(httpx.Response(500))).complete("sys", "user")


class TestProviderSelection:
    def test_auto_uses_heuristic_without_a_key(self, monkeypatch):
        monkeypatch.setenv("ARBITER_LLM_PROVIDER", "auto")
        monkeypatch.setenv("ARBITER_GROQ_API_KEY", "")
        import arbiter.config as config
        config._settings = None
        assert isinstance(get_estimator(), HeuristicEstimator)
        config._settings = None

    def test_auto_uses_groq_with_a_key(self, monkeypatch):
        monkeypatch.setenv("ARBITER_LLM_PROVIDER", "auto")
        monkeypatch.setenv("ARBITER_GROQ_API_KEY", "k")
        import arbiter.config as config
        config._settings = None
        assert isinstance(get_estimator(), GroqEstimator)
        config._settings = None

    def test_heuristic_is_forced_even_with_a_key(self, monkeypatch):
        monkeypatch.setenv("ARBITER_LLM_PROVIDER", "heuristic")
        monkeypatch.setenv("ARBITER_GROQ_API_KEY", "k")
        import arbiter.config as config
        config._settings = None
        assert isinstance(get_estimator(), HeuristicEstimator)
        config._settings = None
