import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  OpeningScene,
  RouteNarrative,
  ReportPreview,
} from "@/components/editorial/narrative";
import { seedRuns } from "@/domain/engine";
export default async function Home() {
  const [example] = await seedRuns();
  return (
    <>
      <OpeningScene />
      <RouteNarrative run={example} />
      <ReportPreview run={example} />
      <section
        className="use-cases container"
        aria-labelledby="use-cases-title"
      >
        <p className="eyebrow">RESEARCH WITH A PURPOSE / 03</p>
        <h2 id="use-cases-title">
          A question worth
          <br />
          <em>looking into.</em>
        </h2>
        {[
          [
            "Competitive intelligence",
            "Compare a market without manually stitching sources together.",
            "MULTI-SOURCE",
          ],
          [
            "Company research",
            "Turn a focused question into an evidence-led decision memo.",
            "BUDGET-CAPPED",
          ],
          [
            "Due diligence",
            "Surface claims, corroboration, and uncertainty in one artifact.",
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
          Explore these workflows with three fictional cases. The demo does not
          perform live research.
        </p>
      </section>
      <section className="closing container">
        <p className="eyebrow">LESS UNCERTAINTY. MORE CONTEXT.</p>
        <h2>
          Make the route
          <br />
          <em>visible.</em>
        </h2>
        <Link className="editorial-action" href="/forge">
          Forge your first brief <ArrowRight size={22} />
        </Link>
      </section>
    </>
  );
}
