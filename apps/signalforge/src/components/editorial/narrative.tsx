"use client";
import { useCopy } from "@/i18n/copy";

import { useRef } from "react";
import Link from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Run } from "@/domain/schema";
import { seedRoutes } from "@/domain/route-planner";
import { money } from "../ui";
import { LivingEvidence } from "./living-evidence";
gsap.registerPlugin(useGSAP, ScrollTrigger);

const chapters = [
  {
    name: "FRAME OBJECTIVE",
    title: "Start with the boundary.",
    text: "An objective, a hard budget, and explicit capability and verification requirements.",
  },
  {
    name: "MAP CAPABILITIES",
    title: "Not every source belongs.",
    text: "Compare capability, reliability, cost, and independent support. Unconfigured and catalog-only options stay out.",
  },
  {
    name: "COMPETE ROUTES",
    title: "Select only what helps.",
    text: "Compare service chains rather than isolated providers. Every selected capability has a role and modeled cost.",
  },
  {
    name: "COMPILE CONTRACT",
    title: "Show what holds up.",
    text: "Compile dependency order, fallbacks, verification requirements, and stop conditions. Execution remains disabled.",
  },
];
export function ProviderRouteMap() {
  const t = useCopy();

  return (
    <div
      className="provider-route-map"
      aria-label={t(
        "Capability services and a verification requirement converge at the route contract",
      )}
    >
      <svg viewBox="0 0 460 380" fill="none" aria-hidden="true">
        <path
          className="confidence-trail"
          d="M24 48 H128 V128 H292 V210 H426 M128 128 V300 H292 V210"
        />
        <path className="rejected-path" pathLength="1" d="M128 128 V58 H360" />
        <path
          className="route-guide"
          d="M24 48 H128 V128 H292 V210 H426 M128 128 V300 H292 V210"
        />
        <path
          className="route-path path-research"
          pathLength="1"
          d="M24 48 H128 V128 H292 V210 H426"
        />
        <path
          className="route-path path-verify"
          pathLength="1"
          d="M128 128 V300 H292 V210"
        />
        <circle cx="128" cy="128" r="5" />
        <circle className="green-node" cx="128" cy="300" r="5" />
        <circle cx="292" cy="210" r="5" />
        <circle className="convergence-ring" cx="292" cy="210" r="13" />
        <path
          className="route-direction"
          d="m416 204 10 6-10 6 M286 199 l6 11 6-11"
        />
      </svg>
      <span className="map-origin">{t("OBJECTIVE")}</span>
      <div className="map-node research-node">
        <small>{t("01 / CAPABILITIES")}</small>
        <strong>{t("Profile + signals")}</strong>
        <span>{t("Modeled service chain")}</span>
      </div>
      <div className="map-node verify-node">
        <small>{t("02 / CROSS-CHECK")}</small>
        <strong>{t("Proofline Verify")}</strong>
        <span>{t("Mock · $0.12 modeled")}</span>
      </div>
      <div className="map-node synthesis-node">
        <small>{t("03 / SYNTHESIS")}</small>
        <strong>{t("Route contract")}</strong>
        <span>{t("Mock · $0.00")}</span>
      </div>
      <div className="map-alternatives">
        <span>
          <s>{t("Live research")}</s> {t("· unavailable")}
        </span>
        <span>
          <s>{t("Premium catalog")}</s> {t("· metadata only")}
        </span>
      </div>
      <span className="route-annotation">
        {t("Independent sources required →")}
      </span>
    </div>
  );
}
export function RouteNarrative() {
  const t = useCopy();

  const ref = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const compiled = seedRoutes()[0];
  const receipt = { estimatedSpendUsd: compiled.budget.estimatedRouteCostUsd };
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(min-width: 900px) and (min-height: 850px) and (prefers-reduced-motion: no-preference)",
        () => {
          const root = ref.current!;
          root.dataset.enhanced = "true";
          const panels = gsap.utils.toArray<HTMLElement>(".chapter", root);
          const indexes = gsap.utils.toArray<HTMLElement>(
            ".chapter-index",
            root,
          );
          const counter = root.querySelector(".modeled-counter");
          const amount = { value: 0 };
          gsap.set(panels.slice(1), { autoAlpha: 0, y: 12 });
          gsap.set(".route-path", { strokeDasharray: 1, strokeDashoffset: 1 });
          gsap.set(".verification-final", { autoAlpha: 0 });
          gsap.set(".confidence-trail, .convergence-ring, .route-annotation", {
            opacity: 0,
          });
          gsap.set(
            ".verify-node, .synthesis-node, .evidence-field, .map-alternatives",
            { opacity: 0.12 },
          );
          const timeline = gsap.timeline({
            scrollTrigger: {
              trigger: root,
              start: "top 72px",
              end: () => "+=" + window.innerHeight * 2.4,
              pin: scene.current,
              scrub: 0.45,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                const index = Math.min(3, Math.floor(self.progress * 4));
                root.dataset.chapter = String(index + 1);
                indexes.forEach((el, i) =>
                  el.setAttribute("data-active", String(i === index)),
                );
              },
            },
          });
          timeline.to({}, { duration: 0.5 });
          [1, 2, 3].forEach((index) => {
            const at = index * 2;
            timeline
              .to(
                panels[index - 1],
                { autoAlpha: 0, y: -12, duration: 0.35 },
                at,
              )
              .to(
                panels[index],
                { autoAlpha: 1, y: 0, duration: 0.35 },
                at + 0.3,
              );
          });
          timeline
            .to(".map-alternatives", { opacity: 0.65, duration: 0.6 }, 2)
            .to(
              ".rejected-path",
              {
                strokeDasharray: 1,
                strokeDashoffset: 1,
                opacity: 0.2,
                duration: 1,
              },
              3,
            )
            .to(".map-alternatives", { opacity: 0.35, y: -3, duration: 0.7 }, 4)
            .to(".confidence-trail", { opacity: 0.12, duration: 1 }, 4)
            .to(".route-annotation", { opacity: 1, duration: 0.5 }, 5.8)
            .to(".convergence-ring", { opacity: 0.5, duration: 0.25 }, 6)
            .to(
              ".convergence-ring",
              {
                scale: 1.8,
                transformOrigin: "center",
                opacity: 0,
                duration: 0.8,
              },
              6.3,
            )
            .to(
              ".verify-node, .synthesis-node",
              { opacity: 1, duration: 0.6 },
              3,
            )
            .to(
              ".path-research",
              { strokeDashoffset: 0, duration: 1.4, ease: "none" },
              3.8,
            )
            .to(
              ".path-verify",
              { strokeDashoffset: 0, duration: 1, ease: "none" },
              5,
            )
            .to(
              amount,
              {
                value: receipt.estimatedSpendUsd,
                duration: 1.5,
                ease: "none",
                onUpdate: () => {
                  if (counter) counter.textContent = money(amount.value);
                },
              },
              4,
            )
            .to(".evidence-field", { opacity: 1, duration: 0.8 }, 5.8)
            .to(".verification-start", { autoAlpha: 0, duration: 0.25 }, 6)
            .to(".verification-final", { autoAlpha: 1, duration: 0.35 }, 6.25)
            .from(
              ".evidence-field li",
              { x: 8, opacity: 0, stagger: 0.2, duration: 0.4 },
              6,
            )
            .to({}, { duration: 1.3 });
          return () => {
            delete root.dataset.enhanced;
            delete root.dataset.chapter;
            indexes.forEach((el) => el.removeAttribute("data-active"));
            if (counter) counter.textContent = money(receipt.estimatedSpendUsd);
          };
        },
      );
      return () => media.revert();
    },
    {
      scope: ref,
      dependencies: [receipt.estimatedSpendUsd],
      revertOnUpdate: true,
    },
  );
  return (
    <section
      id="how-it-works"
      className="route-narrative"
      ref={ref}
      aria-labelledby="route-title"
    >
      <div className="route-scene container" ref={scene}>
        <div className="narrative-top">
          <p className="eyebrow">{t("THE ROUTE, EXPLAINED / 02")}</p>
          <span className="demo-label">{t("SIMULATED DEMO ROUTE")}</span>
        </div>
        <h2 id="route-title">
          {t("What happens after")}
          <br />
          <em>{t("I forge a route?")}</em>
        </h2>
        <div className="chapter-indexes" aria-hidden="true">
          {chapters.map((c, i) => (
            <span className="chapter-index" key={c.name}>
              0{i + 1} / {t(c.name)}
            </span>
          ))}
        </div>
        <div className="route-composition">
          <aside className="request-field">
            <p className="eyebrow">{t("THE OBJECTIVE")}</p>
            <h3>{t("Build a verified competitive-intelligence route.")}</h3>
            <p>{t("Controlled service fixtures · Most verified")}</p>
            <dl>
              <div>
                <dt>{t("Hard budget cap")}</dt>
                <dd>{money(compiled.budget.hardCapUsd)}</dd>
              </div>
              <div>
                <dt>{t("Modeled route estimate")}</dt>
                <dd className="modeled-counter">
                  {money(receipt.estimatedSpendUsd)}
                </dd>
              </div>
              <div>
                <dt>{t("Actual spend")}</dt>
                <dd>$0.00</dd>
              </div>
            </dl>
          </aside>
          <ProviderRouteMap />
          <aside className="evidence-field">
            <p className="eyebrow">{t("THE AGENT-READY CONTRACT")}</p>
            <h3>
              {t("A clear sequence.")}
              <br />
              {t("Explicit boundaries.")}
            </h3>
            <ol>
              <li>{t("Capability and dependency order")}</li>
              <li>{t("Provider choices and fallbacks")}</li>
              <li>{t("Verification and stop conditions")}</li>
            </ol>
            <div className="verification-note">
              <p className="verification-start">
                {t("Verification requirements mapped.")}
              </p>
              <p className="verification-final">
                {t("ROUTE COMPILED ·")}
                <strong>execution_not_enabled</strong>
              </p>
            </div>
            <p className="mono">
              {t(compiled.route.length)} {t("planned capability steps")}
              <br />
              {t("No service calls or evidence claims")}
              <br />
              {t("Within modeled budget")}
            </p>
          </aside>
        </div>
        <div className="chapter-stage">
          {chapters.map((c, i) => (
            <article className="chapter" key={c.name}>
              <span className="eyebrow">
                0{i + 1} / {t(c.name)}
              </span>
              <h3>{t(c.title)}</h3>
              <p>{t(c.text)}</p>
            </article>
          ))}
        </div>
        <p className="route-footnote">
          {t(
            "An explanatory replay of a controlled capability route. Costs are modeled. No task services are called and no payments are made.",
          )}
        </p>
      </div>
    </section>
  );
}
export function EvidenceMargin({ run }: { run: Run }) {
  const t = useCopy();

  return (
    <aside className="evidence-margin">
      <p className="eyebrow">{t("MARGIN NOTES")}</p>
      <div>
        <span>{t("01 / SUPPORT")}</span>
        <p>
          {t(
            "Two independently modeled source families. Not real-world verification.",
          )}
        </p>
      </div>
      <div>
        <span>{t("02 / LIMIT")}</span>
        <p>
          {t(
            "Commercial traction is not established by the supplied material.",
          )}
        </p>
      </div>
      <div>
        <span>{t("03 / RECEIPT")}</span>
        <p>
          {money(run.receipt!.estimatedSpendUsd)} {t("modeled route.")}
          <br />
          {t("$0.00 actual spend.")}
        </p>
      </div>
    </aside>
  );
}
export function ReportPreview({ run }: { run: Run }) {
  const t = useCopy();

  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".memo-title", {
          y: 24,
          opacity: 0.6,
          duration: 0.7,
          scrollTrigger: { trigger: ref.current, start: "top 80%", once: true },
        });
        gsap.utils
          .toArray<HTMLElement>(".evidence-margin div", ref.current)
          .forEach((note) =>
            gsap.from(note, {
              y: 8,
              opacity: 0.4,
              duration: 0.5,
              scrollTrigger: { trigger: note, start: "top 85%", once: true },
            }),
          );
      });
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <section className="paper-report" ref={ref}>
      <div className="container">
        <div className="paper-top">
          <span>{t("SIGNALFORGE / RESEARCH MEMO 001")}</span>
          <span>{t("DEMO OUTPUT — SIMULATED EVIDENCE")}</span>
        </div>
        <div className="paper-layout">
          <article>
            <p className="eyebrow">
              {t("COMPETITIVE INTELLIGENCE / NORTHSTAR SEARCH")}
            </p>
            <h2 className="memo-title">
              {t("A clear wedge.")}
              <br />
              <em>{t("Not yet a business case.")}</em>
            </h2>
            <p className="memo-deck">
              {t(
                "Permission-aware search is the differentiator. Commercial traction remains uncertain.",
              )}
            </p>
            <hr />
            <p className="eyebrow">{t("THE DECISION")}</p>
            <p className="memo-answer">{t(run.brief!.executiveSummary)}</p>
            <Link href="/forge/example-1/output" className="editorial-action">
              {t("Read the example brief")}
              <ArrowRight size={20} />
            </Link>
          </article>
          <EvidenceMargin run={run} />
        </div>
        <LivingEvidence run={run} />
        <div className="paper-bottom">
          <span>
            {t(run.receipt!.sourceCount)} {t("FICTIONAL DOCUMENTS /")}{" "}
            {t(run.receipt!.verifiedClaimCount)} {t("SIMULATED CORROBORATIONS")}
          </span>
          <span>{t("NO LIVE RESEARCH PERFORMED")}</span>
        </div>
      </div>
    </section>
  );
}
