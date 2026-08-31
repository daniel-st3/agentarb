import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.100.${info.title.length}`,
  });
});
for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920])
  test(`real-first geometry and no fabricated hero at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Find profitable AI-agent work.",
    );
    await expect(page.locator(".route-narrative")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("$1.20");
    await expect(page.locator("main")).not.toContainText("Arbitrage Lab");
    const headingBox = await page.locator(".live-hero h1").boundingBox();
    const snapshotBox = await page.locator(".live-market-note").boundingBox();
    expect(headingBox).not.toBeNull();
    expect(snapshotBox).not.toBeNull();
    if (width >= 768) {
      expect(snapshotBox!.x).toBeGreaterThan(headingBox!.x + headingBox!.width);
      expect(Math.abs(snapshotBox!.y - headingBox!.y)).toBeLessThan(200);
    } else {
      expect(snapshotBox!.y).toBeGreaterThan(
        headingBox!.y + headingBox!.height,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/real-screenshots/hero-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Inspect paid work ↗" })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Price the work. Know the gaps.",
    );
    await expect(
      page.getByRole("heading", {
        name: "No qualifying work in this snapshot.",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/real-screenshots/radar-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
for (const [locale, title] of [
  ["es", "Encuentra trabajo rentable para agentes."],
  ["fr", "Trouvez des missions rentables pour agents."],
])
  test(`${locale} real-first locale and reduced motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${locale}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.screenshot({
      path: `test-results/real-screenshots/hero-${locale}.png`,
      fullPage: true,
    });
    await page.goto(`/${locale}/opportunities`);
    await expect(page.locator(".real-empty")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("public no-demo REST and MCP contracts remain safe", async ({
  request,
}) => {
  const catalog = await request.get("/api/v1/catalog");
  expect(catalog.status()).toBe(200);
  expect((await catalog.json()).records).toEqual([]);
  expect((await request.get("/api/v1/opportunities?mode=lab")).status()).toBe(
    404,
  );
  expect(
    (
      await request.post("/api/v1/opportunities/evaluate", {
        data: { opportunityId: "lab:spread", responseVersion: "2.0" },
      })
    ).status(),
  ).toBe(404);
  const schema = await (await request.get("/api/v1/openapi")).json();
  expect(schema.servers).toBeUndefined();
  const response = await request.post("/api/mcp", {
    headers: { Accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "public-safety-check", version: "1.0" },
      },
    },
  });
  expect(response.status()).toBe(200);
  expect((await request.get("/.well-known/agent-card.json")).status()).toBe(
    200,
  );
});
test("no-JavaScript public hero stays readable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3006/en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".live-market-note")).toBeVisible();
  await context.close();
});
