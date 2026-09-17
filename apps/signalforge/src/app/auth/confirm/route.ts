import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeAuthNext } from "@/lib/auth-redirect";
import { reportAuthCallback } from "@/server/account/auth-diagnostics";

const otpTypes = new Set<EmailOtpType>(["email", "email_change", "invite", "magiclink", "recovery", "signup"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeAuthNext(url.searchParams.get("next"));
  const client = await createSupabaseServerClient();
  if (tokenHash && rawType && otpTypes.has(rawType) && client) {
    try {
      const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: rawType });
      if (!error) {
        reportAuthCallback("auth_confirm_session_established");
        return NextResponse.redirect(new URL(next, url.origin));
      }
      reportAuthCallback("auth_confirm_verification_failed", { error });
    } catch (error) {
      reportAuthCallback("auth_confirm_verification_failed", { error });
    }
  }
  return NextResponse.redirect(new URL(`/en/forge?auth_error=1`, url.origin));
}
