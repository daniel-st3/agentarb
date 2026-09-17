"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { Flip } from "gsap/Flip";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { m, useReducedMotion } from "motion/react";
import type { ArbitrageEvaluation, Decision } from "@/domain/arbitrage";
import Link from "@/i18n/navigation";
import type { LabCopy } from "./copy";
import {
  fetchLabUnderwriting,
  explicitLabChallengeScenario,
  type LabChallengeScenario,
  type LabDataset,
  type LabReceipt,
  type LabSubject,
} from "./lab-model";
import styles from "./v2-lab.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText, Flip, DrawSVGPlugin);

const STAGES = ["capture", "capabilities", "route", "economics", "decision"] as const;
type DerivedEconomics = NonNullable<ArbitrageEvaluation["realEconomics"]>["derived"];

export type ForgeHomePresentation = {
  eyebrow: string;
  introduction: string;
  inspectAction: string;
  underwriteAction: string;
  controlsLabel: string;
};

const MARKET_SLOTS = [
  [68, 21], [84, 18], [57, 43], [78, 46], [91, 42], [55, 68], [72, 73], [88, 67], [43, 84],
] as const;

function usdMicros(value: string | null | undefined) {
  if (value == null) return "UNKNOWN";
  const amount = BigInt(value), negative = amount < 0n, absolute = negative ? -amount : amount;
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "−" : ""}$${absolute / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}

function percentageWidth(value: string | null | undefined, reward: string | null | undefined) {
  if (value == null || reward == null || BigInt(reward) <= 0n) return null;
  const amount = BigInt(value) < 0n ? -BigInt(value) : BigInt(value);
  return Math.max(3, Math.min(100, Number((amount * 1000n) / BigInt(reward)) / 10));
}

function decisionText(decision: Decision, copy: LabCopy) {
  const labels: Partial<Record<Decision, string>> = {
    conditionally_profitable: copy.conditionallyProfitable,
    conditionally_marginal: copy.conditionallyMarginal,
    conditionally_uneconomic: copy.conditionallyUneconomic,
    insufficient_data: copy.insufficient,
    not_eligible: copy.notEligible,
    unroutable: copy.unroutable,
  };
  return labels[decision] ?? decision.toUpperCase().replaceAll("_", " ");
}

