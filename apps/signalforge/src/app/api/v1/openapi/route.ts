import { z } from "zod";
import { ObjectiveInputSchema } from "@/domain/objective";
import {
  CatalogQuerySchema,
  ListingSchema,
  NetworkStatusSchema,
} from "@/domain/intelligence";
import { PlanningResponseSchema } from "@/domain/planning-response";
import { checkPlanningLimit } from "@/server/planning-limit";
import { requestQuery } from "@/server/request-query";
import { ArbitrageInputSchema } from "@/domain/arbitrage";
import {
  ArbitrageReceiptSchema,
  OpportunityQuerySchema,
  OpportunitiesResponseSchema,
} from "@/server/arbitrage/service";
import {
  EvaluationInputSchema,
  EvaluationSchema,
} from "@/server/intelligence/http";
import { ClaimReadinessPacketSchema } from "@/domain/claim-readiness";
import {
  ForgeUnderwritingInputSchema,
  ForgeUnderwritingResponseSchema,
} from "@/domain/forge-underwriting";
import { SourceSynthesisInputSchema, SourceSynthesisResponseSchema } from "@/domain/source-synthesis";
export async function GET(request: Request) {
  const denied = await checkPlanningLimit(request, "catalog");
  if (denied) return denied;
  try {
    requestQuery(request.url);
  } catch {
    return Response.json(
      { error: "Invalid schema request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    {
      openapi: "3.1.0",
      info: {
        title: "SignalForge underwriting and bounded source synthesis",
        version: "1.3.0",
        description:
          "SignalForge underwrites agent work and preserves unknown economics. Underwriting and marketplace contracts remain execution_not_enabled. A separate, explicit user-authorized route can synthesize 1–10 supplied public HTTPS sources; no marketplace actions or payments are enabled.",
      },
      // Relative paths intentionally target the deployment serving this schema.
      components: {
        schemas: {
          PlanningResponse: z.toJSONSchema(PlanningResponseSchema),
          ArbitrageReceipt: z.toJSONSchema(ArbitrageReceiptSchema),
          Opportunities: z.toJSONSchema(OpportunitiesResponseSchema),
          Listing: z.toJSONSchema(ListingSchema),
          NetworkStatus: z.toJSONSchema(NetworkStatusSchema),
          ClaimReadinessPacket: z.toJSONSchema(ClaimReadinessPacketSchema),
          ForgeUnderwritingInput: z.toJSONSchema(ForgeUnderwritingInputSchema),
          ForgeUnderwritingResponse: z.toJSONSchema(
            ForgeUnderwritingResponseSchema,
          ),
          SourceSynthesisInput: z.toJSONSchema(SourceSynthesisInputSchema),
          SourceSynthesisResponse: z.toJSONSchema(SourceSynthesisResponseSchema),
        },
      },
      paths: {
        "/api/v1/opportunities": {
          get: {
            summary:
              "Bounded observed demand search; Lab requires explicit non-production configuration",
            parameters: Object.entries(OpportunityQuerySchema.shape).map(
              ([name, schema]) => ({
                name,
                in: "query",
                schema: z.toJSONSchema(schema),
              }),
            ),
            responses: {
              "200": {
                description: "Demand records, separated by mode",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/Opportunities" },
                  },
                },
              },
            },
          },
        },
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
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/PlanningResponse" },
                  },
                },
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
        "/api/v1/forge/underwrite": {
          post: {
            summary:
              "Underwrite a user-defined task using explicit operator assumptions",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ForgeUnderwritingInput",
                  },
                },
              },
            },
            responses: {
              "200": {
                description:
                  "Server-authoritative conditional economics and receipt; execution disabled",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/ForgeUnderwritingResponse",
                    },
                  },
                },
              },
              "400": { description: "Invalid objective or assumptions" },
              "413": { description: "Body too large" },
              "429": { description: "Rate limit" },
              "503": { description: "Protected service unavailable" },
            },
          },
        },
        "/api/v1/forge/synthesize": {
          post: {
            summary: "Run one explicitly authorized public-source synthesis task",
            description: "Fixed Groq model, 1–10 user-supplied public HTTPS URLs, bounded text, no redirects or private-network access, one model call, no marketplace actions or payments. The receipt distinguishes observed token usage from a calculated published-price cost; it is not a bill or signature.",
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SourceSynthesisInput" } } } },
            responses: {
              "200": { description: "Source-bound synthesis and execution receipt", content: { "application/json": { schema: { $ref: "#/components/schemas/SourceSynthesisResponse" } } } },
              "400": { description: "Invalid or unsafe request" },
              "409": { description: "Duplicate run ID" },
              "413": { description: "Body too large" },
              "429": { description: "Execution quota" },
              "503": { description: "Protected service or source unavailable" },
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
                  schema: z.toJSONSchema(
                    z.union([EvaluationInputSchema, ArbitrageInputSchema]),
                  ),
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: z.toJSONSchema(
                      z.union([EvaluationSchema, ArbitrageReceiptSchema]),
                    ),
                  },
                },
                description:
                  "Unavailable margin or defensible projection with assumptions; no marketplace action",
              },
            },
          },
        },
        "/api/v1/opportunities/claim-readiness": {
          post: {
            summary:
              "Build a read-only claim-readiness packet; never claim or execute",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: z.toJSONSchema(ArbitrageInputSchema),
                },
              },
            },
            responses: {
              "200": {
                description:
                  "Inspection packet with claimAuthorized=false and execution_not_enabled",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/ClaimReadinessPacket",
                    },
                  },
                },
              },
              "400": { description: "Invalid input; no action occurred" },
              "429": { description: "Rate limit" },
            },
          },
        },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
