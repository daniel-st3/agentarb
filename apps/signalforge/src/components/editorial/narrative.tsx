"use client";
import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, ArrowDown } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Run } from "@/domain/schema";
import { money } from "../ui";
import { SignalField, MagneticLink } from "./atmosphere";
import { LivingEvidence } from "./living-evidence";
gsap.registerPlugin(useGSAP, ScrollTrigger);

export function SignalLine() {
  return (
    <div
      className="signal-line"
      aria-label="Illustrative route: web, news, profile, verification, brief ready"
    >
      <svg
        className="signal-trace"
        viewBox="0 0 1000 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="signal-rule"
          pathLength="1"
          d="M0 30 H190 Q210 30 220 20 L230 10 H430 Q450 10 460 20 L470 30 H690 Q710 30 720 40 L730 50 H820 Q840 50 850 40 L860 30 H1000"
        />
      </svg>
      {["WEB", "NEWS", "PROFILE", "VERIFY"].map((name, i) => (
        <span className={"signal-marker marker-" + i} key={name}>
          <i />
          {name}
        </span>
      ))}
      <span className="signal-rejected">
        <s>expensive</s>
        <s>single-source</s>
      </span>
      <span className="signal-result">
        <i />
        BRIEF READY
      </span>
    </div>
  );
}
export function OpeningScene() {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from(".opening-label", { y: 8, opacity: 0, duration: 0.45 })
          .from(
            ".headline-line",
            { yPercent: 105, opacity: 0, duration: 0.8, stagger: 0.12 },
            0.12,
          )
          .from(".opening-support", { y: 10, opacity: 0, duration: 0.6 }, 0.5)
          .from(".sample-question", { opacity: 0, y: 6, duration: 0.5 }, 0.8)
          .from(
            ".signal-rule",
            { strokeDasharray: 1, strokeDashoffset: 1, duration: 0.7 },
            0.9,
          )
          .from(
            ".signal-marker",
            { opacity: 0, y: 5, stagger: 0.1, duration: 0.35 },
            1.15,
          )
          .from(".signal-rejected", { opacity: 0, duration: 0.3 }, 1.6)
          .from(".signal-result", { opacity: 0, x: -6, duration: 0.4 }, 1.75);
      });
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <section className="opening container" ref={ref}>
      <SignalField />
      <aside
        className="research-rail"
        aria-label="Illustrative demo coordinates"
      >
        <span>DEMO / INTERFACE SIGNALS</span>
        <span>BUDGET LOCK / $0.25</span>
        <span>ACTUAL SPEND / $0.00</span>
      </aside>
      <p className="eyebrow opening-label">INTELLIGENCE ROUTING / 01</p>
      <h1>
        <span className="headline-mask">
          <span className="headline-line">One question.</span>
        </span>
        <span className="headline-mask">
          <span className="headline-line">A better route</span>
        </span>
        <span className="headline-mask">
          <span className="headline-line">
            to the <em>answer.</em>
          </span>
        </span>
      </h1>
      <div className="opening-support">
        <p>
          SignalForge plans a research route across specialized sources, works
          within a defined budget, and shows the evidence behind every
          conclusion.
        </p>
        <div className="hero-actions">
          <MagneticLink href="/forge">
            Forge a brief <ArrowRight size={21} />
          </MagneticLink>
          <a className="text-link" href="#how-it-works">
            Watch the route <ArrowDown size={15} />
          </a>
        </div>
      </div>
      <div className="opening-bottom">
        <p className="sample-question">
          “Where does Northstar Search have an edge?”
        </p>
        <span className="eyebrow">FICTIONAL CASE / ILLUSTRATIVE ROUTE</span>
      </div>
      <SignalLine />
    </section>
  );
}

