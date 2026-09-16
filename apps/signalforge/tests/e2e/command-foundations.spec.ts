import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${info.project.name === "mobile" ? 101 : 100}.${(info.testId.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 200) + 1}`,
  });
});

test("typing is local and Ctrl+Enter performs one authoritative underwriting request", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let underwritingCalls = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/forge/underwrite")) underwritingCalls++;
  });
  await page.goto("/forge");
  const input = page.getByLabel("Agent objective");
  await input.fill("Parse and validate a long public document into structured data.");
  expect(underwritingCalls).toBe(0);
  await page.getByLabel(/^Payout \/ reward/).fill("12.00");
  await page.getByLabel(/^Fulfillment cost/).fill("3.00");
  await page.getByLabel(/Success probability/).fill("75");
  await page.getByLabel(/Human-review cost/).fill("1.00");
  await input.press("Control+Enter");
  await expect(page.locator("#forge-decision")).toBeVisible();
  expect(underwritingCalls).toBe(1);
});

test("omitted payout and fulfillment cost remain UNKNOWN rather than zero", async ({ page }) => {
  await page.goto("/forge");
  await page.getByLabel("Agent objective").fill("Build a verification-first public company profile.");
  await page.getByLabel(/Success probability/).fill("70");
  await page.getByLabel(/Human-review cost/).fill("0.00");
  await page.getByRole("button", { name: "Underwrite task" }).click();
  await expect(page.locator("#forge-decision")).toContainText("INSUFFICIENT DATA");
  await expect(page.locator("#forge-decision")).toContainText("Payout was not supplied.");
  await expect(page.locator("#forge-decision")).toContainText("Fulfillment cost was not supplied.");
  await expect(page.locator("#forge-economics")).toContainText("—");
});

test("reduced motion retains the complete causal underwriting structure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/forge");
  await expect(page.locator("[data-forge-lab]")).toBeVisible();
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.getByLabel("Agent objective").fill("Extract public website data and validate the result.");
  await page.getByLabel(/Success probability/).fill("70");
  await page.getByLabel(/Human-review cost/).fill("0.00");
  await page.getByRole("button", { name: "Underwrite task" }).click();
  for (const id of ["forge-objective", "forge-capabilities", "forge-route", "forge-economics", "forge-decision"])
    await expect(page.locator(`#${id}`)).toBeVisible();
});

test("network filters persist in URL and survive reload", async ({ page }) => {
  await page.goto("/network?capability=synthesis&source=demo&sort=structured_price");
  await expect(page.getByLabel("Capability", { exact: true })).toHaveValue("synthesis");
  await page.getByLabel("Sort order", { exact: true }).selectOption("freshest");
  await expect(page).toHaveURL(/sort=freshest/);
  await page.reload();
  await expect(page.getByLabel("Sort order", { exact: true })).toHaveValue("freshest");
  await expect(page.locator(".catalog-row").first()).toBeVisible();
});

test("agent proof makes real REST and MCP planning calls and validates returned contracts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/developers/try");
  await page.getByRole("button", { name: "Send REST request" }).click();
  await expect(page.getByLabel("Execution route contract")).toContainText('"executionStatus": "execution_not_enabled"');
  await page.getByRole("button", { name: "Call MCP planning tool" }).click();
  await expect(page.getByText("MCP / CONTRACT RECEIVED", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("observed options remain visibly separate from simulated route providers", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/routes/plan", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.route.observedSupply = [{ id: "test:catalog-option", name: "Authored catalog test option", sourceId: "test", sourceName: "Test catalog", freshness: "cached_live", observedAt: new Date().toISOString(), sourceUrl: "https://example.com/catalog", accessMode: "official_catalog", actionability: "catalog_only", capabilities: ["synthesis"], pricing: { model: "per_token", parseConfidence: "unstructured", rawPriceText: "Unit pricing requires review" }, label: "Observed Catalog Option", boundaryLabel: "NOT CALLED / NOT PAID / EXECUTION DISABLED", selectionStatus: "discovery_only_not_selected", servicesCalled: false, paymentsMade: false, executionStatus: "execution_not_enabled", reason: "Catalog context only; not a selected provider." }];
    await route.fulfill({ response, json: value });
  });
  await page.goto("/developers/try");
  await page.getByRole("button", { name: "Send REST request" }).click();
  await page.getByRole("link", { name: "Inspect compiled route" }).click();
  await expect(page.getByRole("heading", { name: "Observed Catalog Options" })).toBeVisible();
  await expect(page.getByText("NOT CALLED / NOT PAID / EXECUTION DISABLED", { exact: true })).toBeVisible();
});
