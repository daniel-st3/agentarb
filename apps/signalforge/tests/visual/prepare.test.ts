/** Local-only render fixtures. Never imported by the app or written to Supabase. */
import { it, expect, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ getAuthenticatedUser: async () => ({ id: "visual-owner" }), createSupabaseServerClient: vi.fn() }));
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/i18n/navigation", async () => ({ default: (await import("next/link")).default, useRouter: () => ({}) }));
vi.mock("@/components/account/auth-provider", () => ({ useAuth: () => ({}) }));
import { decomposeObjective } from "@/domain/objective";
import { buildExecutionRoute } from "@/domain/route-planner";
import { PlanningResponseSchema } from "@/domain/planning-response";
import { evaluateForgeScenario, ForgeUnderwritingResponseSchema, type ForgeUnderwritingInput } from "@/domain/forge-underwriting";
import { SourceSynthesisResponseSchema } from "@/domain/source-synthesis";
import { hashReceipt } from "@/server/arbitrage/service";
import { buildLedger } from "@/server/account/ledger";
import { AccountLedger } from "@/components/account/ledger";
import styles from "@/components/account/ledger.module.css";
import SavedRun from "@/app/[locale]/account/history/[id]/page";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database";

it("renders real private-page components with isolated canonical visual fixtures", async () => {
  const input: ForgeUnderwritingInput = {
    clientRunId: "51a23a72-e2b1-46d0-a43a-88ef1bc9a1ce", locale: "en",
    objective: { objective: "Compare three public reports and summarize their evidence.", budgetUsd: 10, optimizationPolicy: "best_value", mode: "demo" },
    scenario: { payoutUsd: "20", fulfillmentCostUsd: "2", successProbabilityBps: 8000, humanReviewCostUsd: "1", verificationCostUsd: "0", platformCostUsd: "0", failureCostUsd: "0", refundableCapitalUsd: "5", minimumMarginBps: 2500 },
  };
  const frame = decomposeObjective(input.objective);
  const planning = PlanningResponseSchema.parse({ objectiveFrame: frame, route: buildExecutionRoute(input.objective, frame, { offers: [] }), decompositionSource: "local_demo_fallback", freshnessSummary: [], warnings: [], executionStatus: "execution_not_enabled" });
  const make = (unknown: boolean) => {
    const evaluation = evaluateForgeScenario(unknown ? { ...input, scenario: { ...input.scenario, payoutUsd: "", fulfillmentCostUsd: "" } } : input, planning);
    const core = { receiptSchemaVersion: "forge-underwriting/1.0", economicModelVersion: "deterministic-cents/1.0", policyVersion: "forge-policy/1.0", objectiveFrame: frame, observedOptions: planning.route.observedSupply, ...evaluation, calculationMetadata: { monetaryUnit: "USD_CENTS", catalogContextIsTaskQuote: false, serverAuthoritative: true }, executionStatus: "execution_not_enabled", servicesCalled: false, paymentsMade: false };
    return ForgeUnderwritingResponseSchema.parse({ version: "1.0", clientRunId: input.clientRunId, planning, ...evaluation, receipt: { core, receiptHash: hashReceipt(core), hashAlgorithm: "SHA-256/canonical-json-v2", receiptFingerprintIsSignature: false }, executionStatus: "execution_not_enabled", persistence: { status: "guest", savedRunId: null } });
  };
  const profitable = make(false), insufficient = make(true);
  const core = SourceSynthesisResponseSchema.shape.receipt.shape.core.parse({
    schemaVersion: "source-synthesis/1.0", runId: input.clientRunId, locale: "en", objective: input.objective.objective,
    sourceUrls: ["https://example.com/", "https://www.iana.org/help/example-domains"],
    sourceEvidence: ["https://example.com/", "https://www.iana.org/help/example-domains"].map((url, i) => ({ sourceId: i + 1, url, retrievedAt: "2026-09-30T12:00:00.000Z", contentSha256: "a".repeat(64), bytesRead: 420 })),
    provider: "Groq", modelId: "openai/gpt-oss-20b", usage: { inputTokens: 706, outputTokens: 269, calls: 1 },
    cost: { observedProviderChargeUsdMicros: null, calculatedFromUsageUsdMicros: "134", publishedPriceObservedAt: "2026-09-14T00:00:00.000Z", provenance: "calculated_from_actual_usage_at_published_price", maxAuthorizedSpendUsdMicros: "10000" },
    latencyMs: 771, result: { summary: "Example domains are reserved for documentation. Their availability is not a production-service guarantee.", findings: [{ statement: "Example domains can illustrate documentation without referring readers to an unrelated business.", sourceIds: [1, 2] }, { statement: "The supplied IANA page warns against relying on the example-domain web service for production applications.", sourceIds: [2] }], limitations: ["Only supplied sources were considered; no independent factual verification was performed."] }, status: "completed", verificationStatus: "citations_structurally_checked_not_independently_verified", executedAt: "2026-09-30T12:00:00.000Z", boundary: "user_authorized_source_synthesis_only_no_marketplace_actions_no_payments",
  });
  const synthesis = SourceSynthesisResponseSchema.parse({ receipt: { core, receiptHash: hashReceipt(core), hashAlgorithm: "SHA-256/canonical-json-v2", receiptFingerprintIsSignature: false }, persistence: { status: "guest", savedRunId: null } });
  const row = { id: input.clientRunId!, title: "Compare public reports and their evidence", objective: input.objective.objective, created_at: "2026-09-30T12:00:00.000Z", receipt_hash: profitable.receipt.receiptHash, result_payload: profitable as unknown as Json };
  const entries = buildLedger([row, { ...row, id: "another-visual-record", title: "Evaluate a document extraction task", receipt_hash: insufficient.receipt.receiptHash, result_payload: insufficient as unknown as Json }], [{ id: "visual-research", objective: "Compare source evidence about example domains", created_at: row.created_at, receipt_hash: synthesis.receipt.receiptHash, receipt_payload: synthesis.receipt as unknown as Json }]);
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }) }) };
  vi.mocked(createSupabaseServerClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  const snapshot = renderToStaticMarkup(await SavedRun({ params: Promise.resolve({ locale: "en", id: row.id }) }));
  const history = renderToStaticMarkup(createElement(AccountLedger, { locale: "en", entries, analysesAvailable: true, executionsAvailable: true }));
  const css = readFileSync("src/components/account/ledger.module.css", "utf8").replace(/\.([a-zA-Z][\w-]*)/g, (selector, key) => styles[key] ? `.${styles[key]}` : selector);
  expect(history).toContain("$13.00");
  expect(snapshot).toContain(profitable.receipt.receiptHash);
  mkdirSync("/tmp/valrun-layout-fixtures", { recursive: true });
  writeFileSync("/tmp/valrun-layout-fixtures/states.json", JSON.stringify({ profitable, insufficient, synthesis, history, snapshot, css }));
});
