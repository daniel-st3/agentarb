import { z } from "zod";
import { FxObservationSchema, usdcBaseUnitsToUsdMicros } from "./fx";
import {
  calculateProviderCostCeiling,
  currentProviderPrice,
  ProviderPricingSchema,
  REVIEWED_PROVIDER_PRICES,
} from "./provider-pricing";

export const EconomicProvenanceSchema = z.enum([
  "observed_source",
  "published_provider_price",
  "observed_market_rate",
  "estimated_from_live_inputs",
  "actual_usage",
  "user_scenario",
  "unknown",
]);
export const AtomicAmountSchema = z
  .object({
    amount: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
    currency: z.literal("USDC"),
    unit: z.literal("base_units"),
    decimals: z.literal(6),
  })
  .strict();
export const DemandStateSchema = z
  .object({
    sourceType: z.literal("canonical_base"),
    workState: z.string().max(60),
    paymentState: z.string().max(60),
    paymentCommitted: z.boolean(),
    reward: AtomicAmountSchema.nullable(),
    refundableBond: AtomicAmountSchema.nullable(),
    requiredExternalSpend: AtomicAmountSchema.nullable(),
    verificationReady: z.boolean(),
    verifier: z.string().max(300),
    evidenceRequirements: z.string().max(6000),
    evidenceBoundary: z.string().max(2000),
    competitionMode: z.string().max(80),
    deadlineKind: z.string().max(80).nullable(),
    scoringEndsAt: z.string().max(60).nullable(),
    participationPhase: z.string().max(80).nullable(),
    standingMetaBounty: z.boolean(),
    capabilityStatus: z.enum(["source_mapped", "unknown"]),
    eligibility: z.enum(["source_ready", "not_eligible", "unknown"]),
    eligibilityReasons: z.array(z.string().max(120)).max(12),
    projectionGeneratedAt: z.string().datetime(),
    provenance: z.literal("observed_source"),
  })
  .strict();
export type DemandState = z.infer<typeof DemandStateSchema>;

/** Eligibility is time-dependent even when the source representation has not changed. */
export function refreshDemandEligibility(
  state: DemandState,
  deadline: string | undefined,
  now = Date.now(),
): DemandState {
  const temporalReasons = new Set([
    "deadline_unknown",
    "deadline_expired",
    "scoring_window_unknown",
    "scoring_window_closed",
  ]);
  const reasons = state.eligibilityReasons.filter(
    (r) => !temporalReasons.has(r),
  );
  if (!deadline || !Number.isFinite(Date.parse(deadline)))
    reasons.push("deadline_unknown");
  else if (Date.parse(deadline) <= now) reasons.push("deadline_expired");
  if (state.scoringEndsAt !== null) {
    const ends = Date.parse(state.scoringEndsAt);
    if (!Number.isFinite(ends)) reasons.push("scoring_window_unknown");
    else if (ends <= now) reasons.push("scoring_window_closed");
  }
  if (
    state.capabilityStatus === "unknown" &&
    !reasons.includes("requirements_unknown")
  )
    reasons.push("requirements_unknown");
  const unknownReasons = new Set([
    "deadline_unknown",
    "scoring_window_unknown",
    "requirements_unknown",
  ]);
  return {
    ...state,
    eligibilityReasons: reasons,
    eligibility: reasons.some((r) => !unknownReasons.has(r))
      ? "not_eligible"
      : reasons.length
        ? "unknown"
        : "source_ready",
  };
}

export const WorkloadSchema = z
  .object({
    maxInputTokens: z.number().int().min(1).max(32000),
    maxOutputTokens: z.number().int().min(1).max(8000),
    boundedCalls: z.number().int().min(1).max(4),
  })
  .strict();
