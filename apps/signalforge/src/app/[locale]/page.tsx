import { getCopy } from "@/i18n/server";
import Link from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import {
  RouteNarrative,
  ReportPreview,
} from "@/components/editorial/narrative";
import { seedRuns } from "@/domain/engine";
import { ResearchCommand } from "@/components/research-command";
import { SignalField, MagneticLink } from "@/components/editorial/atmosphere";
export default async function Home() {
  const t = await getCopy();

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
        <p className="eyebrow">{t("CAPABILITIES, COMPOSED / 03")}</p>
        <h2 id="use-cases-title">
          {t("An objective worth")}
          <br />
          <em>{t("routing well.")}</em>
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
            <h3>{t(title)}</h3>
            <p>{t(description)}</p>
            <span className="route-tag">
              {t(tag)}
              <ArrowRight size={16} />
            </span>
          </Link>
        ))}
        <p className="field-help">
          {t(
            "Compare modeled service routes. Public catalog discovery is separate from task execution; no task services are called.",
          )}
        </p>
      </section>
      <section className="closing container">
        <SignalField variant="closing" />
        <p className="eyebrow">
          {t("HUMAN OBJECTIVES. AGENT-READY CONTRACTS.")}
        </p>
        <h2>
          {t("Make the route")}
          <br />
          <em>{t("visible.")}</em>
        </h2>
        <MagneticLink href="/forge">
          {t("Forge route")}
          <ArrowRight size={22} />
        </MagneticLink>
      </section>
    </>
  );
}