export function ConceptD({
  dataset,
  copy,
  home,
}: {
  dataset: LabDataset;
  copy: LabCopy;
  home?: ForgeHomePresentation;
}) {
  const subject = dataset.subject;
  const scope = useRef<HTMLElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const trigger = useRef<ScrollTrigger | null>(null);
  const replayTween = useRef<gsap.core.Tween | null>(null);
  const stageValue = useRef(0);
  const reduced = useReducedMotion();
  const motionReduced = reduced === true;
  const [receipt, setReceipt] = useState<LabReceipt>();
  const [requestState, setRequestState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [stage, setStage] = useState(0);
  const [skipped, setSkipped] = useState(motionReduced);
  const [scenarioActive, setScenarioActive] = useState(false);
  const [probability, setProbability] = useState(70);
  const [reviewMicros, setReviewMicros] = useState("250000");
  const [fontsReady, setFontsReady] = useState(false);
  const [layoutRevision, setLayoutRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => {
      if (active) setFontsReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let width = window.innerWidth;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (Math.abs(window.innerWidth - width) < 2) return;
        width = window.innerWidth;
        setLayoutRevision((value) => value + 1);
      }, 160);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const request = useCallback(async (scenario?: LabChallengeScenario, signal?: AbortSignal) => {
    if (!subject?.opportunity) return;
    const local = signal ?? AbortSignal.timeout(12_000);
    setRequestState("loading");
    try {
      const next = await fetchLabUnderwriting(subject.id, local, scenario);
      if (!local.aborted) {
        setReceipt(next);
        setRequestState("ready");
      }
    } catch {
      if (!local.aborted) setRequestState("error");
    }
  }, [subject]);

  useEffect(() => {
    if (!subject?.opportunity) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      request(undefined, AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]));
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [request, subject?.id, subject?.opportunity]);

  useEffect(() => {
    if (!scenarioActive || !subject?.opportunity) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      request(
        explicitLabChallengeScenario(subject, probability, reviewMicros),
        AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
      );
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [probability, request, reviewMicros, scenarioActive, subject]);

  const evaluation = receipt?.evaluation;
  const economics = evaluation?.realEconomics;
  const derived = economics?.derived;
  const activeDecision = evaluation?.decision ?? subject?.decision ?? "insufficient_data";
  const options = evaluation?.supplyOptions ?? subject?.options ?? [];
  const capabilities = evaluation?.capabilityCoverage.required ?? subject?.capabilities ?? [];
  const reasons = evaluation?.reasons ?? subject?.missing ?? [];

  const ledger = useMemo(() => [
    { label: copy.reward, value: derived?.grossRewardUsdMicros ?? null, provenance: "OBSERVED / MARKET RATE" },
    { label: copy.spend, value: derived?.knownExternalSpendUsdMicros ?? null, provenance: "OBSERVED / MARKET RATE" },
    { label: copy.cost, value: derived?.providerCostCeilingUsdMicros ?? null, provenance: "PUBLISHED / USER WORKLOAD" },
    { label: "REVIEW + FEES", value: derived?.humanReviewCostUsdMicros ?? null, provenance: scenarioActive ? "USER ASSUMPTION" : "UNKNOWN" },
    { label: copy.risk, value: derived?.expectedFailureCostUsdMicros ?? null, provenance: scenarioActive ? "USER ASSUMPTION / DERIVED" : "UNKNOWN" },
    { label: copy.residual, value: derived?.expectedProfitUsdMicros ?? null, provenance: "DERIVED" },
  ], [copy, derived, scenarioActive]);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      if (skipped || !fontsReady) return;
      const root = scope.current;
      const story = root?.querySelector<HTMLElement>("[data-forge-story]");
      const pin = root?.querySelector<HTMLElement>("[data-forge-pin]");
      const marketMark = root?.querySelector<HTMLElement>("[data-forge-active-mark]");
      const subjectCore = root?.querySelector<HTMLElement>("[data-forge-subject]");
      const heading = root?.querySelector<HTMLElement>("[data-forge-heading]");
      const verdict = root?.querySelector<HTMLElement>("[data-forge-verdict]");
      if (!story || !pin || !marketMark || !subjectCore || !heading || !verdict) return;

      const headingSplit = SplitText.create(heading, { type: "lines", aria: "auto", linesClass: styles.dSplitLine });
      const verdictSplit = SplitText.create(verdict, { type: "lines", aria: "auto", linesClass: styles.dSplitLine });
      const layers = gsap.utils.toArray<HTMLElement>("[data-forge-layer]", root);
      gsap.set(layers, { autoAlpha: 0 });
      gsap.set(layers[0], { autoAlpha: 1 });
      gsap.set(layers.slice(1), { scaleX: 0.985, transformOrigin: "left center" });
      gsap.set(subjectCore, { autoAlpha: 0 });
      Flip.fit(subjectCore, marketMark, { scale: true });

      const updateStage = (progress: number) => {
        const next = progress < 0.34 ? 0 : progress < 0.5 ? 1 : progress < 0.68 ? 2 : progress < 0.86 ? 3 : 4;
        if (stageValue.current !== next) {
          stageValue.current = next;
          setStage(next);
        }
      };
      const tl = gsap.timeline({ defaults: { ease: "none" } });
      tl.fromTo("[data-forge-market-frame]", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.075 }, 0)
        .fromTo(headingSplit.lines, { autoAlpha: 0, scaleX: 0.9, transformOrigin: "left center" }, { autoAlpha: 1, scaleX: 1, duration: 0.065, stagger: 0.018, ease: "power3.inOut" }, 0.025)
        .fromTo("[data-forge-market-mark]", { scale: 0, transformOrigin: "0 0" }, { scale: 1, duration: 0.045, stagger: 0.007, ease: "power2.out" }, 0.075)
        .fromTo("[data-forge-market-trace]", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.055 }, 0.1)
        .to("[data-forge-market-secondary]", { opacity: 0.16, duration: 0.08 }, 0.13)
        .to(subjectCore, { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.12, ease: "power3.inOut" }, 0.13)
        .set(layers[1], { autoAlpha: 1, scaleX: 1 }, 0.18)
        .set(layers[0], { autoAlpha: 0 }, 0.18)
        .set(layers[2], { autoAlpha: 1, scaleX: 1 }, 0.34)
        .set(layers[1], { autoAlpha: 0 }, 0.34)
        .from("[data-forge-capability]", { opacity: 0.15, scaleX: 0.92, transformOrigin: "left", stagger: 0.014, duration: 0.06 }, 0.36)
        .from("[data-forge-capability-path]", { drawSVG: 0, stagger: 0.012, duration: 0.08 }, 0.36)
        .set(layers[3], { autoAlpha: 1, scaleX: 1 }, 0.5)
        .set(layers[2], { autoAlpha: 0 }, 0.5)
        .from("[data-forge-option-line]", { drawSVG: 0, stagger: 0.014, duration: 0.08 }, 0.53)
        .to("[data-forge-rejected]", { opacity: 0.42, scaleX: 0.985, transformOrigin: "left", duration: 0.08 }, 0.62)
        .set(layers[4], { autoAlpha: 1, scaleX: 1 }, 0.68)
        .set(layers[3], { autoAlpha: 0 }, 0.68)
        .from("[data-forge-economic-row]", { opacity: 0.12, scaleX: 0.94, transformOrigin: "left", stagger: 0.012, duration: 0.06 }, 0.7)
        .set(layers[5], { autoAlpha: 1, scaleX: 1 }, 0.88)
        .set(layers[4], { autoAlpha: 0 }, 0.88)
        .fromTo(verdictSplit.lines, { autoAlpha: 0.5, scaleX: 0.91, transformOrigin: "left center" }, { autoAlpha: 1, scaleX: 1, duration: 0.075, stagger: 0.018, ease: "power3.inOut" }, 0.88);

      const st = ScrollTrigger.create({
        id: home ? "profit-engine-story" : "v2-forge-story",
        trigger: story,
        start: "top top",
        end: home ? "+=300%" : "+=400%",
        pin,
        scrub: 0.55,
        animation: tl,
        invalidateOnRefresh: true,
        onUpdate: (self) => updateStage(self.progress),
      });
      timeline.current = tl;
      trigger.current = st;
      return () => {
        replayTween.current?.kill();
        st.kill();
        tl.kill();
        headingSplit.revert();
        verdictSplit.revert();
        timeline.current = null;
        trigger.current = null;
      };
    });
    return () => media.revert();
  }, { scope, dependencies: [subject?.id, activeDecision, skipped, fontsReady, layoutRevision, home], revertOnUpdate: true });

  const replay = () => {
    setSkipped(false);
    requestAnimationFrame(() => {
      const tl = timeline.current, st = trigger.current;
      if (!tl || !st) return;
      scope.current?.querySelector("[data-forge-story]")?.scrollIntoView({ block: "start" });
      st.disable(false);
      tl.pause(0);
      replayTween.current?.kill();
      replayTween.current = gsap.to(tl, {
        progress: 1,
        duration: home ? 7 : 11,
        ease: "none",
        onUpdate: () => {
          const progress = tl.progress();
          const next = progress < 0.34 ? 0 : progress < 0.5 ? 1 : progress < 0.68 ? 2 : progress < 0.86 ? 3 : 4;
          if (next !== stageValue.current) { stageValue.current = next; setStage(next); }
        },
        onComplete: () => st.enable(false, true),
      });
    });
  };

  const skip = () => {
    replayTween.current?.kill();
    timeline.current?.progress(1).pause();
    trigger.current?.disable(true);
    setStage(4);
    setSkipped(true);
  };

  const goToStage = (index: number) => {
    if (motionReduced || skipped || !trigger.current) {
      stageValue.current = index;
      setStage(index);
      return;
    }
    const st = trigger.current;
    const targetProgress = [0.08, 0.41, 0.58, 0.76, 0.94][index];
    const targetScroll = st.start + (st.end - st.start) * targetProgress;
    replayTween.current?.kill();
    window.scrollTo({ top: targetScroll, behavior: "auto" });
    ScrollTrigger.update();
    stageValue.current = index;
    setStage(index);
  };

  if (!subject) return (
    <section className={styles.conceptEmpty} aria-labelledby="concept-d-title">
      <p className={styles.sectionIndex}>D / {copy.forge}</p>
      <h2 id="concept-d-title">{copy.forgeTitle}</h2>
      <p>{copy.noData}</p>
    </section>
  );

  return (
    <section ref={scope} className={styles.conceptD} aria-labelledby="concept-d-title" data-surface={home ? "home" : "lab"} data-scenario-active={scenarioActive} data-forge-stage={STAGES[stage]} data-story-skipped={skipped} data-decision={activeDecision}>
      <header className={styles.dIntro}>
        <p className={styles.sectionIndex}>{home?.eyebrow ?? `D / ${copy.forge} · SIGNALFORGE / LIVE UNDERWRITING`}</p>
        {home ? <h1 id="concept-d-title">{copy.forgeTitle}</h1> : <h2 id="concept-d-title">{copy.forgeIntro}</h2>}
        {home && <p className={styles.dHomeIntroduction}>{home.introduction}</p>}
        {home && <div className={styles.dHomeActions}>
          <Link href={`/opportunities?id=${encodeURIComponent(subject.id)}`}>{home.inspectAction} ↗</Link>
          <Link href="/forge">{home.underwriteAction} →</Link>
        </div>}
        <div className={styles.dPlayback} aria-label={home?.controlsLabel ?? "Story controls"}>
          <button type="button" onClick={replay} disabled={motionReduced}>{copy.replay}</button>
          <button type="button" onClick={skip}>{copy.skip}</button>
        </div>
      </header>

      <ol className={styles.dProgress} aria-label="Underwriting stages">
        {STAGES.map((item, index) => <li key={item} aria-current={stage === index ? "step" : undefined}><button type="button" onClick={() => goToStage(index)}><span>0{index + 1}</span>{item === "route" ? copy.compile : copy[item]}</button></li>)}
      </ol>

      <div className={`${styles.dStory} ${skipped ? styles.dStorySkipped : ""}`} data-forge-story>
        <div className={styles.dPin} data-forge-pin aria-hidden="true">
          <div className={styles.dMarketField} data-forge-layer>
            <h3 data-forge-heading>{copy.forgeTitle}</h3>
            <p>{copy.observedContext}</p>
            <svg className={styles.dMarketFrame} viewBox="0 0 1000 640" preserveAspectRatio="none" aria-hidden="true">
              <path data-forge-market-frame d="M510 72H948V520H510" />
              <path data-forge-market-trace d="M680 135H758V205" />
            </svg>
            {dataset.observations.slice(0, 9).map((item, index) => (
              <span
                key={item.id}
                className={`${styles.dMarketMark} ${item.id === subject.id ? styles.dMarketMarkActive : ""}`}
                data-forge-active-mark={item.id === subject.id ? "true" : undefined}
                data-forge-market-secondary={item.id === subject.id ? undefined : "true"}
                data-forge-market-mark
                data-observation-id={item.id}
                style={{ "--mark-x": `${MARKET_SLOTS[index][0]}%`, "--mark-y": `${MARKET_SLOTS[index][1]}%` } as React.CSSProperties}
              >
                <b>{item.reward.display ?? "?"}</b><small>{item.sourceName}</small>
              </span>
            ))}
          </div>

          <div className={styles.dSubjectCore} data-forge-subject>
            <span>{subject.sourceName} / {subject.freshness}</span>
            <strong>{subject.title}</strong>
          </div>

          <div className={styles.dLayer} data-forge-layer>
            <CaptureStage subject={subject} copy={copy} />
          </div>
          <div className={styles.dLayer} data-forge-layer>
            <CapabilityStage capabilities={capabilities} missing={subject.missing} copy={copy} />
          </div>
          <div className={styles.dLayer} data-forge-layer>
            <RouteStage options={options} reasons={reasons} decision={activeDecision} copy={copy} />
          </div>
          <div className={styles.dLayer} data-forge-layer>
            <EconomicsStage ledger={ledger} derived={derived} subject={subject} copy={copy} reduced={motionReduced} />
          </div>
          <div className={`${styles.dLayer} ${styles.dVerdict}`} data-forge-layer>
            <span>DECISION / {activeDecision.replaceAll("_", " ")}</span>
            <strong className={styles.dResponsiveVerdict} data-forge-verdict>{decisionText(activeDecision, copy)}</strong>
            <small>{scenarioActive ? "OBSERVED + PUBLISHED + USER ASSUMPTION + DERIVED" : "OBSERVED / UNKNOWN REMAINS UNKNOWN"}</small>
          </div>
        </div>
      </div>

      <div className={styles.dMobileFlow} aria-label="Complete underwriting sequence">
        <CausalStep index="01" label={copy.capture}><CaptureStage subject={subject} copy={copy} /></CausalStep>
        <CausalStep index="02" label={copy.capabilities}><CapabilityStage capabilities={capabilities} missing={subject.missing} copy={copy} /></CausalStep>
        <CausalStep index="03" label={copy.compile}><RouteStage options={options} reasons={reasons} decision={activeDecision} copy={copy} /></CausalStep>
        <CausalStep index="04" label={copy.economics}><EconomicsStage ledger={ledger} derived={derived} subject={subject} copy={copy} reduced={true} /></CausalStep>
        <CausalStep index="05" label={copy.decision}><div className={styles.dSemanticVerdict}><strong className={styles.dResponsiveVerdict} data-forge-mobile-verdict>{decisionText(activeDecision, copy)}</strong><span>{evaluation?.executionStatus ?? subject.executionStatus}</span></div></CausalStep>
      </div>

      <Challenge
        subject={subject}
        copy={copy}
        scenarioActive={scenarioActive}
        activate={() => setScenarioActive(true)}
        probability={probability}
        setProbability={setProbability}
        reviewMicros={reviewMicros}
        setReviewMicros={setReviewMicros}
        evaluation={evaluation}
        requestState={requestState}
        reduced={motionReduced}
      />

      <div className={styles.dAfterword}>
        <section><h3>{copy.whatSaw}</h3><p>{subject.sourceName} · {subject.observedAt || copy.unknownValue} · {subject.reward.display ?? copy.unknownValue}</p></section>
        <section><h3>{copy.whatAssumed}</h3><p>{scenarioActive ? `${probability}% · ${usdMicros(reviewMicros)} review · USER ASSUMPTION` : copy.unknownValue}</p></section>
        <section><h3>{copy.whatSurvived}</h3><p>{options.length} observed options · {copy.routeLimit}</p></section>
        <section><h3>{copy.whatChanges}</h3><p>{economics?.missingInputs.join(" · ") || `${copy.probability} · ${copy.reviewCost}`}</p></section>
      </div>
      <p className={styles.dBoundary}>{subject.executionStatus} · NOT CALLED · NOT PAID</p>
    </section>
  );
}

