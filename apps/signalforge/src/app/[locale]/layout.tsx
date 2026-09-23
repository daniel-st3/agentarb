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
import { AuthProvider } from "@/components/account/auth-provider";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { supabasePublicConfig } from "@/lib/supabase/config";
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
  const authUser = await getAuthenticatedUser();
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
        <AuthProvider
          configured={Boolean(supabasePublicConfig())}
          initialUser={authUser ? {
            id: authUser.id,
            email: authUser.email ?? null,
            displayName: typeof authUser.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name : null,
            avatarUrl: typeof authUser.user_metadata?.avatar_url === "string" ? authUser.user_metadata.avatar_url : null,
          } : null}
        >
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

          <footer className="site-footer site-footer-v1 container">
            <div className="footer-identity"><span>{t("SignalForge")}<span className="brand-dot">.</span></span><p>{locale === "es" ? "Evaluación + ejecución acotada · sin pagos autónomos" : locale === "fr" ? "Analyse + exécution bornée · aucun paiement autonome" : "Underwriting + bounded execution · no autonomous payments"}</p></div>
            <nav aria-label={locale === "es" ? "Navegación de pie de página" : locale === "fr" ? "Navigation de pied de page" : "Footer navigation"}>
              <Link href="/forge">{t("Forge")}</Link>
              <Link href="/pricing">{t("Pricing")}</Link>
              <Link href="/developers/try">{t("Developers")}</Link>
              <Link href="/privacy">{t("Privacy and boundaries")}</Link>
              <a href="https://github.com/daniel-st3/agentarb" target="_blank" rel="noreferrer">GitHub ↗</a>
            </nav>
          </footer>
        </InteractionProvider>
        </AuthProvider>
      </NextIntlClientProvider>
    </>
  );
}
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
