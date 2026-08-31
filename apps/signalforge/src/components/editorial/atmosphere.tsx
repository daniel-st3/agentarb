"use client";
import { useRef, type ReactNode } from "react";
import Link from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Decorative coordinates, never telemetry. No timers or perpetual animation. */
export function SignalField({
  variant = "hero",
}: {
  variant?: "hero" | "closing";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(min-width: 900px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
        () => {
          const root = ref.current!;
          const host = root.parentElement!;
          const x = gsap.quickTo(root.querySelector(".field-light"), "x", {
            duration: 1.2,
          });
          const y = gsap.quickTo(root.querySelector(".field-light"), "y", {
            duration: 1.2,
          });
          const move = (e: PointerEvent) => {
            const box = host.getBoundingClientRect();
            x((e.clientX - box.left - box.width / 2) * 0.045);
            y((e.clientY - box.top - box.height / 2) * 0.045);
          };
          const reset = () => {
            x(0);
            y(0);
          };
          host.addEventListener("pointermove", move);
          host.addEventListener("pointerleave", reset);
          // A single slow settling movement, paused when out of view or hidden.
          const drift = gsap.to(".field-point", {
            x: 9,
            y: -5,
            duration: 14,
            stagger: 0.5,
            ease: "sine.inOut",
            paused: true,
          });
          const visibility = () => {
            if (!document.hidden && ScrollTrigger.isInViewport(host))
              drift.play();
            else drift.pause();
          };
          ScrollTrigger.create({
            trigger: host,
            start: "top bottom",
            end: "bottom top",
            onToggle: visibility,
          });
          visibility();
          document.addEventListener("visibilitychange", visibility);
          return () => {
            host.removeEventListener("pointermove", move);
            host.removeEventListener("pointerleave", reset);
            document.removeEventListener("visibilitychange", visibility);
          };
        },
      );
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <div
      ref={ref}
      className={`signal-field field-${variant}`}
      aria-hidden="true"
    >
      <div className="field-light" />
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <g className="field-contours">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <path
              key={i}
              d={`M${330 + i * 42} -60 C${190 + i * 38} 220 ${1080 - i * 25} 200 ${920 + i * 35} 470 S${540 + i * 45} 720 ${1130 + i * 30} 890`}
            />
          ))}
        </g>
        <g className="field-coordinates">
          {[180, 420, 660, 900, 1140].map((x) => (
            <path key={x} d={`M${x} 70 v660 M${x - 5} 390 h10 M${x} 385 v10`} />
          ))}
          <path d="M80 150 H1180 M80 630 H1180" />
        </g>
        <g className="field-points">
          <circle className="field-point" cx="694" cy="278" r="2" />
          <circle className="field-point" cx="940" cy="474" r="2" />
          <circle className="field-point" cx="830" cy="650" r="2" />
        </g>
      </svg>
    </div>
  );
}

export function MagneticLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(min-width: 900px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
        () => {
          const el = ref.current!;
          const x = gsap.quickTo(el.firstElementChild, "x", { duration: 0.3 });
          const y = gsap.quickTo(el.firstElementChild, "y", { duration: 0.3 });
          const move = (e: PointerEvent) => {
            const b = el.getBoundingClientRect();
            x((e.clientX - b.left - b.width / 2) * 0.035);
            y((e.clientY - b.top - b.height / 2) * 0.07);
          };
          const reset = () => {
            x(0);
            y(0);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", reset);
          el.addEventListener("focus", reset);
          return () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", reset);
            el.removeEventListener("focus", reset);
          };
        },
      );
      return () => media.revert();
    },
    { scope: ref },
  );
  return (
    <Link ref={ref} href={href} className="editorial-action magnetic-link">
      <span>{children}</span>
    </Link>
  );
}

export function PageChoreography({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".composer-heading, .workspace-title, .history-heading", {
          opacity: 0.6,
          y: 8,
          duration: 0.32,
          ease: "power2.out",
        });
        gsap.from(".arrival-line", {
          scaleX: 0,
          transformOrigin: "left",
          duration: 0.4,
        });
      });
      const root = ref.current!;
      const point = (e: PointerEvent) => {
        const link = (e.target as Element).closest<HTMLElement>(
          ".text-link, .editorial-action",
        );
        if (link)
          link.style.setProperty(
            "--underline-origin",
            e.clientX < link.getBoundingClientRect().left + link.offsetWidth / 2
              ? "left"
              : "right",
          );
      };
      root.addEventListener("pointerover", point);
      return () => {
        root.removeEventListener("pointerover", point);
        media.revert();
      };
    },
    { scope: ref, dependencies: [pathname], revertOnUpdate: true },
  );
  return (
    <div ref={ref} className="page-choreography">
      <span className="arrival-line" aria-hidden="true" />
      {children}
    </div>
  );
}

export function PrecisionSelector({
  children,
  value,
  className,
}: {
  children: ReactNode;
  value: string;
  className: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<{ x: number; y: number; scaleX: number } | null>(
    null,
  );
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const root = ref.current!;
        const indicator = root.querySelector(".precision-indicator");
        const selected = root.querySelector<HTMLButtonElement>(
          'button[aria-pressed="true"]',
        );
        if (!selected) return;
        root.dataset.motion = "true";
        const next = {
          x: selected.offsetLeft,
          y: selected.offsetTop + selected.offsetHeight - 1,
          scaleX: selected.offsetWidth,
        };
        gsap.fromTo(indicator, previous.current ?? next, {
          ...next,
          duration: 0.25,
          ease: "power2.out",
        });
        previous.current = next;
        const observer = new ResizeObserver(() => {
          const state = {
            x: selected.offsetLeft,
            y: selected.offsetTop + selected.offsetHeight - 1,
            scaleX: selected.offsetWidth,
          };
          if (
            previous.current?.x === state.x &&
            previous.current?.y === state.y &&
            previous.current?.scaleX === state.scaleX
          )
            return;
          gsap.set(indicator, state);
          previous.current = state;
        });
        observer.observe(root);
        return () => {
          observer.disconnect();
          delete root.dataset.motion;
        };
      });
      return () => media.revert();
    },
    { scope: ref, dependencies: [value], revertOnUpdate: true },
  );
  return (
    <div ref={ref} className={`${className} precision-selector`}>
      {children}
      <span className="precision-indicator" aria-hidden="true" />
    </div>
  );
}
