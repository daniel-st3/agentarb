"use client";
import { useCopy } from "@/i18n/copy";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import type { Run } from "@/domain/schema";
gsap.registerPlugin(useGSAP, ScrollTrigger);

export function LivingEvidence({ run }: { run: Run }) {
  const t = useCopy();

  const ref = useRef<HTMLElement>(null);
  const claim = run.brief?.claims.find(
    (c) => c.verificationStatus === "corroborated_in_simulation",
  );
  const sources =
    run.brief?.sources.filter((s) => claim?.evidenceIds.includes(s.id)) ?? [];
  const independent =
    new Set(sources.map((s) => s.independentSourceId)).size >= 2 &&
    new Set(sources.map((s) => s.providerId)).size >= 2;
  useGSAP(
    () => {
      if (!independent) return;
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const root = ref.current!;
        gsap.set(".evidence-arrival", { opacity: 0.2 });
        gsap.set(".evidence-thread", {
          strokeDasharray: 1,
          strokeDashoffset: 1,
        });
        gsap.set(".living-final", { autoAlpha: 0 });
        gsap.set(".living-initial", { autoAlpha: 1 });
        const timeline = gsap.timeline({
          scrollTrigger: { trigger: root, start: "top 78%", once: true },
          onComplete: () => {
            root.dataset.stage = "corroborated";
          },
        });
        timeline
          .to(".evidence-arrival", {
            opacity: 1,
            duration: 0.45,
            stagger: 0.65,
          })
          .to(
            ".evidence-thread",
            {
              strokeDashoffset: 0,
              duration: 0.6,
              stagger: 0.55,
              ease: "power2.out",
            },
            0.1,
          )
          .to(".living-initial", { autoAlpha: 0, duration: 0.2 }, 1.25)
          .to(".living-final", { autoAlpha: 1, duration: 0.3 }, 1.45);
        return () => {
          delete root.dataset.stage;
        };
      });
      return () => media.revert();
    },
    { scope: ref, dependencies: [independent], revertOnUpdate: true },
  );
  if (!claim || !independent) return null;
  return (
    <figure
      ref={ref}
      className="living-evidence"
      aria-label={t(
        "Two modeled source families support a claim in simulation",
      )}
    >
      <figcaption>{t("THE EVIDENCE CONNECTION / SIMULATED DEMO")}</figcaption>
      <div className="evidence-connection">
        <ol className="evidence-references">
          {sources.slice(0, 2).map((source, i) => (
            <li className="evidence-arrival" key={source.id}>
              <span>0{i + 1}</span>
              <div>
                <strong>{t(source.sourceTitle)}</strong>
                <small>
                  {t(source.providerId)} {t("· Mock")}
                </small>
              </div>
            </li>
          ))}
        </ol>
        <svg viewBox="0 0 120 130" fill="none" aria-hidden="true">
          <path
            className="evidence-thread"
            pathLength="1"
            d="M0 25 H40 Q55 25 55 40 V65 H120"
          />
          <path
            className="evidence-thread"
            pathLength="1"
            d="M0 105 H40 Q55 105 55 90 V65 H120"
          />
          <circle cx="115" cy="65" r="3" />
        </svg>
        <div className="evidence-claim">
          <p>{t(claim.text)}</p>
          <div className="living-status">
            <span className="living-initial" aria-hidden="true">
              {t("SINGLE-SOURCE / BEFORE CROSS-CHECK")}
            </span>
            <strong className="living-final">
              {t("CORROBORATED IN SIMULATION")}
            </strong>
          </div>
          <small>
            {t("Two modeled source families. Not real-world verification.")}
          </small>
        </div>
      </div>
    </figure>
  );
}
