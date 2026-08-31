import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ObjectiveInputSchema } from "../src/domain/objective";
import { seedRoutes } from "../src/domain/route-planner";
import { routeFlow } from "../src/domain/route-flow";
import { parseModelsDev } from "../src/server/intelligence/connectors/models-dev";
import { observedCatalogOptions } from "../src/domain/observed-catalog";

describe("interaction projections preserve the contract", () => {
  it("represents every required and selected capability without changing the contract", () => {
    for (const route of seedRoutes()) {
      const before = JSON.stringify(route);
      const flow = routeFlow(route);
      expect(flow.executionStatus).toBe("execution_not_enabled");
      expect(flow.capabilities).toHaveLength(
        route.objectiveFrame.requiredCapabilities.length,
      );
      expect(flow.selected).toHaveLength(route.route.length);
      expect(
        flow.selected.every(
          (n) =>
            n.kind === "simulated" &&
            n.detail.includes("NOT CALLED / NOT PAID"),
        ),
      ).toBe(true);
      expect(flow.observed).toHaveLength(0);
      expect(flow.rejected.length).toBeLessThanOrEqual(3);
      expect(JSON.stringify(route)).toBe(before);
    }
  });
  it("keeps observed metadata separate from simulated selection, with exact provenance", () => {
    const route = seedRoutes()[0];
    const timestamp = "2026-08-30T00:00:00.000Z";
    const records = parseModelsDev(
      {
        groq: {
          name: "Authored test fixture",
          models: {
            test: {
              id: "test",
              name: "Authored model",
              modalities: { input: ["text"], output: ["text"] },
            },
          },
        },
      },
      timestamp,
    );
    route.observedSupply = observedCatalogOptions(
      records,
      ["synthesis"],
      Date.parse(timestamp),
    );
    const flow = routeFlow(route);
    expect(flow.observed).toHaveLength(1);
    expect(flow.observed[0].kind).toBe("observed");
    expect(flow.observed[0].detail).toContain(timestamp);
    expect(flow.observed[0].detail).toContain(
      "NOT CALLED / NOT PAID / EXECUTION DISABLED",
    );
    expect(flow.selected.some((s) => s.label === flow.observed[0].label)).toBe(
      false,
    );
  });
  it("palette forwarding uses the same bounded objective validation", () => {
    const schema = ObjectiveInputSchema.shape.objective;
    expect(
      schema.safeParse(
        "Build a verification-first due-diligence route under $0.25",
      ).success,
    ).toBe(true);
    for (const invalid of [
      "tiny",
      "x".repeat(2001),
      ["a repeated query parameter"],
      { objective: "nested" },
    ])
      expect(schema.safeParse(invalid).success).toBe(false);
  });
  it("Motion and GSAP ownership remains disjoint", () => {
    const preview = readFileSync("src/components/command-preview.tsx", "utf8");
    expect(preview).toContain('gsap.from(".preview-trace path"');
    expect(preview).not.toMatch(
      /gsap\.(?:from|to|fromTo)\("\.preview-(?:node|type)/,
    );
    const chart = readFileSync(
      "src/components/interactions/route-flow.tsx",
      "utf8",
    );
    expect(chart).not.toMatch(/gsap|data-reveal/);
    const provider = readFileSync(
      "src/components/interactions/provider.tsx",
      "utf8",
    );
    expect(provider).toContain("LazyMotion");
    expect(provider).toContain('reducedMotion="user"');
    expect(
      readFileSync("src/components/editorial/narrative.tsx", "utf8"),
    ).not.toContain('from "motion/react"');
  });
});
