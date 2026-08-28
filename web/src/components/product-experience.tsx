"use client";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleStop,
  Menu,
  X,
} from "lucide-react";
import { PolicySandbox } from "./policy-sandbox";
gsap.registerPlugin(ScrollTrigger, useGSAP);
const GITHUB_URL = "https://github.com/daniel-st3/agentarb";

export function ProductExperience() {
  const root = useRef<HTMLDivElement>(null);
  const heroVisual = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  const { contextSafe } = useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-hero-reveal]", {
          y: 24,
          opacity: 0,
          duration: 0.8,
          stagger: 0.08,
          ease: "power3.out",
        });
        gsap
          .timeline()
          .from(
            ".policy-line",
            {
              x: -12,
              opacity: 0,
              stagger: 0.09,
              duration: 0.5,
              ease: "power3.out",
            },
            0.25,
          )
          .from(
            ".decision-node",
            { y: 10, opacity: 0, duration: 0.45 },
            "-=0.1",
          )
          .from(".stop-rule", { y: 5, opacity: 0, duration: 0.3 }, "-=0.1");
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
          gsap.from(element, {
            y: 28,
            duration: 0.72,
            ease: "power3.out",
            scrollTrigger: { trigger: element, start: "top 84%", once: true },
          });
        });
        gsap.to("[data-flow-orbit]", {
          y: -18,
          ease: "none",
          scrollTrigger: {
            trigger: heroVisual.current,
            start: "top top+=80",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      });
      // Mobile console panels change document height. Keep trigger geometry in
      // sync, while section text remains visible even before its motion runs.
      let refreshFrame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(refreshFrame);
        refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      if (root.current) observer.observe(root.current);
      return () => {
        observer.disconnect();
        cancelAnimationFrame(refreshFrame);
        media.revert();
      };
    },
    { scope: root, revertOnUpdate: true },
  );

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const moveVisual = contextSafe(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 8;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 8;
      gsap.to("[data-flow-field]", {
        x,
        y,
        duration: 0.7,
        ease: "power3.out",
        overwrite: "auto",
      });
    },
  );
  const resetVisual = contextSafe(() => {
    if (!reducedMotion)
      gsap.to("[data-flow-field]", {
        x: 0,
        y: 0,
        duration: 0.6,
        overwrite: "auto",
      });
  });

  return (
    <div ref={root} className="site-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-nav">
        <a className="wordmark" href="#top" aria-label="Agent Arbiter home">
          <span className="wordmark-mark">A</span>
          <span>Agent Arbiter</span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#sandbox">Sandbox</a>
          <a href="#safety">Safety</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight size={13} />
          </a>
        </nav>
        <a className="button button-small desktop-cta" href="#sandbox">
          Try the sandbox
        </a>
        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <AnimatePresence>
          {menuOpen ? (
            <motion.nav
              className="mobile-nav"
              aria-label="Mobile navigation"
              initial={reducedMotion ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
            >
              {[
                ["How it works", "#how"],
                ["Policy sandbox", "#sandbox"],
                ["Safety", "#safety"],
                ["GitHub", GITHUB_URL],
              ].map(([name, href]) => (
                <a key={name} href={href} onClick={() => setMenuOpen(false)}>
                  {name}
                  <ChevronRight />
                </a>
              ))}
            </motion.nav>
          ) : null}
        </AnimatePresence>
      </header>

      <main id="main">
        <section id="top" className="hero section-grid">
          <div className="hero-copy">
            <p className="eyebrow" data-hero-reveal>
              Agent labor control plane
            </p>
            <h1 data-hero-reveal>
              Decide what an agent may do—before it acts.
            </h1>
            <p className="hero-lead" data-hero-reveal>
              Agent Arbiter evaluates public work opportunities against a
              hypothetical worker’s capabilities, costs, risk limits, and
              approval policy.
            </p>
            <div className="hero-actions" data-hero-reveal>
              <a className="button" href="#sandbox">
                Open policy sandbox <ArrowDownRight />
              </a>
              <a className="text-link" href="#how">
                View architecture <ArrowDownRight />
              </a>
            </div>
            <p className="boundary-note" data-hero-reveal>
              <span /> Public demonstration. Session-only. No marketplace
              actions.
            </p>
          </div>
          <div
            className="flow-visual"
            ref={heroVisual}
            onPointerMove={moveVisual}
            onPointerLeave={resetVisual}
            aria-label="Policy routing diagram: public opportunities pass through capability, risk, and cost constraints before a read-only decision"
          >
            <div className="flow-grid" data-flow-field>
              <div className="flow-orbit orbit-one" data-flow-orbit />
              <div className="flow-orbit orbit-two" data-flow-orbit />
              <p className="flow-label">CONTROLLED EXAMPLE / POLICY ROUTING</p>
              <div className="policy-lines">
                <PolicyLine label="Capability match" value="PASS" tone="good" />
                <PolicyLine label="Risk boundary" value="PASS" tone="good" />
                <PolicyLine
                  label="Projected cost"
                  value="$0.052"
                  tone="neutral"
                />
                <PolicyLine
                  label="Approval rule"
                  value="REQUIRED"
                  tone="caution"
                />
              </div>
              <div className="decision-node">
                <span className="decision-index">04</span>
                <div>
                  <small>POLICY DECISION</small>
                  <strong>Allowed for preview</strong>
                </div>
                <Check />
              </div>
              <div className="stop-rule">
                <span>STOP</span>
                <p>
                  Discovery only
                  <br />
                  No authority granted
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="proof-strip" aria-label="Verified project evidence">
          {[
            ["305", "Hermetic tests passed"],
            ["40/40", "Golden decisions correct"],
            ["0%", "Unsafe false-allows"],
            ["GET", "Only public discovery"],
          ].map(([value, label]) => (
            <div key={label} className="proof-item">
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>

        <section id="how" className="how section-wrap">
          <p className="proof-scope">
            Verified Python baseline · golden corpus v1, 40 offline cases · 28
            August 2026. These are test results, not marketplace outcome
            evidence.
          </p>
          <div className="section-heading" data-reveal>
            <p className="eyebrow">How it works</p>
            <h2>Turn limits into inspectable decisions.</h2>
            <p>
              Every result traces back to the profile and policy that produced
              it.
            </p>
          </div>
          <div className="steps">
            <Step
              index="01"
              title="Define the worker"
              text="Describe supported work, local tools, cost limits, and actions the hypothetical worker must never take."
            />
            <Step
              index="02"
              title="Apply policy"
              text="Normalize public listings, screen safety first, then evaluate capability, confidence, cost, margin, and reputation."
            />
            <Step
              index="03"
              title="Inspect governed decisions"
              text="See exact reason codes and preview the bounded contract—without bidding, claiming, submitting, or paying."
            />
          </div>
          <div
            className="how-flow"
            data-reveal
            aria-label="Define worker then apply policy then inspect decisions"
          >
            <span>Worker profile</span>
            <ChevronRight />
            <span>Cost + risk policy</span>
            <ChevronRight />
            <strong>Reasoned decision</strong>
          </div>
        </section>

        <PolicySandbox />

        <section id="safety" className="safety section-wrap">
          <div className="safety-header" data-reveal>
            <p className="eyebrow">Safety boundary</p>
            <h2>Designed to stop before the point of action.</h2>
            <p>
              The public experience ends at a read-only preview. It has no
              execution surface, credentials, persistent visitor store, or
              marketplace authority.
            </p>
          </div>
          <div className="safety-grid">
            {[
              "No bids or claims",
              "No submissions",
              "No payments or wallets",
              "No marketplace credentials",
              "No worker execution",
              "No persistent visitor data",
              "Public GET-only discovery",
              "Session-only policy simulation",
            ].map((item) => (
              <div className="safety-item" key={item} data-reveal>
                <CircleStop />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className="stop-diagram" data-reveal>
            {[
              "Public listing",
              "Normalize",
              "Policy evaluation",
              "Read-only preview",
            ].map((item, index) => (
              <div className="stop-stage" key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item}</strong>
                <ChevronRight />
              </div>
            ))}
            <div className="stop-final">
              <CircleStop />
              <div>
                <small>BOUNDARY</small>
                <strong>Stop</strong>
              </div>
            </div>
          </div>
          <p className="what-proves">
            <strong>What this proves</strong>
            Agent Arbiter applies capability and risk policy before a
            hypothetical worker is permitted to act. This simulation does not
            bid, claim, submit, pay, or modify marketplace data.
          </p>
        </section>
      </main>

      <footer>
        <div>
          <span className="wordmark-mark">A</span>
          <strong>Agent Arbiter</strong>
        </div>
        <p>Public demonstration · session-only · no marketplace actions</p>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
          GitHub <ArrowUpRight />
        </a>
      </footer>
    </div>
  );
}

function PolicyLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="policy-line">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

function Step({
  index,
  title,
  text,
}: {
  index: string;
  title: string;
  text: string;
}) {
  return (
    <article className="step" data-reveal>
      <span>{index}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}
