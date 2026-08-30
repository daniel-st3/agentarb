import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const shots = "test-results/screenshots";
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
      name: "Turn one question into a verified brief.",
    }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-hero`);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Forge a brief" })
    .click();
  await expect(
    page.getByRole("heading", { name: "What do you need to know?" }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-composer`);
  await page.getByRole("button", { name: /Assess Northstar/ }).click();
  await page
    .getByRole("button", { name: "Most verified", exact: true })
    .click();
  await screenshot(page, `${info.project.name}-configured`);
  await page.getByRole("button", { name: "Forge brief", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Here’s the research route." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Independent review", exact: true }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-plan`);
  await page.getByText("Alternatives not selected").click();
  await expect(
    page.getByText("Catalog metadata only; execution is unavailable."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run research", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Intelligence brief: Northstar Search" }),
  ).toBeVisible();
  await expect(
    page.getByText("2 claims corroborated in simulation", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Simulated demo evidence.", { exact: true }),
  ).toBeVisible();
  await screenshot(page, `${info.project.name}-brief`);
  await page.getByText("Evidence ledger", { exact: true }).click();
  await expect(
    page.getByText("None — authored fixture document, not a public source."),
  ).toHaveCount(5);
  await screenshot(page, `${info.project.name}-evidence`);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download audit JSON" }).click();
  expect((await downloading).suggestedFilename()).toMatch(
    /^signalforge-.+\.json$/,
  );
  const mdDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  expect((await mdDownload).suggestedFilename()).toMatch(/\.md$/);
  await page.getByRole("link", { name: "History", exact: true }).click();
  await expect(page.getByText(/THIS SESSION/)).toHaveCount(1);
  await screenshot(page, `${info.project.name}-history`);
  await page.reload();
  await expect(page.getByText(/THIS SESSION/)).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("cheapest route is free and single-source", async ({ page }) => {
  await page.goto("/forge");
  await page.getByRole("button", { name: /Evaluate AtlasGrid/ }).click();
  await page.getByRole("button", { name: "Cheapest", exact: true }).click();
  await page.getByRole("button", { name: "$0.00", exact: true }).click();
  await page.getByRole("button", { name: "Forge brief", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Independent review", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Run research" }).click();
  await expect(page.getByText("Single-source", { exact: true })).toHaveCount(3);
});
test("reduced motion retains usable route story and seeded brief", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("heading", { name: "Keep the receipt" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("heading", { name: "Keep the receipt" }),
  ).toBeVisible();
  await page.goto("/forge/example-1");
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
    page.getByRole("heading", { name: "This brief isn’t in your session." }),
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
  await page.getByRole("button", { name: /Explain Lumen/ }).click();
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    await held;
    await route.abort();
  });
  await page.getByRole("button", { name: "Forge brief", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Comparing demo services…" }),
  ).toBeDisabled();
  await screenshot(page, `${info.project.name}-loading`);
  release!();
  await expect(
    page.getByRole("alert").filter({ hasText: /fetch|route|network/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Forge brief", exact: true }),
  ).toBeEnabled();
});
for (const width of [390, 768, 1024, 1440]) {
  test(`responsive geometry at ${width}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, name] of [
      ["/", "landing"],
      ["/forge", "composer"],
      ["/forge/example-1", "brief"],
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
