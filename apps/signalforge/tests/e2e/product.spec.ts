import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `192.0.${info.project.name === "mobile" ? 5 : 4}.${(info.title.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 240) + 1}`,
  });
});
import { mkdir } from "node:fs/promises";
const shots = "test-results/screenshots";

test("short laptop windows keep the Profit Engine readable", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "IS THE WORK WORTH DOING?" })).toBeVisible();
  await page.getByRole("heading", { name: "Continue with the evidence." }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Continue with the evidence." })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Profit Engine remains available without JavaScript", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3002/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("IS THE WORK WORTH DOING?");
  await expect(page.getByRole("heading", { name: "Continue with the evidence." })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("SIMULATED / ARBITRAGE LAB");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await context.close();
});
async function screenshot(page: Page, name: string) {
  // Capture the static equivalent, with sticky navigation at the document top.
  // GSAP is separately exercised by the normal-motion interaction tests.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: `${shots}/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
test.beforeAll(async () => {
  await mkdir(shots, { recursive: true });
});
test("homepage → Forge Lab → conditional decision → receipt, with legacy evidence exports intact", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:3002"))
      external.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "IS THE WORK WORTH DOING?",
    }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-hero`);
  await page.screenshot({
    path: `${shots}/${info.project.name}-hero-viewport.png`,
  });
  await page.locator("[data-profit-engine]").screenshot({
    path: `${shots}/${info.project.name}-underwriting-example.png`,
    style: ".site-nav, .skip-link { visibility: hidden !important; }",
  });
  await page.goto("/forge");
  await expect(
    page.getByRole("heading", { name: "Underwrite your own task." }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-composer`);
  await page.getByLabel("Agent objective").fill("Extract and verify structured public company data for a research brief.");
  await page.getByLabel(/^Payout \/ reward/).fill("20.00");
  await page.getByLabel(/^Fulfillment cost/).fill("2.00");
  await page.getByLabel(/Success probability/).fill("80");
  await page.getByLabel(/Human-review cost/).fill("1.00");
  await page
    .getByLabel("Routing policy", { exact: true })
    .selectOption("most_verified");
  await screenshot(page, `${info.project.name}-configured`);
  await page.getByRole("button", { name: "Underwrite task" }).click();
  await expect(page.locator("#forge-decision")).toBeVisible();
  await expect(page.locator("#forge-decision")).toContainText("No executable RouteCandidateSet exists");
  await screenshot(page, `${info.project.name}-plan`);
  await expect(page.locator("main")).toContainText("EXECUTION DISABLED");
  await screenshot(page, `${info.project.name}-contract`);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download receipt JSON" }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.json$/);
  await page.goto("/forge/example-1/output");
  await expect(
    page.getByRole("heading", { name: "Intelligence brief: Northstar Search" }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-brief`);
  await page.getByText("Evidence ledger", { exact: true }).click();
  await expect(
    page.getByText("None — authored fixture document, not a public source."),
  ).toHaveCount(5);
  const audit = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download audit JSON" }).click();
  await audit;
  const md = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await md;
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("hard budget refuses an otherwise complete user scenario", async ({
  page,
}) => {
  await page.goto("/forge");
  await page.getByLabel("Agent objective").fill("Extract public website data and verify the structured output.");
  await page.getByLabel("Hard fulfillment budget (USD)").fill("0");
  await page.getByLabel(/^Payout \/ reward/).fill("10.00");
  await page.getByLabel(/^Fulfillment cost/).fill("1.00");
  await page.getByLabel(/Success probability/).fill("70");
  await page.getByLabel(/Human-review cost/).fill("0.00");
  await page.getByRole("button", { name: "Underwrite task" }).click();
  await expect(page.locator("#forge-decision")).toContainText("UNROUTABLE");
  await expect(page.locator("#forge-decision")).toContainText("exceeds the hard fulfillment budget");
});
test("reduced motion retains usable route story and seeded brief", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "IS THE WORK WORTH DOING?" })).toBeVisible();
  await expect(page.locator("[data-profit-engine]")).toBeVisible();
  await page.goto("/forge/example-1/output");
  await expect(
    page.getByRole("heading", { name: "Intelligence brief: Northstar Search" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid routes and absent sessions have recoverable states", async ({
  page,
  request,
}) => {
  await page.goto("/forge/missing");
  await expect(
    page.getByRole("heading", { name: "This route isn’t in your session." }),
  ).toBeVisible();
  expect((await request.get("/api/discovery")).status()).toBe(404);
  expect((await request.post("/api/claim")).status()).toBe(404);
  expect((await request.get("/api/run")).status()).toBe(405);
  expect(
    (
      await request.post("/api/plan", {
        data: { question: "bad", budgetUsd: -1 },
      })
    ).status(),
  ).toBe(400);
});
test("request-in-flight and recoverable network failure are honest", async ({
  page,
}, info) => {
  await page.goto("/forge");
  await page.getByRole("textbox",{name:"Agent objective"}).fill("Choose the best service sequence for extracting and validating a public document.");
  await page.getByLabel(/Success probability/).fill("70");
  await page.getByLabel(/Human-review cost/).fill("0.00");
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/forge/underwrite", async (route) => {
    await held;
    await route.abort();
  });
  await page.getByRole("button", { name: "Underwrite task" }).click({ noWaitAfter: true });
  await expect(
    page.getByRole("button", { name: "Compiling underwriting…" }),
  ).toBeDisabled();
  await screenshot(page, `${info.project.name}-loading`);
  release!();
  await expect(
    page.getByRole("alert").filter({ hasText: /fetch|route|network/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Underwrite task", exact: true }),
  ).toBeEnabled();
});
for (const width of [390, 768, 1024, 1440]) {
  test(`responsive geometry at ${width}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, name] of [
      ["/", "landing"],
      ["/forge", "composer"],
      ["/forge/example-1/output", "brief"],
      ["/forge/example-1", "contract"],
      ["/network", "network"],
    ]) {
      await page.goto(path);
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await screenshot(page, `${width}-${name}`);
    }
  });
}
test("empty live homepage remains truthful and unpinned", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("[data-profit-engine]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "IS THE WORK WORTH DOING?" })).toBeVisible();
  await expect(page.locator("main")).toContainText("No qualifying observed work");
  await expect(page.locator("main")).not.toContainText("SIMULATED / ARBITRAGE LAB");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page.screenshot({ path: shots + "/desktop-profit-engine-empty.png" });
});
test("mobile Profit Engine is readable with no pinning", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "IS THE WORK WORTH DOING?" })).toBeVisible();
  await page.getByRole("heading", { name: "Continue with the evidence." }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Continue with the evidence." })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: shots + "/mobile-profit-engine.png", fullPage: true });
});
