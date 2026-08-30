import { z } from "zod";

export const policies = [
  "best_value",
  "cheapest",
  "most_verified",
  "fastest",
] as const;
export const capabilities = [
  "web_research",
  "url_extract",
  "structured_company_profile",
  "news_search",
  "claim_verification",
  "synthesis",
] as const;
const money = z.number().finite().min(0).max(10);
const unit = z.number().min(0).max(1);
const timestamp = z.iso.datetime();
export const requestInputSchema = z
  .object({
    question: z.string().trim().min(12).max(2000),
    targetUrl: z
      .url()
      .max(500)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      }, "Use a public HTTPS URL without credentials.")
      .optional(),
    budgetUsd: money.refine(
      (value) =>
        Number.isInteger(Math.round(value * 10000)) &&
        Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
      "Use whole cents.",
    ),
    optimizationPolicy: z.enum(policies),
  })
  .strict();
export const ResearchRequestSchema = requestInputSchema
  .extend({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    createdAt: timestamp,
    status: z.enum(["planned", "complete"]),
  })
  .strict();
export const ServiceOfferSchema = z
  .object({
    providerId: z.string(),
    name: z.string(),
    description: z.string(),
    capabilities: z.array(z.enum(capabilities)),
    providerType: z.enum(["mock", "public_source", "x402_catalog_only"]),
    pricePerCallUsd: money,
    estimatedLatencySeconds: z.number().nonnegative(),
    reliabilityScore: unit,
    qualityScore: unit,
    requiresApiKey: z.boolean(),
    isEnabled: z.boolean(),
    metadata: z
      .object({
        sourceGroup: z.string(),
        diversityScore: unit,
        unavailableReason: z.string().optional(),
        priceBasis: z.literal("simulation"),
      })
      .strict(),
  })
  .strict();
export const AlternativeSchema = z
  .object({
    providerId: z.string(),
    name: z.string(),
    reason: z.string(),
    code: z.enum([
      "catalog_only",
      "missing_configuration",
      "unavailable",
      "low_reliability",
      "low_capability_fit",
      "would_exceed_budget",
      "lower_policy_score",
    ]),
  })
  .strict();
export const ExecutionStepSchema = z
  .object({
    stepId: z.string(),
    capabilityNeeded: z.enum(capabilities),
    selectedProviderId: z.string(),
    alternativesConsidered: z.array(AlternativeSchema),
    reasonSelected: z.string(),
    estimatedCostUsd: money,
    actualCostUsd: z.literal(0),
    status: z.enum(["planned", "complete"]),
    outputReference: z.string().nullable(),
  })
  .strict();
export const ExecutionPlanSchema = z
  .object({
    requestId: z.string(),
    steps: z.array(ExecutionStepSchema).max(3),
    estimatedTotalCostUsd: money,
    budgetUsd: money,
    expectedQualityScore: unit,
    expectedLatencySeconds: z.number().nonnegative(),
    policy: z.enum(policies),
    planningExplanation: z.string(),
    catalogVersion: z.literal("v1"),
    simulationOnly: z.literal(true),
  })
  .strict()
  .refine(
    (p) => p.estimatedTotalCostUsd <= p.budgetUsd,
    "Route exceeds budget.",
  );
export const EvidenceItemSchema = z
  .object({
    id: z.string(),
    claimId: z.string(),
    sourceTitle: z.string(),
    sourceUrl: z.url().nullable(),
    sourceType: z.literal("simulated_fixture"),
    excerpt: z.string(),
    retrievedAt: timestamp,
    providerId: z.string(),
    independentSourceId: z.string(),
    confidence: unit,
    corroboratesClaimId: z.string().optional(),
    isMock: z.literal(true),
    provenanceLabel: z.literal("Simulated demo evidence"),
  })
  .strict();
export const ClaimSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    importance: z.enum(["high", "medium"]),
    confidence: unit,
    verificationStatus: z.enum([
      "corroborated_in_simulation",
      "single_source",
      "unverified",
    ]),
    evidenceIds: z.array(z.string()),
    provenanceLabel: z.literal("Simulated demo evidence"),
  })
  .strict();
export const ResearchBriefSchema = z
  .object({
    requestId: z.string(),
    title: z.string(),
    executiveSummary: z.string(),
    keyFindings: z.array(z.string()),
    risksAndUnknowns: z.array(z.string()),
    claims: z.array(ClaimSchema),
    sources: z.array(EvidenceItemSchema),
    markdownContent: z.string(),
    createdAt: timestamp,
  })
  .strict();
export const SpendReceiptSchema = z
  .object({
    requestId: z.string(),
    budgetUsd: money,
    estimatedSpendUsd: money,
    actualSpendUsd: z.literal(0),
    simulatedSpendUsd: money,
    providerBreakdown: z.array(
      z
        .object({
          providerId: z.string(),
          name: z.string(),
          provenance: z.literal("Mock"),
          estimatedCostUsd: money,
          actualCostUsd: z.literal(0),
          simulatedCostUsd: money,
        })
        .strict(),
    ),
    rejectedAlternatives: z.array(AlternativeSchema),
    elapsedSeconds: z.number().nonnegative(),
    sourceCount: z.number().int().nonnegative(),
    evidenceItemCount: z.number().int().nonnegative(),
    verifiedClaimCount: z.number().int().nonnegative(),
    provenanceNotice: z.string(),
  })
  .strict();
export const RunSchema = z
  .object({
    schemaVersion: z.literal("v1"),
    request: ResearchRequestSchema,
    plan: ExecutionPlanSchema,
    offers: z.array(ServiceOfferSchema),
    brief: ResearchBriefSchema.optional(),
    receipt: SpendReceiptSchema.optional(),
    example: z.boolean(),
    audit: z.array(z.object({ state: z.string(), at: timestamp }).strict()),
  })
  .strict();
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
export type RequestInput = z.infer<typeof requestInputSchema>;
export type ServiceOffer = z.infer<typeof ServiceOfferSchema>;
export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;
export type SpendReceipt = z.infer<typeof SpendReceiptSchema>;
export type Run = z.infer<typeof RunSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;
export type Capability = (typeof capabilities)[number];
