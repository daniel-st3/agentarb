import { z } from "zod";
import { DecisionSchema } from "./arbitrage";
import { RealEconomicAssumptionsSchema } from "./real-economics";

export const ClaimReadinessCoreSchema = z
  .object({
    schemaVersion: z.literal("1.1"),
    opportunityId: z.string().max(240),
    sourceUrl: z.string().url(),
    sourceObservedAt: z.string().datetime(),
    deadline: z.string().datetime().nullable(),
    requiredCapabilities: z.array(z.string().max(80)).max(20),
    evidenceRequirements: z.string().max(6000),
    currentEligibility: z.enum(["source_ready", "not_eligible", "unknown"]),
    economicAssumptions: RealEconomicAssumptionsSchema,
    expectedCostUsdMicros: z.string().nullable(),
    worstCaseProviderCostUsdMicros: z.string().nullable(),
    expectedTotalCostUsdMicros: z.string().nullable(),
    worstCaseTotalCostUsdMicros: z.string().nullable(),
    worstCaseCompleteness: z.enum(["complete", "partial", "unknown"]),
    capitalRequiredUsdMicros: z.string().nullable(),
    refundableBondUsdMicros: z.string().nullable(),
    bondAtRiskUsdMicros: z.string().nullable(),
    economicDecision: DecisionSchema,
    missingInputs: z.array(z.string().max(160)).max(40),
    policyVersion: z.literal("arbitrage-policy/1.0"),
    claimAuthorized: z.literal(false),
    authorizationState: z.literal("authorization_required"),
    executionStatus: z.literal("execution_not_enabled"),
    servicesCalled: z.literal(false),
    paymentsMade: z.literal(false),
  })
  .strict();
export const ClaimReadinessPacketSchema = ClaimReadinessCoreSchema.extend({
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ClaimReadinessCore = z.infer<typeof ClaimReadinessCoreSchema>;
export type ClaimReadinessPacket = z.infer<typeof ClaimReadinessPacketSchema>;
