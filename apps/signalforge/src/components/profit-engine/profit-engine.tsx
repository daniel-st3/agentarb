"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link, { useRouter } from "@/i18n/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Locale } from "@/i18n/routing";
import { useNetworkState } from "@/components/network-state";
import { fetchRealLabData, type LabDataset } from "@/components/v2-lab/lab-model";
import { profitEngineCopy } from "./copy";
import styles from "./profit-engine.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function ProfitEngine({ locale, initialDataset }: { locale: Locale; initialDataset: LabDataset }) {
  const copy = useMemo(() => profitEngineCopy(locale), [locale]);
  const router = useRouter();
  const [quickObjective, setQuickObjective] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [dataset, setDataset] = useState(initialDataset);
  const [refreshState, setRefreshState] = useState<"loading" | "ready" | "degraded">("loading");
  const heroRef = useRef<HTMLElement>(null);
  const methodRef = useRef<HTMLElement>(null);
  const { status: networkStatus } = useNetworkState();

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
    gsap.timeline({ defaults: { ease: "power2.inOut" } })
      .fromTo(titleSignal, { scaleX: 0 }, { scaleX: 1, duration: 0.55, clearProps: "transform" })
      .fromTo(entrySignal, { scaleX: 0 }, { scaleX: 1, duration: 0.7, clearProps: "transform" }, "-=0.15");
  }, { scope: heroRef });

  useGSAP(() => {
    const host = methodRef.current;
    const trace = host?.querySelector<SVGPathElement>("[data-method-trace]");
    if (!host || !trace || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.timeline({ scrollTrigger: { trigger: host, start: "top bottom", once: true } })
      .to(trace, { strokeDashoffset: 0, duration: 1.1, ease: "none" });
  }, { scope: methodRef });

  function openForge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const objective = quickObjective.trim();
    if (objective.length < 12) return;
    router.push(`/forge?objective=${encodeURIComponent(objective)}`);
  }

  const subject = dataset.subject;
  const freshnessLabel = subject?.freshness === "live"
    ? copy.freshLive
    : subject?.freshness === "cached_live"
      ? copy.freshCached
      : copy.freshUnknown;
  const sourceState = refreshState === "loading"
    ? copy.loading
    : refreshState === "degraded"
      ? copy.unavailable
      : subject
        ? `${subject.sourceName} · ${freshnessLabel}`
        : copy.empty;
  const observationHref = subject ? `/opportunities?id=${encodeURIComponent(subject.id)}` : "/opportunities";

  return (
    <div className={styles.home} data-profit-engine data-refresh-state={refreshState}>
      <div className={styles.engine}>
        <aside className={styles.statusRail} aria-label={copy.liveWork}>
          <span className={styles.statusTitle}>{copy.marketPulse}</span>
          <span><strong>{networkStatus?.observedCount ?? "—"}</strong> {copy.observedListings}</span>
          <span><strong>{refreshState === "degraded" ? "—" : dataset.matchedCount}</strong> {copy.paidOpportunities}</span>
          <span className={styles.statusDetail} role="status" aria-live="polite">{sourceState}</span>
        </aside>

        <section className={styles.hero} ref={heroRef} aria-labelledby="profit-engine-title">
          <div className={styles.heroMain}>
            <p className={styles.eyebrow}>{copy.eyebrow}<span className={styles.heroSignal} data-hero-signal aria-hidden="true" /></p>
            <h1 id="profit-engine-title">{copy.headline}</h1>
            <p className={styles.heroIntroduction}>{copy.introduction}</p>
            <form className={styles.quickEntry} onSubmit={openForge}>
              <label htmlFor="home-task-entry">{copy.quickLabel}</label>
              <div className={styles.entryField}>
                <input id="home-task-entry" type="text" minLength={12} maxLength={2000} required value={quickObjective} onChange={(event) => setQuickObjective(event.target.value)} placeholder={copy.quickPlaceholder} />
                <button type="submit">{copy.underwriteAction} ↗</button>
                <span className={styles.entrySignal} data-entry-signal aria-hidden="true" />
              </div>
              <small>{copy.quickHint}</small>
            </form>
            <div className={styles.examples} aria-label={copy.examplesLabel}>
              {copy.examples.map((example) => <button type="button" key={example.label} onClick={() => {
                setQuickObjective(example.objective);
                document.getElementById("home-task-entry")?.focus();
              }}>{example.label} <span aria-hidden="true">↗</span></button>)}
            </div>
            <Link className={styles.secondaryAction} href="/forge">{copy.openForge} →</Link>
          </div>

          <div className={styles.heroEvidence} data-observation-id={subject?.id}>
            <div className={styles.evidenceTopline}><span>{subject ? copy.evidenceLabel : copy.marketPulse}</span><span>{subject ? freshnessLabel : "—"}</span></div>
            <p className={styles.evidenceQuestion}>{copy.evidenceQuestion}</p>
            <div className={styles.evidenceBody}>
              {subject ? (
                <>
                  <p className={styles.evidenceSource}>{subject.sourceName} / {copy.observedFact}</p>
                  <h2>{subject.title}</h2>
                  <dl className={styles.evidenceFacts}>
                    <div><dt>{copy.rewardLabel}</dt><dd>{subject.reward.display ?? copy.unknown}</dd></div>
                    <div><dt>{copy.spendLabel}</dt><dd>{subject.externalSpend.display ?? copy.unknown}</dd></div>
                    <div><dt>{copy.decisionLabel}</dt><dd>{subject.decision === "not_eligible" ? copy.notEligible : copy.insufficientData}</dd></div>
                  </dl>
                  <p className={styles.evidenceCaveat}>{copy.evidenceCaveat}</p>
                </>
              ) : (
                <>
                  <h2>{copy.noObservation}</h2>
                  <p className={styles.evidenceCaveat}>{refreshState === "degraded" ? copy.unavailable : copy.emptyDetail}</p>
                </>
              )}
            </div>
            <Link href={observationHref}>{subject ? copy.inspectAction : copy.openRadar} ↗</Link>
          </div>
        </section>
      </div>

      <section className={styles.method} ref={methodRef} aria-labelledby="method-title">
        <div className={styles.methodIntro}>
          <p className={styles.eyebrow}>{copy.methodLabel}</p>
          <h2 id="method-title">{copy.methodHeading}</h2>
          <p>{copy.methodIntroduction}</p>
        </div>
        <div className={styles.methodInstrument}>
          <svg className={styles.methodTrace} viewBox="0 0 24 210" aria-hidden="true" focusable="false"><path data-method-trace d="M12 8v194" /></svg>
          {copy.methodSteps.map((step, index) => (
            <button type="button" className={styles.methodStep} key={step.title} data-method-step data-active={activeStep === index} aria-pressed={activeStep === index} onClick={() => setActiveStep(index)}>
              <span>0{index + 1}</span><strong>{step.title}</strong><small>{step.detail}</small><b aria-hidden="true">↗</b>
            </button>
          ))}
          <div className={styles.methodResolution} role="status" aria-live="polite">
            <span>{copy.methodOutcome}</span><strong>{copy.methodSteps[activeStep].title}</strong><p>{copy.methodSteps[activeStep].detail}</p>
          </div>
        </div>
      </section>

      <section className={styles.agent} aria-labelledby="agent-entry-title">
        <div><p className={styles.eyebrow}>REST / MCP</p><h2 id="agent-entry-title">{copy.agentTitle}</h2><p>{copy.agentDetail}</p><Link href="/developers">{copy.agentAction} ↗</Link></div>
        <div className={styles.agentContract}>
          <ol>{copy.agentFlow.map((step) => <li key={step}>{step}</li>)}</ol>
          <code>POST /api/v1/forge/underwrite</code>
          <code>MCP · signalforge_underwrite_task</code>
          <small>executionStatus: execution_not_enabled</small>
        </div>
      </section>
      <section className={styles.entries} aria-labelledby="product-entry-title">
        <header><p>{copy.productEntry}</p><h2 id="product-entry-title">{copy.entryTitle}</h2></header>
        <nav aria-label={copy.productEntry}>
          <Entry href="/opportunities" index="01" title={copy.radar} detail={copy.radarDetail} />
          <Entry href="/forge" index="02" title={copy.forge} detail={copy.forgeDetail} />
          <Entry href="/developers" index="03" title={copy.developers} detail={copy.developersDetail} />
          <Entry href="/opportunities" index="04" title={copy.receipts} detail={copy.receiptsDetail} />
        </nav>
      </section>
      <section className={styles.trust} aria-label={copy.boundariesLabel}>
        <span>{copy.trust}</span><strong>{copy.boundary}</strong><Link href="/developers">REST / MCP / Agent Card ↗</Link>
      </section>
    </div>
  );
}

function Entry({ href, index, title, detail }: { href: string; index: string; title: string; detail: string }) {
  return <Link href={href}><span>{index}</span><strong>{title}</strong><small>{detail}</small><b aria-hidden="true">↗</b></Link>;
}
