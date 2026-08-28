import { z } from "zod";

export const CATEGORIES = [
  "research",
  "summarization",
  "data_lookup",
  "small_code",
] as const;
export const TOOLS = ["local_text_transform", "structured_planning"] as const;
export const CORE_CAPABILITIES = [
  "local_planning",
  "local_validation",
  "structured_output",
] as const;
export const MARKETPLACES = ["opentask", "execution_market", "mock"] as const;
export const REQUIRED_PROHIBITIONS = [
  "credentials",
  "payments",
  "wallet",
  "signing",
  "marketplace_write",
  "arbitrary_code_execution",
  "browser_login",
  "private_data",
  "external_action",
] as const;
export const OPTIONAL_RESTRICTIONS = [
  "external_source_dependency",
  "code_planning",
] as const;

const category = z.enum(CATEGORIES);
const tool = z.enum(TOOLS);
const capability = z.enum([...CORE_CAPABILITIES, ...CATEGORIES]);
const prohibition = z.enum([
  ...REQUIRED_PROHIBITIONS,
  ...OPTIONAL_RESTRICTIONS,
]);
const marketplace = z.enum(MARKETPLACES);

export const policyEnvelopeSchema = z
  .strictObject({
    profile: z.strictObject({
      template: z.enum([
        "Research Analyst",
        "Data Extraction Worker",
        "Code Planning Worker",
        "Conservative Agent",
      ]),
      supportedCategories: z.array(category).min(1),
      allowedTools: z.array(tool).min(1),
      capabilities: z.array(capability).min(1),
      prohibitedActions: z.array(prohibition),
      maxExecutionCostUsd: z.number().min(0).max(100),
      maxExecutionMinutes: z.number().int().min(1).max(240),
      humanApprovalAlwaysRequired: z.literal(true),
    }),
    policy: z.strictObject({
      minPayoutUsd: z.number().min(0).max(10000),
      minExpectedMarginUsd: z.number().min(-100).max(10000),
      minConfidence: z.number().min(0).max(1),
      allowedMarketplaces: z.array(marketplace).min(1),
    }),
    sessionId: z.string().uuid(),
  })
  .superRefine(({ profile }, context) => {
    for (const required of REQUIRED_PROHIBITIONS) {
      if (!profile.prohibitedActions.includes(required)) {
        context.addIssue({
          code: "custom",
          message: `Required prohibition cannot be removed: ${required}`,
          path: ["profile", "prohibitedActions"],
        });
      }
    }
  });

export type PolicyEnvelope = z.infer<typeof policyEnvelopeSchema>;
export type Category = (typeof CATEGORIES)[number] | "unknown";
export type Marketplace = (typeof MARKETPLACES)[number];
export type SourceType =
  | "live_public"
  | "cached_public"
  | "controlled_demonstration"
  | "offline_unavailable";
export type Decision = "allow" | "skip" | "refuse";

export interface Opportunity {
  opportunityId: string;
  marketplace: Marketplace;
  sourceType: SourceType;
  observedAt: string | null;
  title: string;
  description: string;
  tags?: string[];
  category: Category;
  payoutUsd: number | null;
  requiredCapabilities: string[];
  requiredReputation: number;
  claimConstraint: "bid" | "open_claim";
  settlementConstraint: "offplatform" | "onchain" | "simulated";
}

export interface EvaluationRow extends Opportunity {
  packageEligibility: Decision;
  reasonCodes: string[];
  rationale: string;
  confidence: number;
  pSuccess: number;
  estimatedDurationMinutes: number;
  actual_llm_inference_cost_usd: 0;
  actual_llm_cost_status: "no_llm_call";
  estimated_task_execution_cost_usd: number;
  estimated_other_cost_usd: number;
  expected_margin_usd: number;
  capabilityMatch: boolean | null;
  estimateAvailable: boolean;
  external_execution_status: "discovery_only";
  estimator: "deterministic_heuristic_v1";
}

export interface SourceStatus {
  marketplace: "opentask" | "execution_market";
  status: "available" | "empty" | "unavailable" | "cached";
  count: number;
  observedAt: string;
}

export interface EvaluationResponse {
  evaluatedAt: string;
  statuses: SourceStatus[];
  results: EvaluationRow[];
  boundary: {
    sessionOnly: true;
    persistence: "none";
    marketplaceActions: "disabled";
  };
}

export const TEMPLATE_DEFAULTS: Record<
  PolicyEnvelope["profile"]["template"],
  Omit<PolicyEnvelope, "sessionId">
> = {
  "Research Analyst": {
    profile: {
      template: "Research Analyst",
      supportedCategories: ["research", "summarization"],
      allowedTools: [...TOOLS],
      capabilities: [...CORE_CAPABILITIES, ...CATEGORIES],
      prohibitedActions: [...REQUIRED_PROHIBITIONS],
      maxExecutionCostUsd: 1,
      maxExecutionMinutes: 60,
      humanApprovalAlwaysRequired: true,
    },
    policy: {
      minPayoutUsd: 1,
      minExpectedMarginUsd: 0,
      minConfidence: 0.2,
      allowedMarketplaces: [...MARKETPLACES],
    },
  },
  "Data Extraction Worker": {
    profile: {
      template: "Data Extraction Worker",
      supportedCategories: ["data_lookup"],
      allowedTools: [...TOOLS],
      capabilities: [...CORE_CAPABILITIES, ...CATEGORIES],
      prohibitedActions: [...REQUIRED_PROHIBITIONS],
      maxExecutionCostUsd: 1,
      maxExecutionMinutes: 60,
      humanApprovalAlwaysRequired: true,
    },
    policy: {
      minPayoutUsd: 1,
      minExpectedMarginUsd: 0,
      minConfidence: 0.2,
      allowedMarketplaces: [...MARKETPLACES],
    },
  },
  "Code Planning Worker": {
    profile: {
      template: "Code Planning Worker",
      supportedCategories: ["small_code"],
      allowedTools: [...TOOLS],
      capabilities: [...CORE_CAPABILITIES, ...CATEGORIES],
      prohibitedActions: [...REQUIRED_PROHIBITIONS],
      maxExecutionCostUsd: 1,
      maxExecutionMinutes: 60,
      humanApprovalAlwaysRequired: true,
    },
    policy: {
      minPayoutUsd: 1,
      minExpectedMarginUsd: 0,
      minConfidence: 0.2,
      allowedMarketplaces: [...MARKETPLACES],
    },
  },
  "Conservative Agent": {
    profile: {
      template: "Conservative Agent",
      supportedCategories: [...CATEGORIES],
      allowedTools: [...TOOLS],
      capabilities: [...CORE_CAPABILITIES, ...CATEGORIES],
      prohibitedActions: [...REQUIRED_PROHIBITIONS],
      maxExecutionCostUsd: 0.1,
      maxExecutionMinutes: 15,
      humanApprovalAlwaysRequired: true,
    },
    policy: {
      minPayoutUsd: 10,
      minExpectedMarginUsd: 0,
      minConfidence: 0.8,
      allowedMarketplaces: [...MARKETPLACES],
    },
  },
};

export const PACKAGE_PREVIEW_CONSTANTS = Object.freeze({
  schemaVersion: "sandbox-preview/1",
  status: "preview_only",
  package_preview_only: true,
  submission_status: "not_submitted",
  marketplace_action_authorized: false,
  external_execution_status: "discovery_only",
});
