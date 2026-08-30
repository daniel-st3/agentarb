import { z } from "zod";

export const capabilityIds = [
  "url_extract",
  "structured_profile",
  "web_research",
  "news_search",
  "document_parse",
  "data_extract",
  "change_detection",
  "claim_verification",
  "synthesis",
] as const;
export const optimizationPolicies = [
  "best_value",
  "cheapest",
  "most_verified",
  "fastest",
] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
export const ObjectiveInputSchema = z
  .object({
    objective: text(2000)
      .min(12)
      .refine(
        (s) =>
          !/(?:\b(?:curl|wget|sudo|eval|exec)\s|```|\b(?:api[_ -]?key|private[_ -]?key)\s*[:=]|\b(?:send|transfer|pay)\s+(?:\$|bitcoin|eth\b)|\b(?:connect|sign with)\s+(?:my |a )?wallet|\b(?:run|execute)\s+(?:shell|bash|python|javascript|code|command)|ignore (?:all |previous )?instructions)/i.test(
            s,
          ),
        "Use a planning objective, not credentials, code, or action instructions.",
      ),
    contextUrl: z
      .string()
      .url()
      .max(500)
      .refine((s) => {
        const u = new URL(s);
        return u.protocol === "https:" && !u.username && !u.password;
      }, "Use a public HTTPS context URL without credentials.")
      .optional(),
    budgetUsd: z
      .number()
      .finite()
      .min(0)
      .max(10)
      .refine(
        (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-8,
        "Use whole cents.",
      ),
    optimizationPolicy: z.enum(optimizationPolicies),
    mode: z.literal("demo").default("demo"),
  })
  .strict();
export type ObjectiveInput = z.infer<typeof ObjectiveInputSchema>;
export const CapabilitySchema = z
  .object({
    id: z.enum(capabilityIds),
    label: text(80),
    purpose: text(240),
    priority: z.enum(["critical", "high", "medium", "low"]),
    dependencies: z.array(z.enum(capabilityIds)).max(8),
  })
  .strict();
export const ObjectiveFrameSchema = z
  .object({
    title: text(120),
    normalizedObjective: text(2200),
    objectiveType: z.enum([
      "competitive_intelligence",
      "company_analysis",
      "document_extraction",
      "monitoring",
      "due_diligence",
      "data_enrichment",
      "general_agent_task",
    ]),
    requiredCapabilities: z.array(CapabilitySchema).min(1).max(9),
    constraints: z
      .object({
        budgetUsd: z.number().finite().min(0).max(10),
        optimizationPolicy: z.enum(optimizationPolicies),
        verificationStandard: z.enum([
          "none",
          "single_source",
          "independent_corroboration",
        ]),
        maxLatencySeconds: z.number().positive().max(3600).optional(),
        requiresRecurringExecution: z.boolean(),
      })
      .strict(),
    expectedOutput: z
      .object({
        format: z.enum([
          "route_contract",
          "research_brief",
          "structured_json",
          "monitoring_spec",
        ]),
        description: text(400),
      })
      .strict(),
    ambiguities: z.array(text(240)).max(8),
    routeRationale: text(700),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = f.requiredCapabilities.map((c) => c.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Capabilities must be unique." });
    const visited = new Set<string>(),
      active = new Set<string>();
    function visit(id: string): boolean {
      if (active.has(id)) return false;
      if (visited.has(id)) return true;
      const c = f.requiredCapabilities.find((c) => c.id === id);
      if (!c) return false;
      active.add(id);
      if (!c.dependencies.every(visit)) return false;
      active.delete(id);
      visited.add(id);
      return true;
    }
    if (!ids.every(visit))
      ctx.addIssue({
        code: "custom",
        message: "Dependencies must be present and acyclic.",
      });
  });
export type ObjectiveFrame = z.infer<typeof ObjectiveFrameSchema>;
export type CapabilityId = (typeof capabilityIds)[number];

const labels: Record<CapabilityId, string> = {
  url_extract: "URL extraction",
  structured_profile: "Company profile",
  web_research: "Competitive context",
  news_search: "Recent signals",
  document_parse: "Document parsing",
  data_extract: "Structured extraction",
  change_detection: "Change detection",
  claim_verification: "Independent verification",
  synthesis: "Output synthesis",
};

/** Pure decomposition: no browsing, provider selection, evidence, or execution. */
export function decomposeObjective(raw: ObjectiveInput): ObjectiveFrame {
  const input = ObjectiveInputSchema.parse(raw),
    q = input.objective;
  const type: ObjectiveFrame["objectiveType"] =
    /monitor|recurr|pricing change|per month|\/month/i.test(q)
      ? "monitoring"
      : /due.diligence|material claims|high.impact|evaluating a startup/i.test(
            q,
          )
        ? "due_diligence"
        : /document|pdf|long public/i.test(q)
          ? "document_extraction"
          : /structured (?:company )?data|enrich|website into/i.test(q)
            ? "data_enrichment"
            : /compet|market/i.test(q)
              ? "competitive_intelligence"
              : /company|startup|business/i.test(q) || input.contextUrl
                ? "company_analysis"
                : "general_agent_task";
  const independent =
    type === "due_diligence" ||
    input.optimizationPolicy === "most_verified" ||
    /independent|verified|corroborat/i.test(q);
  const base: Record<ObjectiveFrame["objectiveType"], CapabilityId[]> = {
    competitive_intelligence: [
      "structured_profile",
      "web_research",
      "news_search",
    ],
    company_analysis: ["structured_profile", "web_research"],
    document_extraction: ["document_parse", "data_extract"],
    data_enrichment: ["url_extract", "data_extract"],
    monitoring: ["url_extract", "change_detection"],
    due_diligence: ["structured_profile", "news_search", "web_research"],
    general_agent_task: ["web_research"],
  };
  const ids = [
    ...base[type],
    ...(independent ? ["claim_verification" as const] : []),
    "synthesis" as const,
  ];
  const requiredCapabilities: ObjectiveFrame["requiredCapabilities"] = ids.map(
    (id) => ({
      id,
      label: labels[id],
      purpose:
        id === "claim_verification"
          ? "Require an independent source group for material claims; stop if corroboration is unavailable."
          : `Define the ${labels[id].toLowerCase()} output needed for this objective; do not imply it has been produced.`,
      priority:
        id === "news_search" && type !== "due_diligence"
          ? "medium"
          : id === "web_research" && type === "company_analysis"
            ? "high"
            : "critical",
      dependencies:
        id === "synthesis"
          ? independent
            ? ["claim_verification"]
            : [base[type].at(-1)!]
          : id === "claim_verification"
            ? base[type].filter(
                (i) => i !== "news_search" || type === "due_diligence",
              )
            : id === "data_extract"
              ? [base[type][0]]
              : id === "change_detection"
                ? ["url_extract"]
                : [],
    }),
  );
  const seconds = q.match(/(?:under|within|max(?:imum)?)\s+(\d+)\s+seconds?/i);
  return ObjectiveFrameSchema.parse({
    title: `${type
      .split("_")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")} route`,
    normalizedObjective: q.trim().replace(/\s+/g, " "),
    objectiveType: type,
    requiredCapabilities,
    constraints: {
      budgetUsd: input.budgetUsd,
      optimizationPolicy: input.optimizationPolicy,
      verificationStandard: independent
        ? "independent_corroboration"
        : "single_source",
      requiresRecurringExecution: type === "monitoring",
      ...(seconds
        ? { maxLatencySeconds: Math.max(1, Math.min(3600, Number(seconds[1]))) }
        : {}),
    },
    expectedOutput: {
      format:
        type === "monitoring"
          ? "monitoring_spec"
          : /extraction|enrichment/.test(type)
            ? "structured_json"
            : "route_contract",
      description:
        type === "monitoring"
          ? "A monitoring specification with interval, change threshold, recurring cost, and stop conditions. No scheduler is started."
          : "An agent-ready capability route with dependency order, service choices, fallback constraints, and an uncertainty register.",
    },
    ambiguities: [
      ...(!input.contextUrl &&
      /monitoring|document_extraction|data_enrichment/.test(type)
        ? ["Provide a public context URL before any future execution."]
        : []),
      ...(type === "general_agent_task"
        ? ["Clarify the intended output and measurable completion criteria."]
        : []),
    ],
    routeRationale:
      "Compare eligible service combinations under the operator’s hard budget. Critical capabilities and verification standards take precedence over optional enrichment. All service behavior is simulated.",
  });
}

/** Model text can explain the goal, but cannot relax deterministic constraints or remove needs. */
export function governObjectiveFrame(
  input: ObjectiveInput,
  proposed: ObjectiveFrame,
): ObjectiveFrame {
  const model = ObjectiveFrameSchema.parse(proposed),
    baseline = decomposeObjective(input);
  const byId = new Map(model.requiredCapabilities.map((c) => [c.id, c]));
  for (const c of baseline.requiredCapabilities) {
    const existing = byId.get(c.id);
    byId.set(
      c.id,
      existing
        ? {
            ...existing,
            priority:
              c.priority === "critical" ? "critical" : existing.priority,
            dependencies: [
              ...new Set([...existing.dependencies, ...c.dependencies]),
            ],
          }
        : c,
    );
  }
  return ObjectiveFrameSchema.parse({
    ...model,
    objectiveType: baseline.objectiveType,
    normalizedObjective: input.objective,
    requiredCapabilities: [...byId.values()],
    constraints: {
      ...baseline.constraints,
      ...(model.constraints.maxLatencySeconds
        ? {
            maxLatencySeconds: Math.min(
              model.constraints.maxLatencySeconds,
              baseline.constraints.maxLatencySeconds ?? 3600,
            ),
          }
        : {}),
    },
    expectedOutput: baseline.expectedOutput,
  });
}

export const DecompositionResultSchema = z
  .object({
    frame: ObjectiveFrameSchema,
    source: z.enum(["groq", "local_demo_fallback"]),
    label: z.enum(["Decomposed with Groq", "Local demo decomposition"]),
    fallback: z.boolean(),
    reason: z.enum(["not_configured", "provider_unavailable", "none"]),
    model: z.string().nullable(),
  })
  .strict();
export type DecompositionResult = z.infer<typeof DecompositionResultSchema>;
export const decompositionStatuses = [
  "Parsing objective…",
  "Mapping capabilities…",
  "Applying constraints…",
  "Defining verification standard…",
  "Preparing route competition…",
] as const;
export const DecompositionEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("status"),
      message: z.enum(decompositionStatuses),
    })
    .strict(),
  z
    .object({ type: z.literal("result"), result: DecompositionResultSchema })
    .strict(),
]);
export type DecompositionEvent = z.infer<typeof DecompositionEventSchema>;
