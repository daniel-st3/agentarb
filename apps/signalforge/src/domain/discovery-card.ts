import { z } from "zod";
export const agentCardSchema = z.object({
  name: z.literal("SignalForge"),
  description: z.string(),
  version: z.string(),
  capabilities: z.object({
    streaming: z.literal(false),
    pushNotifications: z.literal(false),
  }),
  defaultInputModes: z.array(z.string()),
  defaultOutputModes: z.array(z.string()),
  skills: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  supportedInterfaces: z.array(z.never()),
  "x-signalforge": z.object({
    compatibility: z.literal(
      "A2A-style discoverability only; A2A message/task transport is not implemented.",
    ),
    executionBoundary: z.string(),
    api: z.record(z.string(), z.string()),
    supportedSchemas: z.array(z.string()),
    mcp: z.object({
      endpoint: z.string(),
      transport: z.literal("streamable-http"),
      tools: z.array(z.string()),
    }),
  }),
});
export const agentCard = agentCardSchema.parse({
  name: "SignalForge",
  description:
    "A discovery and routing intelligence layer for the agent economy. Converts objectives into budget-constrained route contracts; no external execution.",
  version: "1.1.0",
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    {id:"arbitrage-underwriting",name:"Arbitrage intelligence",description:"Compare deterministic Lab fulfillment routes using integer economics. Observed unknowns stay null. Inspection only.",tags:["underwriting","arbitrage-lab","execution_not_enabled"]},
    {
      id: "route-planning",
      name: "Capability route planning",
      description:
        "Decompose objectives and compare deterministic budget-constrained demo routes.",
      tags: ["planning", "discovery", "execution_not_enabled"],
    },
    {
      id: "catalog-search",
      name: "Supply intelligence",
      description:
        "Inspect bounded public catalog metadata and evaluate opportunities without marketplace actions.",
      tags: ["catalog", "read-only"],
    },
  ],
  supportedInterfaces: [],
  "x-signalforge": {
    compatibility:
      "A2A-style discoverability only; A2A message/task transport is not implemented.",
    executionBoundary:
      "execution_not_enabled. No bids, claims, submissions, payments, signing, or marketplace actions.",
    api: {
      routePlanning: "/api/v1/routes/plan",
      catalog: "/api/v1/catalog",
      networkStatus: "/api/v1/network/status",
      opportunityEvaluation: "/api/v1/opportunities/evaluate",
      opportunitySearch: "/api/v1/opportunities",
      openapi: "/api/v1/openapi",
    },
    supportedSchemas: [
      "ObjectiveFrame/1.0",
      "ExecutionRouteContract/1.0",
      "CatalogService/1.0",
      "TaskOpportunity/1.0",
      "ArbitrageEvaluation/2.0",
    ],
    mcp: {
      endpoint: "/api/mcp",
      transport: "streamable-http",
      tools: [
        "signalforge_plan_route",
        "signalforge_search_catalog",
        "signalforge_get_listing",
        "signalforge_evaluate_opportunity",
        "signalforge_search_opportunities",
      ],
    },
  },
});
