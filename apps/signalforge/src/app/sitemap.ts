import type { MetadataRoute } from "next";
import { locales } from "@/i18n/routing";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = "https://signalforge-rose-two.vercel.app";
  return [
    "",
    "/forge",
    "/network",
    "/opportunities",
    "/privacy",
    "/developers",
    "/developers/try",
    "/history",
  ].flatMap((path) =>
    locales.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [l, `${origin}/${l}${path}`]),
        ),
      },
    })),
  );
}
