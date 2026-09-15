import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${info.project.name === "mobile" ? 181 : 180}.${info.title.length}`,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test("default redirects to English and language selector retains network query", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en$/);
  await page.goto("/es/network?query=Atlas");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Français", exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/network\?query=Atlas/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(
    page.getByRole("button", { name: "Français", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".catalog-row")).toHaveCount(1);
});
for (const locale of ["es", "fr"] as const)
  test(`${locale} command, decomposition, route, palette and mobile semantics`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let frameCalls = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/frame")) frameCalls++;
    });
    await page.goto(`/${locale}/forge`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "es"
        ? "¿Qué debería lograr tu agente?"
        : "Que doit accomplir votre agent ?",
    );
    const objective =
      locale === "es"
        ? "Crear una ruta de diligencia debida para una empresa"
        : "Créer un itinéraire de diligence raisonnable pour une entreprise";
    await page.locator("textarea").fill(objective);
    expect(frameCalls).toBe(0);
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-${locale}-hero.png`,
    });
    await page.locator("textarea").press("Control+Enter");
    await expect(page.getByRole("status")).toHaveText(
      locale === "es"
        ? "Descomposición local de demostración"
        : "Décomposition locale de démonstration",
    );
    await expect(page.locator(".frame-dimension")).toHaveCount(5);
    await expect(page.locator(".question-anchor")).toContainText(objective);
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-${locale}-decomposition.png`,
    });
    await page
      .getByRole("button", {
        name:
          locale === "es"
            ? "Crear ruta de ejecución"
            : "Composer l’itinéraire d’exécution",
      })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/forge/.+/plan$`));
    await expect(page.locator("main")).toContainText("execution_not_enabled");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/forge\/.+\/plan$/);
    await expect(page.locator(".capability-sequence")).toBeVisible();
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
test("machine discovery surfaces are not redirected into a locale", async ({
  request,
}) => {
  for (const locale of ["en", "es", "fr"]) {
    const response = await request.get(`/${locale}`),
      html = await response.text();
    expect(response.status()).toBe(200);
    expect(html).toContain(`lang="${locale}"`);
    expect(html).toContain('hrefLang="es"');
  }
  for (const path of [
    "/.well-known/agent-card.json",
    "/api/v1/openapi",
    "/llms.txt",
    "/robots.txt",
  ]) {
    const r = await request.get(path);
    expect(r.status()).toBe(200);
    expect(new URL(r.url()).pathname).toBe(path);
  }
});
