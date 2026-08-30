import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  FileText,
  ScanLine,
  Layers,
  ShieldCheck,
  X,
  Building2,
  Search,
  Fingerprint,
} from "lucide-react";
import { ActionLink, Eyebrow, Status } from "@/components/ui";
import { RouteMotion, ScrollRoute } from "@/components/motion";
export default function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <Eyebrow>RESEARCH, ROUTED INTELLIGENTLY</Eyebrow>
          <h1>
            Turn one question into a <span>verified brief.</span>
          </h1>
          <p className="hero-description">
            SignalForge plans a research route across specialized services,
            works within your budget, and shows exactly how every conclusion was
            sourced.
          </p>
          <div className="hero-actions">
            <ActionLink href="/forge">Forge a brief</ActionLink>
            <Link className="text-link" href="#how-it-works">
              See how it works <ArrowDown size={16} />
            </Link>
          </div>
          <p className="hero-footnote">
            <span className="demo-dot" />
            Try the demo. Fictional evidence, real decision logic.
          </p>
        </div>
        <RouteMotion>
          <div className="artifact-topline">
            <span>RESEARCH ROUTE / 001</span>
            <span>ILLUSTRATIVE DEMO</span>
          </div>
          <div className="route-request">
            <span className="artifact-label">
              <Search size={14} /> THE QUESTION
            </span>
            <p>Where does Northstar Search have an edge?</p>
            <div className="artifact-meta">
              <span>Most verified</span>
              <b>$0.25 budget</b>
            </div>
          </div>
          <div className="connector-line" />
          <div className="provider-row">
            <div className="provider-node selected">
              <Layers size={18} />
              <strong>Research library</strong>
              <span>Mock · $0.00</span>
              <Check size={13} />
            </div>
            <div className="provider-node selected">
              <ShieldCheck size={18} />
              <strong>Independent review</strong>
              <span>Mock · $0.08</span>
              <Check size={13} />
            </div>
            <div className="provider-node rejected">
              <ScanLine size={18} />
              <strong>Live research</strong>
              <span>Not configured</span>
              <X size={13} />
            </div>
          </div>
          <div className="connector-line" />
          <div className="route-evidence">
            <span className="evidence-marker">01</span>
            <div>
              <strong>Evidence, cross-checked.</strong>
              <span>2 modeled source families · 5 fixture excerpts</span>
            </div>
            <Check size={18} />
          </div>
          <div className="connector-line" />
          <div className="route-answer">
            <div className="flex-between">
              <span className="artifact-label">
                <FileText size={15} /> THE BRIEF
              </span>
              <Status positive>Demo complete</Status>
            </div>
            <h3>
              A clear wedge.
              <br />
              An unproven business case.
            </h3>
            <p>
              Permission-aware search is the differentiator. Commercial traction
              remains uncertain.
            </p>
            <div className="receipt-mini">
              <span>
                Modeled route <b>$0.08</b>
              </span>
              <span>
                Actual spend <b>$0.00</b>
              </span>
              <Link
                href="/forge/example-1"
                aria-label="Read the Northstar Search example brief"
              >
                <ArrowUpRightIcon />
              </Link>
            </div>
          </div>
          <p className="artifact-caption">
            Simulated demo evidence. Northstar Search is fictional.
          </p>
        </RouteMotion>
      </section>
      <section id="how-it-works" className="how-section container">
        <div className="section-heading">
          <Eyebrow>FROM QUESTION TO CONVICTION</Eyebrow>
          <h2>
            Less searching.
            <br />
            More understanding.
          </h2>
          <p>
            A deliberate research workflow.
            <br />
            Not another conversation to manage.
          </p>
        </div>
        <div className="three-steps">
          {[
            [
              "01",
              "Plan",
              "Give your question a route.",
              "Set a budget and a priority. The planner compares capability, quality, cost, reliability, and speed.",
              Layers,
            ],
            [
              "02",
              "Source",
              "Use what the question needs.",
              "Inspect selected services and rejected alternatives before running the bounded demo route.",
              Search,
            ],
            [
              "03",
              "Verify",
              "See what holds up.",
              "Trace each finding to evidence. Independent support, single-source claims, and unknowns stay distinct.",
              ShieldCheck,
            ],
          ].map(([n, name, title, body, Icon]) => {
            const Glyph = Icon as typeof Layers;
            return (
              <article key={String(n)}>
                <div className="step-top">
                  <span>
                    {String(n)} / {String(name)}
                  </span>
                  <Glyph size={22} />
                </div>
                <h3>{String(title)}</h3>
                <p>{String(body)}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="route-section container">
        <div className="route-sticky">
          <Eyebrow>THE ROUTE MATTERS</Eyebrow>
          <h2>
            Better answers.
            <br />
            Not more API calls.
          </h2>
          <p>
            Tradeoffs belong in the open. See why a service made the cut—and
            what the budget left out.
          </p>
          <Link className="text-link" href="/forge">
            Compare a route <ArrowRight size={17} />
          </Link>
          <div className="route-budget">
            <span>Example hard budget</span>
            <strong>$0.25</strong>
            <div className="meter">
              <div style={{ width: "32%" }} />
            </div>
            <span>$0.08 modeled · $0.00 actual</span>
          </div>
        </div>
        <ScrollRoute>
          <div className="route-track">
            <div className="route-progress" />
          </div>
          {[
            [
              "01",
              "Set the boundary",
              "A $0.25 hard cap. Most verified policy.",
              "BUDGET",
            ],
            [
              "02",
              "Compare the supply",
              "Free research, fast retrieval, independent review. Unconfigured and catalog-only services stay out.",
              "SELECTION",
            ],
            [
              "03",
              "Take the useful route",
              "Research library + independent review + brief compiler. Modeled cost: $0.08.",
              "ROUTE",
            ],
            [
              "04",
              "Test the important claims",
              "Two fixture publishers support two key claims. The commercial claim remains single-source.",
              "EVIDENCE",
            ],
            [
              "05",
              "Keep the receipt",
              "A concise brief, source excerpts, explicit unknowns, and every service choice.",
              "RESULT",
            ],
          ].map(([n, title, text, tag]) => (
            <article className="story-step" key={n}>
              <span className="story-number">{n}</span>
              <Eyebrow>{tag}</Eyebrow>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </ScrollRoute>
      </section>
      <section className="use-cases container">
        <Eyebrow>BUILT FOR ANSWERS THAT MATTER</Eyebrow>
        <h2>
          Start with a real question.
          <br />
          Explore with a transparent demo.
        </h2>
        <div className="use-case-grid">
          {[
            [
              "Company research",
              "Understand the business beyond its pitch.",
              Building2,
            ],
            [
              "Competitive intelligence",
              "Find the wedge. Question the advantage.",
              Search,
            ],
            [
              "Due diligence",
              "Separate supported facts from open risks.",
              Fingerprint,
            ],
          ].map(([title, body, Icon]) => {
            const Glyph = Icon as typeof Search;
            return (
              <article key={String(title)}>
                <Glyph size={26} />
                <h3>{String(title)}</h3>
                <p>{String(body)}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="final-cta container">
        <Eyebrow>ONE QUESTION. A CLEARER PICTURE.</Eyebrow>
        <h2>
          Make the next decision
          <br />
          with better evidence.
        </h2>
        <ActionLink href="/forge">Forge a brief</ActionLink>
        <p>Three fictional cases. Four routing policies. Nothing to connect.</p>
      </section>
    </>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={22} style={{ transform: "rotate(-45deg)" }} />;
}
