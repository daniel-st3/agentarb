import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: { object: vi.fn(() => ({})) },
}));
import { generateText } from "ai";
import {
  ObjectiveFrameSchema,
  ObjectiveInputSchema,
  decomposeObjective,
  governObjectiveFrame,
  DecompositionEventSchema,
} from "../src/domain/objective";
import {
  frameWithProvider,
  framingFetch,
} from "../src/server/framing-provider";
import { handleFrame } from "../src/server/framing-http";
const input = ObjectiveInputSchema.parse({
  objective:
    "Create a due diligence route for a startup with independent verification.",
  budgetUsd: 0.25,
  optimizationPolicy: "most_verified",
});
beforeEach(() => {
  vi.stubEnv("GROQ_API_KEY", "");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("CACHE_MODE", "memory");
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function mockStream(output: unknown) {
  vi.mocked(generateText).mockResolvedValue({ output } as never);
}
describe("objective decomposition boundary", () => {
  it("locale affects fallback display only and is supplied privately to the model instruction", async () => {
    const local = await frameWithProvider(
      input,
      () => {},
      new AbortController().signal,
      "es",
    );
    expect(local.frame.title).toBe("Ruta de diligencia debida");
    expect(local.frame.requiredCapabilities[0].id).toBe("structured_profile");
    vi.stubEnv("GROQ_API_KEY", "unit-test-placeholder-not-a-credential");
    mockStream(decomposeObjective(input));
    await frameWithProvider(
      input,
      () => {},
      new AbortController().signal,
      "fr",
    );
    expect(vi.mocked(generateText).mock.calls[0][0].system).toContain("French");
  });
  it.each([
    [
      "Build a competitive intelligence route for a company",
      "competitive_intelligence",
    ],
    ["Plan company analysis for a startup", "company_analysis"],
    ["Extract and summarize a long public document", "document_extraction"],
    ["Monitor competitor pricing changes monthly", "monitoring"],
    ["Create a due diligence route for material claims", "due_diligence"],
    ["Turn a website into structured company data", "data_enrichment"],
    ["Help define a general agent goal and output", "general_agent_task"],
  ])("classifies %s without research", (objective, type) => {
    const f = decomposeObjective({ ...input, objective });
    expect(f.objectiveType).toBe(type);
    expect(ObjectiveFrameSchema.safeParse(f).success).toBe(true);
  });
  it("rejects duplicate, missing and cyclic capability dependencies", () => {
    const f = decomposeObjective(input);
    expect(
      ObjectiveFrameSchema.safeParse({
        ...f,
        requiredCapabilities: [
          f.requiredCapabilities[0],
          f.requiredCapabilities[0],
        ],
      }).success,
    ).toBe(false);
    f.requiredCapabilities[0].dependencies = ["synthesis"];
    expect(ObjectiveFrameSchema.safeParse(f).success).toBe(false);
  });
  it("never lets model constraints remove critical needs or raise the budget", () => {
    const f = decomposeObjective(input);
    f.constraints.budgetUsd = 10;
    f.constraints.verificationStandard = "none";
    f.requiredCapabilities = [
      {
        id: "synthesis",
        label: "Output",
        purpose: "Consolidate",
        priority: "low",
        dependencies: [],
      },
    ];
    const governed = governObjectiveFrame(input, f);
    expect(governed.constraints.budgetUsd).toBe(0.25);
    expect(governed.constraints.verificationStandard).toBe(
      "independent_corroboration",
    );
    expect(
      governed.requiredCapabilities.find((c) => c.id === "claim_verification")
        ?.priority,
    ).toBe("critical");
  });
  it("without configuration uses local fallback and no model call", async () => {
    const result = await frameWithProvider(
      input,
      () => {},
      new AbortController().signal,
    );
    expect(result.source).toBe("local_demo_fallback");
    expect(result.reason).toBe("not_configured");
    expect(generateText).not.toHaveBeenCalled();
  });
  it("validated real-provider response is labeled decomposition, not research", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-placeholder");
    mockStream(decomposeObjective(input));
    const events: unknown[] = [];
    const result = await frameWithProvider(
      input,
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(result.source).toBe("groq");
    expect(result.label).toBe("Decomposed with Groq");
    expect(result.fallback).toBe(false);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          groq: {
            structuredOutputs: true,
            strictJsonSchema: false,
            reasoningEffort: "low",
          },
        },
        maxRetries: 0,
        experimental_telemetry: { isEnabled: false },
      }),
    );
    expect(
      events.every((e) => DecompositionEventSchema.safeParse(e).success),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("test-placeholder");
  });
  it.each(["404", "429", "timeout"])(
    "provider %s fails safely",
    async (code) => {
      vi.stubEnv("GROQ_API_KEY", "test-placeholder");
      vi.mocked(generateText).mockImplementation(() => {
        throw new Error(code + " private provider details");
      });
      const log = vi.spyOn(console, "error");
      const result = await frameWithProvider(
        input,
        () => {},
        new AbortController().signal,
      );
      expect(result.source).toBe("local_demo_fallback");
      expect(result.fallback).toBe(true);
      expect(JSON.stringify(result)).not.toMatch(
        /test-placeholder|private provider details/,
      );
      expect(log).not.toHaveBeenCalled();
    },
  );
  it.each([{}, { title: "Malformed" }])(
    "malformed response falls back",
    async (value) => {
      vi.stubEnv("GROQ_API_KEY", "test-placeholder");
      mockStream(value);
      expect(
        (await frameWithProvider(input, () => {}, new AbortController().signal))
          .fallback,
      ).toBe(true);
    },
  );
  it("source assertions and invented URLs are not rendered", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-placeholder");
    mockStream({
      ...decomposeObjective(input),
      routeRationale: "According to https://example.com I verified this.",
    });
    expect(
      (await frameWithProvider(input, () => {}, new AbortController().signal))
        .fallback,
    ).toBe(true);
  });
  it("model transport has one fixed destination, no redirect or browser credentials", async () => {
    const network = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", network);
    expect(() =>
      framingFetch("https://evil.test", { method: "POST" }),
    ).toThrow();
    expect(() =>
      framingFetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "GET",
      }),
    ).toThrow();
    await framingFetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      body: "{}",
    });
    expect(network.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
      body: '{"include_reasoning":false}',
    });
  });
  it("streams typed statuses and a final local objective", async () => {
    const res = await handleFrame(
      new Request("http://localhost/api/frame", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.1",
        },
        body: JSON.stringify(input),
      }),
    );
    expect(res.status).toBe(200);
    const events = (await res.text())
      .trim()
      .split("\n")
      .map((l) => DecompositionEventSchema.parse(JSON.parse(l)));
    expect(events.at(-1)?.type).toBe("result");
  });
  it("rejects credentials, arbitrary code, alternate URLs and extra fields before decomposition", async () => {
    for (const payload of [
      { ...input, apiKey: "not-a-key" },
      { ...input, objective: "Execute shell commands on the server please" },
      { ...input, contextUrl: "http://127.0.0.1" },
    ]) {
      const res = await handleFrame(
        new Request("http://localhost/api/frame", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "192.0.2.2",
          },
          body: JSON.stringify(payload),
        }),
      );
      expect(res.status).toBe(400);
    }
    expect(generateText).not.toHaveBeenCalled();
  });
});
