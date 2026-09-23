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
  test(`${locale} Forge Lab underwriting, palette and mobile semantics`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let underwritingCalls = 0;
    page.on("request", (r) => {
      if (r.url().endsWith("/api/v1/forge/underwrite")) underwritingCalls++;
    });
    await page.goto(`/${locale}/forge`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "es"
        ? "Evalúa tu propia tarea."
        : "Analysez votre propre mission.",
    );
    const objective =
      locale === "es"
        ? "Crear una ruta de diligencia debida para una empresa"
        : "Créer un itinéraire de diligence raisonnable pour une entreprise";
    await page.locator("#forge-objective-input").fill(objective);
    expect(underwritingCalls).toBe(0);
    await page.getByLabel(locale === "es" ? /^Pago \/ recompensa/ : /^Rémunération/).fill("15.00");
    await page.getByLabel(locale === "es" ? /^Costo de cumplimiento/ : /^Coût de réalisation/).fill("2.00");
    await page.getByLabel(locale === "es" ? /Probabilidad de éxito/ : /Probabilité de réussite/).fill("75");
    await page.getByLabel(locale === "es" ? /Costo de revisión humana/ : /Coût de revue humaine/).fill("1.00");
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-${locale}-hero.png`,
    });
    await page.locator("#forge-objective-input").press("Control+Enter");
    await expect(page.locator("#forge-decision")).toBeVisible();
    expect(underwritingCalls).toBe(1);
    await expect(page.locator("#forge-objective")).toContainText(objective);
    await page.screenshot({
      path: `test-results/screenshots/${info.project.name}-${locale}-underwriting.png`,
    });
    await expect(page.locator("main")).toContainText(locale === "es" ? "LA EVALUACIÓN NO EJECUTA TAREAS" : "L’ANALYSE N’EXÉCUTE PAS DE TÂCHE");
    await expect(page.locator("main")).toContainText(locale === "es" ? "LA SÍNTESIS REQUIERE AUTORIZACIÓN SEPARADA" : "LA SYNTHÈSE EXIGE UNE AUTORISATION DISTINCTE");
    await page.getByRole("button", { name: "English", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/forge$/);
    await expect(page.getByRole("heading", { name: "Underwrite your own task." })).toBeVisible();
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
