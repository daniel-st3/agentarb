import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `192.0.${info.project.name === "mobile" ? 5 : 4}.${(info.title.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 240) + 1}`,
  });
});
import { mkdir } from "node:fs/promises";
const shots = "test-results/screenshots";

test("short laptop windows keep the full route readable", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto("/");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await page
    .getByRole("heading", { name: "Show what holds up." })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Show what holds up." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("landing narrative remains available without JavaScript", async ({
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3002/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "What should your agent accomplish?",
  );
  await expect(
    page.getByRole("heading", { name: "Show what holds up." }),
  ).toBeVisible();
  await expect(page.locator(".paper-report")).toContainText(
    "DEMO OUTPUT — SIMULATED EVIDENCE",
  );
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
test("question → plan → run → evidence → receipt, exports and session reset", async ({
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
      name: "What should your agent accomplish?",
    }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-hero`);
  await page.screenshot({
    path: `${shots}/${info.project.name}-hero-viewport.png`,
  });
  await page.locator(".paper-report").screenshot({
    path: `${shots}/${info.project.name}-paper-report.png`,
    style: ".site-nav, .skip-link { visibility: hidden !important; }",
  });
  await page.goto("/forge");
  await expect(
    page.getByRole("heading", { name: "What should your agent accomplish?" }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-composer`);
  await page
    .getByRole("button", { name: /Build a verified competitive/ })
    .click();
  await page
    .getByLabel("Routing policy", { exact: true })
    .selectOption("most_verified");
  await screenshot(page, `${info.project.name}-configured`);
  await page
    .getByRole("button", { name: "Compile route", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Local demo decomposition");
  await page
    .getByRole("button", { name: "Build execution route", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Capability route" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Proofline Verify", exact: true }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-plan`);
  await page.getByText(/Alternatives not selected/).click();
  await expect(page.getByText(/REJECTED \/ unavailable/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate route", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Agent-ready execution route",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".route-boundary")).toContainText(
    "execution_not_enabled",
  );
  await screenshot(page, `${info.project.name}-contract`);
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download route contract JSON" })
    .click();
  expect((await downloading).suggestedFilename()).toMatch(/\.json$/);
  await page.getByRole("link", { name: "Archive", exact: true }).click();
  await expect(page.locator(".route-archive-row")).toHaveCount(4);
  await screenshot(page, `${info.project.name}-history`);
  await page.reload();
  await expect(page.locator(".route-archive-row")).toHaveCount(3);
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
test("zero-budget route refuses missing critical capabilities", async ({
  page,
}) => {
  await page.goto("/forge");
  await page.getByRole("button", { name: /Find the cheapest/ }).click();
  await page.getByLabel("Routing policy",{exact:true}).selectOption("cheapest");
  await page.getByLabel("Hard route budget",{exact:true}).selectOption("0");
  await page
    .getByRole("button", { name: "Compile route", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Local demo decomposition");
  await page
    .getByRole("button", { name: "Build execution route", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proofline Verify", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Partial route / constraints not met" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect partial contract" }).click();
  await expect(
    page.getByRole("heading", { name: "Unmet requirements" }),
  ).toBeVisible();
});
test("reduced motion retains usable route story and seeded brief", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("heading", { name: "Show what holds up." })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Show what holds up." }),
  ).toBeVisible();
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
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/routes/compile", async (route) => {
    await held;
    await route.abort();
  });
  await page
    .getByRole("button", { name: "Compile route", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Local demo decomposition");
  await page
    .getByRole("button", { name: "Build execution route", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Comparing demo services…" }),
  ).toBeDisabled();
  await screenshot(page, `${info.project.name}-loading`);
  release!();
  await expect(
    page.getByRole("alert").filter({ hasText: /fetch|route|network/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Build execution route", exact: true }),
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
test("editorial hero and a genuinely pinned, scrubbed route", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const story = page.locator(".route-narrative");
  await expect(story).toHaveAttribute("data-enhanced", "true");
  await expect(
    page.locator(".hero-artifact, .use-case-grid, .feature-card"),
  ).toHaveCount(0);
  expect(
    await page
      .locator(".research-command")
      .evaluate((el) => getComputedStyle(el).borderRadius),
  ).toBe("0px");
  const start = await story.evaluate(
    (el) => el.getBoundingClientRect().top + scrollY - 72,
  );
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    start + 200,
  );
  await expect(story).toHaveAttribute("data-chapter", "1");
  const first = await page.locator(".route-scene").boundingBox();
  const initial = await page
    .locator(".path-research")
    .evaluate((el) => getComputedStyle(el).strokeDashoffset);
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    start + 1440,
  );
  await expect(story).toHaveAttribute("data-chapter", "3");
  await expect(
    page.getByRole("heading", { name: "Select only what helps." }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      parseFloat(
        await page
          .locator(".path-research")
          .evaluate((el) => getComputedStyle(el).strokeDashoffset),
      ),
    )
    .toBeLessThan(parseFloat(initial));
  const middle = await page.locator(".route-scene").boundingBox();
  expect(Math.abs(middle!.y - first!.y)).toBeLessThan(3);
  await page.screenshot({ path: shots + "/desktop-route-midscroll.png" });
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    start + 2320,
  );
  await expect(story).toHaveAttribute("data-chapter", "4");
  await expect(
    page.getByRole("heading", { name: "Show what holds up." }),
  ).toBeVisible();
  await expect(page.locator(".modeled-counter")).toHaveText("$0.21");
  await expect(page.locator(".verification-final")).toBeVisible();
  await expect(page.locator(".verification-start")).not.toBeVisible();
  await page.screenshot({ path: shots + "/desktop-route-verified.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(story).not.toHaveAttribute("data-enhanced", "true");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".verification-start")).toBeVisible();
  await expect(page.locator(".verification-final")).toBeVisible();
  for (const title of [
    "Start with the boundary.",
    "Not every source belongs.",
    "Select only what helps.",
    "Show what holds up.",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});
test("mobile route is a readable vertical story, with no pinning", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  await expect(page.locator(".route-narrative")).not.toHaveAttribute(
    "data-enhanced",
    "true",
  );
  for (const title of [
    "Start with the boundary.",
    "Not every source belongs.",
    "Select only what helps.",
    "Show what holds up.",
  ]) {
    await page.getByRole("heading", { name: title }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: shots + "/mobile-route-story.png" });
});
