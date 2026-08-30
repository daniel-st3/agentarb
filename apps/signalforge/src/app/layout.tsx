import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { ResearchSession } from "@/components/session";
import { seedRuns } from "@/domain/engine";
import "./globals.css";
import "./polish.css";
import "./command.css";
import "./network.css";
import { PageChoreography } from "@/components/editorial/atmosphere";
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
    default: "SignalForge — Routing intelligence for the agent economy",
    template: "%s · SignalForge",
  },
  description:
    "Turn an agent objective into a budget-constrained route. Inspect public catalog metadata, capability tradeoffs and execution contracts. Discovery only.",
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
          <main id="main">
            <PageChoreography>{children}</PageChoreography>
          </main>
        </ResearchSession>
        <footer className="site-footer container">
          <span>
            SignalForge<span className="brand-dot">.</span>
          </span>
          <p>Discovery and planning only. Execution not enabled.</p>
          <Link
            href="https://github.com/daniel-st3/agentarb"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub ↗
          </Link>
          <p className="maker-credit">
            <Link href="https://github.com/daniel-st3/agentarb">
              Designed and built by Daniel Rodríguez · AI systems, data, and
              product
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
