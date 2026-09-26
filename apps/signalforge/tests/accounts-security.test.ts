import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { safeAuthNext } from "../src/lib/auth-redirect";
import { ForgeUnderwritingInputSchema, ForgeUnderwritingResponseSchema } from "../src/domain/forge-underwriting";
import { issueSaveAuthorization, verifySaveAuthorization } from "../src/server/account/save-proof";
import { classifyAuthRequestFailure } from "../src/components/account/auth-error";
import { emailConfirmationRedirect } from "../src/lib/auth-email";
import { isConfirmedSavedRun, saveStateFromPersistence } from "../src/components/account/save-status";

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

  it("routes passwordless email through the server token-hash confirmation endpoint", () => {
    expect(emailConfirmationRedirect("https://preview.example", "/fr/forge?saved=1")).toBe(
      "https://preview.example/auth/confirm?next=%2Ffr%2Fforge%3Fsaved%3D1",
    );
    expect(emailConfirmationRedirect("https://preview.example", "https://attacker.example")).toBe(
      "https://preview.example/auth/confirm?next=%2Fen%2Fforge",
    );
  });

  it("shows only configured email auth and retains token-hash confirmation", () => {
    const provider = readFileSync("src/components/account/auth-provider.tsx", "utf8");
    expect(provider).not.toContain("signInWithOAuth");
    expect(provider).toContain("emailConfirmationRedirect(location.origin, next)");
    expect(provider).not.toContain('emailRedirectTo: `${location.origin}/auth/callback');
    expect(readFileSync("src/app/auth/callback/route.ts", "utf8")).toContain("exchangeCodeForSession");
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

  it("never presents an unconfirmed or guest persistence result as saved", () => {
    const savedRunId = crypto.randomUUID();
    expect(isConfirmedSavedRun({ status: "saved", savedRunId })).toBe(true);
    expect(saveStateFromPersistence({ status: "saved", savedRunId })).toBe("saved");
    expect(saveStateFromPersistence({ status: "saved", savedRunId: null })).toBe("idle");
    expect(saveStateFromPersistence({ status: "guest", savedRunId: null })).toBe("idle");
    expect(saveStateFromPersistence({ status: "failed", savedRunId: null })).toBe("failed");
  });

  it("requires the guest conversion endpoint to return a confirmed saved row", () => {
    const forge = readFileSync("src/components/forge-lab/forge-lab.tsx", "utf8");
    expect(forge).toContain("response.ok && isConfirmedSavedRun(persistence)");
    expect(forge).toContain('saveState === "idle" ? null');
  });

  it("keeps the account menu controlled by route, outside click, Escape and item activation", () => {
    const menu = readFileSync("src/components/account/account-menu.tsx", "utf8");
    expect(menu).toContain("openAtPath === pathname");
    expect(menu).toContain('document.addEventListener("pointerdown"');
    expect(menu).toContain('event.key !== "Escape"');
    expect(menu).toContain('onClick={close}');
    expect(menu).toContain('role="menu"');
    expect(menu).toContain('aria-haspopup="menu"');
  });

  it("uses actual streamed server milestones instead of timer-driven progress", () => {
    const service = readFileSync("src/server/forge-underwriting.ts", "utf8");
    const planner = readFileSync("src/server/route-http.ts", "utf8");
    const forge = readFileSync("src/components/forge-lab/forge-lab.tsx", "utf8");
    for (const stage of [
      "understanding_objective",
      "mapping_capabilities",
      "checking_observed_supply",
      "building_route_evidence",
      "underwriting_economics",
      "making_decision",
      "compiling_receipt",
    ]) expect(`${service}\n${planner}`).toContain(stage);
    expect(forge).toContain('Accept: "application/x-ndjson"');
    expect(forge).not.toMatch(/setTimeout\([^)]*progress/i);
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
