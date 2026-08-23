"""`arbiter` CLI. Week 1 exposes one verb: scan (alert-only)."""

from __future__ import annotations

import asyncio

import typer

from arbiter.config import get_settings
from arbiter.connectors import MockMarketplaceConnector, OpenTaskConnector
from arbiter.db import init_db
from arbiter.logging import configure_logging
from arbiter.pipeline import run_scan
from arbiter.scoring import top_n_within_budget

app = typer.Typer(help="Agent Arbiter -- cross-marketplace bounty router (Week 1: alert-only).")


def _build_connectors(markets: list[str]):
    available = {"opentask": OpenTaskConnector, "mock": MockMarketplaceConnector}
    unknown = set(markets) - available.keys()
    if unknown:
        raise typer.BadParameter(f"unknown marketplace(s): {', '.join(sorted(unknown))}")
    return [available[m]() for m in markets]


@app.command()
def scan(
    market: list[str] = typer.Option(
        ["opentask", "mock"], "--market", "-m", help="Marketplaces to scan."
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


if __name__ == "__main__":
    app()
