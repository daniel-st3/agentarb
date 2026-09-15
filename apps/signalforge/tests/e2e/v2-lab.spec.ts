import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${info.project.name === "mobile" ? 211 : 210}.${info.title.length}`,
  });
});

test("visual lab is isolated, truthful and keyboard reachable", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const opportunities = page.waitForResponse((response) =>
    response.url().includes("/api/v1/opportunities?mode=observed") && response.status() === 200,
  );
  const catalog = page.waitForResponse((response) =>
    response.url().includes("/api/v1/catalog?listingType=service_offer") && response.status() === 200,
  );
  await page.goto("/en/lab/v2");
  await Promise.all([opportunities, catalog]);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".site-nav").locator('a[href*="/lab/v2"]')).toHaveCount(0);
  await expect(page.getByText("V2 VISUAL LAB — NOT PRODUCTION UI")).toBeVisible();
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);
  await expect(page.locator('[data-lab-mode="real"]')).not.toContainText("LAB STATE SIMULATION");

  const unknown = page.getByLabel("UNKNOWN", { exact: true });
  await unknown.check();
  await expect(page.locator('[data-lab-mode="unknown"]')).toContainText("LAB STATE SIMULATION");
  await expect(page.getByRole("status").last()).toContainText("INSUFFICIENT DATA");
  await expect(page.locator("main")).not.toContainText("$0");

  const tabs = page.getByRole("tab");
  await tabs.nth(1).focus();
  await page.keyboard.press("Space");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/economic completeness/i).first()).toBeVisible();
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-v2-lab-b.png`,
    fullPage: true,
  });

  await tabs.nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No selected route:")).toBeVisible();
  await expect(page.locator("main")).toContainText("EXECUTION NOT ENABLED");
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-v2-lab-c.png`,
    fullPage: true,
  });

  await tabs.nth(0).click();
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-v2-lab-a.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test("degraded and empty states are explicit and locale-safe", async ({ page }) => {
  await page.goto("/es/lab/v2");
  await page.getByLabel("DEGRADADO", { exact: true }).check();
  await expect(page.getByText("SIMULACIÓN DE ESTADO DEL LABORATORIO").first()).toBeVisible();
  await page.getByLabel("VACÍO", { exact: true }).check();
  await expect(page.getByText("No hay una oportunidad observada en esta instantánea acotada.").first()).toBeVisible();
  await page.goto("/fr/lab/v2");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trois instruments pour une seule vérité économique.");
});