function CaptureStage({ subject, copy }: { subject: LabSubject; copy: LabCopy }) {
  const facts = [
    [copy.source, subject.sourceName], [copy.observed, subject.observedAt || copy.unknownValue],
    [copy.reward, subject.reward.display ?? copy.unknownValue], [copy.spend, subject.externalSpend.display ?? copy.unknownValue],
    [copy.bond, subject.refundableBond.display ?? copy.unknownValue], ["ELIGIBILITY", subject.eligibility.replaceAll("_", " ")],
  ];
  return <div className={styles.dCapture}><p>{copy.capture} / REAL OBSERVATION</p><h3>{subject.title}</h3><dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><small>{subject.missing.join(" · ")}</small></div>;
}

function CapabilityStage({ capabilities, missing, copy }: { capabilities: string[]; missing: string[]; copy: LabCopy }) {
  return <div className={styles.dCapabilities}><p>{copy.capabilities}</p><svg viewBox="0 0 720 110"><path data-forge-capability-path d="M4 55H716" /></svg><ol>{capabilities.length ? capabilities.map((capability, index) => <li data-forge-capability key={capability}><span>0{index + 1}</span><strong>{capability.replaceAll("_", " ")}</strong></li>) : <li data-forge-capability><strong>{copy.unknownValue}</strong></li>}</ol><small>{missing.filter((item) => item.includes("requirement") || item.includes("support")).join(" · ") || "DETERMINISTIC REQUIREMENTS"}</small></div>;
}

