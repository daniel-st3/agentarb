"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link, { useRouter } from "@/i18n/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Locale } from "@/i18n/routing";
import { ConceptD } from "@/components/v2-lab/concept-d";
import { useNetworkState } from "@/components/network-state";
import {
  fetchRealLabData,
  type LabDataset,
} from "@/components/v2-lab/lab-model";
import { profitEngineCopy } from "./copy";
import styles from "./profit-engine.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function ProfitEngine({
  locale,
  initialDataset,
}: {
  locale: Locale;
  initialDataset: LabDataset;
}) {
  const copy = useMemo(() => profitEngineCopy(locale), [locale]);
  const router = useRouter();
  const [quickObjective, setQuickObjective] = useState("");
  const heroRef = useRef<HTMLElement>(null);
  const methodRef = useRef<HTMLDivElement>(null);
  const { status: networkStatus } = useNetworkState();
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

  useGSAP(() => {
    const hero = heroRef.current;
    const titleSignal = hero?.querySelector<HTMLElement>("[data-hero-signal]");
    const entrySignal = hero?.querySelector<HTMLElement>("[data-entry-signal]");
    if (!hero || !titleSignal || !entrySignal || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const signal = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    signal.fromTo(titleSignal, { scaleX: 0 }, { scaleX: 1, duration: 0.55, clearProps: "transform" });
    signal.fromTo(entrySignal, { scaleX: 0 }, { scaleX: 1, duration: 0.7, clearProps: "transform" }, "-=0.15");
  }, { scope: heroRef, dependencies: [Boolean(dataset.subject)], revertOnUpdate: true });

  useGSAP(() => {
    const host = methodRef.current;
    const trace = host?.querySelector<SVGPathElement>("[data-method-trace]");
    if (!host || !trace || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timeline = gsap.timeline({
      scrollTrigger: { trigger: host, start: "top 82%", once: true },
    });
    timeline.to(trace, { strokeDashoffset: 0, duration: 1.1, ease: "none" });
  }, { scope: methodRef, dependencies: [Boolean(dataset.subject)], revertOnUpdate: true });

  const subject = dataset.subject;
  const sourceState = refreshState === "loading"
    ? copy.product.loading
    : refreshState === "degraded"
      ? copy.product.unavailable
      : subject
        ? `${subject.sourceName} · ${subject.freshness}`
      : copy.product.empty;

  function openForge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const objective = quickObjective.trim();
    if (objective.length < 12) return;
    router.push(`/forge?objective=${encodeURIComponent(objective)}`);
  }

  return (
    <div className={styles.home} data-profit-engine data-refresh-state={refreshState}>
      <div className={styles.engine}>
        <aside className={styles.statusRail} aria-label={copy.product.liveWork}>
          <span className={styles.statusTitle}>{copy.product.marketPulse}</span>
          <span><strong>{networkStatus?.observedCount ?? "—"}</strong> {copy.product.observedListings}</span>
          <span><strong>{refreshState === "degraded" ? "—" : dataset.matchedCount}</strong> {copy.product.paidOpportunities}</span>
          <span className={styles.statusDetail} role="status" aria-live="polite">{sourceState}</span>
        </aside>

        {subject ? (
          <ConceptD
            dataset={dataset}
            copy={copy.forge}
            home={homePresentation}
          />
        ) : (
          <section className={styles.emptyHero} ref={heroRef} aria-labelledby="profit-engine-title">
            <div className={styles.heroMain}>
              <p>{copy.product.eyebrow}<span className={styles.heroSignal} data-hero-signal aria-hidden="true" /></p>
              <h1 id="profit-engine-title">{copy.product.headline}</h1>
              <p className={styles.heroIntroduction}>{copy.product.introduction}</p>
              <form className={styles.quickEntry} onSubmit={openForge}>
                <label htmlFor="home-task-entry">{copy.product.quickLabel}</label>
                <div>
                  <input id="home-task-entry" type="text" minLength={12} maxLength={2000} required value={quickObjective} onChange={(event) => setQuickObjective(event.target.value)} placeholder={copy.product.quickPlaceholder} />
                  <button type="submit">{copy.product.underwriteAction} ↗</button>
                  <span className={styles.entrySignal} data-entry-signal aria-hidden="true" />
                </div>
                <small>{copy.product.quickHint}</small>
              </form>
              <nav aria-label={copy.product.controlsLabel}>
                <Link href="/forge">{copy.product.openForge} →</Link>
                <Link href="/opportunities">{copy.product.openRadar} ↗</Link>
              </nav>
            </div>
            <div className={styles.heroMethod} ref={methodRef} aria-label={copy.product.methodLabel}>
              <p>{copy.product.methodLabel}</p>
              <svg className={styles.methodTrace} viewBox="0 0 24 210" aria-hidden="true" focusable="false"><path data-method-trace d="M12 8v194" /></svg>
              {copy.product.methodSteps.map((step, index) => (
                <div key={step.title} data-method-step>
                  <span>0{index + 1}</span>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              ))}
              <p className={styles.marketNote}>{refreshState === "degraded" ? copy.product.unavailable : copy.product.empty}</p>
            </div>
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
          <Entry href="/developers" index="03" title={copy.product.developers} detail={copy.product.developersDetail} />
          <Entry href="/opportunities" index="04" title={copy.product.receipts} detail={copy.product.receiptsDetail} />
        </nav>
      </section>

      <section className={styles.trust} aria-label={copy.product.boundariesLabel}>
        <span>{copy.product.trust}</span>
        <strong>{copy.product.boundary}</strong>
        <Link href="/developers">REST / MCP / A2A ↗</Link>
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
