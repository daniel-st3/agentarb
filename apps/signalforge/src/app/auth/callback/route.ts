import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/auth-redirect";
import { reportAuthCallback } from "@/server/account/auth-diagnostics";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeAuthNext(url.searchParams.get("next"));
  const client = await createSupabaseServerClient();
  if (code && client) {
    const verifierCookiePresent = (await cookies()).getAll().some(({ name }) => name.endsWith("-code-verifier") || /-code-verifier\.\d+$/.test(name));
    try {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        reportAuthCallback("auth_callback_session_established", { verifierCookiePresent });
        return NextResponse.redirect(new URL(next, url.origin));
      }
      reportAuthCallback("auth_callback_exchange_failed", { error, verifierCookiePresent });
    } catch (error) {
      reportAuthCallback("auth_callback_exchange_failed", { error, verifierCookiePresent });
    }
  }
  return NextResponse.redirect(new URL(`/en/forge?auth_error=1`, url.origin));
}