function RouteStage({ options, reasons, decision, copy }: { options: Array<{ id: string; name: string; executionStatus: string; rawPriceText?: string | null; price?: string | null }>; reasons: string[]; decision: Decision; copy: LabCopy }) {
  const visible = options.slice(0, 4);
  return <div className={styles.dRoute}><p>{copy.compile} / ECONOMIC COMPILER</p><div className={styles.dRouteRows}>{visible.length ? visible.map((option) => <div key={option.id} data-forge-rejected><svg viewBox="0 0 360 16"><path data-forge-option-line d="M2 8H350" /><path className={styles.dGateMark} d="M334 2l12 12m0-12-12 12" /></svg><strong>{option.name}</strong><span>REJECTED / {option.rawPriceText ?? option.price ?? "TASK COST UNKNOWN"}</span><small>OBSERVED OPTION · {option.executionStatus}</small></div>) : <div className={styles.dRouteGap} data-forge-rejected><svg viewBox="0 0 360 16"><path data-forge-option-line d="M2 8H162M198 8H350" /><path className={styles.dGateMark} d="M170 2l18 12m0-12-18 12" /></svg><strong>{copy.unknownValue}</strong><span>INTERRUPTED / OBSERVED SUPPLY MATCH UNAVAILABLE</span><small>NO CANDIDATE ROUTE INVENTED</small></div>}</div><aside data-route-candidate-set="absent"><b>{copy.routeOutcome}</b><strong className={styles.dResponsiveVerdict} data-forge-route-verdict>{decisionText(decision, copy)}</strong><p>{copy.routeLimit}</p><small>{reasons.slice(0, 4).join(" · ")}</small></aside></div>;
}

