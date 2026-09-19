import { notFound, redirect } from "next/navigation";
import Link from "@/i18n/navigation";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ForgeUnderwritingResponseSchema } from "@/domain/forge-underwriting";
import { safeLocale } from "@/i18n/routing";
import { DeleteAnalysis } from "@/components/account/account-actions";
export const metadata = { robots: { index: false, follow: false } };

const text = {
  en: { snapshot: "SAVED UNDERWRITING SNAPSHOT", objective: "Objective", capabilities: "Required capabilities", context: "Observed context", economics: "Economics", limitations: "Limitations", receipt: "Receipt fingerprint", payout: "Payout", cost: "Expected cost", risk: "Risk-adjusted EV", capital: "Refundable capital · not expense", again: "Run again", remove: "Delete analysis", prompt: "Delete this analysis?", detail: "This removes the saved analysis from your SignalForge account. This cannot be undone." },
  es: { snapshot: "INSTANTÁNEA GUARDADA", objective: "Objetivo", capabilities: "Capacidades requeridas", context: "Contexto observado", economics: "Economía", limitations: "Limitaciones", receipt: "Huella del recibo", payout: "Pago", cost: "Costo esperado", risk: "VE ajustado al riesgo", capital: "Capital reembolsable · no es gasto", again: "Ejecutar de nuevo", remove: "Eliminar análisis", prompt: "¿Eliminar este análisis?", detail: "Esto elimina el análisis guardado de tu cuenta de SignalForge. No se puede deshacer." },
  fr: { snapshot: "INSTANTANÉ ENREGISTRÉ", objective: "Objectif", capabilities: "Capacités requises", context: "Contexte observé", economics: "Économie", limitations: "Limites", receipt: "Empreinte du reçu", payout: "Rémunération", cost: "Coût attendu", risk: "VA ajustée au risque", capital: "Capital remboursable · pas une dépense", again: "Relancer", remove: "Supprimer l’analyse", prompt: "Supprimer cette analyse ?", detail: "Cette action supprime l’analyse enregistrée de votre compte SignalForge. Elle est irréversible." },
};
const money = (cents: number | null, locale: string) => cents === null ? "UNKNOWN" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);

export default async function SavedRun({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  const locale = safeLocale(rawLocale), t = text[locale];
  if (!(await getAuthenticatedUser())) redirect(`/${locale}/account/history`);
  const client = await createSupabaseServerClient();
  const { data } = client ? await client.from("forge_runs").select("*").eq("id", id).maybeSingle() : { data: null };
  if (!data) notFound();
  const parsed = ForgeUnderwritingResponseSchema.safeParse(data.result_payload);
  if (!parsed.success) notFound();
  const result = parsed.data;
  return <article className="account-page saved-analysis container">
    <p className="eyebrow">{t.snapshot}</p><h1>{data.title}</h1><strong className="saved-decision">{result.decision.replaceAll("_", " ")}</strong>
    <section><h2>{t.objective}</h2><p>{result.planning.objectiveFrame.normalizedObjective}</p></section>
    <section><h2>{t.capabilities}</h2><ol>{result.planning.objectiveFrame.requiredCapabilities.map((item) => <li key={item.id}>{item.label} · {item.priority}</li>)}</ol></section>
    <section><h2>{t.context}</h2><p>{result.routeEvidence.status.replaceAll("_", " ")} · {result.planning.route.observedSupply.length} options · NOT CALLED / NOT PAID / EXECUTION DISABLED</p></section>
    <section><h2>{t.economics}</h2><dl><div><dt>{t.payout}</dt><dd>{money(result.scenario.payout.valueCents, locale)}</dd></div><div><dt>{t.cost}</dt><dd>{money(result.economics.expectedTotalCostCents, locale)}</dd></div><div><dt>{t.risk}</dt><dd>{money(result.economics.riskAdjustedExpectedValueCents, locale)}</dd></div><div><dt>{t.capital}</dt><dd>{money(result.financialExposure.refundableCapitalCents, locale)}</dd></div></dl></section>
    <section><h2>{t.limitations}</h2><ul>{result.limitations.map((item) => <li key={item}>{item.replaceAll("_", " ")}</li>)}</ul></section>
    <section><h2>{t.receipt}</h2><code>{result.receipt.receiptHash}</code><p>SHA-256/canonical-json-v2 · not a digital signature</p></section>
    <div className="account-actions"><Link className="account-primary" href={`/forge?objective=${encodeURIComponent(data.objective)}`}>{t.again}</Link><DeleteAnalysis id={id} label={t.remove} prompt={t.prompt} detail={t.detail} /></div>
  </article>;
}
