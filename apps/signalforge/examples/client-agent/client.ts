import { z } from "zod";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  ObjectiveInputSchema,
  decomposeObjective,
} from "../../src/domain/objective";
import {
  ExecutionRouteContractSchema,
  type ExecutionRouteContract,
} from "../../src/domain/route-planner";

export const ClientRequestSchema = z
  .object({
    objective: ObjectiveInputSchema.shape.objective,
    budgetUsd: ObjectiveInputSchema.shape.budgetUsd,
    policy: ObjectiveInputSchema.shape.optimizationPolicy,
    endpoint: z
      .string()
      .url()
      .refine((value) => {
        const u = new URL(value);
        return (
          !u.username &&
          !u.password &&
          !u.search &&
          !u.hash &&
          u.pathname === "/" &&
          (u.protocol === "https:" ||
            (u.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(u.hostname)))
        );
      }),
    transport: z.enum(["rest", "mcp"]),
  })
  .strict();
export type ClientRequest = z.infer<typeof ClientRequestSchema>;
export const ClientAgentReceiptSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    receiptId: z.string().uuid(),
    createdAt: z.string().datetime(),
    endpoint: z.string().url(),
    transport: z.enum(["rest", "mcp"]),
    request: z
      .object({
        objective: z.string(),
        budgetUsd: z.number(),
        policy: z.string(),
      })
      .strict(),
    routeId: z.string().optional(),
    contractValidation: z.enum(["accepted", "refused"]),
    refusalReasons: z.array(z.string()),
    budgetCheck: z
      .object({
        hardCapUsd: z.number(),
        estimatedCostUsd: z.number().optional(),
        passed: z.boolean(),
      })
      .strict(),
    executionBoundary: z
      .object({
        executionEnabled: z.literal(false),
        servicesCalled: z.literal(false),
        paymentsMade: z.literal(false),
      })
      .strict(),
    observedOptionCount: z.number().int(),
    provenanceSummary: z.array(z.string()),
  })
  .strict();
export type ClientAgentReceipt = z.infer<typeof ClientAgentReceiptSchema>;

