"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { ConceptA } from "./concept-a";
import { ConceptB } from "./concept-b";
import { ConceptC } from "./concept-c";
import { labCopy } from "./copy";
import {
  fetchRealLabData,
  simulatedLabData,
  type LabDataset,
  type LabMode,
} from "./lab-model";
import styles from "./v2-lab.module.css";

type Concept = "a" | "b" | "c";

const emptyReal: LabDataset = {
  mode: "real",
  subject: null,
  observations: [],
  fetchedAt: null,
  matchedCount: 0,
  truncated: false,
  error: false,
};

export function VisualLab({ locale }: { locale: Locale }) {
  const copy = labCopy(locale);
  const reduced = useReducedMotion();
  const motionReduced = reduced === true;
  const [concept, setConcept] = useState<Concept>("a");
  const [mode, setMode] = useState<LabMode>("real");
  const [realData, setRealData] = useState<LabDataset>(emptyReal);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (mode !== "real") return;
    const controller = new AbortController();
    fetchRealLabData(AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]))
      .then((data) => {
        if (!controller.signal.aborted) setRealData(data);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRealData({ ...emptyReal, error: true });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [mode]);

  const dataset = mode === "real" ? realData : simulatedLabData(mode);
  const status = loading && mode === "real"
    ? copy.loading
    : dataset.error && mode === "real"
      ? copy.unavailable
      : mode !== "real"
        ? copy.simulated
        : dataset.subject
          ? `${dataset.matchedCount} observed · ${dataset.truncated ? "bounded result truncated" : "bounded result complete"}`
          : copy.noData;

  return (
    <div
      className={styles.lab}
      data-motion={motionReduced ? "reduced" : "system"}
      data-lab-mode={mode}
    >
      <header className={styles.labHeader}>
        <div>
          <p className={styles.labMarker}>{copy.lab}</p>
          <h1>{copy.title}</h1>
          <p className={styles.labIntro}>{copy.intro}</p>
        </div>
        <aside className={styles.truthRail} aria-label={copy.current}>
          <span>{copy.current}</span>
          <strong role="status" aria-live="polite">{status}</strong>
          <small>{copy.execution}</small>
        </aside>
      </header>

      <section className={styles.controls} aria-label="V2 lab controls">
        <div className={styles.controlGroup}>
          <span>{copy.concept}</span>
          <div role="tablist" aria-label={copy.concept}>
            {(["a", "b", "c"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={concept === item}
                aria-controls="v2-lab-concept"
                onClick={() => setConcept(item)}
              >
                {item.toUpperCase()}
                {concept === item && (
                  <m.span
                    layoutId="v2-lab-concept-indicator"
                    className={styles.controlIndicator}
                    transition={{ duration: motionReduced ? 0 : 0.2 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
        <fieldset className={styles.controlGroup}>
          <legend>{copy.state}</legend>
          <div>
            {(["real", "unknown", "degraded", "empty"] as const).map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  name="v2-lab-state"
                  value={item}
                  checked={mode === item}
                  onChange={() => {
                    if (item === "real") setLoading(true);
                    setMode(item);
                  }}
                />
                <span>{copy[item]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <div className={styles.stateDisclosure}>
        <span>{mode === "real" ? "REAL / BOUNDED API" : copy.simulated}</span>
        <p>{mode === "real" ? status : copy.notProduction}</p>
        <small>{copy.modeHint}</small>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <m.article
          id="v2-lab-concept"
          key={`${concept}:${mode}:${dataset.subject?.id ?? "none"}`}
          role="tabpanel"
          className={styles.conceptStage}
          initial={motionReduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={motionReduced ? undefined : { opacity: 0, y: -5 }}
          transition={{ duration: motionReduced ? 0 : 0.2 }}
        >
          {concept === "a" && <ConceptA subject={dataset.subject} copy={copy} />}
          {concept === "b" && <ConceptB dataset={dataset} copy={copy} />}
          {concept === "c" && <ConceptC subject={dataset.subject} copy={copy} />}
        </m.article>
      </AnimatePresence>

      <footer className={styles.labFooter}>
        <span>{copy.provenance} / {dataset.subject?.stateLabel ?? (mode === "real" ? "NO OBSERVATION" : copy.simulated)}</span>
        <span>{copy.execution}</span>
      </footer>
    </div>
  );
}
