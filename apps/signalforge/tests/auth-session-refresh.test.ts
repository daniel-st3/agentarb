import { afterEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const setSession = vi.hoisted(() => vi.fn());
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (values: unknown[]) => void } }) => ({
    auth: { getUser: async () => { setSession(); options.cookies.setAll([{ name: "test-session", value: "new-test-value", options: { httpOnly: true, secure: true, sameSite: "lax" } }]); return { data: { user: null } }; } },
  }),
}));
import { refreshSupabaseSession } from "../src/lib/supabase/proxy";
afterEach(() => vi.unstubAllEnvs());
it("refreshes both the browser cookie and the server request without losing locale routing", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-configuration-only");
  const request = new NextRequest("https://preview.example/fr/account/history", { headers: { cookie: "test-session=old-test-value" } });
  const response = NextResponse.rewrite("https://preview.example/fr/account/history");
  response.headers.set("x-middleware-override-headers", "x-next-intl-locale");
  response.headers.set("x-middleware-request-x-next-intl-locale", "fr");
  const refreshed = await refreshSupabaseSession(request, response);
  expect(refreshed.headers.get("x-middleware-request-cookie")).toContain("test-session=new-test-value");
  expect(refreshed.cookies.get("test-session")?.value).toBe("new-test-value");
  expect(refreshed.headers.get("x-middleware-request-x-next-intl-locale")).toBe("fr");
  expect(refreshed.headers.get("x-middleware-rewrite")).toBe("https://preview.example/fr/account/history");
  expect(refreshed.headers.get("set-cookie")).toMatch(/HttpOnly/);
  expect(refreshed.headers.get("set-cookie")).toMatch(/Secure/);
});