export const publishedGroqPrice = REVIEWED_PROVIDER_PRICES[0];
export function providerCostCeiling(
  workload: z.infer<typeof WorkloadSchema>,
  now = Date.now(),
) {
  const price = currentProviderPrice("Groq", "openai/gpt-oss-20b", now);
  return price
    ? calculateProviderCostCeiling(WorkloadSchema.parse(workload), price)
    : null;
}
const UsdMicrosSchema = z.string().regex(/^(0|[1-9][0-9]{0,17})$/);
export const RealEconomicAssumptionsSchema = z
  .object({
    successProbabilityBps: z.number().int().min(0).max(10000).optional(),
    workload: WorkloadSchema.optional(),
    platformFeeUsdMicros: UsdMicrosSchema.optional(),
    proofGasFeeUsdMicros: UsdMicrosSchema.optional(),
    humanReviewCostUsdMicros: UsdMicrosSchema.optional(),
    additionalFulfillmentCostUsdMicros: UsdMicrosSchema.optional(),
    timeValueCostUsdMicros: UsdMicrosSchema.optional(),
    competitionRiskAdjustmentUsdMicros: UsdMicrosSchema.optional(),
    bondLossProbabilityBps: z.number().int().min(0).max(10000).optional(),
    fxRateMicros: z.string().regex(/^[1-9][0-9]{0,17}$/).optional(),
  })
  .strict();
export type RealEconomicAssumptions = z.infer<
  typeof RealEconomicAssumptionsSchema
>;

const DerivedEconomicsSchema = z
  .object({
    grossRewardUsdMicros: z.string().nullable(),
    knownExternalSpendUsdMicros: z.string().nullable(),
    providerCostCeilingUsdMicros: z.string().nullable(),
    platformAndVerificationCostUsdMicros: z.string().nullable(),
    humanReviewCostUsdMicros: z.string().nullable(),
    additionalFulfillmentCostUsdMicros: z.string().nullable(),
    timeValueCostUsdMicros: z.string().nullable(),
    competitionRiskAdjustmentUsdMicros: z.string().nullable(),
    expectedFailureCostUsdMicros: z.string().nullable(),
    totalExpectedCostUsdMicros: z.string().nullable(),
    expectedProfitUsdMicros: z.string().regex(/^-?\d+$/).nullable(),
    expectedMarginBps: z.number().int().nullable(),
    riskAdjustedExpectedValueUsdMicros: z
      .string()
      .regex(/^-?\d+$/)
      .nullable(),
    breakEvenRewardUsdMicros: z.string().nullable(),
    maximumFulfillmentCostUsdMicros: z.string().nullable(),
    requiredSuccessProbabilityBps: z.number().int().nullable(),
    capitalRequiredUsdMicros: z.string().nullable(),
  })
  .strict();

const ProvenancedAssumptionSchema = z
  .object({ value: z.union([z.string(), z.number()]).nullable(), provenance: z.enum(["user_scenario", "unknown"]) })
  .strict();
export const RealEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    economicModelVersion: z.literal("real-economics/1.0"),
    phase: z.literal("pre_execution_estimate"),
    knownExternalSpendUsdcBaseUnits: z.string().nullable(),
    refundableBondUsdcBaseUnits: z.string().nullable(),
    rewardUsdcBaseUnits: z.string().nullable(),
    cashHeadroomUsdcBaseUnits: z.string().nullable(),
    cashHeadroomIsProfit: z.literal(false),
    estimatedProviderCostUsdMicros: z.string().nullable(),
    worstCaseProviderCostUsdMicros: z.string().nullable(),
    workload: WorkloadSchema.nullable(),
    workloadProvenance: z.enum(["user_scenario", "unknown"]),
    providerPricing: ProviderPricingSchema.nullable(),
    fx: FxObservationSchema.nullable(),
    assumptions: z
      .object({
        successProbabilityBps: ProvenancedAssumptionSchema,
        maxInputTokens: ProvenancedAssumptionSchema,
        maxOutputTokens: ProvenancedAssumptionSchema,
        boundedCalls: ProvenancedAssumptionSchema,
        platformFeeUsdMicros: ProvenancedAssumptionSchema,
        proofGasFeeUsdMicros: ProvenancedAssumptionSchema,
        humanReviewCostUsdMicros: ProvenancedAssumptionSchema,
        additionalFulfillmentCostUsdMicros: ProvenancedAssumptionSchema,
        timeValueCostUsdMicros: ProvenancedAssumptionSchema,
        competitionRiskAdjustmentUsdMicros: ProvenancedAssumptionSchema,
        bondLossProbabilityBps: ProvenancedAssumptionSchema,
        fxRateMicros: ProvenancedAssumptionSchema,
      })
      .strict(),
    derived: DerivedEconomicsSchema,
    costProvenance: EconomicProvenanceSchema,
    successProbabilityBps: z.number().int().min(0).max(10000).nullable(),
    probabilityProvenance: z.enum(["user_scenario", "unknown"]),
    expectedProfitUsdMicros: z.string().regex(/^-?\d+$/).nullable(),
    riskAdjustedValueUsdMicros: z.string().regex(/^-?\d+$/).nullable(),
    actual: z.null(),
    outcomeObservations: z.literal(0),
    missingInputs: z.array(z.string()),
    executionStatus: z.literal("execution_not_enabled"),
    servicesCalled: z.literal(false),
    paymentsMade: z.literal(false),
  })
  .strict();
