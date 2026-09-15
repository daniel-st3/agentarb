import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../src/server/planning-limit", () => ({
  checkPlanningLimit: vi.fn(async () => null),
  quotaHeaders: () => ({}),
}));
import { checkPlanningLimit } from "../src/server/planning-limit";
import { handleCatalog } from "../src/server/intelligence/http";
import { handleMcp } from "../src/server/mcp";
import { readBounded } from "../src/server/http";
import { requestQuery } from "../src/server/request-query";
import { GET as openapi } from "../src/app/api/v1/openapi/route";

beforeEach(() => {
  vi.mocked(checkPlanningLimit).mockReset().mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it.each(["?refresh=true", "?limit=1&limit=2", "?unknown=x"])(
  "rejects status query %s before discovery",
  async (query) => {
    const response = await handleCatalog(
      new Request("https://preview.example/api/v1/network/status" + query),
      "status",
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each(["listing", "evaluate"] as const)(
  "rejects unused query controls for %s",
  async (kind) => {
    const response = await handleCatalog(
      new Request(
        "https://preview.example/api?execute=true",
        kind === "evaluate"
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                opportunityId: "agentbounties:audit",
                responseVersion: "2.0",
              }),
            }
          : undefined,
      ),
      kind,
      "agentbounties:audit",
    );
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("bounds total URL length before decoding or schema parsing", async () => {
  const url =
    "https://preview.example/api/v1/catalog?query=" + "%61".repeat(1000);
  expect(url.length).toBeGreaterThan(2048);
  expect((await handleCatalog(new Request(url), "search")).status).toBe(400);
  expect(() =>
    requestQuery(
      "https://preview.example/api?" +
        Array.from({ length: 17 }, (_, i) => `k${i}=x`).join("&"),
      true,
    ),
  ).toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("rejects duplicate encoded query keys and preserves supported catalog filters", () => {
  expect(() =>
    requestQuery("https://preview.example/api?limit=1&%6cimit=2", true),
  ).toThrow();
  expect(
    requestQuery("https://preview.example/api?query=text&limit=2", true),
  ).toEqual({ query: "text", limit: "2" });
});

it("requires queryless JSON-body and OpenAPI endpoints", async () => {
  const request = new Request(
    "https://preview.example/api/frame?model=attacker",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  await expect(readBounded(request)).rejects.toThrow("invalid_request_query");
  expect(
    (
      await openapi(
        new Request("https://preview.example/api/v1/openapi?server=attacker"),
      )
    ).status,
  ).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["signalforge_search_catalog", ["catalog"]],
  ["signalforge_plan_route", ["catalog", undefined]],
  ["signalforge_evaluate_opportunity", ["catalog", "underwriting"]],
])(
  "MCP %s consumes the corresponding shared category before dispatch",
  async (name, categories) => {
    const request = new Request("https://preview.example/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: { invalid: true } },
      }),
    });
    await handleMcp(request);
    expect(
      vi.mocked(checkPlanningLimit).mock.calls.map((call) => call[1]),
    ).toEqual(categories);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("MCP shared underwriting denial stops dispatch", async () => {
  vi.mocked(checkPlanningLimit).mockImplementation(async (_, category) =>
    category === "underwriting"
      ? Response.json({ error: "rate_limited" }, { status: 429 })
      : null,
  );
  const request = new Request("https://preview.example/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "signalforge_evaluate_opportunity",
        arguments: {
          opportunity_id: "agentbounties:audit",
          response_version: "2.0",
        },
      },
    }),
  });
  expect((await handleMcp(request)).status).toBe(429);
  expect(fetch).not.toHaveBeenCalled();
});
