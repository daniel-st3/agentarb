"""Agent Arbiter command-line interface."""

from __future__ import annotations

import asyncio
from pathlib import Path

import typer

from arbiter import calibration
from arbiter.config import get_settings
from arbiter.connectors import (
    ExecutionMarketConnector,
    MockMarketplaceConnector,
    OpenTaskConnector,
)
from arbiter.db import init_db
from arbiter.evaluation import (
    DiscoveryOnlyConnector,
    export_evaluations_csv,
    run_offline_evaluation,
)
from arbiter.llm import GroqEstimator, HeuristicEstimator, get_estimator
from arbiter.logging import configure_logging
from arbiter.orchestrator import Orchestrator, pending_tasks
from arbiter.pipeline import run_scan
from arbiter.risk import RiskGuard
from arbiter.scoring import top_n_within_budget

app = typer.Typer(
    help=(
        "Agent Arbiter -- capability-aware cross-marketplace opportunity "
        "intelligence and offline evaluation."
    )
)


def _build_connectors(markets: list[str]):
    available = {
        "opentask": OpenTaskConnector,
        "execution_market": ExecutionMarketConnector,
        "mock": MockMarketplaceConnector,
    }
    unknown = set(markets) - available.keys()
    if unknown:
        raise typer.BadParameter(f"unknown marketplace(s): {', '.join(sorted(unknown))}")
    return [available[m]() for m in markets]


@app.command()
def scan(
    market: list[str] = typer.Option(
        ["opentask", "execution_market", "mock"], "--market", "-m",
        help="Marketplaces to scan.",
    ),
    limit: int = typer.Option(50, help="Max bounties to pull per marketplace."),
    top: int = typer.Option(5, help="How many ranked bounties to print."),
    persist: bool = typer.Option(True, help="Write results to SQLite."),
) -> None:
    """Scan, score, rank, and report. Never claims anything."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    init_db()

    connectors = _build_connectors(market)

    async def _run():
        try:
            return await run_scan(connectors, limit=limit, settings=settings, persist=persist)
        finally:
            for connector in connectors:
                await connector.aclose()

    result = asyncio.run(_run())

    typer.echo("")
    typer.secho(f"Scan {result.run_id}", bold=True)
    typer.echo(
        f"  found {len(result.scored)} · actionable {len(result.actionable)} "
        f"· skipped {len(result.skipped)}"
    )
    for name, error in result.errors.items():
        typer.secho(f"  ! {name}: {error}", fg=typer.colors.RED)

    picks = top_n_within_budget(result.scored, settings.daily_budget_usd, n=top)
    typer.echo("")
    typer.secho(f"Top {len(picks)} within ${settings.daily_budget_usd:.2f} budget:", bold=True)
    if not picks:
        typer.echo("  (nothing cleared the filters)")
    for i, item in enumerate(picks, 1):
        b, s = item.bounty, item.score
        payout = f"${b.payout_usd:.2f}" if b.payout_usd is not None else "?"
        typer.echo(
            f"  {i}. [{b.marketplace}] {b.title[:68]}\n"
            f"     score {s.score:>9.2f} · payout {payout} · net EV ${s.net_ev_usd:.2f} "
            f"· effort {s.est_effort_hours * 60:.0f}m · p_success {s.p_success:.2f}"
        )

    typer.echo("")
    typer.secho("Skip reasons:", bold=True)
    for item in result.skipped[:12]:
        typer.echo(
            f"  - [{item.bounty.marketplace}] {item.bounty.title[:52]}: "
            f"{item.score.skip_reason}"
        )
    if len(result.skipped) > 12:
        typer.echo(f"  ... and {len(result.skipped) - 12} more")
    typer.echo("")


@app.command()
def initdb() -> None:
    """Create the SQLite schema."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    init_db()
    typer.echo(f"initialized {settings.db_path}")


