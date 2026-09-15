import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  evaluateArbitrage,
  ArbitrageInputSchema,
  ArbitrageEvaluationSchema,
} from "@/domain/arbitrage";
import { arbitrageLab, findLab } from "@/domain/arbitrage-lab";
import { networkSnapshot } from "../intelligence/service";
import { ListingSchema } from "@/domain/intelligence";
import { demoDataEnabled } from "../demo-mode";
import {
  realEnvelope,
  refreshDemandEligibility,
  RealEconomicAssumptionsSchema,
} from "@/domain/real-economics";
import { getUsdcUsdObservation } from "../economics/fx";
import { FxObservationSchema } from "@/domain/fx";
import {
  ClaimReadinessCoreSchema,
  ClaimReadinessPacketSchema,
} from "@/domain/claim-readiness";

export const OpportunityQuerySchema = z
  .object({
    mode: z.enum(["observed", "lab"]).default("observed"),
    query: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();
export const OpportunitiesResponseSchema = z
  .object({
    version: z.literal("2.0"),
    mode: z.enum(["observed", "lab"]),
    records: z.array(ListingSchema).max(20),
    observedSupplyCount: z.number().int().nonnegative(),
    matchedCount: z.number().int().nonnegative().optional(),
    truncated: z.boolean().optional(),
    executionStatus: z.literal("execution_not_enabled"),
  })
  .strict();
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return (
      "[" +
      value.map((item) => canonicalJson(item === undefined ? null : item)).join(",") +
      "]"
    );
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
        .join(",") +
      "}"
    );
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("canonical_json_unsupported");
  return serialized;
}
export const hashReceipt = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");
export const EconomicEvidenceSchema = z
  .object({
    observed: z
      .object({
        marketplaceSource: z.string(),
        opportunityId: z.string(),
        sourceObservedAt: z.string().datetime(),
        rewardUsdcBaseUnits: z.string().nullable(),
        requiredSpendUsdcBaseUnits: z.string().nullable(),
        refundableBondUsdcBaseUnits: z.string().nullable(),
        deadline: z.string().nullable(),
        eligibility: z.string(),
        provenance: z.literal("observed_source"),
      })
      .strict(),
    published: z
      .object({ providerPricing: z.unknown().nullable(), provenance: z.enum(["published_provider_price", "unknown"]) })
      .strict(),
    marketObservation: z
      .object({ fx: z.unknown().nullable(), provenance: z.enum(["observed_market_rate", "user_scenario", "unknown"]) })
      .strict(),
    userAssumptions: z.record(z.string(), z.unknown()),
    derived: z.record(z.string(), z.unknown()),
    unknown: z.array(z.string()),
  })
  .strict();
