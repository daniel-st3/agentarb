import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${info.project.name === "mobile" ? 211 : 210}.${info.title.length}`,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test("underwriting hero → Radar → policy sensitivity → auditable receipt", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Find profitable routes",
  );
  await expect(page.locator(".arb-hero-route")).toContainText("$0.75");
  await expect(page.locator(".arb-hero-route")).toContainText("SIMULATED");
  await expect(page.locator(".paper-report")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-arbitrage-hero.png`,
  });
  await page
    .getByRole("link", { name: "Open Arbitrage Lab ↗" })
    .first()
    .click();
  await expect(
    page.getByRole("table", { name: "Opportunity radar" }),
  ).toBeVisible();
  await expect(page.locator(".arb-row")).toHaveCount(7);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-arbitrage-radar.png`,
  });
  await page
    .getByRole("row", { name: /Policy-sensitive company profile/ })
    .click();
  await page.getByLabel("Minimum margin", { exact: true }).fill("9000");
  await expect(page.locator(".arb-profit")).toContainText("MARGINAL");
  await expect(page.locator(".arb-diff")).toContainText(
    "PROFITABLE → MARGINAL",
  );
  await page.locator(".arb-inspector").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-arbitrage-detail.png`,
  });
  await page.locator(".arb-curve").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-arbitrage-sensitivity.png`,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download auditable receipt" })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "signalforge-arbitrage-receipt.json",
  );
  await page.getByRole("button", { name: "OBSERVED", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "No approved demand feed is connected.",
    }),
  ).toBeVisible();
  await expect(page.locator(".arb-row")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-arbitrage-observed-empty.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
for (const locale of ["es", "fr"] as const)
  test(`${locale} arbitrage copy, policy and locale-preserved mode`, async ({
    page,
  }, info) => {
    await page.goto(`/${locale}/opportunities?mode=lab`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "es"
        ? "¿Resiste el diferencial?"
        : "La marge résiste-t-elle ?",
    );
    await expect(page.locator(".arb-row")).toHaveCount(7);
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-arbitrage-${locale}.png`,
    });
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/opportunities\?mode=lab/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("underwriting proof uses the versioned REST endpoint and exposes safe MCP parameters", async ({
  page,
}, info) => {
  await page.goto("/en/developers/try");
  const proof = page.locator(".arb-api-proof");
  await expect(proof).toContainText("signalforge_evaluate_opportunity");
  await proof
    .getByRole("button", { name: "Compile underwriting receipt" })
    .click();
  await expect(proof.locator("details")).toContainText(
    '"executionStatus": "execution_not_enabled"',
  );
  await expect(proof.locator("details")).toContainText('"actualSpendCents": 0');
  await expect(proof.locator("details")).toContainText('"receiptHash"');
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-arbitrage-api-proof.png`,
  });
});
test("first-paint Network no longer serializes report fixtures", async ({
  request,
}) => {
  const r = await request.get("/en/network");
  const html = await r.text();
  expect(r.status()).toBe(200);
  expect(html).not.toContain("Intelligence brief: Northstar Search");
  expect(html).toContain("Atlas Extract");
});
test("narrow Radar remains keyboard-operable without page overflow", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Widths are exercised once.");
  for (const width of [320, 360, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/en/opportunities?mode=lab");
    const opportunity = page.getByRole("row", {
      name: /Policy-sensitive company profile/,
    });
    await opportunity.focus();
    await opportunity.press("Enter");
    await expect(page.locator(".arb-inspector")).toContainText(
      "Policy-sensitive company profile",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
