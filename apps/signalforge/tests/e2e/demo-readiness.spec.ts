import { expect, test } from "@playwright/test";

test("hero examples are editable objectives, not fabricated results", async ({ page }) => {
  await page.goto("/en");
  await page.getByRole("button", { name: "Compare reports" }).click();
  const objective = page.getByLabel("YOUR TASK / START HERE");
  await expect(objective).toBeFocused();
  await expect(objective).toHaveValue("Summarize three public reports and compare their evidence.");
  await expect(page.getByText("MCP · signalforge_underwrite_task")).toBeVisible();
  await objective.press("Enter");
  await expect(page).toHaveURL(/\/en\/forge\?objective=/);
  await expect(page.getByLabel("Agent objective")).toHaveValue("Summarize three public reports and compare their evidence.");
  await expect(page.locator("#forge-decision")).toHaveCount(0);
});

test("home remains readable across resize, locale and reduced-motion changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const locale of ["en", "es", "fr"]) {
    await page.goto(`/${locale}`);
    for (const width of [390, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator("#home-task-entry")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const header = await page.locator('.site-nav').boundingBox();
      const nav = await page.locator('.site-nav .nav-inner > nav:not(.locale-selector)').boundingBox();
      expect(header && nav && nav.y >= header.y && nav.y + nav.height <= header.y + header.height + 1).toBeTruthy();
      const input = await page.locator("#home-task-entry").boundingBox();
      const button = await page.locator('form button[type="submit"]').boundingBox();
      expect(input && button && (button.x >= input.x + input.width - 1 || button.y >= input.y + input.height - 1)).toBeTruthy();
    }
  }
});

test("social metadata is public brand content, private history remains noindex", async ({ page, request }) => {
  await page.goto("/en");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /Valrun/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('.brand img')).toHaveAttribute("src", "/brand/valrun-logo.png");
  expect(await page.locator('.brand img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 952)).toBe(true);
  await expect(page.locator('link[rel~="icon"][href*="favicon.ico"]')).toHaveCount(1);
  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  const image = await request.get("/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toContain("image/png");
  await page.goto("/en/account/history");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
