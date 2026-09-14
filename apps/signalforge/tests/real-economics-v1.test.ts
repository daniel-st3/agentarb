import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  decimalRateToMicros,
  usdcBaseUnitsToUsdMicros,
  FxObservationSchema,
} from "../src/domain/fx";
import {
  realEnvelope,
  type DemandState,
} from "../src/domain/real-economics";
import {
  currentProviderPrice,
  calculateProviderCostCeiling,
  providerPricingStatus,
} from "../src/domain/provider-pricing";
import {
  sharedStatePrefix,
  signalForgeEnvironment,
} from "../src/server/environment";
import { RedisSnapshotCache } from "../src/server/intelligence/cache";
import {
  fetchCoinbaseFxObservation,
  RedisFxObservationCache,
} from "../src/server/economics/fx";
import { ClaimReadinessPacketSchema } from "../src/domain/claim-readiness";
import { rateLimitPrefix } from "../src/server/planning-limit";
import { agentCard } from "../src/domain/discovery-card";
import { toolNames } from "../src/server/mcp";

const now = Date.parse("2026-09-14T12:00:00.000Z");
const amount = (value: string) => ({
  amount: value,
  currency: "USDC" as const,
  unit: "base_units" as const,
  decimals: 6 as const,
});
const state: DemandState = {
  sourceType: "canonical_base",
  workState: "claimable",
  paymentState: "escrowed",
  paymentCommitted: true,
  reward: amount("3000001"),
  refundableBond: amount("100001"),
  requiredExternalSpend: amount("110001"),
  verificationReady: true,
  verifier: "deterministic",
  evidenceRequirements: "{}",
  evidenceBoundary: "source projection",
  competitionMode: "exclusive_claim",
  deadlineKind: "submission_deadline",
  scoringEndsAt: null,
  participationPhase: null,
  standingMetaBounty: false,
  capabilityStatus: "source_mapped",
  eligibility: "source_ready",
  eligibilityReasons: [],
  projectionGeneratedAt: new Date(now).toISOString(),
  provenance: "observed_source",
};
const fx = FxObservationSchema.parse({
  baseCurrency: "USDC",
  quoteCurrency: "USD",
  rateMicros: "1000000",
  observedAt: new Date(now).toISOString(),
  validUntil: new Date(now + 600_000).toISOString(),
  source: "test observation",
  sourceUrl: "https://example.com/fx",
  provenance: "observed_market_rate",
});
const complete = {
  successProbabilityBps: 9000,
  workload: { maxInputTokens: 1000, maxOutputTokens: 1000, boundedCalls: 2 },
  platformFeeUsdMicros: "0",
  proofGasFeeUsdMicros: "0",
  humanReviewCostUsdMicros: "0",
  additionalFulfillmentCostUsdMicros: "0",
  timeValueCostUsdMicros: "0",
  competitionRiskAdjustmentUsdMicros: "0",
  bondLossProbabilityBps: 1000,
};