const chapters = [
  {
    name: "FRAME",
    title: "Start with the boundary.",
    text: "A focused question. A hard budget. A need for evidence, not just an answer.",
  },
  {
    name: "COMPARE",
    title: "Not every source belongs.",
    text: "Compare capability, reliability, cost, and independent support. Unconfigured and catalog-only options stay out.",
  },
  {
    name: "COMPOSE",
    title: "Select only what helps.",
    text: "Research, independent review, then synthesis. Every selected step has a role and a modeled cost.",
  },
  {
    name: "VERIFY",
    title: "Show what holds up.",
    text: "Two modeled source families support two important claims. Commercial traction remains single-source.",
  },
];
export function ProviderRouteMap() {
  return (
    <div
      className="provider-route-map"
      aria-label="Research library and independent review converge at the brief compiler"
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
      <span className="map-origin">QUESTION</span>
      <div className="map-node research-node">
        <small>01 / RESEARCH</small>
        <strong>Research library</strong>
        <span>Mock · $0.00</span>
      </div>
      <div className="map-node verify-node">
        <small>02 / CROSS-CHECK</small>
        <strong>Independent review</strong>
        <span>Mock · $0.08 modeled</span>
      </div>
      <div className="map-node synthesis-node">
        <small>03 / SYNTHESIS</small>
        <strong>Brief compiler</strong>
        <span>Mock · $0.00</span>
      </div>
      <div className="map-alternatives">
        <span>
          <s>Live research</s> · unavailable
        </span>
        <span>
          <s>Premium catalog</s> · metadata only
        </span>
      </div>
      <span className="route-annotation">2 modeled source families →</span>
    </div>
  );
}
export function RouteNarrative({ run }: { run: Run }) {
  const ref = useRef<HTMLElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const receipt = run.receipt!;
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
              end: () => "+=" + window.innerHeight * 3,
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
          <p className="eyebrow">THE ROUTE, EXPLAINED / 02</p>
          <span className="demo-label">SIMULATED DEMO ROUTE</span>
        </div>
        <h2 id="route-title">
          The answer is only as good
          <br />
          as <em>the route behind it.</em>
        </h2>
        <div className="chapter-indexes" aria-hidden="true">
          {chapters.map((c, i) => (
            <span className="chapter-index" key={c.name}>
              0{i + 1} / {c.name}
            </span>
          ))}
        </div>
        <div className="route-composition">
          <aside className="request-field">
            <p className="eyebrow">THE QUESTION</p>
            <h3>Where does Northstar Search have an edge?</h3>
            <p>Fictional company · Most verified</p>
            <dl>
              <div>
                <dt>Hard budget cap</dt>
                <dd>{money(run.request.budgetUsd)}</dd>
              </div>
              <div>
                <dt>Modeled route estimate</dt>
                <dd className="modeled-counter">
                  {money(receipt.estimatedSpendUsd)}
                </dd>
              </div>
              <div>
                <dt>Actual spend</dt>
                <dd>$0.00</dd>
              </div>
            </dl>
          </aside>
          <ProviderRouteMap />
          <aside className="evidence-field">
            <p className="eyebrow">THE EMERGING BRIEF</p>
            <h3>
              A clear wedge.
              <br />
              An open question.
            </h3>
            <ol>
              <li>Permission-aware retrieval</li>
              <li>Focused integration strategy</li>
              <li>Unproven commercial traction</li>
            </ol>
            <div className="verification-note">
              <p className="verification-start">
                Before cross-check: single-source.
              </p>
              <p className="verification-final">
                {receipt.verifiedClaimCount} claims corroborated{" "}
                <strong>in simulation</strong>.
              </p>
            </div>
            <p className="mono">
              {receipt.sourceCount} fixture documents
              <br />
              {receipt.evidenceItemCount} evidence excerpts
              <br />
              Within modeled budget
            </p>
          </aside>
        </div>
        <div className="chapter-stage">
          {chapters.map((c, i) => (
            <article className="chapter" key={c.name}>
              <span className="eyebrow">
                0{i + 1} / {c.name}
              </span>
              <h3>{c.title}</h3>
              <p>{c.text}</p>
            </article>
          ))}
        </div>
        <p className="route-footnote">
          An explanatory replay of the seeded route. All sources are authored
          fixtures. No external calls or live spending.
        </p>
      </div>
    </section>
  );
}
export function EvidenceMargin({ run }: { run: Run }) {
  return (
    <aside className="evidence-margin">
      <p className="eyebrow">MARGIN NOTES</p>
      <div>
        <span>01 / SUPPORT</span>
        <p>
          Two independently modeled source families. Not real-world
          verification.
        </p>
      </div>
      <div>
        <span>02 / LIMIT</span>
        <p>Commercial traction is not established by the supplied material.</p>
      </div>
      <div>
        <span>03 / RECEIPT</span>
        <p>
          {money(run.receipt!.estimatedSpendUsd)} modeled route.
          <br />
          $0.00 actual spend.
        </p>
      </div>
    </aside>
  );
}
export function ReportPreview({ run }: { run: Run }) {
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
          <span>SIGNALFORGE / RESEARCH MEMO 001</span>
          <span>DEMO OUTPUT — SIMULATED EVIDENCE</span>
        </div>
        <div className="paper-layout">
          <article>
            <p className="eyebrow">
              COMPETITIVE INTELLIGENCE / NORTHSTAR SEARCH
            </p>
            <h2 className="memo-title">
              A clear wedge.
              <br />
              <em>Not yet a business case.</em>
            </h2>
            <p className="memo-deck">
              Permission-aware search is the differentiator. Commercial traction
              remains uncertain.
            </p>
            <hr />
            <p className="eyebrow">THE DECISION</p>
            <p className="memo-answer">{run.brief!.executiveSummary}</p>
            <Link href="/forge/example-1" className="editorial-action">
              Read the example brief <ArrowRight size={20} />
            </Link>
          </article>
          <EvidenceMargin run={run} />
        </div>
        <LivingEvidence run={run} />
        <div className="paper-bottom">
          <span>
            {run.receipt!.sourceCount} FICTIONAL DOCUMENTS /{" "}
            {run.receipt!.verifiedClaimCount} SIMULATED CORROBORATIONS
          </span>
          <span>NO LIVE RESEARCH PERFORMED</span>
        </div>
      </div>
    </section>
  );
}
