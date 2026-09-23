import { z } from "zod";

const PublicHttpsUrlSchema = z.url().max(2048).refine((value) => {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password &&
      !parsed.port && !parsed.hash && host.includes(".") &&
      !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(":") &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host);
  } catch { return false; }
});

export const SourceSynthesisInputSchema = z.object({
  runId: z.string().uuid(),
  locale: z.enum(["en", "es", "fr"]),
  objective: z.string().trim().min(12).max(2000),
  urls: z.array(PublicHttpsUrlSchema).min(1).max(10),
  maxAuthorizedSpendUsdMicros: z.literal("10000"),
  authorization: z.literal("run_task"),
}).strict();

export type SourceSynthesisInput = z.infer<typeof SourceSynthesisInputSchema>;

export const SynthesisOutputSchema = z.object({
  summary: z.string().min(1).max(4000),
  findings: z.array(z.object({
    statement: z.string().min(1).max(1200),
    sourceIds: z.array(z.number().int().min(1).max(10)).min(1).max(10),
  }).strict()).min(1).max(12),
  limitations: z.array(z.string().min(1).max(400)).max(8),
}).strict();

export const SourceSynthesisReceiptCoreSchema = z.object({
  schemaVersion: z.literal("source-synthesis/1.0"),
  runId: z.string().uuid(),
  locale: z.enum(["en", "es", "fr"]),
  objective: z.string(),
  sourceUrls: z.array(PublicHttpsUrlSchema).min(1).max(10),
  sourceEvidence: z.array(z.object({
    sourceId: z.number().int().min(1).max(10),
    url: PublicHttpsUrlSchema,
    retrievedAt: z.string().datetime(),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytesRead: z.number().int().nonnegative(),
  }).strict()),
  provider: z.literal("Groq"),
  modelId: z.literal("openai/gpt-oss-20b"),
  usage: z.object({ inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable(), calls: z.literal(1) }).strict(),
  cost: z.object({
    observedProviderChargeUsdMicros: z.null(),
    calculatedFromUsageUsdMicros: z.string().regex(/^\d+$/).nullable(),
    publishedPriceObservedAt: z.string().datetime(),
    provenance: z.literal("calculated_from_actual_usage_at_published_price"),
    maxAuthorizedSpendUsdMicros: z.literal("10000"),
  }).strict(),
  latencyMs: z.number().int().nonnegative(),
  result: SynthesisOutputSchema,
  status: z.literal("completed"),
  verificationStatus: z.literal("citations_structurally_checked_not_independently_verified"),
  executedAt: z.string().datetime(),
  boundary: z.literal("user_authorized_source_synthesis_only_no_marketplace_actions_no_payments"),
}).strict().superRefine((core, context) => {
  if (core.sourceEvidence.length !== core.sourceUrls.length ||
    core.sourceEvidence.some((source, index) => source.sourceId !== index + 1 || source.url !== core.sourceUrls[index]) ||
    core.result.findings.some((finding) => finding.sourceIds.some((id) => id > core.sourceUrls.length))) {
    context.addIssue({ code: "custom", message: "source_evidence_mismatch" });
  }
});

export const SourceSynthesisResponseSchema = z.object({
  receipt: z.object({
    core: SourceSynthesisReceiptCoreSchema,
    receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
    hashAlgorithm: z.literal("SHA-256/canonical-json-v2"),
    receiptFingerprintIsSignature: z.literal(false),
  }).strict(),
  persistence: z.object({ status: z.enum(["guest", "saved", "failed"]), savedRunId: z.string().uuid().nullable() }).strict(),
}).strict();

export type SourceSynthesisResponse = z.infer<typeof SourceSynthesisResponseSchema>;
