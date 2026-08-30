import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { ResearchSession } from "@/components/session";
import { seedRuns } from "@/domain/engine";
import "./globals.css";
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const display = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});
const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "SignalForge — Research, routed intelligently",
    template: "%s · SignalForge",
  },
  description:
    "Plan a research route, compare service tradeoffs, and inspect a cited demo brief. Transparent evidence. Hard budget limits. No external spending.",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const seeds = await seedRuns();
  return (
    <html
      lang="en"
      className={`${geist.variable} ${display.variable} ${mono.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <ResearchSession seeds={seeds}>
          <Navigation />
          <main id="main">{children}</main>
        </ResearchSession>
        <footer className="site-footer container">
          <span>
            SignalForge<span className="brand-dot">.</span>
          </span>
          <p>Research demo. Transparent provenance. Actual spend $0.</p>
          <Link
            href="https://github.com/daniel-st3/agentarb"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub ↗
          </Link>
        </footer>
      </body>
    </html>
  );
}