function EconomicsStage({ ledger, derived, subject, copy, reduced }: { ledger: Array<{ label: string; value: string | null; provenance: string }>; derived?: DerivedEconomics; subject: LabSubject; copy: LabCopy; reduced: boolean }) {
  const reward = derived?.grossRewardUsdMicros ?? null;
  return <div className={styles.dEconomics}><p>ECONOMIC COMPRESSION / USD MICROS</p>{ledger.map((row, index) => { const width = percentageWidth(row.value, reward); const unknown = width === null; return <div className={`${styles.dEconomicRow} ${unknown ? styles.dEconomicUnknown : ""}`} data-forge-economic-row key={row.label}><span>{row.label}<small>{row.provenance}</small></span><div className={styles.dEconomicTrack}>{unknown ? <span aria-hidden="true">?</span> : <m.i initial={false} animate={{ scaleX: width / 100 }} transition={{ duration: reduced ? 0 : 0.28, ease: [0.33, 1, 0.68, 1] }} />}</div><strong>{usdMicros(row.value)}</strong>{unknown && <small className={styles.dUnknownReason}>INPUT UNRESOLVED / NOT ZERO</small>}{index < ledger.length - 1 && <em aria-hidden="true">−</em>}</div>; })}<aside><span>{copy.bond}</span><strong>{subject.refundableBond.display ?? copy.unknownValue}</strong><small>REFUNDABLE CAPITAL / CAPITAL ≠ EXPENSE</small></aside></div>;
}

