import { z } from "zod";

export const EconomicProvenanceSchema = z.enum([
  "observed_source",
  "published_provider_price",
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

// First-party production-model pricing, reviewed 2026-08-31. No provider call occurs here.
export const publishedGroqPrice = {
  provider: "Groq",
  modelId: "openai/gpt-oss-20b",
  observedAt: "2026-08-31T00:00:00.000Z",
  validUntil: "2026-09-30T00:00:00.000Z",
  inputUnit: "million_tokens",
  inputPriceUsdMicros: "75000",
  outputUnit: "million_tokens",
  outputPriceUsdMicros: "300000",
  sourceUrl: "https://console.groq.com/docs/models",
  provenance: "published_provider_price",
} as const;
export const WorkloadSchema = z
  .object({
    maxInputTokens: z.number().int().min(1).max(32000),
    maxOutputTokens: z.number().int().min(1).max(8000),
    boundedCalls: z.number().int().min(1).max(4),
  })
  .strict();
export function providerCostCeiling(
  workload: z.infer<typeof WorkloadSchema>,
  now = Date.now(),
) {
  const w = WorkloadSchema.parse(workload);
  if (now > Date.parse(publishedGroqPrice.validUntil)) return null;
  const numerator =
    (BigInt(w.maxInputTokens) * BigInt(publishedGroqPrice.inputPriceUsdMicros) +
      BigInt(w.maxOutputTokens) *
        BigInt(publishedGroqPrice.outputPriceUsdMicros)) *
    BigInt(w.boundedCalls);
  return ((numerator + 999999n) / 1000000n).toString();
}
export const RealEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
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
    providerPricing: z
      .object({
        provider: z.string(),
        modelId: z.string(),
        observedAt: z.string(),
        validUntil: z.string(),
        inputUnit: z.string(),
        inputPriceUsdMicros: z.string(),
        outputUnit: z.string(),
        outputPriceUsdMicros: z.string(),
        sourceUrl: z.string().url(),
        provenance: z.literal("published_provider_price"),
      })
      .strict(),
    costProvenance: EconomicProvenanceSchema,
    successProbabilityBps: z.number().int().min(0).max(10000).nullable(),
    probabilityProvenance: z.enum(["user_scenario", "unknown"]),
    expectedProfitUsdMicros: z.null(),
    riskAdjustedValueUsdMicros: z.null(),
    actual: z.null(),
    outcomeObservations: z.literal(0),
    missingInputs: z.array(z.string()),
    executionStatus: z.literal("execution_not_enabled"),
    servicesCalled: z.literal(false),
    paymentsMade: z.literal(false),
  })
  .strict();
export type RealEnvelope = z.infer<typeof RealEnvelopeSchema>;
export function realEnvelope(
  state: DemandState,
  workload?: z.infer<typeof WorkloadSchema>,
  probability?: number,
  supported = false,
  now = Date.now(),
): RealEnvelope {
  const reward = state.reward?.amount ?? null,
    spend = state.requiredExternalSpend?.amount ?? null;
  const ceiling =
    workload && supported ? providerCostCeiling(workload, now) : null;
  return RealEnvelopeSchema.parse({
    schemaVersion: "1.0",
    phase: "pre_execution_estimate",
    knownExternalSpendUsdcBaseUnits: spend,
    refundableBondUsdcBaseUnits: state.refundableBond?.amount ?? null,
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
    providerPricing: publishedGroqPrice,
    costProvenance: ceiling === null ? "unknown" : "estimated_from_live_inputs",
    successProbabilityBps: probability ?? null,
    probabilityProvenance:
      probability === undefined ? "unknown" : "user_scenario",
    expectedProfitUsdMicros: null,
    riskAdjustedValueUsdMicros: null,
    actual: null,
    outcomeObservations: 0,
    missingInputs: [
      "complete_fulfillment_scope",
      "platform_and_verification_costs",
      "actual_eligibility",
      "USDC_USD_conversion_not_assumed",
      ...(probability === undefined ? ["success_probability"] : []),
      ...(ceiling === null ? ["bounded_provider_workload"] : []),
    ],
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
