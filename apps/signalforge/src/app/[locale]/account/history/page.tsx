import Link from "@/i18n/navigation";
import { getAuthenticatedUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { safeLocale } from "@/i18n/routing";
import { SignInPrompt } from "@/components/account/account-actions";
import { ForgeUnderwritingResponseSchema } from "@/domain/forge-underwriting";
import { SourceSynthesisResponseSchema } from "@/domain/source-synthesis";
export const metadata = { robots: { index: false, follow: false } };

const copy = {
  en: { eyebrow: "SIGNALFORGE / ACCOUNT", title: "My analyses", intro: "Private underwriting and source-synthesis snapshots. Opening one never re-runs it.", empty: "No saved analyses yet.", open: "Open snapshot", payout: "payout", cost: "expected cost", ev: "risk-adjusted EV", unknown: "unresolved", executions: "Source synthesis", sources: "sources", call: "call" },
  es: { eyebrow: "SIGNALFORGE / CUENTA", title: "Mis análisis", intro: "Instantáneas privadas de evaluación y síntesis de fuentes. Abrir una no vuelve a ejecutarla.", empty: "Todavía no hay análisis guardados.", open: "Abrir instantánea", payout: "pago", cost: "costo esperado", ev: "VE ajustado al riesgo", unknown: "sin resolver", executions: "Síntesis de fuentes", sources: "fuentes", call: "llamada" },
  fr: { eyebrow: "SIGNALFORGE / COMPTE", title: "Mes analyses", intro: "Instantanés privés d’analyse et de synthèse des sources. Leur ouverture ne relance aucun calcul.", empty: "Aucune analyse enregistrée.", open: "Ouvrir l’instantané", payout: "rémunération", cost: "coût attendu", ev: "VA ajustée au risque", unknown: "non résolu", executions: "Synthèse des sources", sources: "sources", call: "appel" },
};

const money = (cents: number | null, locale: string) => cents === null ? null : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);

export default async function AccountHistory({ params }: { params: Promise<{ locale: string }> }) {
  const locale = safeLocale((await params).locale);
  const t = copy[locale];
  const user = await getAuthenticatedUser();
  if (!user) return <article className="account-page container"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p><SignInPrompt /></article>;
  const client = await createSupabaseServerClient();
  const { data } = client ? await client.from("forge_runs").select("id,title,decision,result_payload,receipt_hash,created_at").order("created_at", { ascending: false }).limit(100) : { data: [] };
  const { data: executions } = client ? await client.from("source_synthesis_runs").select("id,objective,receipt_payload,created_at").order("created_at", { ascending: false }).limit(100) : { data: [] };
  return (
    <article className="account-page container">
      <p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p>
      {!data?.length && !executions?.length ? <p className="account-empty">{t.empty}</p> : null}
      {!!data?.length && <div className="analysis-list">{data.map((row) => {
        const parsed = ForgeUnderwritingResponseSchema.safeParse(row.result_payload);
        const result = parsed.success ? parsed.data : null;
        return <Link key={row.id} href={`/account/history/${row.id}`} className="analysis-row">
          <div><span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.created_at))}</span><h2>{row.title}</h2><strong>{row.decision.replaceAll("_", " ")}</strong></div>
          <p>{result ? [money(result.scenario.payout.valueCents, locale) ? `${money(result.scenario.payout.valueCents, locale)} ${t.payout}` : t.unknown, money(result.economics.expectedTotalCostCents, locale) ? `${money(result.economics.expectedTotalCostCents, locale)} ${t.cost}` : t.unknown, money(result.economics.riskAdjustedExpectedValueCents, locale) ? `${money(result.economics.riskAdjustedExpectedValueCents, locale)} ${t.ev}` : t.unknown].join(" · ") : t.unknown}</p>
          <span>{t.open} ↗</span>
        </Link>;
      })}</div>}
      {!!executions?.length && <section><h2>{t.executions}</h2><div className="analysis-list">{executions.map((row) => {
        const parsed = SourceSynthesisResponseSchema.shape.receipt.safeParse(row.receipt_payload);
        return <Link key={row.id} href={`/account/history/execution/${row.id}`} className="analysis-row">
          <div><span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(row.created_at))}</span><h2>{row.objective.slice(0, 120)}</h2><strong>{t.executions}</strong></div>
          <p>{parsed.success ? `${parsed.data.core.sourceUrls.length} ${t.sources} · ${parsed.data.core.usage.calls} ${t.call}` : t.unknown}</p>
          <span>{t.open} ↗</span>
        </Link>;
      })}</div></section>}
    </article>
  );
}
