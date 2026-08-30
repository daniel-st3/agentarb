export const fixtureDate = "2026-08-29T12:00:00.000Z";
export const topics = [
  {
    name: "Northstar Search",
    match: /northstar/i,
    sector: "enterprise search",
    question:
      "Assess Northstar Search's competitive position and the risks a buyer should investigate.",
    answer:
      "In this fictional case, Northstar Search has a credible wedge in permission-aware enterprise search, but its deployment footprint and economics remain unproven. Advance to a technical evaluation, not a buying decision.",
    findings: [
      [
        "Northstar Search differentiates on permission-aware retrieval across internal documents.",
        "The product specification describes document-level access checks before retrieval.",
        "The independent evaluation fixture confirms that access checks remained intact in its modeled retrieval tests.",
      ],
      [
        "Its distribution strategy favors a small number of deeply integrated knowledge systems.",
        "The roadmap prioritizes three document connectors over a broad integration catalog.",
        "The analyst fixture also identifies limited connector breadth as a buyer tradeoff.",
      ],
      [
        "Commercial traction cannot be established from the available evidence.",
        "The company fixture contains no audited revenue, retention, or paid-customer figures.",
        "",
      ],
    ],
    unknowns: [
      "No audited revenue, retention, or customer reference data.",
      "Permission changes, connector coverage, and deployment effort require real testing.",
      "The fixture does not establish a durable advantage over incumbent search.",
    ],
  },
  {
    name: "AtlasGrid",
    match: /atlasgrid/i,
    sector: "data infrastructure",
    question:
      "Evaluate AtlasGrid for vendor due diligence: strengths, dependencies, and unanswered questions.",
    answer:
      "In this fictional case, AtlasGrid offers a useful data-lineage workflow, with material concentration risk in its connector ecosystem. Request evidence of recovery procedures and connector maintenance before shortlisting.",
    findings: [
      [
        "AtlasGrid's core value is tracing data transformations across warehouse workflows.",
        "The architecture fixture describes lineage records linking inputs, transformations, and downstream tables.",
        "The independent analyst fixture documents the same lineage-focused workflow.",
      ],
      [
        "Connector maintenance is a material operational dependency.",
        "The support matrix lists a small set of maintained warehouse integrations.",
        "The evaluation fixture notes that unsupported integrations require manual mapping.",
      ],
      [
        "Operational resilience remains unverified.",
        "No independently audited recovery metrics are included in the fixture.",
        "",
      ],
    ],
    unknowns: [
      "Recovery objectives have not been independently established.",
      "Maintenance ownership and incident response require contractual diligence.",
      "No real vendor or service has been evaluated.",
    ],
  },
  {
    name: "Lumen Labs",
    match: /lumen/i,
    sector: "research software",
    question:
      "Explain Lumen Labs' positioning and which claims need independent validation.",
    answer:
      "In this fictional case, Lumen Labs is positioned as an evidence-management layer for research teams. Its traceable-source workflow is clear; claimed productivity gains are not independently established.",
    findings: [
      [
        "Lumen Labs organizes research notes around claims and source excerpts.",
        "The workflow fixture links each research claim to an excerpt and source record.",
        "The independent review fixture describes the same claim-to-source structure.",
      ],
      [
        "The product prioritizes reviewability over automated publication.",
        "The product brief requires an editorial review before publishing a report.",
        "The analyst fixture confirms an explicit review stage in the modeled workflow.",
      ],
      [
        "Productivity gains cannot be quantified from the supplied material.",
        "The fixture offers no controlled comparison of completion time or accuracy.",
        "",
      ],
    ],
    unknowns: [
      "No measured productivity baseline.",
      "Evidence licensing and export interoperability need further review.",
      "This case is fictional and does not assess a real company.",
    ],
  },
] as const;
export function topicFor(question: string) {
  return topics.find((topic) => topic.match.test(question));
}
