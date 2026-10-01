import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../src/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { decomposeObjective } from "../src/domain/objective";
import { buildExecutionRoute } from "../src/domain/route-planner";
import { PlanningResponseSchema } from "../src/domain/planning-response";
import { evaluateForgeScenario, ForgeUnderwritingResponseSchema, type ForgeUnderwritingInput } from "../src/domain/forge-underwriting";
import { hashReceipt } from "../src/server/arbitrage/service";
import { assertForgeSaveMatches, readForgeSnapshot } from "../src/server/account/snapshot";
import { buildLedger } from "../src/server/account/ledger";
import { AccountLedger } from "../src/components/account/ledger";
import type { Json } from "../src/lib/supabase/database";
import { inspectUnderwriting, requestUnderwriting } from "../examples/client-agent/underwrite";
import { persistForgeRun } from "../src/server/account/forge-runs";
import { createSupabaseServerClient } from "../src/lib/supabase/server";

const input: ForgeUnderwritingInput = {
  clientRunId: "51a23a72-e2b1-46d0-a43a-88ef1bc9a1ce",
  objective: { objective: "Summarize three public reports and compare their evidence.", budgetUsd: 10, optimizationPolicy: "best_value", mode: "demo" },
  locale: "en",
  scenario: { payoutUsd: "20", fulfillmentCostUsd: "2", successProbabilityBps: 8000, humanReviewCostUsd: "1", verificationCostUsd: "0", platformCostUsd: "0", failureCostUsd: "0", refundableCapitalUsd: "5", minimumMarginBps: 2500 },
};
function fixture(raw = input) {
  const objectiveFrame = decomposeObjective(raw.objective);
  const planning = PlanningResponseSchema.parse({
    objectiveFrame, route: buildExecutionRoute(raw.objective, objectiveFrame, { offers: [] }),
    decompositionSource: "local_demo_fallback", freshnessSummary: [], warnings: [], executionStatus: "execution_not_enabled",
  });
  const evaluation = evaluateForgeScenario(raw, planning);
  const core = {
    receiptSchemaVersion: "forge-underwriting/1.0", economicModelVersion: "deterministic-cents/1.0",
    policyVersion: "forge-policy/1.0", objectiveFrame, observedOptions: planning.route.observedSupply, ...evaluation,
    calculationMetadata: { monetaryUnit: "USD_CENTS", catalogContextIsTaskQuote: false, serverAuthoritative: true },
    executionStatus: "execution_not_enabled", servicesCalled: false, paymentsMade: false,
  };
  return ForgeUnderwritingResponseSchema.parse({
    version: "1.0", clientRunId: raw.clientRunId, planning, ...evaluation,
    receipt: { core, receiptHash: hashReceipt(core), hashAlgorithm: "SHA-256/canonical-json-v2", receiptFingerprintIsSignature: false },
    executionStatus: "execution_not_enabled", persistence: { status: "guest", savedRunId: null },
  });
}
function row(result = fixture()) {
  return { id: input.clientRunId!, title: "Compare public reports", created_at: "2026-09-30T12:00:00.000Z",
    receipt_hash: result.receipt.receiptHash, result_payload: result as unknown as Json };
}
describe("saved snapshot and private ledger integrity", () => {
  it("saves with the authenticated owner, confirms the row ID, and propagates rejection", async () => {
    const id = "93829aa6-2ac0-4b48-9e83-6a8439ed2e2e";
    const single = vi.fn().mockResolvedValue({ data: { id }, error: null });
    const upsert = vi.fn().mockReturnValue({ select: () => ({ single }) });
    const client = { auth: { getUser: async () => ({ data: { user: { id } }, error: null }) }, from: () => ({ upsert }) };
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    expect(await persistForgeRun(input, fixture())).toEqual({ status: "saved", savedRunId: id });
    expect(upsert.mock.calls[0][0].user_id).toBe(id);
    expect(upsert.mock.calls[0][0].idempotency_key).toBe(input.clientRunId);
    expect(upsert.mock.calls[0][1].onConflict).toBe("user_id,idempotency_key");
    single.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(persistForgeRun(input, fixture())).rejects.toThrow("forge_run_save_failed");
    single.mockResolvedValueOnce({ data: null, error: null });
    await expect(persistForgeRun(input, fixture())).rejects.toThrow("forge_run_save_failed");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(null);
    expect(await persistForgeRun(input, fixture())).toEqual({ status: "guest", savedRunId: null });
  });
  it("accepts the original result and preserves economics and capital separation", () => {
    const result = fixture();
    expect(assertForgeSaveMatches(input, result, result.receipt.receiptHash)).toEqual(result);
    expect(result.economics.riskAdjustedExpectedValueCents).toBe(1300);
    expect(result.financialExposure.refundableCapitalIsExpense).toBe(false);
    expect(result.financialExposure.refundableCapitalCents).toBe(500);
    expect(inspectUnderwriting(result).receiptHash).toBe(result.receipt.receiptHash);
  });
  it("the external client uses the same contract over REST and MCP without credentials or execution", async () => {
    for (const transport of ["rest", "mcp"] as const) {
      const response = fixture();
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(transport === "rest" ? response : { result: { structuredContent: response } }), { headers: { "Content-Type": "application/json" } }));
      expect((await requestUnderwriting("https://valrun.example", transport, input, fetcher)).servicesCalled).toBe(false);
      expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", redirect: "error" });
      expect(fetcher.mock.calls[0][0].pathname).toBe(transport === "rest" ? "/api/v1/forge/underwrite" : "/api/mcp");
    }
  });
  it.each(["decision", "economics", "scenario", "routeEvidence"] as const)("rejects mutated outer %s paired with an untouched receipt", (key) => {
    const result = fixture();
    const changed = structuredClone(result);
    if (key === "decision") changed.decision = "unroutable";
    if (key === "economics") changed.economics.expectedProfitCents = 999999;
    if (key === "scenario") changed.scenario.payout.valueCents = 999999;
    if (key === "routeEvidence") changed.routeEvidence.status = "context_available";
    expect(readForgeSnapshot(changed, result.receipt.receiptHash)).toBeNull();
    expect(() => assertForgeSaveMatches(input, changed, result.receipt.receiptHash)).toThrow();
  });
  it("rejects a substituted objective or assumptions when saving a signed receipt", () => {
    const result = fixture();
    expect(() => assertForgeSaveMatches({ ...input, scenario: { ...input.scenario, payoutUsd: "99" } }, result, result.receipt.receiptHash)).toThrow();
    expect(() => assertForgeSaveMatches({ ...input, objective: { ...input.objective, objective: "A different objective entirely" } }, result, result.receipt.receiptHash)).toThrow();
    expect(() => assertForgeSaveMatches({ ...input, objective: { ...input.objective, optimizationPolicy: "fastest" } }, result, result.receipt.receiptHash)).toThrow();
  });
  it("rejects invalid checksum and mismatching database fingerprint", () => {
    const result = fixture();
    expect(readForgeSnapshot(result, "a".repeat(64))).toBeNull();
    result.receipt.core.decision = "unroutable";
    expect(readForgeSnapshot(result, result.receipt.receiptHash)).toBeNull();
  });
  it("keeps unknown amounts null and never aggregates scenario profit into earnings", () => {
    const result = fixture({ ...input, scenario: { ...input.scenario, payoutUsd: "", fulfillmentCostUsd: "" } });
    const ledger = buildLedger([row(result)], []);
    expect(ledger[0].payout).toBeNull();
    expect(ledger[0].cost).toBeNull();
    expect(ledger[0].ev).toBeNull();
    const html = renderToStaticMarkup(createElement(AccountLedger, { locale: "en", entries: ledger, analysesAvailable: true, executionsAvailable: true }));
    expect(html).toContain("Unknown");
    expect(html).not.toContain("$0.00");
    expect(html).toContain("User assumptions");
    expect(html).toContain("not lifetime totals");
  });
  it("distinguishes an empty account from a failed history query in every locale", () => {
    for (const locale of ["en", "es", "fr"] as const) {
      const empty = renderToStaticMarkup(createElement(AccountLedger, { locale, entries: [], analysesAvailable: true, executionsAvailable: true }));
      const failed = renderToStaticMarkup(createElement(AccountLedger, { locale, entries: [], analysesAvailable: false, executionsAvailable: false }));
      expect(empty).not.toContain('role="alert"');
      expect(failed).toContain('role="alert"');
      expect(failed).not.toContain("<dd>0</dd>");
    }
  });
  it("marks corrupted rows unverified without exposing forged economics", () => {
    const data = row();
    data.receipt_hash = "f".repeat(64);
    const [entry] = buildLedger([data], []);
    expect(entry.valid).toBe(false);
    expect(entry.ev).toBeNull();
  });
});
