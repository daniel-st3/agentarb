import { setRequestLocale } from "next-intl/server";
import { getCopy } from "@/i18n/server";
import { pageMetadata } from "@/i18n/metadata";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { locales } from "@/i18n/routing";
import Link from "@/i18n/navigation";
import { Navigation } from "@/components/navigation";
import { NetworkState } from "@/components/network-state";
import { InteractionProvider } from "@/components/interactions/provider";
import { PageChoreography } from "@/components/editorial/atmosphere";
import { cachedNetworkView } from "@/server/intelligence/cached-view";
import { NetworkStatusSchema } from "@/domain/intelligence";
export const generateMetadata = ({
  params,
}: {
  params: Promise<{ locale: string }>;
}) => pageMetadata(params, "home");
export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getCopy();
  const cached = await cachedNetworkView();
  const { records, ...network } = cached ?? { records: [] };
  const observed = records.filter((r) =>
    ["live", "cached_live"].includes(r.freshness),
  );
  const initialStatus = cached
    ? NetworkStatusSchema.parse({
        ...network,
        observedCount: observed.length,
        observedCapabilities: [
          ...new Set(
            observed.flatMap((r) =>
              r.listingType === "service_offer"
                ? r.capabilities
                : r.requiredCapabilities,
            ),
          ),
        ],
        rateLimitMode:
          cached.cacheMode === "shared" ? "distributed" : "best_effort",
      })
    : null;
  return (
    <>
      <NextIntlClientProvider locale={locale}>
        <InteractionProvider>
          <a className="skip-link" href="#main">
            {t("Skip to content")}
          </a>

          <NetworkState initialStatus={initialStatus}>
            <Navigation />
            <main id="main">
              <PageChoreography>{children}</PageChoreography>
            </main>
          </NetworkState>

          <footer className="site-footer container">
            <span>
              {t("SignalForge")}
              <span className="brand-dot">.</span>
            </span>
            <p>{t("Discovery and planning only. Execution not enabled.")}</p>
            <Link href="/privacy">{t("Privacy and boundaries")}</Link>
            <Link
              href="https://github.com/daniel-st3/agentarb"
              target="_blank"
              rel="noreferrer"
            >
              {t("Source on GitHub ↗")}
            </Link>
            <p className="maker-credit">
              <Link href="https://github.com/daniel-st3/agentarb">
                {t(
                  "Designed and built by Daniel Rodríguez · AI systems, data, and product",
                )}
              </Link>
            </p>
          </footer>
        </InteractionProvider>
      </NextIntlClientProvider>
    </>
  );
}
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
