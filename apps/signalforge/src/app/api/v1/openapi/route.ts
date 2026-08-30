import { z } from "zod";
import { ObjectiveInputSchema } from "@/domain/objective";
import { CatalogQuerySchema } from "@/domain/intelligence";
import { checkPlanningLimit } from "@/server/planning-limit";
export async function GET(request: Request) {
  const denied = await checkPlanningLimit(request, "catalog");
  if (denied) return denied;
  return Response.json(
    {
      openapi: "3.1.0",
      info: {
        title: "SignalForge discovery and demo planning",
        version: "1.0.0",
        description:
          "execution_not_enabled. No external task service execution or marketplace actions.",
      },
      servers: [{ url: "https://signalforge-rose-two.vercel.app" }],
      paths: {
        "/api/v1/routes/plan": {
          post: {
            summary: "Plan a demo capability route",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: z.toJSONSchema(ObjectiveInputSchema),
                },
              },
            },
            responses: {
              "200": {
                description:
                  "ObjectiveFrame, route contract, decompositionSource, freshnessSummary, warnings, executionStatus",
              },
              "400": { description: "Invalid input" },
              "413": { description: "Body too large" },
              "429": { description: "Rate limit" },
              "503": { description: "Unavailable" },
            },
          },
        },
        "/api/v1/catalog": {
          get: {
            summary: "Search a bounded catalog sample",
            parameters: Object.entries(CatalogQuerySchema.shape).map(
              ([name, schema]) => ({
                name,
                in: "query",
                schema: z.toJSONSchema(schema),
              }),
            ),
            responses: {
              "200": { description: "Normalized listings and source status" },
            },
          },
        },
        "/api/v1/catalog/{id}": {
          get: {
            summary: "Retrieve catalog listing",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string", maxLength: 240 },
              },
            ],
            responses: {
              "200": { description: "Normalized listing" },
              "404": { description: "Not in current sample" },
            },
          },
        },
        "/api/v1/network/status": {
          get: {
            summary: "Connector health and freshness",
            responses: {
              "200": {
                description:
                  "Source state without raw payloads or configuration",
              },
            },
          },
        },
        "/api/v1/opportunities/evaluate": {
          post: {
            summary: "Evaluate a catalog task, never act",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["opportunityId"],
                    properties: {
                      opportunityId: { type: "string", maxLength: 240 },
                      agentProfile: { const: "default_demo_profile" },
                    },
                  },
                },
              },
            },
            responses: {
              "200": {
                description:
                  "Unavailable margin or defensible projection with assumptions; no marketplace action",
              },
            },
          },
        },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
