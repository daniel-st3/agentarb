import { z } from "zod";

const ConfigSchema = z.object({
  url: z.string().url().startsWith("https://"),
  publishableKey: z.string().min(20).max(1000),
});

export type SupabasePublicConfig = z.infer<typeof ConfigSchema>;

export function supabasePublicConfig(): SupabasePublicConfig | null {
  const parsed = ConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