@app.command()
def evaluate(
    marketplace: list[str] = typer.Option(
        ["opentask"], "--marketplace", "-m",
        help="Public marketplaces to discover and evaluate locally.",
    ),
    limit: int = typer.Option(10, min=1, max=100, help="Tasks per marketplace."),
) -> None:
    """Generate local quality evidence from read-only marketplace discovery.

    This command cannot bid, claim, accept, submit, settle, sign, or pay. It
    stores records in the separate evaluation database and labels every row
    OFFLINE_EVALUATION / NOT_SUBMITTED.
    """
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    raw_connectors = _build_connectors(marketplace)
    connectors = [DiscoveryOnlyConnector(connector) for connector in raw_connectors]

    async def _run():
        try:
            return await run_offline_evaluation(
                connectors, limit=limit, settings=settings, persist=True
            )
        finally:
            for connector in connectors:
                await connector.aclose()

    result = asyncio.run(_run())
    typer.echo("")
    typer.secho("OFFLINE EVALUATION · NOT SUBMITTED", bold=True, fg=typer.colors.CYAN)
    typer.echo(f"Run {result.run_id} · {len(result.records)} task(s)")
    typer.echo(f"Stored separately in {settings.evaluation_db_path}")
    typer.echo("")
    for record in result.records:
        status = (
            f"refused ({record.safety_kind})"
            if not record.safety_allowed
            else record.deliverable_state or "no deliverable"
        )
        typer.echo(f"  [{record.marketplace}] {record.title[:68]}")
        typer.echo(
            f"     {record.category} · {status} · provider {record.provider} · "
            f"{record.total_latency_ms:.1f}ms · est. API cost "
            f"${record.estimated_api_cost_usd:.4f}"
        )
        if record.skip_or_refusal_reason:
            typer.echo(f"     reason: {record.skip_or_refusal_reason}")
    typer.echo("")
    typer.echo("Human review status: pending. No marketplace action was taken.")


@app.command("export-evaluations")
def export_evaluations(
    format_: str = typer.Option("csv", "--format", help="Export format (csv)."),
    output: Path = typer.Option(
        Path("data/evaluations.csv"), "--output", "-o", help="Local export path."
    ),
) -> None:
    """Export offline quality reviews; never exports marketplace outcomes."""
    if format_.lower() != "csv":
        raise typer.BadParameter("only csv is currently supported")
    settings = get_settings()
    count = export_evaluations_csv(output, settings)
    typer.secho("OFFLINE EVALUATION · NOT SUBMITTED", bold=True, fg=typer.colors.CYAN)
    typer.echo(f"Exported {count} record(s) to {output}")


if __name__ == "__main__":
    app()


@app.command()
def run(
    market: list[str] = typer.Option(
        ["mock"], "--market", "-m", help="Marketplaces to scan."
    ),
    limit: int = typer.Option(25, help="Max bounties to pull per marketplace."),
    top: int = typer.Option(3, help="How many top bounties to push through the graph."),
) -> None:
    """Scan, score, then run the top bounties up to the human claim gate.

    Stops at the gate. Use `arbiter queue` to see what is waiting and
    `arbiter approve` / `arbiter reject` to decide.
    """
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    init_db()
    connectors = _build_connectors(market)

    async def _run():
        orchestrator = await Orchestrator.create(
            {c.name: c for c in connectors}, settings=settings
        )
        try:
            result = await run_scan(connectors, limit=limit, settings=settings)
            picks = top_n_within_budget(result.scored, settings.daily_budget_usd, n=top)
            started = []
            for item in picks:
                outcome = await orchestrator.start(item.bounty, run_id=result.run_id)
                started.append((item.bounty, outcome))
            return result, started
        finally:
            await orchestrator.aclose()
            for connector in connectors:
                await connector.aclose()

    result, started = asyncio.run(_run())

    typer.echo("")
    typer.secho(f"Scan {result.run_id}", bold=True)
    typer.echo(f"  found {len(result.scored)} · actionable {len(result.actionable)}")
    typer.echo("")
    for bounty, outcome in started:
        if hasattr(outcome, "payload"):
            typer.secho(f"  ⏸  {bounty.key} awaiting approval", fg=typer.colors.YELLOW)
            typer.echo(f"     {bounty.title[:70]}")
        else:
            typer.echo(f"  ·  {bounty.key} finished: {outcome.get('state')}")
    typer.echo("")
    typer.echo("Next: `arbiter queue`, then `arbiter approve <bounty_key>`.")