describe("trusted Redis namespaces", () => {
  it("isolates production and preview keys for every shared purpose", async () => {
    expect(sharedStatePrefix("catalog", "v3", { SIGNALFORGE_ENV: "preview" })).toBe("sf:preview:catalog:v3");
    expect(sharedStatePrefix("limit", "v3", { SIGNALFORGE_ENV: "production" })).toBe("sf:production:limit:v3");
    expect(rateLimitPrefix("underwriting", { SIGNALFORGE_ENV: "preview" })).toBe("sf:preview:limit:v3:underwriting");
    expect(rateLimitPrefix("underwriting", { SIGNALFORGE_ENV: "production" })).toBe("sf:production:limit:v3:underwriting");
    expect(sharedStatePrefix("model-admission", "v3", { SIGNALFORGE_ENV: "preview" })).toBe("sf:preview:model-admission:v3");
    expect(sharedStatePrefix("fx", "v3", { SIGNALFORGE_ENV: "production" })).toBe("sf:production:fx:v3");
    const calls: string[] = [];
    const redis = {
      get: vi.fn(async (key: string) => { calls.push(key); return null; }),
      set: vi.fn(async (key: string) => { calls.push(key); return "OK"; }),
    };
    const preview = new RedisSnapshotCache(redis as never, { SIGNALFORGE_ENV: "preview" });
    const production = new RedisSnapshotCache(redis as never, { SIGNALFORGE_ENV: "production" });
    await preview.get("agentbounties");
    await production.get("agentbounties");
    await preview.lease("refresh", 20);
    await production.lease("refresh", 20);
    await preview.lease("slot", 20, "model-admission");
    await production.lease("slot", 20, "model-admission");
    expect(calls).toEqual([
      "sf:preview:catalog:v3:agentbounties",
      "sf:production:catalog:v3:agentbounties",
      "sf:preview:catalog:v3:lease:refresh",
      "sf:production:catalog:v3:lease:refresh",
      "sf:preview:model-admission:v3:lease:slot",
      "sf:production:model-admission:v3:lease:slot",
    ]);
  });
  it("isolates actual FX cache and lease operations", async () => {
    const calls: string[] = [];
    const redis = {
      get: vi.fn(async (key: string) => { calls.push(key); return null; }),
      set: vi.fn(async (key: string) => { calls.push(key); return "OK"; }),
    };
    const preview = new RedisFxObservationCache(redis as never, { SIGNALFORGE_ENV: "preview" });
    const production = new RedisFxObservationCache(redis as never, { SIGNALFORGE_ENV: "production" });
    await preview.get(now);
    await production.get(now);
    await preview.lease();
    await production.lease();
    expect(calls).toEqual([
      "sf:preview:fx:v3:USDC-USD",
      "sf:production:fx:v3:USDC-USD",
      "sf:preview:fx:v3:USDC-USD:lease",
      "sf:production:fx:v3:USDC-USD:lease",
    ]);
  });
  it("fails closed for unknown hosted environments", () => {
    expect(() => signalForgeEnvironment({ VERCEL: "1", VERCEL_ENV: "staging" })).toThrow("signalforge_environment_invalid");
    expect(() => signalForgeEnvironment({ VERCEL: "1" })).toThrow("signalforge_environment_missing");
  });
});

describe("FX and reviewed pricing", () => {
  it("uses exact decimal conversion and conservative rounding", () => {
    expect(decimalRateToMicros("0.999999")).toBe("999999");
    expect(decimalRateToMicros("1.0000001")).toBeNull();
    expect(usdcBaseUnitsToUsdMicros("1", "999999", "floor")).toBe("0");
    expect(usdcBaseUnitsToUsdMicros("1", "999999", "ceil")).toBe("1");
  });
  it("accepts only bounded JSON from the fixed Coinbase response", async () => {
    const observed = await fetchCoinbaseFxObservation(
      vi.fn(async () => new Response(JSON.stringify({ data: { amount: "0.999876", base: "USDC", currency: "USD" } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
      now,
    );
    expect(observed).toMatchObject({ rateMicros: "999876", provenance: "observed_market_rate" });
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })) as typeof fetch, now)).rejects.toThrow();
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch, now)).rejects.toThrow("fx_content_type_invalid");
    for (const mime of ["text/application/json", "application/jsonp"]) {
      await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": mime } })) as typeof fetch, now)).rejects.toThrow("fx_content_type_invalid");
    }
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch, now)).rejects.toThrow("fx_payload_invalid");
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response(JSON.stringify({ data: { amount: "1", base: "BTC", currency: "USD" } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch, now)).rejects.toThrow();
  });
  it("enforces the FX byte limit while streaming and cancels excess input", async () => {
    const payload = JSON.stringify({ data: { amount: "1", base: "USDC", currency: "USD" } });
    const atLimit = payload + " ".repeat(16_384 - new TextEncoder().encode(payload).byteLength);
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response(atLimit, { headers: { "content-type": "application/json" } })) as typeof fetch, now)).resolves.toMatchObject({ rateMicros: "1000000" });
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16_384));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() { cancelled = true; },
    });
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => new Response(stream, { headers: { "content-type": "application/json" } })) as typeof fetch, now)).rejects.toThrow("fx_payload_too_large");
    expect(cancelled).toBe(true);
  });
  it("fails safely when the FX request times out", async () => {
    await expect(fetchCoinbaseFxObservation(vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }) as typeof fetch, now)).rejects.toThrow();
  });
  it("expires reviewed provider pricing instead of guessing", () => {
    const price = currentProviderPrice("Groq", "openai/gpt-oss-20b", now);
    expect(price?.provenance).toBe("published_provider_price");
    expect(calculateProviderCostCeiling(complete.workload, price!)).toBe("750");
    expect(currentProviderPrice("Groq", "openai/gpt-oss-20b", Date.parse("2030-01-01"))).toBeNull();
    expect(providerPricingStatus("Groq", "openai/gpt-oss-20b", now)).toBe("current");
    expect(providerPricingStatus("Groq", "openai/gpt-oss-20b", Date.parse("2026-10-10"))).toBe("expiring_soon");
    expect(providerPricingStatus("Groq", "openai/gpt-oss-20b", Date.parse("2026-10-15"))).toBe("expired");
    expect(providerPricingStatus("Unknown", "none", now)).toBe("unknown");
  });
});

