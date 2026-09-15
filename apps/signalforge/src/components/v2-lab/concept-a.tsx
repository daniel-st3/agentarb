"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { LabCopy } from "./copy";
import type { LabSubject } from "./lab-model";
import styles from "./v2-lab.module.css";

gsap.registerPlugin(useGSAP);

function shown(value: string | null, unknownLabel: string) {
  return value ?? unknownLabel;
}

export function ConceptA({
  subject,
  copy,
}: {
  subject: LabSubject | null;
  copy: LabCopy;
}) {
  const scope = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
        timeline
          .from("[data-gsap-a=question]", {
            clipPath: "inset(0 0 100% 0)",
            yPercent: 12,
            duration: 0.7,
          })
          .from(
            "[data-gsap-a=rule]",
            { scaleX: 0, transformOrigin: "left", duration: 0.45, stagger: 0.08 },
            "-=0.32",
          )
          .from(
            "[data-gsap-a=value]",
            { xPercent: -6, opacity: 0, duration: 0.38, stagger: 0.075 },
            "-=0.3",
          )
          .from(
            "[data-gsap-a=verdict]",
            { clipPath: "inset(0 100% 0 0)", duration: 0.55 },
            "-=0.08",
          );
      });
      return () => media.revert();
    },
    { scope, dependencies: [subject?.id], revertOnUpdate: true },
  );

  if (!subject)
    return (
      <section className={styles.conceptEmpty} aria-labelledby="concept-a-title">
        <p className={styles.sectionIndex}>A / TYPOGRAPHIC ECONOMIC STATE</p>
        <h2 id="concept-a-title">{copy.verdictQuestion}</h2>
        <p>{copy.noData}</p>
      </section>
    );

  const verdict =
    subject.decision === "not_eligible" ? copy.notEligible : copy.insufficient;
  const ledger = [
    [copy.reward, subject.reward],
    [copy.spend, subject.externalSpend],
    [copy.cost, subject.fulfillmentCost],
    [copy.risk, subject.riskAdjustment],
    [copy.residual, subject.residualValue],
  ] as const;

  return (
    <section ref={scope} className={styles.conceptA} aria-labelledby="concept-a-title">
      <div className={styles.aQuestion}>
        <p className={styles.sectionIndex}>A / TYPOGRAPHIC ECONOMIC STATE</p>
        <h2 id="concept-a-title" data-gsap-a="question">
          {copy.verdictQuestion}
        </h2>
        <p className={styles.subjectTitle}>{subject.title}</p>
      </div>

      <div className={styles.compression} aria-label="Economic compression ledger">
        {ledger.map(([label, value], index) => (
          <div
            className={`${styles.compressionRow} ${value.display === null ? styles.interrupted : ""}`}
            key={label}
          >
            <div className={styles.compressionRule} data-gsap-a="rule" aria-hidden="true">
              <span style={{ inlineSize: `${Math.max(30, 100 - index * 14)}%` }} />
            </div>
            <div className={styles.compressionCopy} data-gsap-a="value">
              <span>{label}</span>
              <strong>{shown(value.display, copy.unknownValue)}</strong>
              <small>{value.provenance.replaceAll("_", " ")}</small>
            </div>
          </div>
        ))}
      </div>

      <aside className={styles.capitalRail}>
        <span>{copy.bond}</span>
        <strong>{shown(subject.refundableBond.display, copy.unknownValue)}</strong>
        <small>{copy.bond} ≠ expense</small>
      </aside>

      <div className={styles.aVerdict} data-gsap-a="verdict" role="status">
        <span>DECISION / {subject.decision.replaceAll("_", " ")}</span>
        <strong>{verdict}</strong>
        <p>{subject.missing.join(" · ")}</p>
      </div>
    </section>
  );
}
