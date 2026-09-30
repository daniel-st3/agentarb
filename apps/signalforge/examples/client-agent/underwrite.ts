/** External, non-executing consumer. No local economic calculations or model calls. */
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { ForgeUnderwritingInputSchema, ForgeUnderwritingResponseSchema, type ForgeUnderwritingInput } from "../../src/domain/forge-underwriting";
import { ClientRequestSchema } from "./client";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
export function inspectUnderwriting(raw: unknown) {
  const result = ForgeUnderwritingResponseSchema.parse(raw);
  const core = result.receipt.core;
  const fingerprint = createHash("sha256").update(canonical(core)).digest("hex");
  if (fingerprint !== result.receipt.receiptHash) throw new Error("receipt_integrity_failed");
  for (const key of ["scenario", "economics", "decision", "financialExposure", "blockers", "limitations", "routeEvidence"] as const) {
    if (canonical(core[key]) !== canonical(result[key])) throw new Error("projection_mismatch");
  }
  return { decision: core.decision, blockers: core.blockers, limitations: core.limitations,
    scenario: core.scenario, economics: core.economics, receiptHash: fingerprint,
    executionStatus: core.executionStatus, servicesCalled: core.servicesCalled, paymentsMade: core.paymentsMade };
}

export async function requestUnderwriting(endpoint: string, transport: "rest" | "mcp", input: ForgeUnderwritingInput, fetcher: typeof fetch = fetch) {
  const origin = ClientRequestSchema.shape.endpoint.parse(endpoint);
  const request = ForgeUnderwritingInputSchema.parse(input);
  const response = await fetcher(new URL(transport === "rest" ? "/api/v1/forge/underwrite" : "/api/mcp", origin), {
    method: "POST", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(transport === "rest" ? request : {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "signalforge_underwrite_task", arguments: { objective: request.objective, locale: request.locale, scenario: request.scenario } },
    }),
  });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("application/json")) throw new Error("underwriting_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) throw new Error("response_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (transport === "mcp" && (raw.error || raw.result?.isError)) throw new Error("underwriting_unavailable");
  return inspectUnderwriting(transport === "rest" ? raw : raw.result?.structuredContent);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { endpoint: { type: "string" }, transport: { type: "string" } } });
  if (values.transport && !["rest", "mcp"].includes(values.transport)) throw new Error("invalid_transport");
  const input = ForgeUnderwritingInputSchema.parse({
    objective: { objective: "Summarize three public reports and compare their evidence.", budgetUsd: 10, optimizationPolicy: "best_value" },
    locale: "en",
    // Explicit demonstration assumptions, not observed market prices.
    scenario: { payoutUsd: "20", fulfillmentCostUsd: "2", successProbabilityBps: 8000,
      humanReviewCostUsd: "1", verificationCostUsd: "0", platformCostUsd: "0",
      failureCostUsd: "0", refundableCapitalUsd: "0", minimumMarginBps: 2500 },
  });
  requestUnderwriting(values.endpoint ?? "https://signalforge-rose-two.vercel.app", values.transport === "mcp" ? "mcp" : "rest", input)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch(() => { console.error("Underwriting could not be verified. No execution occurred."); process.exitCode = 1; });
}
