import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { POST } from "../app/api/evaluate/route";
import { TEMPLATE_DEFAULTS } from "../lib/contracts";
import { limiterTransport } from "./redis-transport";

const token = randomBytes(48).toString("base64");
const salt = randomBytes(32).toString("hex");
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://unit-fixture.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", token);
  vi.stubEnv("RATE_LIMIT_SALT", salt);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function incoming() {
  return new Request("https://sandbox.example/api/evaluate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.5",
      cookie: "visitor=private",
      authorization: "never-forward",
    },
    body: JSON.stringify({
      ...TEMPLATE_DEFAULTS["Research Analyst"],
      sessionId: randomUUID(),
    }),
  });
}
it("real SDK performs one atomic limiter request before exactly two credential-free marketplace GETs", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes("upstash.io")
              ? { result: [1, 0] }
              : { tasks: [] },
          ),
        ),
    );
  expect((await POST(incoming())).status).toBe(200);
  expect(network).toHaveBeenCalledTimes(3);
  const [url, options] = network.mock.calls[0];
  expect(url).toBe("https://unit-fixture.upstash.io");
  expect(options).toMatchObject({
    method: "POST",
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
  });
  expect(new Headers(options?.headers).get("authorization")).toBe(
    `Bearer ${token}`,
  );
  expect(String(options?.body)).not.toMatch(
    /192\.0\.2\.5|visitor|never-forward|Research Analyst/,
  );
  for (const [market, init] of network.mock.calls.slice(1)) {
    expect([
      "https://opentask.ai/api/tasks?limit=5",
      "https://api.execution.market/api/v1/tasks/available?limit=5",
    ]).toContain(market);
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
    });
    expect(init?.body).toBeUndefined();
    const headers = new Headers(init?.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("cookie")).toBe(false);
  }
});
it("does not retry network errors or send marketplace requests after an invalid store response", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("sensitive failure"));
  expect((await POST(incoming())).status).toBe(503);
  expect(network).toHaveBeenCalledTimes(1);
  network
    .mockClear()
    .mockResolvedValue(
      new Response(JSON.stringify({ error: "sensitive redis failure" })),
    );
  const denied = await POST(incoming());
  expect(denied.status).toBe(503);
  expect(await denied.text()).not.toContain("sensitive");
  expect(network).toHaveBeenCalledTimes(1);
});
it("rejects redirects, oversized responses, and non-limiter Redis commands", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "https://evil.example" },
    }),
  );
  expect((await POST(incoming())).status).toBe(503);
  network.mockResolvedValue(new Response("x".repeat(5000)));
  expect((await POST(incoming())).status).toBe(503);
  network.mockClear();
  const requester = limiterTransport({
    mode: "distributed",
    url: "https://unit-fixture.upstash.io",
    token,
    salt,
  });
  await expect(
    requester.request({ body: ["set", "visitor", "data"] }),
  ).rejects.toThrow();
  expect(network).not.toHaveBeenCalled();
});
