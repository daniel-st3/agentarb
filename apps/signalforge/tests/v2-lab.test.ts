import { describe, expect, it } from "vitest";
import {
  normalizeRealLabData,
  simulatedLabData,
} from "../src/components/v2-lab/lab-model";

const at = "2026-09-15T12:00:00.000Z";
const quality = {
  freshnessScore: 1,
  priceConfidence: "exact" as const,
  actionabilityConfidence: "observed" as const,
  sourceTrust: "official" as const,
  warnings: [],
};
const task = (freshness: "live" | "simulated_demo" = "live") => ({
  id: `agentbounties:${freshness}`,
  sourceId: "agentbounties",
  sourceName: "Agent Bounties",
  accessMode: "official_feed" as const,
  freshness,
  observedAt: at,
  sourceUrl: "https://agentbounties.app/opportunities/example",
  executionStatus: "execution_not_enabled" as const,
  dataQuality: quality,
  listingType: "task_opportunity" as const,
  title: "Structure a public company profile",
  description: "Produce a structured public company profile.",
  requiredCapabilities: ["data_extract", "synthesis"] as const,
  payout: {
    amountUsd: undefined,
    currency: "USDC",
    parseConfidence: "exact" as const,
    rawPayoutText: "4 USDC",
  },
  deadline: "2026-12-01T00:00:00.000Z",
  claimModel: "open_claim" as const,
  settlement: "escrow" as const,
  actionability: "open_claim_observed" as const,
  constraints: [],
  demandState: {
    sourceType: "canonical_base" as const,
    workState: "claimable",
    paymentState: "escrowed",
    paymentCommitted: true,
    reward: { amount: "4000000", currency: "USDC" as const, unit: "base_units" as const, decimals: 6 as const },
    refundableBond: { amount: "100000", currency: "USDC" as const, unit: "base_units" as const, decimals: 6 as const },
    requiredExternalSpend: null,
    verificationReady: true,
    verifier: "source verifier",
    evidenceRequirements: "Structured evidence required",
    evidenceBoundary: "Source projection only",
    competitionMode: "exclusive_claim",
    deadlineKind: "submission_deadline",
    scoringEndsAt: null,
    participationPhase: null,
    standingMetaBounty: false,
    capabilityStatus: "source_mapped" as const,
    eligibility: "source_ready" as const,
    eligibilityReasons: [],
    projectionGeneratedAt: at,
    provenance: "observed_source" as const,
  },
});
const service = (freshness: "cached_live" | "simulated_demo" = "cached_live") => ({
  id: `modelsdev:${freshness}`,
  sourceId: "modelsdev",
  sourceName: "models.dev",
  accessMode: "official_catalog" as const,
  freshness,
  observedAt: at,
  sourceUrl: "https://models.dev/",
  executionStatus: "execution_not_enabled" as const,
  dataQuality: { ...quality, priceConfidence: "estimated" as const },
  listingType: "service_offer" as const,
  name: "Observed model listing",
  description: "Public model catalog record.",
  capabilities: ["data_extract", "synthesis"] as const,
  providerType: "api" as const,
  pricing: {
    model: "per_token" as const,
    parseConfidence: "estimated" as const,
    rawPriceText: "Published token units",
  },
  access: {
    actionability: "catalog_only" as const,
    requiresApiKey: true,
    requiresWallet: false,
    requiresReputation: false,
    requirementsKnown: true,
    executionEnabled: false as const,
  },
  tags: [],
});

describe("V2 visual lab data boundary", () => {
  it("REAL mode keeps observed economics and never substitutes simulated records", () => {
    const result = normalizeRealLabData(
      {
        records: [task(), task("simulated_demo")],
        matchedCount: 2,
        truncated: false,
        executionStatus: "execution_not_enabled",
      },
      {
        records: [service(), service("simulated_demo")],
        executionStatus: "execution_not_enabled",
      },
    );
    expect(result.subject?.reward).toMatchObject({
      display: "4 USDC",
      provenance: "observed_source",
    });
    expect(result.subject?.externalSpend.display).toBeNull();
    expect(result.subject?.fulfillmentCost.display).toBeNull();
    expect(result.subject?.residualValue.display).toBeNull();
    expect(result.subject?.decision).toBe("insufficient_data");
    expect(result.subject?.options).toHaveLength(1);
    expect(result.subject?.options[0]).toMatchObject({
      executionStatus: "execution_not_enabled",
      reason: "task_cost_unknown",
    });
    expect(result.observations).toHaveLength(1);
  });

  it("UNKNOWN keeps absent values null rather than converting them to zero", () => {
    const subject = simulatedLabData("unknown").subject;
    expect(subject?.stateLabel).toBe("LAB STATE SIMULATION");
    expect(subject?.reward.display).toBeNull();
    expect(subject?.externalSpend.atomicAmount).toBeNull();
    expect(subject?.residualValue.currency).toBeNull();
    expect(JSON.stringify(subject)).not.toContain('"display":"0"');
  });

  it("DEGRADED and EMPTY remain explicit lab-only resilience states", () => {
    const degraded = simulatedLabData("degraded");
    expect(degraded.error).toBe(true);
    expect(degraded.subject?.stateLabel).toBe("LAB STATE SIMULATION");
    expect(degraded.subject?.missing).toContain("source_freshness_expired");
    expect(degraded.subject?.executionStatus).toBe("execution_not_enabled");

    const empty = simulatedLabData("empty");
    expect(empty.subject).toBeNull();
    expect(empty.observations).toEqual([]);
    expect(empty.matchedCount).toBe(0);
  });
});
