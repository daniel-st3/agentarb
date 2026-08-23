"""Domain models (`Bounty`, `Score`) and the SQLite audit tables behind them.

`Bounty` is the normalization target: every connector maps its native payload
into this shape, so the scorer and orchestrator never see marketplace-specific
fields. Capability differences are carried on `MarketplaceCapabilities` rather
than smoothed over -- a push/accept-gated market says so honestly.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field
from sqlmodel import JSON, Column, SQLModel
from sqlmodel import Field as SQLField


def utcnow() -> datetime:
    return datetime.now(UTC)


class Settlement(StrEnum):
    """How money actually moves once work is accepted."""

    ONCHAIN = "onchain"           # platform escrow / contract settles on a chain
    OFFPLATFORM = "offplatform"   # you invoice; platform never custodies funds
    SIMULATED = "simulated"       # mock connector only


class ClaimModel(StrEnum):
    """How a worker gets attached to a bounty."""

    OPEN_CLAIM = "open_claim"     # first-come pull claim
    BID = "bid"                   # submit a pitch/bid, buyer selects
    BUYER_SELECTS = "buyer_selects"  # pure push: buyer hires you


class Category(StrEnum):
    RESEARCH = "research"
    SUMMARIZATION = "summarization"
    SMALL_CODE = "small_code"
    DATA_LOOKUP = "data_lookup"
    UNKNOWN = "unknown"


#: Categories an execution sub-agent exists for. Week 1 has no executors yet,
#: but the skip-filter is written against the eventual handler set.
SUPPORTED_CATEGORIES: frozenset[Category] = frozenset(
    {Category.RESEARCH, Category.SUMMARIZATION, Category.SMALL_CODE, Category.DATA_LOOKUP}
)


class MarketplaceCapabilities(BaseModel):
    """What a marketplace can actually do -- stated, not assumed."""

    name: str
    supports_open_claim: bool
    claim_model: ClaimModel
    settlement: Settlement
    has_human_accept_gate: bool
    supports_autonomous_settle: bool = False
    notes: str = ""


class Bounty(BaseModel):
    """A marketplace task, normalized."""

    marketplace: str
    bounty_id: str
    title: str
    description: str = ""
    category: Category = Category.UNKNOWN
    payout_usd: float | None = None
    payout_text: str = ""
    currency: str | None = None
    deadline: datetime | None = None
    tags: list[str] = Field(default_factory=list)
    url: str | None = None
    posted_at: datetime | None = None
    raw: dict[str, Any] = Field(default_factory=dict)

    @property
    def key(self) -> str:
        """Idempotency key. Claims/submits/settles are keyed by this."""
        return f"{self.marketplace}:{self.bounty_id}"


class Score(BaseModel):
    """Scoring output for one bounty -- every input kept for the audit log."""

    bounty_key: str
    skipped: bool = False
    skip_reason: str | None = None

    # LLM- or heuristic-produced estimates
    feasibility: float = 0.0
    p_success: float = 0.0
    confidence: float = 0.0
    est_effort_hours: float = 0.0
    est_api_cost_usd: float = 0.0
    est_gas_cost_usd: float = 0.0

    # derived
    ev_usd: float = 0.0
    net_ev_usd: float = 0.0
    score: float = 0.0

    estimator: str = "heuristic"
    rationale: str = ""


# --------------------------------------------------------------------------
# Persistence. SQLite is the single source of truth and the audit trail.
# --------------------------------------------------------------------------


class BountyRow(SQLModel, table=True):
    """Latest-seen snapshot of a bounty, upserted by `key`."""

    __tablename__ = "bounties"

    key: str = SQLField(primary_key=True)
    marketplace: str = SQLField(index=True)
    bounty_id: str
    title: str
    description: str = ""
    category: str = Category.UNKNOWN.value
    payout_usd: float | None = None
    payout_text: str = ""
    currency: str | None = None
    deadline: datetime | None = None
    tags: list[str] = SQLField(default_factory=list, sa_column=Column(JSON))
    url: str | None = None
    posted_at: datetime | None = None
    raw: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))
    first_seen_at: datetime = SQLField(default_factory=utcnow)
    last_seen_at: datetime = SQLField(default_factory=utcnow)


class DecisionRow(SQLModel, table=True):
    """Append-only decision log. One row per bounty per scan run."""

    __tablename__ = "decisions"

    id: int | None = SQLField(default=None, primary_key=True)
    run_id: str = SQLField(index=True)
    bounty_key: str = SQLField(index=True)
    marketplace: str = SQLField(index=True)
    title: str = ""
    payout_usd: float | None = None

    action: str = "scored"       # scored | skipped
    skip_reason: str | None = None

    feasibility: float = 0.0
    p_success: float = 0.0
    confidence: float = 0.0
    est_effort_hours: float = 0.0
    est_api_cost_usd: float = 0.0
    est_gas_cost_usd: float = 0.0
    ev_usd: float = 0.0
    net_ev_usd: float = 0.0
    score: float = 0.0
    rank: int | None = None

    estimator: str = "heuristic"
    rationale: str = ""
    created_at: datetime = SQLField(default_factory=utcnow, index=True)


class ScanRow(SQLModel, table=True):
    """One row per scan run, so the dashboard can show run history."""

    __tablename__ = "scans"

    run_id: str = SQLField(primary_key=True)
    started_at: datetime = SQLField(default_factory=utcnow, index=True)
    marketplaces: str = ""
    n_found: int = 0
    n_scored: int = 0
    n_skipped: int = 0


class DeliverableState(StrEnum):
    """How much a produced deliverable can be trusted.

    Strictly ordered. A stub can never rise above SIMULATED, and only a
    deliverable that is both non-stub and validated may become
    SUBMISSION_READY -- see `executors.validation.grade`.
    """

    SIMULATED = "simulated"          # stub content: no LLM ran. Never submittable.
    DRAFT = "draft"                  # real generated content, not yet validated
    VALIDATED = "validated"          # passed the handler's structural checks
    SUBMISSION_READY = "submission_ready"  # validated, non-stub, marketplace accepts it

    @property
    def rank(self) -> int:
        return _DELIVERABLE_ORDER.index(self)


_DELIVERABLE_ORDER: list[DeliverableState] = []


class TaskState(StrEnum):
    """Lifecycle of one claimed bounty."""

    PENDING_APPROVAL = "pending_approval"
    REJECTED = "rejected"
    CLAIMED = "claimed"
    EXECUTING = "executing"
    SUBMITTED = "submitted"
    SETTLED = "settled"
    FAILED = "failed"


_DELIVERABLE_ORDER.extend(
    [
        DeliverableState.SIMULATED,
        DeliverableState.DRAFT,
        DeliverableState.VALIDATED,
        DeliverableState.SUBMISSION_READY,
    ]
)


class TaskRow(SQLModel, table=True):
    """One attempt at one bounty. Keyed by bounty_key for idempotency."""

    __tablename__ = "tasks"

    bounty_key: str = SQLField(primary_key=True)
    run_id: str = SQLField(index=True)
    marketplace: str = SQLField(index=True)
    bounty_id: str
    title: str = ""
    category: str = Category.UNKNOWN.value
    payout_usd: float | None = None
    score: float = 0.0

    state: str = SQLField(default=TaskState.PENDING_APPROVAL.value, index=True)
    approved: bool | None = None          # None = not yet decided
    approved_by: str | None = None
    decided_at: datetime | None = None

    handler: str | None = None
    result: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))
    error: str | None = None
    deliverable_state: str | None = SQLField(default=None, index=True)
    validation_notes: str = ""

    actual_cost_usd: float = 0.0
    settled_amount_usd: float = 0.0
    settlement_ref: str | None = None
    simulated: bool = True

    created_at: datetime = SQLField(default_factory=utcnow, index=True)
    updated_at: datetime = SQLField(default_factory=utcnow)


class LedgerRow(SQLModel, table=True):
    """Append-only money log. Week 2 entries are all simulated."""

    __tablename__ = "ledger"

    id: int | None = SQLField(default=None, primary_key=True)
    bounty_key: str = SQLField(index=True)
    marketplace: str = ""
    kind: str = "credit"                  # credit | debit
    amount_usd: float = 0.0
    reason: str = ""
    reference: str | None = None
    simulated: bool = True
    created_at: datetime = SQLField(default_factory=utcnow, index=True)


class EventRow(SQLModel, table=True):
    """Append-only orchestrator event log -- every node transition."""

    __tablename__ = "events"

    id: int | None = SQLField(default=None, primary_key=True)
    run_id: str = SQLField(index=True)
    bounty_key: str | None = SQLField(default=None, index=True)
    node: str = ""
    message: str = ""
    payload: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = SQLField(default_factory=utcnow, index=True)
