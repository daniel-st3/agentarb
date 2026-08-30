import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPlan,
  createPlan,
  executeRun,
  seedRuns,
  verifyClaim,
} from "../src/domain/engine";
import {
  providers,
  PublicWebResearchProvider,
  X402ServiceCatalogProvider,
} from "../src/domain/providers";
import {
  policies,
  requestInputSchema,
  RunSchema,
  EvidenceItemSchema,
  type ResearchRequest,
} from "../src/domain/schema";
import { DemoRepository, HostedRepository } from "../src/domain/repository";
import { LocalRepository } from "../tools/local-repository";
import { handlePlan, handleRun } from "../src/server/http";
import { topics, fixtureDate } from "../src/domain/fixtures";
const input = {
  question: topics[0].question,
  budgetUsd: 0.25,
  optimizationPolicy: "most_verified" as const,
};
const request: ResearchRequest = {
  ...input,
  id: "test-run",
  createdAt: fixtureDate,
  status: "planned",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("hard budgets and reproducible policy", () => {
  for (const policy of policies) {
    for (const budget of [0, 0.01, 0.02, 0.07, 0.08, 0.1, 0.25, 1, 10]) {
      it(`${policy} never exceeds $${budget}`, async () => {
        const run = await createPlan(
          { ...input, optimizationPolicy: policy, budgetUsd: budget },
          "cap",
        );
        expect(run.plan.estimatedTotalCostUsd).toBeLessThanOrEqual(budget);
        expect(
          run.plan.steps.reduce(
            (sum, step) => sum + Math.round(step.estimatedCostUsd * 100),
            0,
          ),
        ).toBe(Math.round(run.plan.estimatedTotalCostUsd * 100));
        const completed = await executeRun(run.request, true);
        expect(completed.receipt!.simulatedSpendUsd).toBeLessThanOrEqual(
          budget,
        );
        expect(completed.receipt!.actualSpendUsd).toBe(0);
      });
    }
  }
  it("cheapest selects free route, fastest selects rapid, verified adds corroboration", async () => {
    const cheapest = await createPlan(
      { ...input, optimizationPolicy: "cheapest" },
      "cheap",
    );
    const fastest = await createPlan(
      { ...input, optimizationPolicy: "fastest" },
      "fast",
    );
    const verified = await createPlan(input, "verify");
    expect(cheapest.plan.estimatedTotalCostUsd).toBe(0);
    expect(fastest.plan.steps[0].selectedProviderId).toBe("demo-fast");
    expect(
      verified.plan.steps.some(
        (s) => s.selectedProviderId === "demo-verification",
      ),
    ).toBe(true);
  });
  it("same inputs produce the same route, including explanations", () => {
    const offers = providers().map((p) => p.offer());
    expect(buildPlan(request, offers)).toEqual(buildPlan(request, offers));
  });
  it("unavailable, missing-key, catalog, low-quality, and poor-fit alternatives are explained", () => {
    const offers = providers().map((p) => p.offer());
    const poor = { ...offers[0], providerId: "poor", qualityScore: 0.2 };
    const wrong = {
      ...offers[0],
      providerId: "wrong",
      capabilities: ["url_extract" as const],
    };
    const offline = { ...offers[0], providerId: "offline", isEnabled: false };
    const plan = buildPlan(request, [...offers, poor, wrong, offline]);
    const alternatives = plan.steps.flatMap((s) => s.alternativesConsidered);
    expect(alternatives.map((a) => a.code)).toEqual(
      expect.arrayContaining([
        "catalog_only",
        "missing_configuration",
        "low_reliability",
        "low_capability_fit",
        "unavailable",
      ]),
    );
    expect(
      plan.steps.every((s) => s.selectedProviderId.startsWith("demo-")),
    ).toBe(true);
    expect(alternatives.every((a) => a.reason.length > 20)).toBe(true);
  });
  it("above-budget verifier is rejected explicitly", async () => {
    const run = await createPlan({ ...input, budgetUsd: 0 }, "zero");
    expect(
      run.plan.steps[0].alternativesConsidered.find(
        (a) => a.providerId === "demo-verification",
      )?.code,
    ).toBe("would_exceed_budget");
  });
});
describe("provenance and real costs", () => {
  it("complete seeded demo uses no network and records distinct costs", async () => {
    const network = vi.fn(() => {
      throw new Error("Network forbidden");
    });
    vi.stubGlobal("fetch", network);
    const run = await executeRun(request, true);
    expect(network).not.toHaveBeenCalled();
    expect(RunSchema.safeParse(run).success).toBe(true);
    expect(run.brief!.sources).toHaveLength(5);
    expect(run.receipt!.verifiedClaimCount).toBe(2);
    expect(run.receipt!.sourceCount).toBe(4);
    expect(run.receipt!.evidenceItemCount).toBe(5);
    expect(run.receipt!.actualSpendUsd).toBe(0);
    expect(run.receipt!.simulatedSpendUsd).toBe(0.08);
    expect(
      run.brief!.sources.every(
        (e) =>
          e.sourceUrl === null &&
          e.isMock &&
          e.provenanceLabel === "Simulated demo evidence",
      ),
    ).toBe(true);
    expect(run.audit.map((a) => a.state)).toEqual(
      expect.arrayContaining([
        "validate_request",
        "build_plan",
        "user_clicks_run",
        "verify_key_claims",
        "build_receipt",
        "complete",
      ]),
    );
  });
  it("cannot relabel mock evidence as real", async () => {
    const run = await executeRun(request, true);
    expect(
      EvidenceItemSchema.safeParse({ ...run.brief!.sources[0], isMock: false })
        .success,
    ).toBe(false);
    expect(
      EvidenceItemSchema.safeParse({
        ...run.brief!.sources[0],
        sourceType: "public",
      }).success,
    ).toBe(false);
  });
  it("corroboration requires independent provider and publisher", async () => {
    const run = await executeRun(request, true);
    const a = run.brief!.sources[0],
      b = run.brief!.sources[3];
    expect(
      verifyClaim(a.claimId, "test", "high", [a, b]).verificationStatus,
    ).toBe("corroborated_in_simulation");
    expect(
      verifyClaim(a.claimId, "test", "high", [
        a,
        { ...b, providerId: a.providerId },
      ]).verificationStatus,
    ).toBe("single_source");
    expect(
      verifyClaim(a.claimId, "test", "high", [
        a,
        { ...b, independentSourceId: a.independentSourceId },
      ]).verificationStatus,
    ).toBe("single_source");
    expect(verifyClaim(a.claimId, "test", "high", []).verificationStatus).toBe(
      "unverified",
    );
  });
  it("unknown questions do not receive unrelated fixture facts", async () => {
    const run = await executeRun(
      { ...request, question: "What will real markets do tomorrow?" },
      true,
    );
    expect(run.brief!.sources).toHaveLength(0);
    expect(run.plan.planningExplanation).toContain("evidence-gap brief");
    expect(
      run.plan.steps.some(
        (step) => step.selectedProviderId === "demo-verification",
      ),
    ).toBe(false);
    expect(run.receipt!.simulatedSpendUsd).toBe(0);
    expect(run.brief!.executiveSummary).toContain(
      "outside the three fictional demo cases",
    );
    expect(run.receipt!.verifiedClaimCount).toBe(0);
  });
  it("public and catalog adapters cannot execute even if a key exists", async () => {
    vi.stubEnv("PUBLIC_RESEARCH_API_KEY", "test-placeholder-not-a-secret");
    for (const provider of [
      new PublicWebResearchProvider(),
      new X402ServiceCatalogProvider(),
    ]) {
      expect(await provider.isAvailable()).toBe(false);
      await expect(provider.execute()).rejects.toThrow();
    }
  });
  it("example history is honest, deterministic, and covers distinct policies", async () => {
    const seeds = await seedRuns();
    expect(seeds).toHaveLength(3);
    expect(
      seeds.every((r) => r.example && r.receipt?.actualSpendUsd === 0),
    ).toBe(true);
    expect(new Set(seeds.map((r) => r.request.optimizationPolicy)).size).toBe(
      2,
    );
    expect(seeds).toEqual(await seedRuns());
  });
});
describe("repository boundaries", () => {
  it("sessions are independent, completed runs immutable, and snapshots detached", async () => {
    const a = new DemoRepository(),
      b = new DemoRepository();
    const run = await executeRun(request, true);
    await a.save(run);
    expect(await b.list()).toHaveLength(0);
    const returned = (await a.get(request.id))!;
    returned.request.question = "mutation";
    expect((await a.get(request.id))!.request.question).not.toBe("mutation");
    await expect(a.save(run)).rejects.toThrow("immutable");
    await expect(new HostedRepository().save()).rejects.toThrow(
      "not configured",
    );
  });
  it("local SQLite adapter is append-only and unavailable on Vercel", async () => {
    const db = new LocalRepository(":memory:");
    const run = await executeRun(request, true);
    await db.save(run);
    expect(await db.get(request.id)).toEqual(run);
    await expect(db.save(run)).rejects.toThrow();
    db.close();
    vi.stubEnv("VERCEL", "1");
    expect(() => new LocalRepository(":memory:")).toThrow("unavailable");
  });
});
describe("bounded stateless APIs", () => {
  const req = (value: unknown, extra: Record<string, string> = {}) =>
    new Request("http://localhost/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extra },
      body: JSON.stringify(value),
    });
  it("full API flow works without keys, storage, or external requests", async () => {
    const network = vi.fn(() => {
      throw new Error("Network forbidden");
    });
    vi.stubGlobal("fetch", network);
    const response = await handlePlan(
      req(input, { authorization: "not-forwarded", cookie: "not-forwarded" }),
    );
    expect(response.status).toBe(200);
    const plan = RunSchema.parse(await response.json());
    const completed = await handleRun(
      req({ request: plan.request, consent: true }),
    );
    expect(completed.status).toBe(200);
    expect(
      RunSchema.parse(await completed.json()).receipt!.actualSpendUsd,
    ).toBe(0);
    expect(network).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    { ...input, budgetUsd: -1 },
    { ...input, budgetUsd: 100 },
    { ...input, budgetUsd: 0.001 },
    { ...input, question: "short" },
    { ...input, providerId: "arbitrary" },
    { ...input, targetUrl: "http://localhost" },
    { ...input, targetUrl: "https://user:password@example.com" },
    { ...input, question: "a".repeat(20000) },
  ])("invalid input fails closed", async (value) => {
    expect((await handlePlan(req(value))).status).toBe(400);
    expect(requestInputSchema.safeParse(value).success).toBe(false);
  });
  it("rejects cross-origin input and absent run consent", async () => {
    expect(
      (await handlePlan(req(input, { origin: "https://untrusted.example" })))
        .status,
    ).toBe(400);
    expect((await handleRun(req({ request, consent: false }))).status).toBe(
      400,
    );
    expect(
      (
        await handleRun(
          req({
            request,
            consent: true,
            plan: { selectedProviderId: "untrusted" },
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("accepts the browser's actual Host when Next normalizes the internal URL", async () => {
    expect(
      (
        await handlePlan(
          req(input, {
            host: "127.0.0.1:3001",
            origin: "http://127.0.0.1:3001",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handlePlan(
          req(input, {
            host: "127.0.0.1:3001",
            origin: "http://attacker.example",
            "x-forwarded-host": "attacker.example",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("errors do not echo sensitive user input or stack traces", async () => {
    const response = await handlePlan(req({ secret: "sensitive-input" }));
    const body = await response.text();
    expect(body).not.toContain("sensitive-input");
    expect(body).not.toMatch(/stack|ZodError|TypeError/);
  });
});
