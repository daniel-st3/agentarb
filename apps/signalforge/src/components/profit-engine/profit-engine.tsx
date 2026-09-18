"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ConceptD } from "@/components/v2-lab/concept-d";
import {
  fetchRealLabData,
  type LabDataset,
} from "@/components/v2-lab/lab-model";
import { profitEngineCopy } from "./copy";
import styles from "./profit-engine.module.css";

export function ProfitEngine({
  locale,
  initialDataset,
}: {
  locale: Locale;
  initialDataset: LabDataset;
}) {
  const copy = useMemo(() => profitEngineCopy(locale), [locale]);
  const homePresentation = useMemo(() => ({
    eyebrow: copy.product.eyebrow,
    headline: copy.product.headline,
    introduction: copy.product.introduction,
    inspectAction: copy.product.inspectAction,
    underwriteAction: copy.product.underwriteAction,
    controlsLabel: copy.product.controlsLabel,
  }), [copy]);
  const [dataset, setDataset] = useState(initialDataset);
  const [refreshState, setRefreshState] = useState<"loading" | "ready" | "degraded">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetchRealLabData(AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]))
      .then((next) => {
        if (!controller.signal.aborted) {
          setDataset(next);
          setRefreshState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRefreshState("degraded");
      });
    return () => controller.abort();
  }, []);

  const subject = dataset.subject;
  const sourceState = refreshState === "loading"
    ? copy.product.loading
    : refreshState === "degraded"
      ? copy.product.unavailable
      : subject
        ? `${subject.sourceName} · ${subject.freshness}`
        : copy.product.empty;

  return (
    <div className={styles.home} data-profit-engine data-refresh-state={refreshState}>
      <div className={styles.engine}>
        <aside className={styles.statusRail} aria-label={copy.product.liveWork}>
          <span>{subject?.freshness === "live" ? copy.product.liveWork : subject ? copy.product.cachedWork : copy.product.sourceStatus}</span>
          <strong role="status" aria-live="polite">{sourceState}</strong>
          <small>{subject ? `${subject.title} · ${subject.reward.display ?? copy.forge.unknownValue}` : copy.forge.execution}</small>
        </aside>

        {subject ? (
          <ConceptD
            dataset={dataset}
            copy={copy.forge}
            home={homePresentation}
          />
        ) : (
          <section className={styles.emptyHero} aria-labelledby="profit-engine-title">
            <p>{copy.product.eyebrow}</p>
            <h1 id="profit-engine-title">{copy.product.headline}</h1>
            <div>
              <strong>{refreshState === "degraded" ? copy.product.unavailable : copy.product.empty}</strong>
              <span>{copy.product.emptyDetail}</span>
            </div>
            <nav aria-label={copy.product.controlsLabel}>
              <Link href="/opportunities">{copy.product.openRadar} ↗</Link>
              <Link href="/forge">{copy.product.underwriteAction} →</Link>
            </nav>
          </section>
        )}
      </div>

      <section className={styles.entries} aria-labelledby="product-entry-title">
        <header>
          <p>{copy.product.productEntry}</p>
          <h2 id="product-entry-title">{copy.product.entryTitle}</h2>
        </header>
        <nav aria-label={copy.product.productEntry}>
          <Entry href="/opportunities" index="01" title={copy.product.radar} detail={copy.product.radarDetail} />
          <Entry href="/forge" index="02" title={copy.product.forge} detail={copy.product.forgeDetail} />
          <Entry href="/developers/try" index="03" title={copy.product.developers} detail={copy.product.developersDetail} />
          <Entry href="/opportunities" index="04" title={copy.product.receipts} detail={copy.product.receiptsDetail} />
        </nav>
      </section>

      <section className={styles.trust} aria-label="SignalForge boundaries">
        <span>{copy.product.trust}</span>
        <strong>{copy.product.boundary}</strong>
        <Link href="/developers/try">REST / MCP / A2A ↗</Link>
      </section>
    </div>
  );
}

function Entry({ href, index, title, detail }: { href: string; index: string; title: string; detail: string }) {
  return (
    <Link href={href}>
      <span>{index}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
      <b aria-hidden="true">↗</b>
    </Link>
  );
}