@app.command()
def queue() -> None:
    """Show bounties waiting at the claim gate."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)

    rows = pending_tasks()
    guard = RiskGuard(settings)
    totals = guard.totals_today()

    typer.echo("")
    typer.secho(
        f"Today (simulated): spent ${totals.spent_usd:.4f} · earned "
        f"${totals.earned_usd:.2f} · net ${totals.net_usd:.2f} · {totals.tasks} tasks",
        bold=True,
    )
    typer.echo("")
    if not rows:
        typer.echo("Approval queue is empty.")
        return
    typer.secho(f"Awaiting approval ({len(rows)}):", bold=True)
    for row in rows:
        payout = f"${row.payout_usd:.2f}" if row.payout_usd is not None else "?"
        typer.echo(f"  {row.bounty_key}  score {row.score:.2f} · payout {payout}")
        typer.echo(f"     {row.title[:72]}")
    typer.echo("")


def _decide(bounty_key: str, approved: bool, approver: str, reason: str | None) -> None:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    market = bounty_key.split(":", 1)[0]
    connectors = _build_connectors([market])

    async def _run():
        orchestrator = await Orchestrator.create(
            {c.name: c for c in connectors}, settings=settings
        )
        try:
            return await orchestrator.resume(bounty_key, approved, approver, reason)
        finally:
            await orchestrator.aclose()
            for connector in connectors:
                await connector.aclose()

    final = asyncio.run(_run())
    typer.echo("")
    if not approved:
        typer.secho(f"Rejected {bounty_key}", fg=typer.colors.YELLOW)
        return
    settlement = final.get("settlement") or {}
    typer.secho(f"Approved {bounty_key}", fg=typer.colors.GREEN, bold=True)
    typer.echo(f"  final state : {final.get('state')}")
    result = final.get("result") or {}
    if result:
        typer.echo(
            f"  handler     : {result.get('handler')} "
            f"({'STUB' if result.get('stubbed') else 'llm'})"
        )
    if settlement:
        typer.echo(
            f"  settlement  : {settlement.get('status')} "
            f"${settlement.get('amount_usd', 0)} "
            f"{'(SIMULATED)' if settlement.get('simulated') else ''}"
        )
    typer.echo("")


@app.command()
def approve(
    bounty_key: str = typer.Argument(..., help="e.g. mock:mock-007"),
    approver: str = typer.Option("cli", help="Who approved."),
) -> None:
    """Approve a bounty at the claim gate and let the loop finish."""
    _decide(bounty_key, True, approver, None)


@app.command()
def reject(
    bounty_key: str = typer.Argument(..., help="e.g. mock:mock-007"),
    approver: str = typer.Option("cli", help="Who rejected."),
    reason: str = typer.Option("", help="Why."),
) -> None:
    """Reject a bounty at the claim gate."""
    _decide(bounty_key, False, approver, reason or None)


@app.command("estimate-check")
def estimate_check(
    market: list[str] = typer.Option(
        ["opentask", "execution_market", "mock"], "--market", "-m"
    ),
    limit: int = typer.Option(4, help="Bounties per marketplace to estimate."),
    compare: bool = typer.Option(
        True, help="Also show the heuristic estimate side by side."
    ),
) -> None:
    """Sanity-check estimator output on real bounties.

    Use this after dropping a Groq key into .env to confirm the LLM's
    numbers look sane next to the deterministic baseline.
    """
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)

    estimator = get_estimator()
    kind = "GROQ" if isinstance(estimator, GroqEstimator) else "HEURISTIC"
    typer.echo("")
    typer.secho(f"Estimator: {kind}", bold=True)
    if kind == "HEURISTIC":
        typer.secho(
            "  (no ARBITER_GROQ_API_KEY set — add one to .env to use the LLM)",
            fg=typer.colors.YELLOW,
        )
    typer.echo("")

    connectors = _build_connectors(market)
    baseline = HeuristicEstimator()

    async def _run():
        rows = []
        try:
            for connector in connectors:
                for bounty in await connector.list_open(limit=limit):
                    live = await estimator.estimate(bounty)
                    base = await baseline.estimate(bounty) if compare else None
                    rows.append((bounty, live, base))
        finally:
            for connector in connectors:
                await connector.aclose()
        return rows

    for bounty, live, base in asyncio.run(_run()):
        payout = f"${bounty.payout_usd:.2f}" if bounty.payout_usd is not None else "?"
        typer.secho(f"[{bounty.marketplace}] {bounty.title[:66]}", bold=True)
        typer.echo(f"   category {bounty.category.value} · payout {payout}")
        typer.echo(
            f"   {kind:9} feas {live['feasibility']:.2f} · p_succ "
            f"{live['p_success']:.2f} · conf {live['confidence']:.2f} · effort "
            f"{live['est_effort_hours'] * 60:.0f}m · cost ${live['est_api_cost_usd']:.3f}"
        )
        if base is not None and kind != "HEURISTIC":
            typer.echo(
                f"   {'baseline':9} feas {base['feasibility']:.2f} · p_succ "
                f"{base['p_success']:.2f} · conf {base['confidence']:.2f} · effort "
                f"{base['est_effort_hours'] * 60:.0f}m · cost ${base['est_api_cost_usd']:.3f}"
            )
        typer.echo(f"   rationale: {live.get('rationale', '')[:150]}")
        typer.echo("")


@app.command()
def calibrate(
    real_only: bool = typer.Option(
        False, "--real-only", help="Exclude simulated (mock) outcomes."
    ),
    backfill: bool = typer.Option(False, help="Derive outcomes from older finished tasks."),
) -> None:
    """Report how well predicted p_success matched what actually happened."""
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    init_db()

    if backfill:
        typer.echo(f"backfilled {calibration.backfill_from_tasks()} outcome(s)")

    scope = False if real_only else None
    summary = calibration.overall(simulated=scope)

    typer.echo("")
    if summary.n == 0:
        typer.secho("No outcomes recorded yet.", fg=typer.colors.YELLOW)
        if real_only:
            typer.echo("  (no real-marketplace outcomes exist — everything so far is simulated)")
        return

    label = "real marketplaces only" if real_only else "all outcomes (incl. simulated)"
    typer.secho(f"Calibration — {label}", bold=True)
    typer.echo(
        f"  n {summary.n} · accepted {summary.accepted} "
        f"({summary.acceptance_rate:.0%}) · brier {summary.brier:.3f} · "
        f"bias {summary.bias:+.3f} → {summary.verdict}"
    )
    typer.echo(
        f"  cost ${summary.total_cost_usd:.4f} · payout ${summary.total_payout_usd:.2f} "
        f"· net ${summary.net_usd:.2f}"
    )
    typer.echo("")
    typer.secho("  Reliability by confidence band:", bold=True)
    for bucket in summary.buckets:
        typer.echo(
            f"    {bucket.label}  n={bucket.n:<3} predicted {bucket.predicted_mean:.2f} "
            f"· actual {bucket.actual_rate:.2f} · gap {bucket.gap:+.2f}"
        )
    typer.echo("")
    typer.secho("  By category:", bold=True)
    for name, c in calibration.by_category(simulated=scope).items():
        rate = f"{c.acceptance_rate:.0%}" if c.acceptance_rate is not None else "—"
        typer.echo(f"    {name:16} n={c.n:<3} acc {rate:<5} brier {c.brier:.3f} · {c.verdict}")
    typer.echo("")
    typer.secho("  By marketplace:", bold=True)
    for name, c in calibration.by_marketplace(simulated=scope).items():
        typer.echo(f"    {name:16} n={c.n:<3} net ${c.net_usd:.2f}")
    typer.echo("")


@app.command()
def markets() -> None:
    """Show what each marketplace connector can actually do."""
    configure_logging("ERROR", False)
    typer.echo("")
    typer.secho("Marketplace capabilities", bold=True)
    typer.echo("")
    for name, cls in {
        "opentask": OpenTaskConnector,
        "execution_market": ExecutionMarketConnector,
        "mock": MockMarketplaceConnector,
    }.items():
        c = cls.capabilities
        ready = "PAID LOOP" if c.supports_autonomous_settle else "discovery only"
        colour = typer.colors.GREEN if c.supports_autonomous_settle else typer.colors.YELLOW
        typer.secho(f"  {name}  [{ready}]", fg=colour, bold=True)
        typer.echo(
            f"     open_claim={c.supports_open_claim} · claim={c.claim_model.value} · "
            f"settlement={c.settlement.value} · accept_gate={c.has_human_accept_gate}"
        )
        typer.echo(f"     {c.notes}")
        typer.echo("")
