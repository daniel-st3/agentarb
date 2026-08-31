import { describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ClientRequestSchema,
  inspectContract,
  makeReceipt,
  retrieveRoute,
  writeReceipt,
  terminalReceipt,
} from "../examples/client-agent/client";
import { buildExecutionRoute } from "../src/domain/route-planner";
import { ObjectiveInputSchema } from "../src/domain/objective";
const request = ClientRequestSchema.parse({
  objective: "Build a verified startup due-diligence route",
  budgetUsd: 0.25,
  policy: "most_verified",
  endpoint: "https://signalforge-rose-two.vercel.app",
  transport: "rest",
});
const contract = () =>
  buildExecutionRoute(
    ObjectiveInputSchema.parse({
      objective: request.objective,
      budgetUsd: request.budgetUsd,
      optimizationPolicy: request.policy,
    }),
  );
describe("independent non-executing client agent", () => {
  it("does not trust a remote frame that hides critical needs or verification", () => {
    const route = contract();
    route.objectiveFrame.requiredCapabilities =
      route.objectiveFrame.requiredCapabilities.filter(
        (c) => c.id !== "news_search",
      );
    route.route = route.route.filter((s) => s.capability !== "news_search");
    expect(makeReceipt(request, route).receipt.contractValidation).toBe(
      "refused",
    );
  });
  it("accepts a complete safe contract and serializes an honest receipt", () => {
    const { receipt, route } = makeReceipt(request, contract());
    expect(receipt.contractValidation).toBe("accepted");
    expect(receipt.executionBoundary).toEqual({
      executionEnabled: false,
      servicesCalled: false,
      paymentsMade: false,
    });
    expect(terminalReceipt(receipt, route)).toContain("Inspection only");
  });
  it.each(["executionStatus", "observedSupply", "provenance"])(
    "refuses absent explicit wire field %s, not schema defaults",
    (key) => {
      const raw: Record<string, unknown> = { ...contract() };
      delete raw[key];
      expect(makeReceipt(request, raw).receipt.contractValidation).toBe(
        "refused",
      );
    },
  );
  it.each(["servicesCalled", "paymentsMade"])("refuses %s=true", (field) => {
    const raw = contract();
    (raw.provenance as Record<string, unknown>)[field] = true;
    expect(makeReceipt(request, raw).receipt.contractValidation).toBe(
      "refused",
    );
  });
  it("refuses an unexpected status, missing critical capability, and a lower supplied budget", () => {
    const route = contract();
    route.route = route.route.filter(
      (s) => s.capability !== "claim_verification",
    );
    expect(inspectContract(route, request).reasons.length).toBeGreaterThan(0);
    expect(
      inspectContract({ ...contract(), status: "executed" }, request).reasons
        .length,
    ).toBeGreaterThan(0);
    expect(
      inspectContract(contract(), { ...request, budgetUsd: 0.1 }).reasons,
    ).toContain("supplied_budget_exceeded");
  });
  it.each([
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com/alternate",
    "https://example.com?key=x",
  ])("rejects unsafe endpoint %s", (endpoint) =>
    expect(
      ClientRequestSchema.safeParse({ ...request, endpoint }).success,
    ).toBe(false),
  );
  it.each(["rest", "mcp"] as const)(
    "retrieves %s only through the fixed planning interface",
    async (transport) => {
      const route = contract();
      const fetcher = vi.fn(async () =>
        Response.json(
          transport === "rest"
            ? { route }
            : { result: { structuredContent: { route } } },
        ),
      );
      expect(await retrieveRoute({ ...request, transport }, fetcher)).toEqual(
        route,
      );
      const [url, init] = fetcher.mock.calls[0] as unknown as [
        URL,
        RequestInit,
      ];
      expect(url.pathname).toBe(
        transport === "rest" ? "/api/v1/routes/plan" : "/api/mcp",
      );
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
        credentials: "omit",
      });
      expect(JSON.stringify(init.headers)).not.toMatch(/authorization|cookie/i);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects errors and oversized responses without echoing payloads", async () => {
    await expect(
      retrieveRoute(request, async () =>
        Response.json(
          { error: "private infrastructure details" },
          { status: 429 },
        ),
      ),
    ).rejects.toThrow("planning_response_unavailable");
    await expect(
      retrieveRoute(request, async () =>
        Response.json({ data: "x".repeat(1048576) }),
      ),
    ).rejects.toThrow("response_too_large");
  });
  it("creates receipts exclusively and never overwrites a previous receipt", async () => {
    const folder = await mkdtemp(join(tmpdir(), "sf-client-test-")),
      path = join(folder, "receipt.json");
    const { receipt } = makeReceipt(request, contract());
    await writeReceipt(path, receipt);
    await expect(writeReceipt(path, receipt)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(receipt);
  });
  it("unsafe fixture refusal cannot print a successful safety decision", () => {
    const { receipt, route } = makeReceipt(request, {
      ...contract(),
      executionStatus: "execution_enabled",
    });
    expect(terminalReceipt(receipt, route)).toContain(
      "Decision: ROUTE REFUSED",
    );
    expect(terminalReceipt(receipt, route)).not.toContain("ROUTE ACCEPTED");
  });
});