function CausalStep({ index, label, children }: { index: string; label: string; children: React.ReactNode }) {
  return <section className={styles.dCausalStep}><header><span>{index}</span><h3>{label}</h3></header>{children}</section>;
}

function Challenge({ subject, copy, scenarioActive, activate, probability, setProbability, reviewMicros, setReviewMicros, evaluation, requestState, reduced }: { subject: LabSubject; copy: LabCopy; scenarioActive: boolean; activate: () => void; probability: number; setProbability: (value: number) => void; reviewMicros: string; setReviewMicros: (value: string) => void; evaluation?: ArbitrageEvaluation; requestState: string; reduced: boolean }) {
  const breakEven = evaluation?.realEconomics?.derived.requiredSuccessProbabilityBps;
  const result = requestState === "loading" ? copy.recalculating : evaluation ? `${decisionText(evaluation.decision, copy)} · ${evaluation.executionStatus}` : copy.insufficient;
  return <section className={styles.dChallenge} aria-labelledby="forge-challenge-title"><header><p className={styles.sectionIndex}>MODEL INPUT / USER SCENARIO</p><h2 id="forge-challenge-title">{copy.challenge}</h2><p>{scenarioActive ? copy.scenarioApplied : copy.scenarioDisclosure}</p></header><div className={styles.dChallengeInstrument} data-challenge-instrument>{!scenarioActive ? <button type="button" className={styles.dApplyScenario} onClick={activate} disabled={!subject.opportunity}>{copy.applyScenario} ↗</button> : <div className={styles.dChallengeControls}><label><span>{copy.probability}</span><output>{probability}%</output><input aria-label={copy.probability} type="range" min="0" max="100" step="1" value={probability} style={{ "--range-progress": `${probability}%` } as React.CSSProperties} onChange={(event) => setProbability(Number(event.target.value))} /></label><label><span>{copy.reviewCost}</span><output>{usdMicros(reviewMicros)}</output><input aria-label={copy.reviewCost} type="range" min="0" max="3000000" step="50000" value={reviewMicros} style={{ "--range-progress": `${Number(reviewMicros) / 30000}%` } as React.CSSProperties} onChange={(event) => setReviewMicros(event.target.value)} /></label><div className={styles.dThreshold}><span>{copy.threshold}</span><strong>{breakEven == null ? copy.unknownValue : `${breakEven / 100}%`}</strong>{breakEven != null && <m.i key={evaluation?.decision ?? "unknown"} initial={reduced ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: reduced ? 0 : 0.2 }} style={{ insetInlineStart: `${Math.min(100, breakEven / 100)}%` }} />}</div></div>}<div className={styles.dChallengeResult}><span>RESULT</span><m.strong key={evaluation?.decision ?? requestState} initial={reduced ? false : { opacity: 0.35, scaleX: 0.97 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ duration: reduced ? 0 : 0.2 }} role="status" aria-live="polite">{result}</m.strong></div></div></section>;
}
