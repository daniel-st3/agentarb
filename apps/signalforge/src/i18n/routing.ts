import { defineRouting } from "next-intl/routing";
export const locales = ["en", "es", "fr"] as const;
export type Locale = (typeof locales)[number];
export const safeLocale = (value: unknown): Locale =>
  locales.includes(value as Locale) ? (value as Locale) : "en";
export const routing = defineRouting({
  locales,
  defaultLocale: "en",
  localePrefix: "always",
  localeDetection: false,
  localeCookie: false,
});
export const machinePath = (path: string) =>
  /^\/(?:api(?:\/|$)|\.well-known\/|llms\.txt|robots\.txt|sitemap\.xml|icon\.svg)/.test(
    path,
  );
