import { notFound, redirect } from "next/navigation";
import { safeLocale } from "@/i18n/routing";
import { createSupabaseServerClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { SourceSynthesisResponseSchema } from "@/domain/source-synthesis";
import { hashReceipt } from "@/server/arbitrage/service";
import { DeleteAnalysis } from "@/components/account/account-actions";

export const metadata = { robots: { index: false, follow: false } };

const copy = {
  en: { title: "Saved source synthesis", objective: "Objective", sources: "Public sources", findings: "Source-bound findings", limitations: "Limitations", receipt: "Execution receipt", fingerprint: "Fingerprint, not a digital signature", delete: "Delete run", prompt: "Delete this execution?", detail: "This removes the saved execution from your account. It cannot be undone." },
  es: { title: "Síntesis de fuentes guardada", objective: "Objetivo", sources: "Fuentes públicas", findings: "Hallazgos con fuentes", limitations: "Limitaciones", receipt: "Recibo de ejecución", fingerprint: "Huella, no firma digital", delete: "Eliminar ejecución", prompt: "¿Eliminar esta ejecución?", detail: "Se eliminará esta ejecución guardada de tu cuenta. No se puede deshacer." },
  fr: { title: "Synthèse des sources enregistrée", objective: "Objectif", sources: "Sources publiques", findings: "Constats sourcés", limitations: "Limites", receipt: "Reçu d’exécution", fingerprint: "Empreinte, pas une signature numérique", delete: "Supprimer l’exécution", prompt: "Supprimer cette exécution ?", detail: "Cette action supprime l’exécution enregistrée de votre compte. Elle est irréversible." },
};

export default async function SavedSourceSynthesis({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: rawLocale, id } = await params;
  const locale = safeLocale(rawLocale);
  const t = copy[locale];
  if (!(await getAuthenticatedUser())) redirect(`/${locale}/account/history`);
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  const client = await createSupabaseServerClient();
  const { data } = client ? await client.from("source_synthesis_runs").select("*").eq("id", id).maybeSingle() : { data: null };
  if (!data) notFound();
  const parsed = SourceSynthesisResponseSchema.shape.receipt.safeParse(data.receipt_payload);
  if (!parsed.success || parsed.data.receiptHash !== data.receipt_hash || hashReceipt(parsed.data.core) !== data.receipt_hash) notFound();
  const receipt = parsed.data;
  return <article className="account-page saved-analysis container">
    <p className="eyebrow">SIGNALFORGE / {t.title}</p><h1>{t.title}</h1>
    <section><h2>{t.objective}</h2><p>{receipt.core.objective}</p></section>
    <section><h2>{t.sources}</h2><ol>{receipt.core.sourceUrls.map((url) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ol></section>
    <section><h2>{t.findings}</h2><p>{receipt.core.result.summary}</p><ol>{receipt.core.result.findings.map((finding, index) => <li key={index}>{finding.statement} {finding.sourceIds.map((sourceId) => <a key={sourceId} href={receipt.core.sourceUrls[sourceId - 1]} target="_blank" rel="noreferrer">[{sourceId}]</a>)}</li>)}</ol></section>
    <section><h2>{t.limitations}</h2><ul>{receipt.core.result.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>
    <section><h2>{t.receipt}</h2><code>{receipt.receiptHash}</code><p>{receipt.hashAlgorithm} · {t.fingerprint} · {receipt.core.verificationStatus}</p></section>
    <div className="account-actions"><DeleteAnalysis id={id} kind="source-synthesis-runs" label={t.delete} prompt={t.prompt} detail={t.detail} /></div>
  </article>;
}
