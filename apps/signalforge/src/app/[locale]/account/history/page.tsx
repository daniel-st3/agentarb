import { getAuthenticatedUser, createSupabaseServerClient } from "@/lib/supabase/server";
import { safeLocale } from "@/i18n/routing";
import { SignInPrompt } from "@/components/account/account-actions";
import { AccountLedger } from "@/components/account/ledger";
import { ledgerCopy } from "@/components/account/ledger-copy";
import { buildLedger } from "@/server/account/ledger";
export const metadata = { robots: { index: false, follow: false } };

export default async function AccountHistory({ params }: { params: Promise<{ locale: string }> }) {
  const locale = safeLocale((await params).locale);
  const t = ledgerCopy[locale];
  const user = await getAuthenticatedUser();
  if (!user) return <article className="account-page container"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p><SignInPrompt /></article>;
  const client = await createSupabaseServerClient();
  const [analyses, executions] = await Promise.allSettled([
    client?.from("forge_runs").select("id,title,result_payload,receipt_hash,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    client?.from("source_synthesis_runs").select("id,objective,receipt_payload,receipt_hash,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const a = analyses.status === "fulfilled" ? analyses.value : null;
  const e = executions.status === "fulfilled" ? executions.value : null;
  return <AccountLedger locale={locale} entries={buildLedger(a?.error ? [] : a?.data ?? [], e?.error ? [] : e?.data ?? [])}
    analysesAvailable={!!a && !a.error} executionsAvailable={!!e && !e.error} />;
}
