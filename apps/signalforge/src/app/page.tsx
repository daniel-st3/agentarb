import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  RouteNarrative,
  ReportPreview,
} from "@/components/editorial/narrative";
import { seedRuns } from "@/domain/engine";
import { ResearchCommand } from "@/components/research-command";
import { SignalField, MagneticLink } from "@/components/editorial/atmosphere";
export default async function Home() {
  const [example] = await seedRuns();
  return (
    <>
      <script
        id="signalforge-software-metadata"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "SignalForge",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "Web",
            url: "https://signalforge-rose-two.vercel.app/",
            description:
              "Public catalog discovery and budget-constrained agent route planning. Demo routes do not execute services or make payments.",
          }),
        }}
      />
      <ResearchCommand landing />
      <RouteNarrative run={example} />
      <ReportPreview run={example} />
      <section
        className="use-cases container"
        aria-labelledby="use-cases-title"
      >
        <p className="eyebrow">CAPABILITIES, COMPOSED / 03</p>
        <h2 id="use-cases-title">
          An objective worth
          <br />
          <em>routing well.</em>
        </h2>
        {[
          [
            "Competitive intelligence",
            "Compose company, market, and independent verification capabilities.",
            "MULTI-SOURCE",
          ],
          [
            "Structured extraction",
            "Find a reliable chain from a public website to structured data.",
            "BUDGET-CAPPED",
          ],
          [
            "Due diligence",
            "Require independent verification before a material claim reaches an agent.",
            "AUDITABLE",
          ],
        ].map(([title, description, tag], i) => (
          <Link href="/forge" className="use-case-row" key={title}>
            <span className="use-number">0{i + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <span className="route-tag">
              {tag}
              <ArrowRight size={16} />
            </span>
          </Link>
        ))}
        <p className="field-help">
          Compare modeled service routes. Public catalog discovery is separate
          from task execution; no task services are called.
        </p>
      </section>
      <section className="closing container">
        <SignalField variant="closing" />
        <p className="eyebrow">HUMAN OBJECTIVES. AGENT-READY CONTRACTS.</p>
        <h2>
          Make the route
          <br />
          <em>visible.</em>
        </h2>
        <MagneticLink href="/forge">
          Forge route <ArrowRight size={22} />
        </MagneticLink>
      </section>
    </>
  );
}