export const ReceiptCoreSchema = z
  .object({
    receiptSchemaVersion: z.literal("2.0"),
    economicModelVersion: z.literal("real-economics/1.1").nullable(),
    policyVersion: z.literal("arbitrage-policy/1.0"),
    evaluation: ArbitrageEvaluationSchema,
    economicEvidence: EconomicEvidenceSchema.nullable(),
    claimReadinessCore: ClaimReadinessCoreSchema.nullable(),
    calculationMetadata: z
      .object({
        canonicalization: z.literal("canonical-json-v2"),
        monetaryUnit: z.literal("USD_MICROS"),
        snapshotVersion: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export const ArbitrageReceiptSchema = ReceiptCoreSchema.extend({
    receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
    hashAlgorithm: z.literal("SHA-256/canonical-json-v2"),
    claimReadiness: ClaimReadinessPacketSchema.optional(),
    receiptFingerprintIsSignature: z.literal(false).default(false),
  }).strict();
export function receiptCoreOf(
  receipt: z.infer<typeof ArbitrageReceiptSchema>,
): z.infer<typeof ReceiptCoreSchema> {
  return ReceiptCoreSchema.parse({
    receiptSchemaVersion: receipt.receiptSchemaVersion,
    economicModelVersion: receipt.economicModelVersion,
    policyVersion: receipt.policyVersion,
    evaluation: receipt.evaluation,
    economicEvidence: receipt.economicEvidence,
    claimReadinessCore: receipt.claimReadinessCore,
    calculationMetadata: receipt.calculationMetadata,
  });
}
export async function searchOpportunities(raw: unknown) {
  const q = OpportunityQuerySchema.parse(raw);
  if (q.mode === "lab" && !demoDataEnabled()) throw new Error("not_found");
  const network = await networkSnapshot();
  const records =
    q.mode === "lab"
      ? arbitrageLab.map((f) => f.opportunity)
      : network.records.filter(
          (l) =>
            l.listingType === "task_opportunity" &&
            ["live", "cached_live"].includes(l.freshness),
        );
  return OpportunitiesResponseSchema.parse({
    version: "2.0",
    mode: q.mode,
    matchedCount: records.filter(
      (l) =>
        !q.query ||
        JSON.stringify(l).toLowerCase().includes(q.query.toLowerCase()),
    ).length,
    truncated:
      records.filter(
        (l) =>
          !q.query ||
          JSON.stringify(l).toLowerCase().includes(q.query.toLowerCase()),
      ).length > q.limit,
    records: records
      .filter(
        (l) =>
          !q.query ||
          JSON.stringify(l).toLowerCase().includes(q.query.toLowerCase()),
      )
      .slice(0, q.limit),
    observedSupplyCount: network.records.filter(
      (l) =>
        l.listingType === "service_offer" &&
        ["live", "cached_live"].includes(l.freshness),
    ).length,
    executionStatus: "execution_not_enabled",
  });
}
export async function underwriteOpportunity(raw: unknown) {
  const input = ArbitrageInputSchema.parse(raw),
    network = await networkSnapshot(),
    lab = demoDataEnabled() ? findLab(input.opportunityId) : undefined;
  const task =
    lab?.opportunity ??
    network.records.find(
      (l) =>
        l.id === input.opportunityId && l.listingType === "task_opportunity",
    );
  if (!task) throw new Error("not_found");
  const snapshotVersion = hashReceipt(
    network.sources.map((s) => ({
      id: s.connectorId,
      observed: s.lastSuccessAt ?? null,
    })),
  );
  const evaluation = evaluateArbitrage(task, input, {
    lab: lab?.specification,
    supply: network.records.filter((l) => l.listingType === "service_offer"),
    now: new Date().toISOString(),
    snapshotVersion,
  });
  if (task.listingType === "task_opportunity" && task.demandState) {
    const state = refreshDemandEligibility(task.demandState, task.deadline);
    evaluation.opportunity = { ...task, demandState: state };
    // The legacy payout is denominated in USD cents. A user scenario cannot
    // replace the observed USDC reward or make its USD conversion "exact".
    // Preserve the submitted scenario for audit, but keep real economics separate.
    evaluation.payout = {
      amountCents: null,
      provenance: "unknown",
      confidence: "unknown",
    };
    evaluation.economicProvenance = "incomplete";
    const supported =
      state.capabilityStatus === "source_mapped" &&
      task.requiredCapabilities.length > 0 &&
      task.requiredCapabilities.every((c) =>
        ["data_extract", "synthesis"].includes(c),
      );
    const scenario = input.scenario
      ? RealEconomicAssumptionsSchema.parse({
          successProbabilityBps: input.scenario.successProbabilityBps,
          workload: input.scenario.workload,
          platformFeeUsdMicros: input.scenario.platformFeeUsdMicros,
          proofGasFeeUsdMicros: input.scenario.proofGasFeeUsdMicros,
          humanReviewCostUsdMicros: input.scenario.humanReviewCostUsdMicros,
          additionalFulfillmentCostUsdMicros:
            input.scenario.additionalFulfillmentCostUsdMicros,
          timeValueCostUsdMicros: input.scenario.timeValueCostUsdMicros,
          competitionRiskAdjustmentUsdMicros:
            input.scenario.competitionRiskAdjustmentUsdMicros,
          bondLossProbabilityBps: input.scenario.bondLossProbabilityBps,
          fxRateMicros: input.scenario.fxRateMicros,
        })
      : {};
    const observedFx = scenario.fxRateMicros
      ? FxObservationSchema.parse({
          baseCurrency: "USDC",
          quoteCurrency: "USD",
          rateMicros: scenario.fxRateMicros,
          observedAt: new Date().toISOString(),
          validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          source: "Operator scenario",
          sourceUrl: null,
          provenance: "user_scenario",
        })
      : await getUsdcUsdObservation();
    evaluation.realEconomics = realEnvelope(state, scenario, observedFx, supported);
    evaluation.decision = state.eligibility === "not_eligible"
      ? "not_eligible"
      : state.eligibility === "unknown"
        ? "insufficient_data"
        : !supported
          ? "unroutable"
          : "insufficient_data";
    const derived = evaluation.realEconomics.derived;
    if (
      state.eligibility === "source_ready" &&
      supported &&
      derived.expectedProfitUsdMicros !== null &&
      derived.expectedMarginBps !== null &&
      derived.riskAdjustedExpectedValueUsdMicros !== null
    ) {
      const minimumProfitMicros =
        BigInt(input.policy.minimumExpectedProfitCents) * 10_000n;
      const expectedProfit = BigInt(derived.expectedProfitUsdMicros);
      const riskAdjusted = BigInt(derived.riskAdjustedExpectedValueUsdMicros);
      evaluation.decision =
        expectedProfit < 0n || riskAdjusted < 0n
          ? "conditionally_uneconomic"
          : expectedProfit < minimumProfitMicros ||
              derived.expectedMarginBps < input.policy.minimumMarginBps
            ? "conditionally_marginal"
            : "conditionally_profitable";
      evaluation.economicProvenance = "conditional_real_inputs";
    }
    const expired = task.deadline && Date.parse(task.deadline) <= Date.now();
    if (expired) evaluation.decision = "unroutable";
    const missingInputs = [
      ...new Set([
        ...evaluation.missingInputs.filter(
          (reason) => reason !== "payout_unknown",
        ),
        ...evaluation.realEconomics.missingInputs,
        ...(state.reward
          ? evaluation.realEconomics.fx
            ? []
            : ["payout_USD_conversion_unknown"]
          : ["payout_unknown"]),
        ...state.eligibilityReasons.filter((reason) =>
          reason.endsWith("_unknown"),
        ),
        ...(supported ? [] : ["requirements_not_supported"]),
      ]),
    ];
    evaluation.reasons = [
      ...new Set([
        ...evaluation.reasons
          .filter(
            (reason) =>
              !(
                reason === "payout_unknown" &&
                state.reward &&
                evaluation.realEconomics?.fx
              ),
          )
          .map((reason) =>
            reason === "payout_unknown" && state.reward
              ? "payout_USD_conversion_unknown"
              : reason,
          ),
        ...state.eligibilityReasons,
        ...(expired ? ["deadline_expired"] : []),
        ...(supported ? [] : ["requirements_not_supported"]),
        ...missingInputs,
        ...(input.scenario?.payoutCents !== undefined
          ? ["USD_payout_scenario_not_applied_to_observed_reward"]
          : []),
        ...(evaluation.decision.startsWith("conditionally_")
          ? ["conditional_on_explicit_operator_assumptions"]
          : []),
      ]),
    ];
    evaluation.missingInputs = missingInputs;
  }
  const economicEvidence = evaluation.realEconomics
    ? EconomicEvidenceSchema.parse({
        observed: {
          marketplaceSource: evaluation.opportunity.sourceName,
          opportunityId: evaluation.opportunityId,
          sourceObservedAt: evaluation.opportunity.observedAt,
          rewardUsdcBaseUnits: evaluation.realEconomics.rewardUsdcBaseUnits,
          requiredSpendUsdcBaseUnits:
            evaluation.realEconomics.knownExternalSpendUsdcBaseUnits,
          refundableBondUsdcBaseUnits:
            evaluation.realEconomics.refundableBondUsdcBaseUnits,
          deadline: evaluation.opportunity.deadline ?? null,
          eligibility:
            evaluation.opportunity.demandState?.eligibility ?? "unknown",
          provenance: "observed_source",
        },
        published: {
          providerPricing: evaluation.realEconomics.providerPricing,
          provenance: evaluation.realEconomics.providerPricing
            ? "published_provider_price"
            : "unknown",
        },
        marketObservation: {
          fx: evaluation.realEconomics.fx,
          provenance: evaluation.realEconomics.fx?.provenance ?? "unknown",
        },
        userAssumptions: evaluation.realEconomics.assumptions,
        derived: evaluation.realEconomics.derived,
        unknown: evaluation.realEconomics.missingInputs,
      })
    : null;
  const readinessCore = evaluation.realEconomics
    ? ClaimReadinessCoreSchema.parse({
        schemaVersion: "1.1",
        opportunityId: evaluation.opportunityId,
        sourceUrl: evaluation.opportunity.sourceUrl,
        sourceObservedAt: evaluation.opportunity.observedAt,
        deadline: evaluation.opportunity.deadline ?? null,
        requiredCapabilities: evaluation.opportunity.requiredCapabilities,
        evidenceRequirements:
          evaluation.opportunity.demandState?.evidenceRequirements ?? "",
        currentEligibility:
          evaluation.opportunity.demandState?.eligibility ?? "unknown",
        economicAssumptions: input.scenario
          ? RealEconomicAssumptionsSchema.parse({
              successProbabilityBps: input.scenario.successProbabilityBps,
              workload: input.scenario.workload,
              platformFeeUsdMicros: input.scenario.platformFeeUsdMicros,
              proofGasFeeUsdMicros: input.scenario.proofGasFeeUsdMicros,
              humanReviewCostUsdMicros: input.scenario.humanReviewCostUsdMicros,
              additionalFulfillmentCostUsdMicros:
                input.scenario.additionalFulfillmentCostUsdMicros,
              timeValueCostUsdMicros: input.scenario.timeValueCostUsdMicros,
              competitionRiskAdjustmentUsdMicros:
                input.scenario.competitionRiskAdjustmentUsdMicros,
              bondLossProbabilityBps: input.scenario.bondLossProbabilityBps,
              fxRateMicros: input.scenario.fxRateMicros,
            })
          : {},
        expectedCostUsdMicros:
          evaluation.realEconomics.derived.totalExpectedCostUsdMicros,
        worstCaseProviderCostUsdMicros:
          evaluation.realEconomics.worstCaseProviderCostUsdMicros,
        expectedTotalCostUsdMicros:
          evaluation.realEconomics.derived.totalExpectedCostUsdMicros,
        worstCaseTotalCostUsdMicros:
          evaluation.realEconomics.derived.worstCaseTotalCostUsdMicros,
        worstCaseCompleteness:
          evaluation.realEconomics.derived.worstCaseCompleteness,
        capitalRequiredUsdMicros:
          evaluation.realEconomics.derived.capitalRequiredUsdMicros,
        refundableBondUsdMicros:
          evaluation.realEconomics.derived.refundableBondUsdMicros,
        bondAtRiskUsdMicros:
          evaluation.realEconomics.derived.bondAtRiskUsdMicros,
        economicDecision: evaluation.decision,
        missingInputs: evaluation.missingInputs,
        policyVersion: "arbitrage-policy/1.0",
        claimAuthorized: false,
        authorizationState: "authorization_required",
        executionStatus: "execution_not_enabled",
        servicesCalled: false,
        paymentsMade: false,
      })
    : null;
  const receiptCore = ReceiptCoreSchema.parse({
    receiptSchemaVersion: "2.0",
    economicModelVersion: evaluation.realEconomics
      ? "real-economics/1.1"
      : null,
    policyVersion: "arbitrage-policy/1.0",
    evaluation,
    economicEvidence,
    claimReadinessCore: readinessCore,
    calculationMetadata: {
      canonicalization: "canonical-json-v2",
      monetaryUnit: "USD_MICROS",
      snapshotVersion,
    },
  });
  const receiptHash = hashReceipt(receiptCore);
  const readiness = readinessCore
    ? ClaimReadinessPacketSchema.parse({ ...readinessCore, receiptHash })
    : undefined;
  return ArbitrageReceiptSchema.parse({
    ...receiptCore,
    receiptHash,
    hashAlgorithm: "SHA-256/canonical-json-v2",
    claimReadiness: readiness,
    receiptFingerprintIsSignature: false,
  });
}
