import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `192.0.${info.project.name === "mobile" ? 3 : 2}.${(info.testId.split("").reduce((n, c) => n + c.charCodeAt(0), 0) % 240) + 1}`,
  });
});
test("landing command → local frame → deterministic route, with edit and metadata", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "What should your agent accomplish?",
  );
  await page
    .getByRole("button", { name: /Build a verified competitive/ })
    .click();
  await page
    .getByRole("button", { name: "Compile route", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Local demo decomposition");
  await expect(page.locator(".frame-dimension")).toHaveCount(5);
  await expect(page.locator(".question-anchor")).toContainText("AI search");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".research-command").screenshot({
    path: `test-results/screenshots/${info.project.name}-framing.png`,
    style: ".site-nav, .skip-link { visibility: hidden !important; }",
  });
  await page.getByRole("button", { name: "Edit objective" }).click();
  await expect(
    page.getByRole("textbox", { name: "Agent objective" }),
  ).toHaveValue(/AI search/);
  await page
    .getByRole("button", { name: "Compile route", exact: true })
    .click();
  await page.getByRole("button", { name: "Build execution route" }).click();
  await expect(
    page.getByRole("heading", { name: "Capability route", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".capability-sequence")).toContainText(
    "claim verification",
  );
});
test("interrupted framing keeps the question and offers retry", async ({
  page,
}) => {
  await page.route("**/api/frame", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: '{"type":"status","message":"Parsing objective…"}\n',
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Agent objective" })
    .fill("Compare the research needs of two markets");
  await page
    .getByRole("button", { name: "Compile route", exact: true })
    .click();
  await expect(page.locator(".error-message")).toContainText(
    "Decomposition was interrupted",
  );
  await expect(
    page.getByRole("textbox", { name: "Agent objective" }),
  ).toHaveValue("Compare the research needs of two markets");
});
