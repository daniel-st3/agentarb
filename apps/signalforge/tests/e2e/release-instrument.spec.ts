import { expect, test } from "@playwright/test";

test("developer schema links use document navigation, not RSC prefetch", async ({ page }) => {
  const schemaRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/v1/openapi") schemaRequests.push(request.url()); });
  await page.goto("/en/developers");
  await page.getByRole("link", { name: "Open the live OpenAPI schema →" }).click();
  await expect(page.locator("body")).toContainText('"openapi":"3.1.0"');
  expect(schemaRequests.length).toBeGreaterThan(0);
  expect(schemaRequests.every((url) => new URL(url).search === "")).toBe(true);
});

test("source entry explains invalid input, prerequisites and source-specific failures", async ({ page }) => {
  await page.goto("/en/forge");
  const run = page.getByRole("button", { name: "Run public-source research ↗" });
  await expect(run).toBeDisabled();
  await expect(page.locator("#source-disabled-reason")).toContainText("12 characters");
  await page.getByLabel("Agent objective").fill("Summarize the provided public sources.");
  await page.getByLabel("Public source URLs", { exact: true }).fill("Please write a summary");
  await expect(page.getByText(/Invalid URL ·/)).toBeVisible();
  await expect(run).toBeDisabled();
  await page.getByLabel("Public source URLs", { exact: true }).fill("https://example.com\nhttps://www.rfc-editor.org/rfc/rfc2606");
  await expect(run).toBeEnabled();
  await page.route("**/api/v1/forge/synthesize", (route) => route.fulfill({ status: 503, json: { code: "redirect_rejected", sourceIndex: 2, error: "internal text must not be displayed" } }));
  await run.click();
  await expect(page.getByRole("alert").filter({ hasText: "Source 2:" })).toContainText("does not follow redirects");
  await expect(page.getByText("internal text must not be displayed")).toHaveCount(0);
  await page.getByLabel("Public source URLs", { exact: true }).fill("https://example.com");
  await expect(page.getByRole("alert").filter({ hasText: "Source 2:" })).toHaveCount(0);
  await expect(page.getByText("Valid URL format · availability checked when research runs")).toBeVisible();
});

test("money inputs follow the page locale rather than the browser OS", async ({ page }) => {
  for (const [locale, amount] of [["en", "10.00"], ["es", "10,00"], ["fr", "10,00"]]) {
    await page.goto(`/${locale}/forge`);
    await expect(page.locator("#forge-budget")).toHaveValue(amount);
    await page.locator("#forge-payout").fill(locale === "en" ? "20.50" : "20,50");
    await expect(page.locator("#forge-payout")).toHaveValue(locale === "en" ? "20.50" : "20,50");
  }
});

test("decision values remain inside their own columns after resize", async ({ page }) => {
  await page.goto("/en/forge");
  await page.getByLabel("Agent objective").fill("Summarize three public reports and compare their evidence.");
  await page.locator("#forge-payout").fill("20.00");
  await page.getByLabel(/^Fulfillment cost/).fill("2.00");
  await page.getByLabel(/Success probability/).fill("80");
  await page.getByLabel(/Human-review cost/).fill("1.00");
  await page.getByRole("button", { name: "Underwrite task", exact: true }).click();
  await expect(page.locator("#forge-decision")).toContainText("$13.00");
  for (const width of [1920, 1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await page.locator("#forge-decision dl dd").evaluateAll((values) => values.every((value) => {
      const rect = value.getBoundingClientRect();
      const parent = value.parentElement!.getBoundingClientRect();
      return value.scrollWidth <= value.clientWidth && rect.left >= parent.left && rect.right <= parent.right + 1;
    }));
    expect(bounds, `financial values fit at ${width}`).toBe(true);
  }
});
