import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${info.project.name === "mobile" ? 121 : 120}.${info.title.length}`,
  });
});
test("command palette traps focus, closes with Escape and forwards a validated objective", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open command palette" });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Forge a route" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("textbox", { name: "Describe an objective" });
  await expect(input).toBeFocused();
  await dialog.getByRole("button", { name: "Close command palette" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Inspect API / MCP" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close command palette" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Meta+k");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: /Build a verification-first/ })
    .click();
  await expect(input).toHaveValue(
    "Build a verification-first due-diligence route under $0.25",
  );
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-command-palette.png`,
  });
  await dialog.getByRole("button", { name: "Forge this objective" }).click();
  await expect(page).toHaveURL(/\/forge\?objective=/);
  await expect(
    page.getByRole("textbox", { name: "Agent objective" }),
  ).toHaveValue("Build a verification-first due-diligence route under $0.25");
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("palette validates and reduced motion controls remain immediate", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/forge?objective=tiny");
  await expect(
    page.getByRole("textbox", { name: "Agent objective" }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Open command palette" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").fill("tiny");
  await dialog.getByRole("button", { name: "Forge this objective" }).click();
  await expect(dialog.getByRole("alert")).toContainText("12–2,000");
  await dialog.getByRole("button", { name: "Explore Live Network" }).click();
  await expect(page).toHaveURL(/\/network$/);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".catalog-row").first()).toBeVisible();
  await page.getByLabel("Search this bounded sample").fill("Atlas Extract");
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await page.locator(".catalog-row summary").click();
  await expect(page.locator(".catalog-row summary")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const technical = page.getByRole("button", {
    name: "execution_not_enabled",
    exact: true,
  });
  await technical.focus();
  await expect(page.locator(".technical-tip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".technical-tip")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/screenshots/${info.project.name}-network-interaction.png`,
    fullPage: true,
  });
});
test("route composition is keyboard-inspectable and never implies service execution", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/forge/example-1");
  const chart = page.getByRole("region", {
    name: "Route composition inspector",
  });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("No observed options attached");
  const selected = chart.locator('[data-kind="simulated"]').first();
  await selected.focus();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  const detail = chart.getByRole("region", {
    name: "Selected node provenance",
  });
  await expect(detail).toContainText("Simulated selected demo provider");
  await expect(detail).toContainText(
    "NOT CALLED / NOT PAID / EXECUTION DISABLED",
  );
  await expect(chart.locator('[data-motion-owner="gsap"]')).toHaveCount(0);
  await chart.screenshot({
    path: `test-results/screenshots/${info.project.name}-route-composition.png`,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
