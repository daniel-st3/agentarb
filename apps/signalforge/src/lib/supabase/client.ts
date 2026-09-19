"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { supabasePublicConfig } from "./config";

let browserClient: SupabaseClient<Database> | null | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;
  const config = supabasePublicConfig();
  browserClient = config
    ? createBrowserClient<Database>(config.url, config.publishableKey)
    : null;
  return browserClient;
}

