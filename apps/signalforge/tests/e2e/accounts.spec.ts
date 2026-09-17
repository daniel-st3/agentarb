import { expect, test } from "@playwright/test";

test("guest underwriting remains complete and account-optional", async ({ page }) => {
  await page.goto("/en/forge");
  await expect(page).toHaveURL(/\/en\/forge/);
  await page.getByLabel("Agent objective").fill("Create a bounded public market summary with independent verification.");
  await page.getByLabel("Success probability").fill("70");
  await page.getByLabel("Human-review cost (USD) · USER ASSUMPTION").fill("1.00");
  await page.getByRole("button", { name: "Underwrite task" }).click();
  await expect(page.locator("#forge-decision")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download receipt JSON" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save this analysis" })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/forge/);
});

test("optional sign-in experience is accessible and dismissible", async ({ page, isMobile }) => {
  await page.goto("/en/forge");
  if (isMobile) await page.locator(".arb-mobile-nav summary").click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "Sign in", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Keep your SignalForge work." });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("fully usable without an account");
  await expect(dialog.getByRole("button", { name: "Continue without an account" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Agent objective")).toBeVisible();
});

test("account history does not create an auth wall for the public product", async ({ page }) => {
  await page.goto("/en/account/history");
  await expect(page.getByRole("heading", { name: "My analyses" })).toBeVisible();
  await expect(page.locator("#main").getByRole("button", { name: "Sign in" })).toBeVisible();
  await page.goto("/en/network");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
