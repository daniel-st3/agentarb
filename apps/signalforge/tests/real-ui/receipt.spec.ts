import { test, expect } from "@playwright/test";
import { TaskOpportunitySchema } from "../../src/domain/intelligence";
import { evaluateArbitrage } from "../../src/domain/arbitrage";
import { realEnvelope } from "../../src/domain/real-economics";

// Authored test payloads only. Never bundled or exposed by a live source adapter.
const task = TaskOpportunitySchema.parse({
  id: "agentbounties:controlled-ui-test",
  sourceId: "agentbounties",
  sourceName: "Controlled source test",
  listingType: "task_opportunity",
  title: "CONTROLLED TEST — structured extraction",
  description:
    "Authored browser-test payload. Not a real marketplace opportunity.",
  requiredCapabilities: ["data_extract"],
  payout: { currency: "USDC", parseConfidence: "exact" },
  deadline: "2099-01-01T00:00:00Z",
  claimModel: "unknown",
  settlement: "escrow",
  actionability: "discovery_only",
  constraints: ["Test fixture only"],
  accessMode: "public_read_only_api",
  freshness: "cached_live",
  observedAt: "2026-09-08T00:00:00.000Z",
  sourceUrl: "https://agentbounties.app/",
  executionStatus: "execution_not_enabled",
  dataQuality: {
    freshnessScore: 0.9,
    priceConfidence: "exact",
    actionabilityConfidence: "observed",
    sourceTrust: "official",
    warnings: ["Authored test"],
  },
  demandState: {
    sourceType: "canonical_base",
    workState: "claimable",
    paymentState: "escrowed",
    paymentCommitted: true,
    reward: {
      amount: "3000001",
      currency: "USDC",
      decimals: 6,
      unit: "base_units",
    },
    refundableBond: null,
    requiredExternalSpend: null,
    verificationReady: true,
    verifier: "Test verifier",
    evidenceRequirements: "Controlled test only",
    evidenceBoundary: "Source projection, not settlement",
    competitionMode: "exclusive_claim",
    deadlineKind: "submission_deadline",
    scoringEndsAt: null,
    participationPhase: null,
    standingMetaBounty: false,
    capabilityStatus: "source_mapped",
    eligibility: "source_ready",
    eligibilityReasons: [],
    projectionGeneratedAt: "2026-09-08T00:00:00.000Z",
    provenance: "observed_source",
  },
});
const evaluation = evaluateArbitrage(
  task,
  { opportunityId: task.id, responseVersion: "2.0" },
  { now: "2026-09-08T00:00:00.000Z" },
);
evaluation.realEconomics = realEnvelope(task.demandState!);
evaluation.reasons = ["complete_fulfillment_scope", "success_probability"];

