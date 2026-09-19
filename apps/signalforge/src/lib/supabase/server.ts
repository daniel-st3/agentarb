import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";
import type { Database } from "./database";

const authFetch: typeof fetch = (input, init = {}) => fetch(input, {
  ...init,
  signal: init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(2_000)])
    : AbortSignal.timeout(2_000),
});

export async function createSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const config = supabasePublicConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    global: { fetch: authFetch },
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const value of values) store.set(value.name, value.value, value.options);
        } catch {
          // Server Components cannot always write cookies. proxy.ts refreshes them.
        }
      },
    },
  });
}

export async function getAuthenticatedUser(): Promise<User | null> {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
}
