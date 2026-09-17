import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { safeAuthNext } from "../src/lib/auth-redirect";
import { ForgeUnderwritingInputSchema, ForgeUnderwritingResponseSchema } from "../src/domain/forge-underwriting";
import { issueSaveAuthorization, verifySaveAuthorization } from "../src/server/account/save-proof";
import { classifyAuthRequestFailure } from "../src/components/account/auth-error";

const migration = readFileSync("supabase/migrations/20260917023313_accounts_saved_runs_v1.sql", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

describe("accounts and saved-run boundaries", () => {
  it("allows only localized internal auth redirects", () => {
    expect(safeAuthNext("/en/forge?saved=1")).toBe("/en/forge?saved=1");
    expect(safeAuthNext("/es/account/history")).toBe("/es/account/history");
    expect(safeAuthNext("https://attacker.example")).toBe("/en/forge");
    expect(safeAuthNext("//attacker.example")).toBe("/en/forge");
    expect(safeAuthNext("/en\\@attacker.example")).toBe("/en/forge");
    expect(safeAuthNext("/unknown/forge")).toBe("/en/forge");
  });

  it("enables RLS and declares explicit ownership policies for every mutation", () => {
    expect(migration).toContain("alter table public.profiles enable row level security");
    expect(migration).toContain("alter table public.forge_runs enable row level security");
    expect(migration).toMatch(/forge_runs_select_own[\s\S]*auth\.uid\(\)[\s\S]*user_id/);
    expect(migration).toMatch(/forge_runs_insert_own[\s\S]*with check[\s\S]*auth\.uid\(\)[\s\S]*user_id/);
    expect(migration).toMatch(/forge_runs_update_own[\s\S]*using[\s\S]*with check/);
    expect(migration).toMatch(/forge_runs_delete_own[\s\S]*auth\.uid\(\)[\s\S]*user_id/);
    expect(migration).toContain("revoke all on table public.forge_runs from anon");
  });

  it("uses auth.users as identity and never creates a password or token column", () => {
    expect(migration).toContain("references auth.users(id) on delete cascade");
    expect(migration).not.toMatch(/password|oauth_token|access_token|refresh_token|service_role/i);
  });

  it("requires stable run identity and a server-authoritative no-execution receipt", () => {
    expect(ForgeUnderwritingInputSchema.shape.clientRunId.safeParse(crypto.randomUUID()).success).toBe(true);
    expect(ForgeUnderwritingResponseSchema.shape.executionStatus.value).toBe("execution_not_enabled");
    expect(ForgeUnderwritingResponseSchema.shape.persistence.safeParse({ status: "saved", savedRunId: crypto.randomUUID() }).success).toBe(true);
  });

  it("attests the exact run and receipt without accepting client mutations", () => {
    vi.stubEnv("RATE_LIMIT_SALT", "account-test-salt-that-is-at-least-thirty-two-characters");
    const runId = crypto.randomUUID(), receipt = "a".repeat(64);
    const proof = issueSaveAuthorization(runId, receipt);
    expect(verifySaveAuthorization(runId, receipt, proof)).toBe(true);
    expect(verifySaveAuthorization(runId, "b".repeat(64), proof)).toBe(false);
    expect(verifySaveAuthorization(crypto.randomUUID(), receipt, proof)).toBe(false);
    vi.unstubAllEnvs();
  });

  it("classifies hosted auth failures without inspecting email or response content", () => {
    expect(classifyAuthRequestFailure({ status: 429, code: "over_email_send_rate_limit" })).toBe("rate_limited");
    expect(classifyAuthRequestFailure({ status: 400, code: "email_address_not_authorized" })).toBe("delivery_restricted");
    expect(classifyAuthRequestFailure({ status: 401, code: "invalid_api_key" })).toBe("configuration");
    expect(classifyAuthRequestFailure({ status: 500, code: "unexpected_failure" })).toBe("unavailable");
  });

  it("allows only the configured HTTPS Supabase origin through the browser CSP", () => {
    expect(nextConfig).toContain("url.protocol === \"https:\"");
    expect(nextConfig).toContain("url.hostname.endsWith(\".supabase.co\")");
    expect(nextConfig).toContain("connect-src ${connectSrc}");
    expect(nextConfig).not.toContain("connect-src *");
  });
});