test("open Radar expires a deadline locally and invalidates its prior receipt", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  const expiring = { ...task, deadline: "2030-01-01T00:01:00Z" };
  let calls = 0;
  await page.route("**/api/v1/opportunities?*", (route) =>
    route.fulfill({ json: { records: [expiring], observedSupplyCount: 75 } }),
  );
  await page.route("**/api/v1/opportunities/evaluate", (route) => {
    calls++;
    return route.fulfill({
      json: {
        evaluation: { ...evaluation, opportunity: expiring },
        receiptHash: "a".repeat(64),
        hashAlgorithm: "SHA-256/canonical-json-v1",
        receiptFingerprintIsSignature: false,
      },
    });
  });
  await page.goto("/en/opportunities");
  await expect(page.locator(".underwriting-verdict")).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(
    page.getByText(
      "Eligibility has changed. Recheck the current source constraints.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: task.title }),
  ).toContainText("NOT ELIGIBLE");
  await expect(
    page.getByRole("button", { name: /Download underwriting JSON/ }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});

test("homepage refresh opens the exact source opportunity in the Radar", async ({
  page,
}) => {
  const another = {
    ...task,
    id: "agentbounties:another-test",
    title: "CONTROLLED TEST — second record",
  };
  await page.route("**/api/v1/opportunities?*", (route) =>
    route.fulfill({
      json: { records: [another, task], observedSupplyCount: 75 },
    }),
  );
  const evaluated: string[] = [];
  await page.route("**/api/v1/opportunities/evaluate", (route) => {
    evaluated.push(route.request().postDataJSON().opportunityId);
    return route.fulfill({
      status: 503,
      headers: { "Retry-After": "60" },
      json: { error: "Unavailable" },
    });
  });
  await page.goto("/en");
  await expect(page.locator(".live-market-note")).toContainText(another.title);
  await page.getByRole("link", { name: "Inspect this opportunity →" }).click();
  await expect(page).toHaveURL(/id=agentbounties%3Aanother-test/);
  await expect(page.locator("#opportunity-inspector h2")).toHaveText(
    another.title,
  );
  await expect.poll(() => evaluated).toContain(another.id);
});

test("populated Radar exits a failed request, respects Retry-After and downloads a receipt", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let attempts = 0;
  const margins: number[] = [];
  await page.route("**/api/v1/opportunities?*", (route) =>
    route.fulfill({
      json: {
        records: [task],
        observedSupplyCount: 75,
        matchedCount: 1,
        truncated: false,
      },
    }),
  );
  await page.route("**/api/v1/opportunities/evaluate", async (route) => {
    attempts++;
    margins.push(route.request().postDataJSON().policy.minimumMarginBps);
    if (attempts === 1)
      return route.fulfill({
        status: 429,
        headers: { "Retry-After": "1" },
        json: { error: "Limited" },
      });
    return route.fulfill({ json: {
      evaluation,
      receiptHash: "a".repeat(64),
      hashAlgorithm: "SHA-256/canonical-json-v1",
      receiptFingerprintIsSignature: false,
    } });
  });
  await page.goto("/en/opportunities");
  await expect(page.getByRole("button", { name: task.title })).toBeVisible();
  await expect(
    page.getByText("Checking economic inputs…", { exact: true }),
  ).toHaveCount(0);
  const retry = page.getByRole("button", { name: /Retry underwriting/ });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled({ timeout: 4000 });
  await retry.click();
  await expect(page.locator(".underwriting-verdict")).toBeVisible();
  await expect(page.locator(".underwriting-reasons")).toContainText(
    "A complete, bounded fulfillment specification is still needed.",
  );
  await page.getByRole("button", { name: task.title }).click();
  await expect(page.locator(".underwriting-verdict")).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByLabel("Minimum margin").fill("3000");
  for (const [label, value] of [
    ["Success probability", "70"],
    ["Max input tokens", "1000"],
    ["Max output tokens", "500"],
    ["Bounded model calls", "1"],
    ["Platform fee", "0"],
    ["Proof / gas fee", "0"],
    ["Human review cost", "0"],
    ["Additional fulfillment", "0"],
    ["Time-value cost", "0"],
    ["Competition-risk adjustment", "0"],
  ] as const) await page.getByLabel(new RegExp(label)).fill(value);
  expect(attempts).toBe(2);
  await page.getByRole("button", { name: "Apply assumptions →" }).click();
  await expect(page.locator(".underwriting-verdict")).toBeVisible();
  expect(margins).toEqual([2500, 2500, 3000]);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Download underwriting JSON/ })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "signalforge-real-underwriting.json",
  );
  // Capture the document from its origin, without a focused skip-link or a
  // mid-scroll fixed navigation bar crossing the full-page screenshot.
  await page.getByRole("heading", { level: 1 }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/real-screenshots/controlled-receipt-test.png",
    fullPage: true,
  });
});

for (const [locale, retryLabel] of [
  ["es", "Reintentar evaluación"],
  ["fr", "Réessayer l’analyse"],
]) {
  test(`${locale} populated mobile failure is localized and static`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/v1/opportunities?*", (route) =>
      route.fulfill({ json: { records: [task], observedSupplyCount: 75 } }),
    );
    await page.route("**/api/v1/opportunities/evaluate", (route) =>
      route.fulfill({
        status: 503,
        headers: { "Retry-After": "60" },
        json: { error: "Unavailable" },
      }),
    );
    await page.goto(`/${locale}/opportunities`);
    await expect(
      page.getByRole("button", { name: new RegExp(retryLabel) }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
