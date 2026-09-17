import { locales } from "@/i18n/routing";

export function safeAuthNext(value: string | null, fallback = "/en/forge") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  const segment = value.split("/", 3)[1];
  return locales.includes(segment as (typeof locales)[number]) ? value : fallback;
}

