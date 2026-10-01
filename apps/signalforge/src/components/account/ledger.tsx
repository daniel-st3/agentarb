import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import type { LedgerEntry } from "@/server/account/ledger";
import { ledgerCopy } from "./ledger-copy";
import styles from "./ledger.module.css";
export function AccountLedger({ locale, entries, analysesAvailable, executionsAvailable }: {
  locale: Locale; entries: LedgerEntry[]; analysesAvailable: boolean; executionsAvailable: boolean;
}) {
  const t = ledgerCopy[locale];
  const money = (cents: number | null) => cents === null ? t.unknown : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(cents / 100);
  const count = (kind: LedgerEntry["kind"]) => entries.filter((entry) => entry.kind === kind).length;
  const unavailable = !analysesAvailable || !executionsAvailable;
  return <article className={styles.ledger}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>{t.eyebrow}</p><h1>{t.title}</h1><p>{t.intro}</p></div>
      <nav><Link href={`/${locale}/forge`}>{t.newTask} ↗</Link><Link href={`/${locale}/account`}>{t.account}</Link></nav>
    </header>
    {unavailable && <p role="alert" className={styles.warning}>{entries.length ? t.partial : t.unavailable}</p>}
    <dl className={styles.summary}>
      <div><dt>{t.analyses}</dt><dd>{analysesAvailable ? count("underwrite") : "—"}</dd></div>
      <div><dt>{t.unresolved}</dt><dd>{analysesAvailable ? entries.filter((entry) => entry.valid && entry.kind === "underwrite" && entry.blockers.length).length : "—"}</dd></div>
      <div><dt>{t.executions}</dt><dd>{executionsAvailable ? count("synthesis") : "—"}</dd></div>
    </dl>
    <p className={styles.scope}>{t.scope}</p>
    {!entries.length && !unavailable && <section className={styles.empty}><h2>{t.empty}</h2><p>{t.emptyDetail}</p><Link href={`/${locale}/forge`}>{t.newTask} →</Link></section>}
    <ol className={styles.rows}>{entries.map((entry) => {
      const decision = entry.decision in t.statuses ? t.statuses[entry.decision as keyof typeof t.statuses] : entry.kind === "synthesis" && entry.valid ? t.completed : t.unknown;
      return <li key={entry.id} className={styles.row} data-ledger-kind={entry.kind} data-decision={entry.valid ? entry.decision : "unknown"}>
        <div><p className={styles.eyebrow}>{t[entry.kind]} · <time dateTime={entry.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(entry.createdAt))} UTC</time></p>
          <h2>{entry.title}</h2><strong>{entry.valid ? decision : t.invalid}</strong>
          <p className={styles.note}>{entry.kind === "underwrite" ? t.assumptions : t.charge}</p>
        </div>
        {entry.valid && <div><dl className={styles.values}>{entry.kind === "underwrite" ? <>
            <div><dt>{t.payout}</dt><dd>{money(entry.payout)}</dd></div>
            <div><dt>{t.cost}</dt><dd>{money(entry.cost)}</dd></div>
            <div><dt>{t.ev}</dt><dd>{money(entry.ev)}</dd></div>
            <div><dt>{t.evidence}</dt><dd>{entry.evidenceCount ?? t.unknown}</dd></div>
          </> : <>
            <div><dt>{t.sources}</dt><dd>{entry.sources ?? t.unknown}</dd></div>
            <div><dt>{t.calls}</dt><dd>{entry.calls ?? t.unknown}</dd></div>
            <div><dt>{t.usage}</dt><dd>{entry.usageCostMicros === null ? t.unknown : new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(Number(entry.usageCostMicros) / 1_000_000)}</dd></div>
          </>}</dl><p className={styles.note}>{t.historical}</p></div>}
        <div className={styles.receipt}>{entry.hash && <><span>{t.receipt}</span><code title={entry.hash}>{entry.hash.slice(0, 16)}…</code></>}<Link href={`/${locale}/account/history/${entry.kind === "synthesis" ? "execution/" : ""}${entry.id}`}>{t.open} ↗</Link></div>
      </li>;
    })}</ol>
  </article>;
}
