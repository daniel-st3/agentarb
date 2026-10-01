import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { synthesisErrorCode, SynthesisFailure } from "../src/domain/source-synthesis-error";
import { PublicHttpsUrlSchema } from "../src/domain/source-synthesis";
import { decimalSeparator } from "../src/components/forge-lab/decimal-input";
import { reportForgeRunPersistence } from "../src/server/account/persistence-diagnostics";

describe("safe actionable research errors", () => {
  it.each([
    ["source_redirect_rejected", "redirect_rejected"], ["source_dns_unsafe", "blocked_source"],
    ["source_timeout", "fetch_failed"], ["source_mime_invalid", "content_unusable"],
    ["provider_unavailable", "provider_unavailable"],
  ])("classifies %s without leaking the source or vendor", (internal, code) => {
    expect(synthesisErrorCode(new Error(internal))).toBe(code);
  });
  it("unknown vendor errors are never returned as public messages", () => {
    expect(synthesisErrorCode(new Error("private vendor response: secret"))).toBe("fetch_failed");
    expect(new SynthesisFailure("redirect_rejected", 3).sourceIndex).toBe(3);
  });
  it.each(["summarize this", "http://example.com", "https://127.0.0.1", "https://example.com/#private", "https://a:b@example.com"])("rejects invalid source input %s", (value) => {
    expect(PublicHttpsUrlSchema.safeParse(value).success).toBe(false);
  });
});
it("uses the product locale for the decimal separator without changing arithmetic", () => {
  expect(decimalSeparator("en")).toBe(".");
  expect(decimalSeparator("es")).toBe(",");
  expect(decimalSeparator("fr")).toBe(",");
});
it("classifies PostgREST transport errors without logging raw error data", () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  reportForgeRunPersistence("forge_run_postgrest_rejected", { status: 0, postgrestError: { message: "private details", details: "token" } });
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "forge_run_postgrest_rejected", reason: "network_or_timeout", status: 0 }));
  log.mockRestore();
});
