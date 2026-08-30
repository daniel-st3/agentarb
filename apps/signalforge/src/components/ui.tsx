import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="SignalForge home">
      <svg
        width="25"
        height="25"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="brand-signal"
      >
        <path
          d="M25 5H13a7 7 0 0 0 0 14h7a4 4 0 0 1 0 8H7M7 27V5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="25" cy="5" r="2" fill="#b7b5e9" />
        <circle cx="7" cy="27" r="2" fill="currentColor" />
      </svg>
      <span>
        SignalForge<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link className={secondary ? "button secondary" : "button"} href={href}>
      {children}
      <ArrowUpRight size={17} />
    </Link>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="demo-notice">
      <span className="demo-dot" aria-hidden="true" />
      <span>
        {compact
          ? "Demo mode · no external calls"
          : "Demo mode uses transparent mock adapters. Public-source research is unavailable. No payments are made."}
      </span>
    </div>
  );
}
export function StepHeader({ step }: { step: "Request" | "Plan" | "Brief" }) {
  return (
    <div className="workspace-steps" aria-label="Research workflow">
      {["Request", "Plan", "Brief"].map((label, i) => (
        <span key={label} aria-current={step === label ? "step" : undefined}>
          <b>0{i + 1}</b>
          {label}
          {i < 2 && <ArrowRight size={13} />}
        </span>
      ))}
    </div>
  );
}
export function EmptyRun() {
  return (
    <div className="empty-state">
      <Eyebrow>THIS SESSION HAS ENDED</Eyebrow>
      <h1>This route isn’t in your session.</h1>
      <p>
        New runs stay in memory in this tab. A full reload clears them; example
        routes are always available.
      </p>
      <ActionLink href="/forge">Forge another</ActionLink>
      <Link href="/history">Explore example routes</Link>
    </div>
  );
}
export const money = (n: number) => `$${n.toFixed(2)}`;
export function Status({
  children,
  positive = false,
}: {
  children: ReactNode;
  positive?: boolean;
}) {
  return (
    <span className={positive ? "status positive" : "status"}>{children}</span>
  );
}
