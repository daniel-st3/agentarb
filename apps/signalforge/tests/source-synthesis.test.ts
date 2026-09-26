import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isPublicIpv4, publicSourceUrl } from "../src/server/source-synthesis/fetch-public";
import { SourceSynthesisInputSchema, SourceSynthesisReceiptCoreSchema, SourceSynthesisResponseSchema } from "../src/domain/source-synthesis";
import { hashReceipt } from "../src/server/arbitrage/service";

const validInput = {
  runId: "8b73e47a-c3be-4982-9304-0b65fe62c9bd",
  locale: "en",
  objective: "Summarize the public documentation and cite the supplied sources.",
  urls: ["https://www.example.org/report"],
  maxAuthorizedSpendUsdMicros: "10000",
  authorization: "run_task",
};

describe("bounded source-synthesis authorization", () => {
  it("requires a specific run action, fixed spend ceiling, and 1–10 sources", () => {
    expect(SourceSynthesisInputSchema.safeParse(validInput).success).toBe(true);
    for (const override of [
      { authorization: true }, { authorization: "execute" },
      { maxAuthorizedSpendUsdMicros: "1000000" }, { urls: [] },
      { urls: Array(11).fill("https://www.example.org/report") },
      { execute: true },
      { locale: "de" }, { urls: ["javascript:alert(1)"] },
    ]) expect(SourceSynthesisInputSchema.safeParse({ ...validInput, ...override }).success).toBe(false);
  });

  it.each([
    "http://example.org/", "https://localhost/", "https://127.0.0.1/",
    "https://[::1]/", "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.1/", "https://metadata.google.internal/",
    "https://user:pass@example.org/", "https://example.org:8443/",
    "https://example.org/#fragment", "https://example.local/",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => publicSourceUrl(url)).toThrow("source_url_invalid");
  });

  it.each([
    "0.0.0.0", "10.2.3.4", "100.100.100.100", "127.0.0.1",
    "169.254.169.254", "172.20.1.1", "192.168.1.1", "192.0.2.1",
    "198.18.0.1", "198.51.100.7", "203.0.113.8", "224.0.0.1",
  ])("does not connect to non-public IPv4 %s", (address) => {
    expect(isPublicIpv4(address)).toBe(false);
  });

  it("accepts a canonical public HTTPS URL and public IPv4 answer", () => {
    expect(publicSourceUrl("https://www.example.org/report").hostname).toBe("www.example.org");
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
  });
});

describe("separate execution receipt", () => {
  const core = () => SourceSynthesisReceiptCoreSchema.parse({
    schemaVersion: "source-synthesis/1.0",
    runId: validInput.runId,
    locale: validInput.locale,
    objective: validInput.objective,
    sourceUrls: validInput.urls,
    sourceEvidence: [{ sourceId: 1, url: validInput.urls[0], retrievedAt: "2026-09-23T00:00:00.000Z", contentSha256: "a".repeat(64), bytesRead: 100 }],
    provider: "Groq", modelId: "openai/gpt-oss-20b",
    usage: { inputTokens: 500, outputTokens: 100, calls: 1 },
    cost: { observedProviderChargeUsdMicros: null, calculatedFromUsageUsdMicros: "68", publishedPriceObservedAt: "2026-09-14T00:00:00.000Z", provenance: "calculated_from_actual_usage_at_published_price", maxAuthorizedSpendUsdMicros: "10000" },
    latencyMs: 1200,
    result: { summary: "The source describes its API.", findings: [{ statement: "It provides a documented API.", sourceIds: [1] }], limitations: [] },
    status: "completed", verificationStatus: "citations_structurally_checked_not_independently_verified",
    executedAt: "2026-09-23T00:00:00.000Z",
    boundary: "user_authorized_source_synthesis_only_no_marketplace_actions_no_payments",
  });

  it("fingerprints the full material payload without claiming a signature", () => {
    const receiptCore = core();
    const hash = hashReceipt(receiptCore);
    expect(hashReceipt({ ...receiptCore, sourceUrls: [...receiptCore.sourceUrls] })).toBe(hash);
    expect(hashReceipt({ ...receiptCore, objective: "Changed task" })).not.toBe(hash);
    expect(hashReceipt({ ...receiptCore, usage: { ...receiptCore.usage, outputTokens: 101 } })).not.toBe(hash);
    expect(hashReceipt({ ...receiptCore, result: { ...receiptCore.result, summary: "Changed result" } })).not.toBe(hash);
    expect(SourceSynthesisResponseSchema.parse({ receipt: { core: receiptCore, receiptHash: hash, hashAlgorithm: "SHA-256/canonical-json-v2", receiptFingerprintIsSignature: false }, persistence: { status: "guest", savedRunId: null } }).receipt.receiptFingerprintIsSignature).toBe(false);
  });

  it("rejects receipt evidence and citations that do not match supplied sources", () => {
    const receiptCore = core();
    expect(SourceSynthesisReceiptCoreSchema.safeParse({ ...receiptCore, sourceUrls: ["https://localhost/private"] }).success).toBe(false);
    expect(SourceSynthesisReceiptCoreSchema.safeParse({ ...receiptCore, sourceEvidence: [] }).success).toBe(false);
    expect(SourceSynthesisReceiptCoreSchema.safeParse({ ...receiptCore, result: { ...receiptCore.result, findings: [{ statement: "Wrong source", sourceIds: [2] }] } }).success).toBe(false);
  });
});