describe("conditional economics", () => {
  it("computes exact conditional EV and keeps bond separate from guaranteed spend", () => {
    const result = realEnvelope(state, complete, fx, true, now);
    expect(result.missingInputs).toEqual([]);
    expect(result.derived).toMatchObject({
      grossRewardUsdMicros: "3000001",
      knownExternalSpendUsdMicros: "110001",
      providerCostCeilingUsdMicros: "750",
      expectedFailureCostUsdMicros: "10001",
      totalExpectedCostUsdMicros: "120752",
      expectedProfitUsdMicros: "2879249",
      riskAdjustedExpectedValueUsdMicros: "2579248",
      capitalRequiredUsdMicros: "210752",
      refundableBondUsdMicros: "100001",
      bondAtRiskUsdMicros: "100001",
      worstCaseTotalCostUsdMicros: "210752",
      worstCaseCompleteness: "complete",
    });
  });
  it("never labels a partial downside envelope as a complete worst case", () => {
    const result = realEnvelope(state, { ...complete, bondLossProbabilityBps: undefined }, fx, true, now);
    expect(result.derived.worstCaseTotalCostUsdMicros).toBeNull();
    expect(result.derived.worstCaseCompleteness).toBe("partial");
    expect(result.derived.bondAtRiskUsdMicros).toBeNull();
    expect(result.derived.refundableBondUsdMicros).toBe("100001");
  });
  it("never combines currencies or invents probability", () => {
    const withoutFx = realEnvelope(state, complete, null, true, now);
    expect(withoutFx.derived.expectedProfitUsdMicros).toBeNull();
    expect(withoutFx.missingInputs).toContain("USDC_USD_fx_rate");
    const withoutProbability = realEnvelope(state, { ...complete, successProbabilityBps: undefined }, fx, true, now);
    expect(withoutProbability.derived.riskAdjustedExpectedValueUsdMicros).toBeNull();
    expect(withoutProbability.missingInputs).toContain("success_probability");
  });
  it("handles zero probability and never counts refundable bond as spend", () => {
    const result = realEnvelope(state, { ...complete, successProbabilityBps: 0, bondLossProbabilityBps: 0 }, fx, true, now);
    expect(result.derived.totalExpectedCostUsdMicros).toBe("110751");
    expect(result.derived.riskAdjustedExpectedValueUsdMicros).toBe("-110751");
    expect(result.derived.breakEvenRewardUsdMicros).toBeNull();
  });
});

it("claim-readiness schema cannot authorize claim or execution", () => {
  const base = {
    schemaVersion: "1.1",
    opportunityId: "agentbounties:test",
    sourceUrl: "https://agentbounties.app/test",
    sourceObservedAt: new Date(now).toISOString(),
    deadline: null,
    requiredCapabilities: ["data_extract"],
    evidenceRequirements: "{}",
    currentEligibility: "source_ready",
    economicAssumptions: complete,
    expectedCostUsdMicros: "1",
    worstCaseProviderCostUsdMicros: "1",
    expectedTotalCostUsdMicros: "1",
    worstCaseTotalCostUsdMicros: "2",
    worstCaseCompleteness: "complete",
    capitalRequiredUsdMicros: "3",
    refundableBondUsdMicros: "2",
    bondAtRiskUsdMicros: "2",
    economicDecision: "conditionally_profitable",
    missingInputs: [],
    receiptHash: "a".repeat(64),
    policyVersion: "arbitrage-policy/1.0",
    claimAuthorized: false,
    authorizationState: "authorization_required",
    executionStatus: "execution_not_enabled",
    servicesCalled: false,
    paymentsMade: false,
  };
  expect(ClaimReadinessPacketSchema.parse(base).claimAuthorized).toBe(false);
  expect(ClaimReadinessPacketSchema.safeParse({ ...base, claimAuthorized: true }).success).toBe(false);
});

it("publishes claim readiness through read-only machine surfaces", () => {
  expect(toolNames).toContain("signalforge_get_claim_readiness");
  expect(agentCard["x-signalforge"].api.claimReadiness).toBe(
    "/api/v1/opportunities/claim-readiness",
  );
  expect(agentCard["x-signalforge"].executionBoundary).toContain(
    "execution_not_enabled",
  );
});