export function inspectContract(
  raw: unknown,
  request: ClientRequest,
  now = Date.now(),
) {
  const reasons: string[] = [];
  // Require explicit wire values: schema defaults must never hide missing boundaries.
  const boundary = z
    .object({
      executionStatus: z.literal("execution_not_enabled"),
      observedSupply: z.array(z.unknown()),
      provenance: z.object({
        isSimulated: z.literal(true),
        servicesCalled: z.literal(false),
        paymentsMade: z.literal(false),
      }),
    })
    .safeParse(raw);
  if (!boundary.success) reasons.push("missing_or_unsafe_execution_boundary");
  const parsed = ExecutionRouteContractSchema.safeParse(raw);
  if (!parsed.success) reasons.push("invalid_route_contract");
  const route = parsed.success ? parsed.data : undefined;
  if (route) {
    const baseline = decomposeObjective({
      objective: request.objective,
      budgetUsd: request.budgetUsd,
      optimizationPolicy: request.policy,
      mode: "demo",
    });
    if (
      baseline.requiredCapabilities.some(
        (c) =>
          c.priority === "critical" &&
          !route.route.some((s) => s.capability === c.id),
      )
    )
      reasons.push("objective_critical_coverage_missing");
    if (
      baseline.constraints.verificationStandard ===
        "independent_corroboration" &&
      route.verificationPolicy.standard !== "independent_corroboration"
    )
      reasons.push("objective_verification_downgraded");
    if (
      !["planned", "simulated"].includes(route.status) ||
      route.unmetRequirements.length
    )
      reasons.push("route_incomplete_or_unexpected_status");
    if (
      route.objective !== request.objective ||
      route.objectiveFrame.constraints.optimizationPolicy !== request.policy
    )
      reasons.push("request_contract_mismatch");
    if (
      route.budget.hardCapUsd > request.budgetUsd ||
      route.budget.estimatedRouteCostUsd > request.budgetUsd ||
      route.objectiveFrame.constraints.budgetUsd > request.budgetUsd
    )
      reasons.push("supplied_budget_exceeded");
    if (
      route.objectiveFrame.requiredCapabilities.some(
        (c) =>
          c.priority === "critical" &&
          !route.route.some((s) => s.capability === c.id),
      )
    )
      reasons.push("missing_critical_capability");
    if (
      route.verificationPolicy.standard !==
      route.objectiveFrame.constraints.verificationStandard
    )
      reasons.push("verification_standard_mismatch");
    if (
      route.verificationPolicy.standard === "independent_corroboration" &&
      !route.route.some(
        (s) => s.capability === "claim_verification" && s.verificationRequired,
      )
    )
      reasons.push("independent_verification_missing");
    if (
      route.observedSupply.some(
        (s) =>
          !s.sourceName ||
          !s.sourceUrl ||
          Date.parse(s.observedAt) > now + 60000 ||
          now - Date.parse(s.observedAt) > 86400000 ||
          route.route.some(
            (step) =>
              step.selectedProvider.id === s.id ||
              step.fallbackProvider?.id === s.id,
          ),
      )
    )
      reasons.push("invalid_observed_provenance_or_selection");
  }
  return { route, reasons };
}
export function makeReceipt(
  request: ClientRequest,
  raw: unknown,
  transportFailure?: string,
) {
  const { route, reasons } = inspectContract(raw, request);
  if (transportFailure) reasons.unshift(transportFailure);
  const receipt = ClientAgentReceiptSchema.parse({
    schemaVersion: "1.0",
    receiptId: randomUUID(),
    createdAt: new Date().toISOString(),
    endpoint: request.endpoint,
    transport: request.transport,
    request: {
      objective: request.objective,
      budgetUsd: request.budgetUsd,
      policy: request.policy,
    },
    routeId: route?.routeId,
    contractValidation: reasons.length ? "refused" : "accepted",
    refusalReasons: reasons,
    budgetCheck: {
      hardCapUsd: request.budgetUsd,
      estimatedCostUsd: route?.budget.estimatedRouteCostUsd,
      passed:
        !!route &&
        route.budget.hardCapUsd <= request.budgetUsd &&
        route.budget.estimatedRouteCostUsd <= request.budgetUsd,
    },
    executionBoundary: {
      executionEnabled: false,
      servicesCalled: false,
      paymentsMade: false,
    },
    observedOptionCount: route?.observedSupply.length ?? 0,
    provenanceSummary:
      route?.observedSupply.map(
        (s) =>
          `${s.sourceName} / ${s.freshness} / ${s.observedAt} / NOT CALLED`,
      ) ?? [],
  });
  return { receipt, route };
}
export async function retrieveRoute(
  request: ClientRequest,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const args = {
    objective: request.objective,
    budget_usd: request.budgetUsd,
    optimization_policy: request.policy,
  };
  const response = await fetcher(
    new URL(
      request.transport === "rest" ? "/api/v1/routes/plan" : "/api/mcp",
      request.endpoint,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.transport === "mcp"
          ? { Accept: "application/json, text/event-stream" }
          : {}),
      },
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify(
        request.transport === "rest"
          ? {
              objective: request.objective,
              budgetUsd: request.budgetUsd,
              optimizationPolicy: request.policy,
              mode: "demo",
            }
          : {
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "signalforge_plan_route", arguments: args },
            },
      ),
    },
  );
  if (
    !response.ok ||
    !response.body ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error("planning_response_unavailable");
  const reader = response.body.getReader();
  let body = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) throw new Error("response_too_large");
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  const parsed: unknown = JSON.parse(body + decoder.decode());
  const envelope =
    request.transport === "rest"
      ? z.object({ route: z.unknown() }).parse(parsed)
      : z
          .object({
            result: z.object({
              isError: z.literal(false).optional(),
              structuredContent: z.object({ route: z.unknown() }),
            }),
          })
          .parse(parsed).result.structuredContent;
  return envelope.route;
}
export async function writeReceipt(path: string, receipt: ClientAgentReceipt) {
  // Exclusive create. Never overwrite, append to, or mutate an existing receipt.
  await writeFile(
    path,
    JSON.stringify(ClientAgentReceiptSchema.parse(receipt), null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
}
const safeText = (text: string) =>
  text.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
export function terminalReceipt(
  receipt: ClientAgentReceipt,
  route?: ExecutionRouteContract,
) {
  return [
    "SIGNALFORGE CLIENT AGENT",
    "────────────────────────────────────────",
    `Objective: ${safeText(receipt.request.objective)}`,
    `Policy: ${receipt.request.policy}`,
    `Budget cap: $${receipt.budgetCheck.hardCapUsd.toFixed(2)}`,
    `Route status: ${route?.status ?? "invalid"} / execution disabled`,
    `Estimated cost: ${route ? `$${route.budget.estimatedRouteCostUsd.toFixed(2)}` : "unavailable"}`,
    "",
    "Required capabilities",
    ...(route?.objectiveFrame.requiredCapabilities.map(
      (c, i) => ` ${i + 1}. ${safeText(c.label)}`,
    ) ?? [" Unavailable"]),
    "",
    "Observed catalog options",
    ...(receipt.provenanceSummary.length
      ? receipt.provenanceSummary.map((s) => ` • ${safeText(s)}`)
      : [" None attached; no live evidence inferred"]),
    "",
    "Safety validation",
    ` ${receipt.budgetCheck.passed ? "✓" : "×"} Hard budget honored`,
    " ✓ No services called by this client",
    " ✓ No payments made by this client",
    " ✓ External execution disabled",
    ` ${receipt.contractValidation === "accepted" ? "✓" : "×"} Route contract safety validation`,
    ...receipt.refusalReasons.map((r) => ` REFUSED / ${r}`),
    "",
    receipt.contractValidation === "accepted"
      ? "Decision: ROUTE ACCEPTED FOR FUTURE SAFE EXECUTOR"
      : "Decision: ROUTE REFUSED",
    "Inspection only. This is not execution authorization.",
  ].join("\n");
}
