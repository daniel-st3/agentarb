"use client";
import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
gsap.registerPlugin(useGSAP, ScrollTrigger);
export function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-reveal]", {
          y: 15,
          opacity: 0.65,
          duration: 0.55,
          stagger: 0.065,
          ease: "power2.out",
        });
        gsap.from(".budget-fill", {
          scaleX: 0,
          transformOrigin: "left",
          duration: 0.7,
          ease: "power2.out",
        });
      });
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
export function RouteMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { ease: "power2.out", duration: 0.45 } })
          .from(".route-request", { y: 12, opacity: 0.5 })
          .from(
            ".provider-node",
            { y: 12, opacity: 0.45, stagger: 0.1 },
            "-=0.2",
          )
          .from(".route-evidence", { y: 10, opacity: 0.5 }, "-=0.2")
          .from(".route-answer", { y: 10, opacity: 0.4 }, "-=0.1");
      });
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className="hero-artifact">
      {children}
    </div>
  );
}
export function ScrollRoute({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".route-progress", {
          scaleY: 0,
          transformOrigin: "top",
          ease: "none",
          scrollTrigger: {
            trigger: ref.current,
            start: "top 65%",
            end: "bottom 65%",
            scrub: 0.5,
          },
        });
        gsap.utils
          .toArray<HTMLElement>(".story-step", ref.current)
          .forEach((step) => {
            gsap.from(step, {
              x: 12,
              opacity: 0.6,
              duration: 0.5,
              scrollTrigger: { trigger: step, start: "top 85%", once: true },
            });
          });
      });
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className="scroll-route">
      {children}
    </div>
  );
}
