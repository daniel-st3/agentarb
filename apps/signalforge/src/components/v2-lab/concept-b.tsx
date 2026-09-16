"use client";

import { useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { m, useReducedMotion } from "motion/react";
import type { LabCopy } from "./copy";
import type { LabDataset, LabObservation } from "./lab-model";
import styles from "./v2-lab.module.css";

gsap.registerPlugin(useGSAP);

function markPosition(item: LabObservation, index: number) {
  const x = 54 + (item.completeness / 100) * 650;
  const digits = item.reward.atomicAmount?.replace(/^0+/, "").length ?? 0;
  const y = digits ? 330 - Math.min(230, Math.max(12, digits * 27)) : 338;
  return { x, y: y - (index % 3) * 7 };
}

export function ConceptB({
  dataset,
  copy,
}: {
  dataset: LabDataset;
  copy: LabCopy;
}) {
  const scope = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const motionReduced = reduced === true;
  const [selectedId, setSelectedId] = useState(dataset.subject?.id ?? null);
  const selected =
    dataset.observations.find((item) => item.id === selectedId) ??
    dataset.observations[0] ??
    null;
  const positions = useMemo(
    () => dataset.observations.map(markPosition),
    [dataset.observations],
  );

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          "[data-gsap-b=capture]",
          { strokeDashoffset: 420 },
          { strokeDashoffset: 0, duration: 0.65, ease: "power2.out" },
        );
      });
      return () => media.revert();
    },
    { scope, dependencies: [selected?.id], revertOnUpdate: true },
  );

  return (
    <section ref={scope} className={styles.conceptB} aria-labelledby="concept-b-title">
      <header className={styles.conceptHeader}>
        <p className={styles.sectionIndex}>B / LIVE MARKET SIGNAL FIELD</p>
        <h2 id="concept-b-title">Observed work, arranged by evidence.</h2>
        <p>{copy.axes}</p>
        <small>{copy.coverage}</small>
      </header>

      {dataset.observations.length === 0 ? (
        <div className={styles.conceptEmpty}>
          <strong>{copy.noData}</strong>
          <p>{copy.unavailable}</p>
        </div>
      ) : (
        <>
          <div className={styles.marketField} aria-label="Observed opportunity field">
            <svg
              className={styles.marketPlot}
              viewBox="0 0 780 390"
              role="img"
              aria-labelledby="market-title market-description"
            >
              <title id="market-title">Observed opportunity field</title>
              <desc id="market-description">{copy.axes}. {copy.coverage}</desc>
              <path className={styles.axis} d="M54 24V338H748" />
              {[25, 50, 75, 100].map((tick) => (
                <g key={tick} className={styles.plotTick}>
                  <line x1={54 + tick * 6.5} y1="330" x2={54 + tick * 6.5} y2="346" />
                  <text x={54 + tick * 6.5} y="369" textAnchor="middle">{tick}%</text>
                </g>
              ))}
              {selected && (() => {
                const index = dataset.observations.findIndex((item) => item.id === selected.id);
                const position = positions[Math.max(index, 0)];
                return (
                  <path
                    data-gsap-b="capture"
                    className={styles.captureTrace}
                    d={`M${position.x} ${position.y} C${position.x + 55} ${position.y}, 690 90, 748 58`}
                    strokeDasharray="420"
                    strokeDashoffset="0"
                  />
                );
              })()}
              {dataset.observations.map((item, index) => {
                const position = positions[index];
                const active = item.id === selected?.id;
                return (
                  <m.g
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${copy.inspect}: ${item.title}`}
                    aria-pressed={active}
                    onClick={() => setSelectedId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(item.id);
                      }
                    }}
                    animate={{ opacity: active ? 1 : 0.58, scale: active ? 1 : 0.86 }}
                    transition={{ duration: motionReduced ? 0 : 0.18 }}
                    style={{ transformOrigin: `${position.x}px ${position.y}px` }}
                    className={styles.marketMark}
                  >
                    <circle cx={position.x} cy={position.y} r={active ? 11 : 8} />
                    <line x1={position.x} y1={position.y + 14} x2={position.x} y2="338" />
                    <text x={position.x + 16} y={position.y - 12}>{String(index + 1).padStart(2, "0")}</text>
                  </m.g>
                );
              })}
            </svg>

            {selected && (
              <aside className={styles.marketCapture} aria-live="polite">
                <span>{copy.selectedDatum} / {selected.sourceName}</span>
                <strong>{selected.title}</strong>
                <dl>
                  <dt>{copy.reward}</dt>
                  <dd>{selected.reward.display ?? copy.unknownValue}</dd>
                  <dt>Economic completeness</dt>
                  <dd>{selected.completeness}%</dd>
                  <dt>{copy.observed}</dt>
                  <dd>{selected.observedAt || copy.unknownValue}</dd>
                  <dt>Decision</dt>
                  <dd>{selected.decision.replaceAll("_", " ")}</dd>
                </dl>
              </aside>
            )}
          </div>

          <ol className={styles.marketList} aria-label="Accessible observed opportunity list">
            {dataset.observations.map((item, index) => (
              <li key={item.id}>
                <button onClick={() => setSelectedId(item.id)} aria-pressed={item.id === selected?.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.title}</strong>
                  <small>{item.reward.display ?? copy.unknownValue} · {item.completeness}%</small>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
