import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUBLIC_DISCOVERY_METHOD,
  PUBLIC_SOURCE_URLS,
  discoverPublic,
  normalizeOpenTask,
} from "./discovery";

afterEach(() => vi.restoreAllMocks());

describe("public discovery boundary", () => {
  it("handles a string OpenTask budget conservatively, like Python", () => {
    const row = normalizeOpenTask(
      {
        id: "mixed-budget",
        title: "Research records",
        budgetAmount: "20",
        budgetText: "From 15 USDC",
        skillsTags: ["research"],
      },
      "2026-08-28T00:00:00Z",
    );
    expect(row.payoutUsd).toBe(15);
  });
  it("uses fixed GET-only public origins without forwarding auth, cookies, or a body", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ tasks: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await discoverPublic();
    expect(PUBLIC_DISCOVERY_METHOD).toBe("GET");
    expect(request).toHaveBeenCalledTimes(2);
    for (const [url, init] of request.mock.calls) {
      expect(Object.values(PUBLIC_SOURCE_URLS)).toContain(url);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      expect(init?.body).toBeUndefined();
      const headers = new Headers(init?.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
      expect(headers.has("x-api-key")).toBe(false);
    }
  });

  it("labels normalized public records as live only when fetched successfully", () => {
    expect(
      normalizeOpenTask(
        {
          id: "1",
          title: "Research public API pagination",
          description:
            "Compare the supplied public documentation in a structured matrix.",
          budgetAmount: 10,
          budgetCurrency: "USDC",
          skillsTags: ["research"],
        },
        "2026-08-27T00:00:00Z",
      ).sourceType,
    ).toBe("live_public");
  });

  it("returns controlled demonstration records when public sources are unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const result = await discoverPublic();
    expect(
      result.statuses.every((status) => status.status === "unavailable"),
    ).toBe(true);
    expect(
      result.opportunities.every(
        (item) => item.sourceType === "controlled_demonstration",
      ),
    ).toBe(true);
  });
});
