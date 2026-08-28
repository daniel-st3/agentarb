import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { CONTROLLED_OPPORTUNITIES } from "../../src/lib/discovery";
import { evaluateOpportunity } from "../../src/lib/policy";
import type { PolicyEnvelope } from "../../src/lib/contracts";

const shots = resolve("../docs/screenshots/web");
async function screenshot(page: Page, name: string) {
  await mkdir(shots, { recursive: true });
  await page.waitForTimeout(
    name.includes("loading") ? 100 : name.includes("hero") ? 1800 : 900,
  );
  await page.screenshot({ path: resolve(shots, name + ".png") });
}
test.beforeEach(async ({ page }) => {
  // Hermetic E2E: only the local Next app is contacted; source failure is explicit.
  await page.route("**/api/evaluate", async (route) => {
    const input = route.request().postDataJSON() as PolicyEnvelope;
    await new Promise((done) => setTimeout(done, 2000));
    await route.fulfill({
      json: {
        evaluatedAt: "2026-08-28T00:00:00Z",
        statuses: ["opentask", "execution_market"].map((marketplace) => ({
          marketplace,
          status: "unavailable",
          count: 0,
          observedAt: "2026-08-28T00:00:00Z",
        })),
        results: CONTROLLED_OPPORTUNITIES.map((item) =>
          evaluateOpportunity(item, input),
        ),
        boundary: {
          sessionOnly: true,
          persistence: "none",
          marketplaceActions: "disabled",
        },
      },
    });
  });
});

test("policy configuration, results, preview, focus and safety", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Decide what an agent may do—before it acts.",
    }),
  ).toBeVisible();
  await screenshot(page, info.project.name + "-hero");
  await page
    .getByRole("link", { name: "Open policy sandbox", exact: true })
    .click();
  await expect(
    page.getByText("SESSION-ONLY SANDBOX", { exact: false }).first(),
  ).toBeVisible();
  await screenshot(page, info.project.name + "-sandbox-default");
  await page
    .getByRole("button", { name: "Code Planning Worker", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "Minimum payout", exact: true })
    .fill("5");
  await screenshot(page, info.project.name + "-configured-policy");
  const response = page.waitForResponse((item) =>
    item.url().includes("/api/evaluate"),
  );
  await page
    .getByRole("button", { name: "Evaluate public opportunities", exact: true })
    .click();
  await expect(page.getByTestId("loading-state")).toContainText(
    "Fetching public listings",
  );
  await page.getByTestId("loading-state").scrollIntoViewIfNeeded();
  await screenshot(page, info.project.name + "-loading");
  await response;
  await expect(page.getByRole("tab", { name: /Allowed/ })).toBeVisible();
  await page.getByRole("tab", { name: /Allowed/ }).click();
  const preview = page
    .getByRole("button", { name: /Open governed preview/ })
    .first();
  await preview.scrollIntoViewIfNeeded();
  await screenshot(page, info.project.name + "-results");
  await preview.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("package_preview_only = true");
  await expect(dialog).toContainText("marketplace_action_authorized = false");
  await expect(dialog).toContainText("Code Planning Worker");
  await expect(dialog).not.toContainText("submission_ready");
  await screenshot(page, info.project.name + "-package-preview");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close package preview" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(preview).toBeFocused();
  await page.locator("#safety").scrollIntoViewIfNeeded();
  await expect(page.locator(".safety-header")).toHaveCSS("opacity", "1");
  for (const item of await page.locator(".safety-item").all()) {
    await expect(item).toHaveCSS("opacity", "1");
  }
  await screenshot(page, info.project.name + "-safety");
  expect(errors).toEqual([]);
});

test("mobile menu supports Escape and navigation", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).not.toBeVisible();
});

test("fresh browser session resets policy and has no persistent storage", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Conservative Agent", exact: true })
    .click();
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "Research Analyst", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    other.getByRole("spinbutton", { name: "Minimum payout", exact: true }),
  ).toHaveValue("1");
  await other.close();
});

test("reduced motion keeps hero and modal immediately usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("h1")).toHaveCSS("opacity", "1");
  await expect(page.locator("h1")).toHaveCSS("transform", "none");
  await page
    .getByRole("button", { name: "Evaluate public opportunities", exact: true })
    .click();
  await expect(page.getByTestId("loading-state")).toBeVisible();
  await expect(page.locator(".loading-rule span")).toHaveCSS(
    "animation-iteration-count",
    "1",
  );
  await page
    .getByRole("button", { name: /Open governed preview/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toHaveCSS("transform", "none");
});

test("public route inventory rejects marketplace and persistence actions", async ({
  request,
}) => {
  for (const path of [
    "claim",
    "submit",
    "settle",
    "wallet",
    "approve",
    "worker",
    "artifact",
  ]) {
    expect((await request.post("/api/" + path, { data: {} })).status()).toBe(
      404,
    );
  }
  expect((await request.post("/api/discovery", { data: {} })).status()).toBe(
    405,
  );
  expect((await request.delete("/api/evaluate")).status()).toBe(405);
});

for (const width of [1440, 1024, 768, 390]) {
  test("layout at " + width + "px has no overflow", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await screenshot(page, "breakpoint-" + width);
    await page.locator("#sandbox").scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await screenshot(page, "breakpoint-" + width + "-sandbox");
  });
}
