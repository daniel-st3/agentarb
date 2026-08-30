import { test, expect } from "@playwright/test";

test("V3 evidence arrives once, remains truthful, and has a static equivalent", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".signal-field")).toHaveCount(2);
  await expect(page.locator(".signal-trace path")).toHaveCount(1);
  await expect(page.locator(".opening")).toContainText(
    "DEMO / INTERFACE SIGNALS",
  );
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
  await page
    .getByRole("heading", { name: "Make the route visible." })
    .scrollIntoViewIfNeeded();
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
}) => {
  await page.goto("/forge");
  const selected = page.getByRole("button", {
    name: "Most verified",
    exact: true,
  });
  await selected.focus();
  await page.keyboard.press("Enter");
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(selected).toBeFocused();
  const indicator = page.locator(".policy-options .precision-indicator");
  await expect(indicator).toBeVisible();
  await expect
    .poll(async () => {
      const a = await selected.boundingBox();
      const b = await indicator.boundingBox();
      return Math.abs(a!.x - b!.x) + Math.abs(a!.width - b!.width);
    })
    .toBeLessThan(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(indicator).not.toBeVisible();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Archive" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Archive", exact: true }),
  ).toBeVisible();
  await page.locator(".history-row").first().click();
  await expect(page.locator(".report-masthead")).toContainText(
    "RESEARCH BRIEF",
  );
  await expect(page.locator(".receipt-total")).toContainText("$0.00");
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
  await page.goto("http://127.0.0.1:3002/");
  await expect(page.locator(".living-final")).toHaveText(
    "CORROBORATED IN SIMULATION",
  );
  await expect(page.locator(".living-final")).toBeVisible();
  for (const field of await page.locator(".signal-field").all())
    await expect(field).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.getByRole("link", { name: "Forge a brief", exact: true }).first(),
  ).toBeVisible();
  await context.close();
});
