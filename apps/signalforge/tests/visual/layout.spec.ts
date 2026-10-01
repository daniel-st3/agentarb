import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixtures = () => JSON.parse(readFileSync("/tmp/valrun-layout-fixtures/states.json", "utf8"));

async function geometry(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  const clipped = await page.locator("#main h1, #main h2, #main dd, #main input, #main textarea").evaluateAll((nodes) => nodes.filter((node) => {
    const el = node as HTMLElement;
    return el.getClientRects().length && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 3 && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement);
  }).map((node) => node.textContent?.slice(0, 80)));
  expect(clipped).toEqual([]);
  const header = await page.locator(".site-nav").boundingBox();
  const main = await page.locator("#main").boundingBox();
  expect(main!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 3);
  const footer = await page.locator("footer").last().boundingBox();
  expect(footer!.y).toBeGreaterThanOrEqual(main!.y + main!.height - 3);
  expect(footer!.y - (main!.y + main!.height)).toBeLessThan(100);
}

async function capture(page: Page, name: string, info: TestInfo) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  for (const panel of await page.locator("[class*='result'], [class*='synthesisResult']").all()) {
    if (await panel.isVisible()) await expect(panel).toHaveCSS("opacity", "1");
  }
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); resolve(); }))));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await geometry(page);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  await page.screenshot({ path: info.outputPath(`${name}-viewport.png`) });
}

async function detailCapture(page: Page, selector: string, path: string) {
  const target = page.locator(selector);
  // Capture document coordinates without scrolling a large element under the
  // sticky header or racing the product's native smooth scrolling.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const box = await target.boundingBox();
  await page.screenshot({ path, fullPage: true, clip: box! });
}

for (const [name, path] of Object.entries({ homepage: "/en", "forge-empty": "/en/forge", market: "/en/opportunities", network: "/en/network", developers: "/en/developers", pricing: "/en/pricing" })) {
  test(name, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await capture(page, name, info);
    if (name === "homepage") {
      const action = page.locator("#main form button").first();
      const box = await action.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.y).toBeLessThan(page.viewportSize()!.height);
      expect(await action.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    }
    expect(errors).toEqual([]);
  });
}

for (const state of ["profitable", "insufficient"] as const) {
  test(`forge-${state}`, async ({ page }, info) => {
    await page.route("**/api/v1/forge/underwrite", (route) => route.fulfill({ json: fixtures()[state] }));
    await page.goto("/en/forge");
    await page.getByLabel("Agent objective").fill("Compare three public reports and summarize their evidence.");
    await page.locator("#forge-probability").fill("80");
    await page.locator("#forge-review").fill("1.00");
    if (state === "profitable") {
      await page.locator("#forge-payout").fill("20.00");
      await page.locator("#forge-fulfillment").fill("2.00");
    }
    await page.getByRole("button", { name: "Underwrite task", exact: true }).click();
    await expect(page.locator("#forge-decision")).toContainText(state === "profitable" ? "$13.00" : "INSUFFICIENT DATA");
    await expect(page.getByRole("button", { name: "Download receipt JSON" })).toBeVisible();
    await capture(page, `forge-${state}`, info);
    await detailCapture(page, "#forge-decision", info.outputPath("decision-detail.png"));
    const receipt = page.getByRole("button", { name: "Download receipt JSON" });
    await receipt.evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
    expect(await receipt.evaluate(el => {
      const r = el.getBoundingClientRect();
      const front = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return front === el || el.contains(front);
    })).toBe(true);
    const form = await page.locator("form").first().boundingBox();
    const decision = await page.locator("#forge-decision").boundingBox();
    if (page.viewportSize()!.width > 900) {
      expect(decision!.x).toBeGreaterThan(form!.x + form!.width);
      expect(Math.abs(decision!.y - form!.y)).toBeLessThan(40);
      expect(form!.width / decision!.width).toBeGreaterThan(.55);
    } else expect(decision!.y).toBeGreaterThan(form!.y + form!.height);
    const pairsAligned = await page.locator("[class*='pair']").evaluateAll((pairs) => pairs.every((pair) => {
      const inputs = [...pair.querySelectorAll("input, select")].map(el => el.getBoundingClientRect()).filter(r => r.width);
      return inputs.length < 2 || Math.abs(inputs[0].x - inputs[1].x) < 3 || Math.abs(inputs[0].y - inputs[1].y) < 3;
    }));
    expect(pairsAligned).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("#forge-decision")).toContainText(state === "profitable" ? "$13.00" : "INSUFFICIENT DATA");
  });
}

for (const complete of [false, true]) {
  test(`research-${complete ? "complete" : "input"}`, async ({ page }, info) => {
    await page.route("**/api/v1/forge/synthesize", (route) => route.fulfill({ json: fixtures().synthesis }));
    await page.route("**/api/v1/forge/underwrite", (route) => route.fulfill({ json: fixtures().profitable }));
    await page.goto("/en/forge");
    await page.getByLabel("Agent objective").fill("Compare three public reports and summarize their evidence.");
    await page.getByLabel("Public source URLs", { exact: true }).fill("https://example.com/\nhttps://www.iana.org/help/example-domains");
    if (complete) {
      await page.locator("#forge-payout").fill("20.00");
      await page.locator("#forge-fulfillment").fill("2.00");
      await page.locator("#forge-probability").fill("80");
      await page.locator("#forge-review").fill("1.00");
      await page.getByRole("button", { name: "Underwrite task", exact: true }).click();
      await expect(page.locator("#forge-decision")).toContainText("$13.00");
      await page.getByRole("button", { name: "Run public-source research ↗" }).click();
      await expect(page.getByRole("heading", { name: "Source-bound findings" })).toBeVisible();
    }
    await capture(page, complete ? "research-complete" : "research-input", info);
    await detailCapture(page, "#forge-source-synthesis", info.outputPath("research-detail.png"));
  });
}

for (const state of ["history", "snapshot"] as const) {
  test(state, async ({ page }, info) => {
    // Actual React server markup, with dependency-boundary mocks in prepare.test.ts.
    // This tests layout only, NOT a logged-in session or authorization bypass.
    await page.goto("/en/account/history");
    await expect(page.locator("#main h1")).toBeVisible();
    const data = fixtures();
    await page.locator("#main").evaluate((el, html) => { el.innerHTML = html; }, data[state]);
    await page.addStyleTag({ content: data.css });
    await capture(page, state, info);
    if (state === "history") await expect(page.locator("[data-ledger-kind]")).toHaveCount(3);
    if (state === "history" && page.viewportSize()!.width >= 1280) {
      for (const row of await page.locator("[data-ledger-kind]").all()) expect((await row.boundingBox())!.height).toBeLessThan(260);
    }
  });
}

test("login", async ({ page }, info) => {
  await page.goto("/en");
  if (await page.locator(".arb-mobile-nav summary").isVisible()) await page.locator(".arb-mobile-nav summary").click();
  await page.getByRole("button", { name: "Sign in", exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({ path: info.outputPath("login.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("reduced motion and translated operating controls", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const locale of ["es", "fr"]) {
    await page.goto(`/${locale}/forge`);
    await expect(page.locator("#forge-budget")).toHaveValue("10,00");
    await capture(page, `forge-${locale}-reduced`, info);
    const buttons = page.locator("form button[type='submit']");
    for (const button of await buttons.all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