export type RealEnvelope = z.infer<typeof RealEnvelopeSchema>;
const assumption = (value: string | number | undefined) => ({
  value: value ?? null,
  provenance: value === undefined ? ("unknown" as const) : ("user_scenario" as const),
});
const ceilDiv = (numerator: bigint, denominator: bigint) =>
  (numerator + denominator - 1n) / denominator;
const floorSigned = (numerator: bigint, denominator: bigint) =>
  numerator / denominator -
  (numerator < 0n && numerator % denominator !== 0n ? 1n : 0n);

export function realEnvelope(
  state: DemandState,
  rawAssumptions: RealEconomicAssumptions = {},
  fx: z.infer<typeof FxObservationSchema> | null = null,
  supported = false,
  now = Date.now(),
): RealEnvelope {
  const assumptions = RealEconomicAssumptionsSchema.parse(rawAssumptions);
  const workload = assumptions.workload;
  const probability = assumptions.successProbabilityBps;
  const reward = state.reward?.amount ?? null,
    spend = state.requiredExternalSpend?.amount ?? null;
  const price = currentProviderPrice("Groq", "openai/gpt-oss-20b", now);
  const ceiling = workload && supported && price
    ? calculateProviderCostCeiling(workload, price)
    : null;
  const usableFx =
    fx && Date.parse(fx.validUntil) >= now && Date.parse(fx.observedAt) <= now + 60_000
      ? FxObservationSchema.parse(fx)
      : null;
  const rewardUsd = reward && usableFx
    ? usdcBaseUnitsToUsdMicros(reward, usableFx.rateMicros, "floor")
    : null;
  const spendUsd = spend && usableFx
    ? usdcBaseUnitsToUsdMicros(spend, usableFx.rateMicros, "ceil")
    : null;
  const bond = state.refundableBond?.amount ?? null;
  const bondUsd = bond && usableFx
    ? usdcBaseUnitsToUsdMicros(bond, usableFx.rateMicros, "ceil")
    : null;
  const feeKeys = [
    "platformFeeUsdMicros",
    "proofGasFeeUsdMicros",
    "humanReviewCostUsdMicros",
    "additionalFulfillmentCostUsdMicros",
    "timeValueCostUsdMicros",
    "competitionRiskAdjustmentUsdMicros",
  ] as const;
  const missingInputs = [
    ...(reward === null ? ["observed_reward"] : []),
    ...(spend === null ? ["observed_required_external_spend"] : []),
    ...(!usableFx ? ["USDC_USD_fx_rate"] : []),
    ...(!price ? ["current_provider_pricing"] : []),
    ...(!workload ? ["bounded_provider_workload"] : []),
    ...(probability === undefined ? ["success_probability"] : []),
    ...feeKeys.filter((key) => assumptions[key] === undefined),
    ...(bond && BigInt(bond) > 0n && assumptions.bondLossProbabilityBps === undefined
      ? ["bond_loss_probability"]
      : []),
    ...(!supported ? ["supported_fulfillment_route"] : []),
    ...(state.eligibility !== "source_ready" ? ["actual_eligibility"] : []),
  ];
  const complete = missingInputs.length === 0 && rewardUsd !== null && spendUsd !== null && ceiling !== null;
  const platformAndVerification =
    assumptions.platformFeeUsdMicros !== undefined && assumptions.proofGasFeeUsdMicros !== undefined
      ? (BigInt(assumptions.platformFeeUsdMicros) + BigInt(assumptions.proofGasFeeUsdMicros)).toString()
      : null;
  const expectedFailure =
    bondUsd !== null && assumptions.bondLossProbabilityBps !== undefined
      ? ceilDiv(BigInt(bondUsd) * BigInt(assumptions.bondLossProbabilityBps), 10_000n).toString()
      : bond === null || BigInt(bond) === 0n
        ? "0"
        : null;
  const total = complete && platformAndVerification !== null && expectedFailure !== null
    ? BigInt(spendUsd!) + BigInt(ceiling!) + BigInt(platformAndVerification) +
      BigInt(assumptions.humanReviewCostUsdMicros!) +
      BigInt(assumptions.additionalFulfillmentCostUsdMicros!) +
      BigInt(assumptions.timeValueCostUsdMicros!) +
      BigInt(assumptions.competitionRiskAdjustmentUsdMicros!) + BigInt(expectedFailure)
    : null;
  const expectedProfit = total !== null ? BigInt(rewardUsd!) - total : null;
  const riskAdjusted =
    total !== null && probability !== undefined
      ? floorSigned(BigInt(rewardUsd!) * BigInt(probability), 10_000n) - total
      : null;
  const requiredProbabilityRaw =
    total !== null && BigInt(rewardUsd!) > 0n
      ? ceilDiv(total * 10_000n, BigInt(rewardUsd!))
      : null;
  const requiredProbability =
    requiredProbabilityRaw === null
      ? null
      : requiredProbabilityRaw > 10_000n
        ? 10_001
        : Number(requiredProbabilityRaw);
  const marginRaw =
    expectedProfit !== null && BigInt(rewardUsd!) > 0n
      ? floorSigned(expectedProfit * 10_000n, BigInt(rewardUsd!))
      : null;
  const margin =
    marginRaw !== null &&
    marginRaw >= BigInt(Number.MIN_SAFE_INTEGER) &&
    marginRaw <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(marginRaw)
      : null;
  if (expectedProfit !== null && margin === null)
    missingInputs.push("derived_margin_out_of_range");
  const derived = {
    grossRewardUsdMicros: rewardUsd,
    knownExternalSpendUsdMicros: spendUsd,
    providerCostCeilingUsdMicros: ceiling,
    platformAndVerificationCostUsdMicros: platformAndVerification,
    humanReviewCostUsdMicros: assumptions.humanReviewCostUsdMicros ?? null,
    additionalFulfillmentCostUsdMicros: assumptions.additionalFulfillmentCostUsdMicros ?? null,
    timeValueCostUsdMicros: assumptions.timeValueCostUsdMicros ?? null,
    competitionRiskAdjustmentUsdMicros: assumptions.competitionRiskAdjustmentUsdMicros ?? null,
    expectedFailureCostUsdMicros: expectedFailure,
    totalExpectedCostUsdMicros: total?.toString() ?? null,
    expectedProfitUsdMicros: expectedProfit?.toString() ?? null,
    expectedMarginBps: margin,
    riskAdjustedExpectedValueUsdMicros: riskAdjusted?.toString() ?? null,
    breakEvenRewardUsdMicros:
      total !== null && probability !== undefined && probability > 0
        ? ceilDiv(total * 10_000n, BigInt(probability)).toString()
        : null,
    maximumFulfillmentCostUsdMicros:
      riskAdjusted !== null
        ? (BigInt(ceiling!) + riskAdjusted > 0n ? BigInt(ceiling!) + riskAdjusted : 0n).toString()
        : null,
    requiredSuccessProbabilityBps: requiredProbability,
    capitalRequiredUsdMicros:
      bondUsd !== null && spendUsd !== null
        ? (BigInt(bondUsd) + BigInt(spendUsd)).toString()
        : null,
  };
  return RealEnvelopeSchema.parse({
    schemaVersion: "1.0",
    economicModelVersion: "real-economics/1.0",
    phase: "pre_execution_estimate",
    knownExternalSpendUsdcBaseUnits: spend,
    refundableBondUsdcBaseUnits: bond,
    rewardUsdcBaseUnits: reward,
    cashHeadroomUsdcBaseUnits:
      reward !== null && spend !== null
        ? (BigInt(reward) - BigInt(spend)).toString()
        : null,
    cashHeadroomIsProfit: false,
    estimatedProviderCostUsdMicros: null,
    worstCaseProviderCostUsdMicros: ceiling,
    workload: workload ?? null,
    workloadProvenance: workload ? "user_scenario" : "unknown",
    providerPricing: price,
    fx: usableFx,
    assumptions: {
      successProbabilityBps: assumption(probability),
      maxInputTokens: assumption(workload?.maxInputTokens),
      maxOutputTokens: assumption(workload?.maxOutputTokens),
      boundedCalls: assumption(workload?.boundedCalls),
      platformFeeUsdMicros: assumption(assumptions.platformFeeUsdMicros),
      proofGasFeeUsdMicros: assumption(assumptions.proofGasFeeUsdMicros),
      humanReviewCostUsdMicros: assumption(assumptions.humanReviewCostUsdMicros),
      additionalFulfillmentCostUsdMicros: assumption(assumptions.additionalFulfillmentCostUsdMicros),
      timeValueCostUsdMicros: assumption(assumptions.timeValueCostUsdMicros),
      competitionRiskAdjustmentUsdMicros: assumption(assumptions.competitionRiskAdjustmentUsdMicros),
      bondLossProbabilityBps: assumption(assumptions.bondLossProbabilityBps),
      fxRateMicros: assumption(assumptions.fxRateMicros),
    },
    derived,
    costProvenance: ceiling === null ? "unknown" : "estimated_from_live_inputs",
    successProbabilityBps: probability ?? null,
    probabilityProvenance:
      probability === undefined ? "unknown" : "user_scenario",
    expectedProfitUsdMicros: derived.expectedProfitUsdMicros,
    riskAdjustedValueUsdMicros: derived.riskAdjustedExpectedValueUsdMicros,
    actual: null,
    outcomeObservations: 0,
    missingInputs,
    executionStatus: "execution_not_enabled",
    servicesCalled: false,
    paymentsMade: false,
  });
}
// Schema only: no persistence or action interface. Empty until real authorized outcomes exist.
export const ActualOutcomeSchema = z
  .object({
    opportunityId: z.string().max(240),
    event: z.enum([
      "evaluated",
      "claimed",
      "completed",
      "verified",
      "rejected",
      "expired",
      "paid",
    ]),
    recordedAt: z.string().datetime(),
    providerRequestId: z.string().max(240).nullable(),
    actualInputTokens: z.number().int().nonnegative().nullable(),
    actualOutputTokens: z.number().int().nonnegative().nullable(),
    actualProviderChargeUsdMicros: z.string().regex(/^\d+$/).nullable(),
    actualExternalSpendUsdcBaseUnits: z.string().regex(/^\d+$/).nullable(),
    actualProofCostUsdMicros: z.string().regex(/^\d+$/).nullable(),
    actualHumanReviewUsdMicros: z.string().regex(/^\d+$/).nullable(),
    settlementRewardUsdcBaseUnits: z.string().regex(/^\d+$/).nullable(),
    realizedProfitUsdMicros: z
      .string()
      .regex(/^-?\d+$/)
      .nullable(),
    failureReason: z.string().max(1000).nullable(),
    evidenceReference: z.string().max(1000),
  })
  .strict();
export type ActualOutcome = z.infer<typeof ActualOutcomeSchema>;

/** Manual/import-only append boundary. No public route or marketplace action uses it. */
export interface AppendOnlyOutcomeRepository {
  append(record: ActualOutcome): Promise<"appended" | "duplicate">;
  observations(opportunityId: string): Promise<readonly ActualOutcome[]>;
}

export const EmptyOutcomeSummarySchema = z
  .object({
    observationCount: z.literal(0),
    actualProviderChargeUsdMicros: z.null(),
    actualRewardUsdMicros: z.null(),
    realizedProfitUsdMicros: z.null(),
    provenance: z.literal("unknown"),
  })
  .strict();
export const emptyOutcomeSummary = EmptyOutcomeSummarySchema.parse({
  observationCount: 0,
  actualProviderChargeUsdMicros: null,
  actualRewardUsdMicros: null,
  realizedProfitUsdMicros: null,
  provenance: "unknown",
});
