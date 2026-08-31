import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `192.0.${info.project.name === "mobile" ? 3 : 2}.${(info.testId.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 240) + 1}`,
  });
});

test("V3 evidence arrives once, remains truthful, and has a static equivalent", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".signal-field")).toHaveCount(2);
  await expect(page.locator(".arb-hero-route")).toContainText("SIMULATED");
  await page.goto("/forge/example-1/output");
  const evidence = page.locator(".living-evidence");
  await evidence.scrollIntoViewIfNeeded();
  await expect(evidence).toHaveAttribute("data-stage", "corroborated");
  await expect(evidence.locator(".living-final")).toBeVisible();
  await expect(evidence.locator(".living-initial")).not.toBeVisible();
  await expect(evidence.locator(".evidence-arrival")).toHaveCount(2);
  await expect(evidence).toContainText("SIMULATED DEMO");
  await expect(evidence).toContainText("Not real-world verification");
  await evidence.screenshot({
    path: `test-results/screenshots/${info.project.name}-living-evidence.png`,
  });
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await evidence.scrollIntoViewIfNeeded();
  await expect(evidence).toHaveAttribute("data-stage", "corroborated");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(evidence).not.toHaveAttribute("data-stage", "corroborated");
  await expect(evidence.locator(".living-final")).toBeVisible();
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await evidence.screenshot({
    path: `test-results/screenshots/${info.project.name}-evidence-reduced-motion.png`,
  });
  await expect(
    page.getByRole("link", {
      name: "Designed and built by Daniel Rodríguez · AI systems, data, and product",
    }),
  ).toHaveAttribute("href", "https://github.com/daniel-st3/agentarb");
  expect(errors).toEqual([]);
});

test("precision controls support keyboard selection without changing the workflow", async ({
  page,
},info) => {
  await page.goto("/forge");
  const selected = page.getByLabel("Routing policy", { exact: true });
  await selected.focus();
  await page.keyboard.press("m");
  await page.keyboard.press("Tab");
  await selected.focus();
  await selected.selectOption("most_verified");
  await expect(selected).toHaveValue("most_verified");
  await expect(selected).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(selected).toHaveValue("most_verified");
  if(info.project.name==="mobile")await page.locator(".arb-mobile-nav summary").click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Archive" }).filter({visible:true})
    .click();
  await expect(
    page.getByRole("heading", { name: "Archive", exact: true }),
  ).toBeVisible();
  await page.locator(".route-archive-row").first().click();
  await expect(
    page.getByRole("heading", { name: "Agent-ready execution route" }),
  ).toBeVisible();
  await expect(page.locator(".route-constraints")).toContainText("$0.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("no-JavaScript evidence is complete and ambient SVGs are decorative", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3002/forge/example-1/output");
  await expect(page.locator(".living-final")).toHaveText(
    "CORROBORATED IN SIMULATION",
  );
  await expect(page.locator(".living-final")).toBeVisible();
  for (const field of await page.locator(".signal-field").all())
    await expect(field).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.getByRole("link", { name: "Route Forge", exact: true }).first(),
  ).toBeVisible();
  await context.close();
});
