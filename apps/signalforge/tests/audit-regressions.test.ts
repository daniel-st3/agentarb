import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
import {
  parseAgentBounties,
  agentBountiesDefinition,
} from "../src/server/intelligence/connectors/agent-bounties";
import { refreshDemandEligibility } from "../src/domain/real-economics";
import { createConnector } from "../src/server/intelligence/service";
import { MemorySnapshotCache } from "../src/server/intelligence/cache";
import * as intelligence from "../src/server/intelligence/service";
import { underwriteOpportunity } from "../src/server/arbitrage/service";

const at = "2026-09-08T12:00:00.000Z";
const amount = {
  amount: "3000000",
  currency: "USDC",
  unit: "base_units",
  decimals: 6,
};
const item = {
  opportunity_id: "audit",
  source_type: "canonical_base",
  title: "Extract supplied text",
  skills: ["data_extract"],
  public_url: "https://agentbounties.app/bounty.html",
  work_state: "claimable",
  payment_state: "escrowed",
  payment_committed: true,
  competition_mode: "exclusive_claim",
  standing_meta_bounty: false,
  verification_method: "deterministic",
  verification_ready: true,
  evidence_requirements: {
    scoring_window: { ends_at: "2026-09-08T12:05:00Z" },
  },
  evidence_boundary: "Source projection only",
  reward: amount,
  deadline: "2026-10-01T00:00:00Z",
  deadline_kind: "submission_deadline",
  created_at: at,
  updated_at: at,
};
const projection = (overrides = {}, generatedAt = at) => ({
  schema_version: "test",
  generated_at: generatedAt,
  network: "base-mainnet",
  degraded: false,
  items: [{ ...item, ...overrides }],
  evidence_boundary: "Source projection only",
});
const feed = () =>
  Response.json(
    {
      version: "https://jsonfeed.org/version/1.1",
      items: [{ id: "audit" }],
    },
    { headers: { etag: '"audit-v1"' } },
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
  vi.stubEnv("DISCOVERY_MODE", "live");
  vi.stubEnv("ENABLE_DEMO_DATA", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("does not certify partial capability mappings as a complete supported scope", () => {
  const task = parseAgentBounties(
    projection({ skills: ["data_extract", "physical_delivery"] }),
    at,
  )[0];
  expect(task.requiredCapabilities).toEqual(["data_extract"]);
  expect(task.demandState).toMatchObject({
    capabilityStatus: "unknown",
    eligibility: "unknown",
  });
  expect(task.demandState!.eligibilityReasons).toContain(
    "requirements_unknown",
  );
  const known = parseAgentBounties(
    projection({ skills: ["data_extract", "data_extract"] }),
    at,
  )[0];
  expect(known.demandState!.capabilityStatus).toBe("source_mapped");
});

it("rechecks scoring expiry on cached reads before a new source poll is due", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(feed())
    .mockResolvedValueOnce(Response.json(projection()));
  const connector = createConnector(
    agentBountiesDefinition,
    new MemorySnapshotCache(),
    fetcher,
  );
  const initial = await connector.discover({ limit: 30 });
  expect(
    initial.records[0].listingType === "task_opportunity" &&
      initial.records[0].demandState!.eligibility,
  ).toBe("source_ready");
  vi.setSystemTime(new Date("2026-09-08T12:06:00Z"));
  const cached = await connector.discover({ limit: 30 });
  const task = cached.records[0];
  expect(
    task.listingType === "task_opportunity" &&
      task.demandState!.eligibilityReasons,
  ).toContain("scoring_window_closed");
  expect(
    task.listingType === "task_opportunity" && task.demandState!.eligibility,
  ).toBe("not_eligible");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(task.observedAt).toBe(at);
});

it("keeps malformed scoring timestamps unknown and applies current deadline expiry", () => {
  const task = parseAgentBounties(
    projection({
      evidence_requirements: { scoring_window: { ends_at: "not-a-date" } },
    }),
    at,
  )[0];
  expect(task.demandState!.eligibility).toBe("unknown");
  expect(task.demandState!.eligibilityReasons).toContain(
    "scoring_window_unknown",
  );
  const expired = refreshDemandEligibility(
    task.demandState!,
    "2026-09-08T12:00:00Z",
    Date.parse(at),
  );
  expect(expired.eligibility).toBe("not_eligible");
  expect(expired.eligibilityReasons).toContain("deadline_expired");
});

it("revalidates recent observations but fetches an expired representation unconditionally", async () => {
  const later = "2026-09-09T12:01:00.000Z";
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(feed())
    .mockResolvedValueOnce(Response.json(projection()))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockResolvedValueOnce(feed())
    .mockResolvedValueOnce(Response.json(projection({}, later)));
  const cache = new MemorySnapshotCache();
  const connector = createConnector(agentBountiesDefinition, cache, fetcher);
  await connector.discover({ limit: 30 });
  vi.setSystemTime(new Date("2026-09-08T12:11:00Z"));
  const validated = await connector.discover({ limit: 30 });
  expect(fetcher.mock.calls[2][1].headers["If-None-Match"]).toBe('"audit-v1"');
  expect(validated.observedAt).toBe(at);
  vi.setSystemTime(new Date(later));
  const renewed = await connector.discover({ limit: 30 });
  expect(fetcher.mock.calls[3][1].headers).not.toHaveProperty("If-None-Match");
  expect(renewed.records).toHaveLength(1);
  expect(renewed.observedAt).toBe(later);
  expect((await cache.get("agentbounties"))!.snapshot!.observedAt).toBe(later);
});

it("does not turn a USD scenario into an exact observed USDC payout", async () => {
  // This regression isolates the legacy USD scenario boundary. A market FX
  // observation would legitimately make the source reward convertible.
  vi.stubEnv("DISCOVERY_MODE", "offline");
  const task = parseAgentBounties(projection(), at)[0];
  vi.spyOn(intelligence, "networkSnapshot").mockResolvedValue({
    version: "1.0",
    records: [task],
    sources: [],
    cacheMode: "shared",
    warnings: [],
    executionStatus: "execution_not_enabled",
  });
  const { evaluation } = await underwriteOpportunity({
    opportunityId: task.id,
    responseVersion: "2.0",
    scenario: { payoutCents: 1000000, successProbabilityBps: 10000 },
    policy: { allowedSourceModes: ["lab"] },
  });
  expect(evaluation.scenario!.payoutCents).toBe(1000000);
  expect(evaluation.payout).toEqual({
    amountCents: null,
    provenance: "unknown",
    confidence: "unknown",
  });
  expect(evaluation.realEconomics!.rewardUsdcBaseUnits).toBe("3000000");
  expect(evaluation.realEconomics!.expectedProfitUsdMicros).toBeNull();
  expect(evaluation.economics.expectedProfitCents).toBeNull();
  expect(evaluation.economicProvenance).toBe("incomplete");
  expect(evaluation.missingInputs).toContain("payout_USD_conversion_unknown");
  expect(evaluation.missingInputs).toContain("source_mode_disallowed");
  expect(evaluation.decision).toBe("insufficient_data");
});

it("returns the same current eligibility in the decision and echoed opportunity", async () => {
  const task = parseAgentBounties(projection(), at)[0];
  vi.spyOn(intelligence, "networkSnapshot").mockResolvedValue({
    version: "1.0",
    records: [task],
    sources: [],
    cacheMode: "shared",
    warnings: [],
    executionStatus: "execution_not_enabled",
  });
  vi.setSystemTime(new Date("2026-09-08T12:06:00Z"));
  const { evaluation } = await underwriteOpportunity({
    opportunityId: task.id,
    responseVersion: "2.0",
  });
  expect(evaluation.decision).toBe("not_eligible");
  expect(evaluation.opportunity.demandState!.eligibility).toBe("not_eligible");
  expect(evaluation.opportunity.demandState!.eligibilityReasons).toContain(
    "scoring_window_closed",
  );
});
