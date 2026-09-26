import { expect, test } from "@playwright/test";

test("public-source execution requires a separate action and yields a downloadable receipt", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/v1/forge/synthesize", async (route) => {
    calls += 1;
    const input = route.request().postDataJSON();
    expect(input.authorization).toBe("run_task");
    expect(input.locale).toBe("en");
    expect(input.urls).toEqual(["https://www.example.org/report"]);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      receipt: {
        core: {
          schemaVersion: "source-synthesis/1.0", runId: input.runId, locale: "en", objective: input.objective,
          sourceUrls: input.urls,
          sourceEvidence: [{ sourceId: 1, url: input.urls[0], retrievedAt: "2026-09-23T00:00:00.000Z", contentSha256: "a".repeat(64), bytesRead: 120 }],
          provider: "Groq", modelId: "openai/gpt-oss-20b",
          usage: { inputTokens: 500, outputTokens: 100, calls: 1 },
          cost: { observedProviderChargeUsdMicros: null, calculatedFromUsageUsdMicros: "68", publishedPriceObservedAt: "2026-09-14T00:00:00.000Z", provenance: "calculated_from_actual_usage_at_published_price", maxAuthorizedSpendUsdMicros: "10000" },
          latencyMs: 100, result: { summary: "The report documents a public API.", findings: [{ statement: "A public API is documented.", sourceIds: [1] }], limitations: [] },
          status: "completed", verificationStatus: "citations_structurally_checked_not_independently_verified",
          executedAt: "2026-09-23T00:00:00.000Z", boundary: "user_authorized_source_synthesis_only_no_marketplace_actions_no_payments",
        },
        receiptHash: "b".repeat(64), hashAlgorithm: "SHA-256/canonical-json-v2", receiptFingerprintIsSignature: false,
      },
      persistence: { status: "guest", savedRunId: null },
    }) });
  });
  await page.goto("/en/forge");
  await page.locator("#forge-objective-input").fill("Summarize this public report with citations.");
  await page.locator("#forge-source-urls").fill("https://www.example.org/report");
  expect(calls).toBe(0);
  await expect(page.getByRole("button", { name: /Run task/i })).toBeEnabled();
  await page.getByRole("button", { name: /Run task/i }).click();
  await expect(page.getByText("The report documents a public API.")).toBeVisible();
  expect(calls).toBe(1);
  await expect(page.getByRole("link", { name: "[1]" })).toHaveAttribute("href", "https://www.example.org/report");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download execution receipt/i }).click();
  const artifact = await download;
  expect(artifact.suggestedFilename()).toMatch(/^signalforge-execution-b{12}\.json$/);
});
