import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${info.project.name === "mobile" ? 101 : 100}.${(info.testId.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 200) + 1}`,
  });
});
test("local preview never calls decomposition while typing; keyboard compiles a real route", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let modelCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/frame")) modelCalls++;
  });
  await page.goto("/forge");
  const input = page.getByRole("textbox", { name: "Agent objective" });
  await input.fill("Create a due diligence route for evaluating a startup");
  // AnimatePresence can retain the exiting label for one render, even at zero duration.
  await expect(page.locator(".preview-type")).toHaveText(["due diligence"]);
  await expect(page.locator(".preview-chain")).toContainText("VERIFY");
  await input.fill(
    "Parse and validate a long public document into structured data",
  );
  await expect(page.locator(".preview-type")).toHaveText([
    "document extraction",
  ]);
  expect(modelCalls).toBe(0);
  await page
    .getByLabel("Routing policy", { exact: true })
    .selectOption("cheapest");
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-command-preview.png`,
    fullPage: false,
  });
  await input.press("Control+Enter");
  await expect(page.getByRole("status")).toHaveText("Local demo decomposition");
  expect(modelCalls).toBe(1);
  await page.getByRole("button", { name: "Build execution route" }).click();
  await expect(
    page.getByRole("heading", { name: "Capability route", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("placeholder changes only while empty and unfocused", async ({ page }) => {
  await page.clock.install();
  await page.goto("/forge");
  const input = page.getByRole("textbox", { name: "Agent objective" });
  // Wait for hydration/event state before advancing timers on slower CI runners.
  await input.focus();
  await expect(input).toHaveAttribute("data-placeholder-overlay", "false");
  await input.blur();
  await expect(input).toHaveAttribute("data-placeholder-overlay", "true");
  const first = await input.getAttribute("placeholder");
  await page.clock.fastForward(7100);
  await expect(input).not.toHaveAttribute("placeholder", first!);
  const second = await input.getAttribute("placeholder");
  expect(first).not.toBe(second);
  await input.focus();
  await page.clock.fastForward(15000);
  await expect(input).toHaveAttribute("placeholder", second!);
  await input.fill("A company objective");
  await input.blur();
  await page.clock.fastForward(15000);
  await expect(input).toHaveAttribute("placeholder", second!);
});
test("reduced motion and missing observations retain an honest usable command surface", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/forge");
  await expect(page.locator(".observed-supply")).toContainText(
    "LIVE CATALOG UNAVAILABLE",
  );
  await expect(page.locator(".observed-supply")).not.toContainText("39");
  await expect(page.locator(".preview-node").first()).toBeVisible();
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-command-reduced.png`,
    fullPage: false,
  });
});
test("network filters persist in URL and survive reload", async ({ page }) => {
  await page.goto(
    "/network?capability=synthesis&source=demo&sort=structured_price",
  );
  await expect(page.getByLabel("Capability", { exact: true })).toHaveValue(
    "synthesis",
  );
  await page.getByLabel("Sort order", { exact: true }).selectOption("freshest");
  await expect(page).toHaveURL(/sort=freshest/);
  await page.reload();
  await expect(page.getByLabel("Sort order", { exact: true })).toHaveValue(
    "freshest",
  );
  await expect(page.locator(".catalog-row").first()).toBeVisible();
});
test("agent proof makes real REST and MCP planning calls and validates returned contracts", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/developers/try");
  await page.getByRole("button", { name: "Send REST request" }).click();
  await expect(page.getByLabel("Execution route contract")).toContainText(
    '"executionStatus": "execution_not_enabled"',
  );
  await expect(page.locator(".proof-trace")).toContainText(
    "Local demo decomposition",
  );
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-agent-rest-proof.png`,
    fullPage: false,
  });
  await page.getByRole("button", { name: "Call MCP planning tool" }).click();
  await expect(
    page.getByText("MCP / CONTRACT RECEIVED", { exact: true }),
  ).toBeVisible();
  await page.getByText("Actual MCP response", { exact: true }).click();
  await expect(page.getByLabel("Agent integration response")).toContainText(
    '"servicesCalled": false',
  );
  await page
    .getByText("Agent Card / fetched from this deployment", { exact: true })
    .click();
  await expect(page.getByLabel("Agent integration response")).toContainText(
    '"supportedInterfaces": []',
  );
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-agent-mcp-proof.png`,
    fullPage: false,
  });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("observed options remain visibly separate from simulated route providers", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/routes/plan", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    // Authored browser fixture only, not an assertion about a live provider.
    value.route.observedSupply = [
      {
        id: "test:catalog-option",
        name: "Authored catalog test option",
        sourceId: "test",
        sourceName: "Test catalog",
        freshness: "cached_live",
        observedAt: new Date().toISOString(),
        sourceUrl: "https://example.com/catalog",
        accessMode: "official_catalog",
        actionability: "catalog_only",
        capabilities: ["synthesis"],
        pricing: {
          model: "per_token",
          parseConfidence: "unstructured",
          rawPriceText: "Unit pricing requires review",
        },
        label: "Observed Catalog Option",
        boundaryLabel: "NOT CALLED / NOT PAID / EXECUTION DISABLED",
        selectionStatus: "discovery_only_not_selected",
        servicesCalled: false,
        paymentsMade: false,
        executionStatus: "execution_not_enabled",
        reason: "Catalog context only; not a selected provider.",
      },
    ];
    await route.fulfill({ response, json: value });
  });
  await page.goto("/developers/try");
  await page.getByRole("button", { name: "Send REST request" }).click();
  await page.getByRole("link", { name: "Inspect compiled route" }).click();
  await expect(
    page.getByRole("heading", { name: "Observed Catalog Options" }),
  ).toBeVisible();
  await expect(
    page.getByText("NOT CALLED / NOT PAID / EXECUTION DISABLED", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Unit pricing requires review", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Price confidence: unstructured", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
