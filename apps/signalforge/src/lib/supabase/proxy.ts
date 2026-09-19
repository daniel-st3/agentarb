import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "./config";
import type { Database } from "./database";

export async function refreshSupabaseSession(request: NextRequest, response: NextResponse) {
  const config = supabasePublicConfig();
  if (!config) return response;
  const client = createServerClient<Database>(config.url, config.publishableKey, {
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        signal: init.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(2_000)])
          : AbortSignal.timeout(2_000),
      }),
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const value of values) request.cookies.set(value.name, value.value);
        for (const value of values) response.cookies.set(value.name, value.value, value.options);
      },
    },
  });
  try {
    await client.auth.getUser();
  } catch {
    // Identity continuity must never make public product routes unavailable.
  }
  return response;
}
