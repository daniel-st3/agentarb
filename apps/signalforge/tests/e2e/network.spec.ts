import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `192.0.${info.project.name === "mobile" ? 11 : 10}.${info.title.length}`,
  });
});
test("network is a labeled sample with safe filtering and opportunity evaluation", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/network");
  await expect(
    page.getByRole("heading", { name: /Observe the supply side/ }),
  ).toBeVisible();
  await expect(
    page.getByText("NON-DURABLE DEMO CACHE", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByLabel("Listing type", { exact: true })
    .selectOption("task_opportunity");
  await page
    .getByText("Structure a public company profile", { exact: true })
    .click();
  await expect(
    page.getByText("Budget negotiable after review", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Evaluate as opportunity" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Projected margin unavailable",
  );
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-network-evaluation.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Listing type", { exact: true })
    .selectOption("service_offer");
  await page.getByLabel("Search this bounded sample").fill("Atlas Extract");
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await page.locator(".catalog-row summary").click();
  await page
    .getByRole("link", { name: "Forge a route for this capability" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Agent objective" }),
  ).toHaveValue(/url extract/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("public API, MCP and discoverability are truthful", async ({
  request,
}, info) => {
  const headers = {
    "x-forwarded-for": `192.0.12.${info.project.name === "mobile" ? 2 : 1}`,
  };
  const card = await request.get("/.well-known/agent-card.json", { headers });
  expect(card.status()).toBe(200);
  expect((await card.json()).supportedInterfaces).toEqual([]);
  expect((await request.get("/llms.txt")).status()).toBe(200);
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/api/v1/openapi", { headers })).status()).toBe(
    200,
  );
  const rpc = await request.post("/api/mcp", {
    headers: { ...headers, Accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "signalforge_get_listing",
        arguments: { id: "demo:atlas-extract" },
      },
    },
  });
  expect(rpc.status()).toBe(200);
  const result = await rpc.json();
  expect(result.result.structuredContent.executionStatus).toBe(
    "execution_not_enabled",
  );
  const plan = await request.post("/api/v1/routes/plan", {
    headers,
    data: {
      objective: "Create a due diligence route with independent verification",
      budgetUsd: 0.1,
      optimizationPolicy: "most_verified",
      mode: "demo",
    },
  });
  expect(plan.status()).toBe(200);
  const body = await plan.json();
  expect(body.route.status).toBe("partial");
  expect(body.route.budget.actualCostUsd).toBe(0);
  expect(body.decompositionSource).toBe("local_demo_fallback");
  expect(JSON.stringify(body)).not.toMatch(/GROQ_API_KEY|UPSTASH_REDIS|stack/);
});
test("discovery failure is unavailable, never fake live", async ({ page }) => {
  await page.route("**/api/v1/catalog?*", (r) =>
    r.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Unavailable"}',
    }),
  );
  await page.goto("/network");
  await expect(page.locator(".network-page [role=alert]")).toContainText(
    "Live discovery is unavailable",
  );
  await expect(page.locator(".catalog-row")).toHaveCount(11);
  for(const row of await page.locator(".catalog-row").all())await expect(row).toContainText("SIMULATED DEMO");
});
