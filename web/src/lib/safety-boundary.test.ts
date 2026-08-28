import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { POST } from "../app/api/evaluate/route";
import { GET } from "../app/api/discovery/route";
import { TEMPLATE_DEFAULTS, policyEnvelopeSchema } from "./contracts";
import { clearRateLimitsForTests } from "./rate-limit";
import { CONTROLLED_OPPORTUNITIES } from "./discovery";
import { createPackagePreview, evaluateOpportunity } from "./policy";
import { isSameOrigin } from "./http-boundary";

const sessionId = "b62cfb55-84e6-4b6f-a550-199e932e7549";
const envelope = () => ({
  ...structuredClone(TEMPLATE_DEFAULTS["Research Analyst"]),
  sessionId,
});
const request = (body: unknown) =>
  new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: "untrusted-do-not-forward",
      cookie: "untrusted-do-not-forward",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => clearRateLimitsForTests());
afterEach(() => vi.restoreAllMocks());

describe("fail-closed public boundary", () => {
  it("handles Next internal URLs while rejecting foreign origins", () => {
    expect(
      isSameOrigin(
        new Request("http://localhost:3000/api/evaluate", {
          headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        new Request("http://localhost:3000/api/evaluate", {
          headers: {
            host: "127.0.0.1:3000",
            origin: "https://untrusted.example",
          },
        }),
      ),
    ).toBe(false);
  });
  it.each([
    "url",
    "endpoint",
    "apiKey",
    "wallet",
    "provider",
    "worker",
    "approval",
  ])("rejects injected %s fields", async (field) => {
    const upstream = vi.spyOn(globalThis, "fetch");
    expect(
      (await POST(request({ ...envelope(), [field]: "forbidden" }))).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([NaN, Infinity, -1, 101])(
    "rejects invalid execution cost %s",
    (value) => {
      const input = envelope();
      input.profile.maxExecutionCostUsd = value;
      expect(policyEnvelopeSchema.safeParse(input).success).toBe(false);
    },
  );
  it("rejects oversized bodies before discovery", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    expect(
      (await POST(request({ ...envelope(), junk: "x".repeat(20000) }))).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("never forwards caller headers, cookies, or POST body to a marketplace", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ tasks: [] })),
      );
    const response = await POST(request(envelope()));
    expect(response.status).toBe(200);
    for (const [, init] of upstream.mock.calls) {
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      expect(init?.redirect).toBe("error");
    }
    const data = await response.json();
    expect(JSON.stringify(data)).not.toMatch(
      /untrusted-do-not-forward|simulated_pnl|package_hash|approved|private_key/,
    );
  });
  it("shares the cooldown between GET discovery and POST evaluation", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response('{"tasks":[]}'),
    );
    expect(
      (
        await GET(
          new Request("http://localhost/api/discovery", {
            headers: { "x-sandbox-session": sessionId },
          }),
        )
      ).status,
    ).toBe(200);
    expect((await POST(request(envelope()))).status).toBe(429);
  });
  it("rejects alternate routes and missing sessions", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");
    expect(
      (
        await GET(
          new Request("http://localhost/api/discovery?url=https://example.com"),
        )
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects a forged allow flag for unsafe work", () => {
    const row = evaluateOpportunity(CONTROLLED_OPPORTUNITIES[5], envelope());
    row.packageEligibility = "allow";
    expect(() => createPackagePreview(row, envelope())).toThrow();
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(path) && !path.endsWith(".test.ts")
        ? [path]
        : [];
  });
}

it("runtime import graph contains no persistence, worker, connector, shell, or provider surface", () => {
  const sources = sourceFiles(join(process.cwd(), "src"));
  for (const file of sources) {
    const content = readFileSync(file, "utf8");
    expect(content).not.toMatch(
      /from\s+["'][^"']*(?:node:fs|child_process|sqlite|prisma|arbiter_worker|connectors|groq|openai)["']/,
    );
    expect(content).not.toMatch(
      /\b(?:eval|exec|writeFile|appendFile|localStorage|sessionStorage)\s*\(/,
    );
  }
  const routes = sources.filter((file) => file.endsWith("/route.ts"));
  expect(routes).toHaveLength(2);
  for (const route of routes) {
    const content = readFileSync(route, "utf8");
    expect(content).not.toMatch(
      /export (?:async )?function (?:PUT|PATCH|DELETE)/,
    );
  }
});
