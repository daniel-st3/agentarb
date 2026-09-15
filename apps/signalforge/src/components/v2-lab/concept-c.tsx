"use client";

import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { m, useReducedMotion } from "motion/react";
import type { LabCopy } from "./copy";
import type { LabSubject } from "./lab-model";
import styles from "./v2-lab.module.css";

gsap.registerPlugin(useGSAP);

export function ConceptC({
  subject,
  copy,
}: {
  subject: LabSubject | null;
  copy: LabCopy;
}) {
  const scope = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const motionReduced = reduced === true;
  const [selected, setSelected] = useState("objective");

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({ defaults: { ease: "power2.out" } });
        timeline
          .fromTo(
            "[data-gsap-c=route]",
            { strokeDashoffset: 680 },
            { strokeDashoffset: 0, duration: 0.8, stagger: 0.1 },
          )
          .fromTo(
            "[data-gsap-c=spine]",
            { scaleY: 0 },
            { scaleY: 1, transformOrigin: "top", duration: 0.45 },
            "-=0.25",
          );
      });
      return () => media.revert();
    },
    { scope, dependencies: [subject?.id], revertOnUpdate: true },
  );

  if (!subject)
    return (
      <section className={styles.conceptEmpty} aria-labelledby="concept-c-title">
        <p className={styles.sectionIndex}>C / EXPERIMENTAL ROUTE INSTRUMENT</p>
        <h2 id="concept-c-title">Economic possibility cannot compile without a datum.</h2>
        <p>{copy.noData}</p>
      </section>
    );

  const nodes = [
    { id: "objective", label: copy.objective, detail: subject.objective },
    ...subject.capabilities.map((capability) => ({
      id: `capability:${capability}`,
      label: copy.capabilities,
      detail: capability.replaceAll("_", " "),
    })),
    ...subject.options.map((option) => ({
      id: `option:${option.id}`,
      label: copy.options,
      detail: `${option.name} · ${option.reason.replaceAll("_", " ")} · ${option.executionStatus}`,
    })),
    { id: "gate", label: copy.gates, detail: subject.missing.join(" · ") },
    { id: "contract", label: copy.contract, detail: copy.noRoute },
  ];
  const selectedNode = nodes.find((node) => node.id === selected) ?? nodes[0];

  return (
    <section ref={scope} className={styles.conceptC} aria-labelledby="concept-c-title">
      <header className={styles.conceptHeader}>
        <p className={styles.sectionIndex}>C / EXPERIMENTAL ROUTE INSTRUMENT</p>
        <h2 id="concept-c-title">Compile possibility. Preserve the rejection evidence.</h2>
      </header>

      <div className={styles.routeInstrument}>
        <svg className={styles.routeWiring} viewBox="0 0 1100 420" aria-hidden="true">
          <path data-gsap-c="route" d="M76 210H270C320 210 310 92 370 92H540" />
          <path data-gsap-c="route" d="M270 210C320 210 310 210 370 210H540" />
          <path data-gsap-c="route" d="M270 210C320 210 310 328 370 328H540" />
          <path className={styles.rejectedWire} data-gsap-c="route" d="M540 92C630 92 650 150 724 150H818" />
          <path className={styles.rejectedWire} data-gsap-c="route" d="M540 328C630 328 650 270 724 270H818" />
          <path data-gsap-c="route" d="M540 210H818C880 210 878 210 948 210H1030" />
        </svg>

        <div className={styles.instrumentColumns}>
          <InstrumentColumn label={copy.objective}>
            <InstrumentNode id="objective" selected={selected} setSelected={setSelected} reduced={motionReduced}>
              {subject.title}
            </InstrumentNode>
          </InstrumentColumn>
          <InstrumentColumn label={copy.capabilities}>
            {subject.capabilities.map((capability) => (
              <InstrumentNode key={capability} id={`capability:${capability}`} selected={selected} setSelected={setSelected} reduced={motionReduced}>
                {capability.replaceAll("_", " ")}
              </InstrumentNode>
            ))}
          </InstrumentColumn>
          <InstrumentColumn label={copy.options}>
            {subject.options.length ? subject.options.slice(0, 4).map((option) => (
              <InstrumentNode key={option.id} id={`option:${option.id}`} selected={selected} setSelected={setSelected} reduced={motionReduced} rejected>
                {option.name}
                <small>{copy.optionReason}</small>
              </InstrumentNode>
            )) : (
              <InstrumentNode id="option:none" selected={selected} setSelected={setSelected} reduced={motionReduced} rejected>
                {copy.unknownValue}
                <small>observed supply match unavailable</small>
              </InstrumentNode>
            )}
          </InstrumentColumn>
          <InstrumentColumn label={copy.gates}>
            <InstrumentNode id="gate" selected={selected} setSelected={setSelected} reduced={motionReduced} rejected>
              INCOMPLETE
              <small>{subject.missing[0] ?? copy.unknownValue}</small>
            </InstrumentNode>
          </InstrumentColumn>
          <InstrumentColumn label={copy.contract}>
            <InstrumentNode id="contract" selected={selected} setSelected={setSelected} reduced={motionReduced}>
              {copy.insufficient}
              <small>{copy.execution}</small>
            </InstrumentNode>
          </InstrumentColumn>
        </div>
      </div>

      <div className={styles.contractSpine} data-gsap-c="spine">
        <span>CONTRACT SPINE / {subject.id}</span>
        <strong>{selectedNode.label}</strong>
        <p>{selectedNode.detail}</p>
        <small>{copy.noRoute}</small>
      </div>
    </section>
  );
}

function InstrumentColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.instrumentColumn}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function InstrumentNode({
  id,
  selected,
  setSelected,
  reduced,
  rejected = false,
  children,
}: {
  id: string;
  selected: string;
  setSelected: (value: string) => void;
  reduced: boolean;
  rejected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <m.button
      type="button"
      className={`${styles.instrumentNode} ${rejected ? styles.rejectedNode : ""}`}
      data-node-id={id}
      aria-pressed={selected === id}
      onClick={() => setSelected(id)}
      onFocus={() => setSelected(id)}
      animate={{ opacity: selected === id ? 1 : rejected ? 0.62 : 0.82, x: selected === id ? 3 : 0 }}
      transition={{ duration: reduced ? 0 : 0.16 }}
    >
      {children}
    </m.button>
  );
}
