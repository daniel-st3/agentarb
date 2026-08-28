import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { TEMPLATE_DEFAULTS } from "@/lib/contracts";

// These regression tests isolate policy/UX behavior. Distributed enforcement
// is exercised without this mock in server/public-rate-limit.test.ts.
vi.mock("@/server/public-rate-limit", () => ({
  enforcePublicLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/discovery", () => ({
  discoverPublic: vi.fn(async () => ({
    opportunities: [],
    statuses: [
      {
        marketplace: "opentask",
        status: "empty",
        count: 0,
        observedAt: "2026-08-27T00:00:00Z",
      },
      {
        marketplace: "execution_market",
        status: "empty",
        count: 0,
        observedAt: "2026-08-27T00:00:00Z",
      },
    ],
  })),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "must-not-be-forwarded",
      Cookie: "must-not-be-forwarded",
    },
    body: JSON.stringify(body),
  });
}

describe("session-only evaluation route", () => {
  it("fails closed on invalid input", async () => {
    const response = await POST(request({ policy: {} }));
    expect(response.status).toBe(400);
  });

  it("returns a no-persistence boundary without treating session IDs as a security limiter", async () => {
    const body = {
      ...structuredClone(TEMPLATE_DEFAULTS["Research Analyst"]),
      sessionId: "b62cfb55-84e6-4b6f-a550-199e932e7549",
    };
    const first = await POST(request(body));
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      boundary: {
        sessionOnly: true,
        persistence: "none",
        marketplaceActions: "disabled",
      },
    });
    const second = await POST(request(body));
    expect(second.status).toBe(200);
  });
});
