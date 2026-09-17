import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `192.0.${info.project.name === "mobile" ? 3 : 2}.${(info.testId.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 240) + 1}`,
  });
});

test("Forge Lab produces a server-authoritative conditional result and receipt", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/forge");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Underwrite your own task.");
  await page.getByLabel("Agent objective").fill("Extract and validate structured data from 100 public product pages.");
  await page.getByLabel(/^Payout \/ reward/).fill("20.00");
  await page.getByLabel(/^Fulfillment cost/).fill("2.00");
  await page.getByLabel(/Success probability/).fill("80");
  await page.getByLabel(/Human-review cost/).fill("1.00");
  await page.getByRole("button", { name: "Underwrite task" }).click();
  await expect(page.locator("#forge-decision")).toBeVisible();
  await expect(page.locator("#forge-decision")).toContainText(/CONDITIONALLY (PROFITABLE|MARGINAL|UNECONOMIC)/);
  await expect(page.locator("#forge-route")).toContainText("not task quotes");
  await expect(page.locator("#forge-economics")).toContainText("Refundable capital · not expense");
  await expect(page.getByRole("button", { name: "Download receipt JSON" })).toBeVisible();
  await expect(page.locator("main")).toContainText("EXECUTION DISABLED");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("Forge Lab preserves the scenario and reports a recoverable server failure", async ({ page }) => {
  await page.route("**/api/v1/forge/underwrite", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Underwriting is temporarily unavailable." }) }),
  );
  await page.goto("/forge");
  const objective = page.getByLabel("Agent objective");
  await objective.fill("Compare and verify public pricing across competing agent services.");
  await page.getByLabel(/Success probability/).fill("70");
  await page.getByLabel(/Human-review cost/).fill("0.00");
  await page.getByRole("button", { name: "Underwrite task" }).click();
  await expect(page.locator("[data-forge-lab] [role=alert]")).toHaveText("Underwriting is temporarily unavailable. Your scenario was preserved.");
  await expect(objective).toHaveValue("Compare and verify public pricing across competing agent services.");
});
