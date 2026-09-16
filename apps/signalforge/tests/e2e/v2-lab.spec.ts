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
  await expect(page).toHaveTitle(/V2 visual laboratory · SignalForge/);
  await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", /icon\.svg/);
  const icon = await page.request.get("/icon.svg");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Quatre instruments pour une seule vérité économique.");
});

test("the Forge is a reversible, lab-only causal instrument", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const at = "2026-09-15T12:00:00.000Z";
  const quality = {
    freshnessScore: 1,
    priceConfidence: "exact",
    actionabilityConfidence: "observed",
    sourceTrust: "official",
    warnings: [],
  };
  await page.route("**/api/v1/opportunities?*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      version: "2.0",
      mode: "observed",
      observedSupplyCount: 1,
      matchedCount: 1,
      truncated: false,
      executionStatus: "execution_not_enabled",
      records: [{
        id: "agentbounties:forge-e2e",
        sourceId: "agentbounties",
        sourceName: "Agent Bounties",
        accessMode: "official_feed",
        freshness: "live",
        observedAt: at,
        sourceUrl: "https://agentbounties.app/opportunities/forge-e2e",
        executionStatus: "execution_not_enabled",
        dataQuality: quality,
        listingType: "task_opportunity",
        title: "Extract and synthesize a bounded public dataset",
        description: "Return structured data and a concise synthesis.",
        requiredCapabilities: ["data_extract", "synthesis"],
        payout: { currency: "USDC", parseConfidence: "exact", rawPayoutText: "4 USDC" },
        deadline: "2026-12-01T00:00:00.000Z",
        claimModel: "open_claim",
        settlement: "escrow",
        actionability: "open_claim_observed",
        constraints: [],
        demandState: {
          sourceType: "canonical_base",
          workState: "claimable",
          paymentState: "escrowed",
          paymentCommitted: true,
          reward: { amount: "4000000", currency: "USDC", unit: "base_units", decimals: 6 },
          refundableBond: { amount: "100000", currency: "USDC", unit: "base_units", decimals: 6 },
          requiredExternalSpend: null,
          verificationReady: true,
          verifier: "source verifier",
          evidenceRequirements: "Structured evidence required",
          evidenceBoundary: "Source projection only",
          competitionMode: "exclusive_claim",
          deadlineKind: "submission_deadline",
          scoringEndsAt: null,
          participationPhase: null,
          standingMetaBounty: false,
          capabilityStatus: "source_mapped",
          eligibility: "source_ready",
          eligibilityReasons: [],
          projectionGeneratedAt: at,
          provenance: "observed_source",
        },
      }],
    }),
  }));
  await page.route("**/api/v1/catalog?*", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      version: "1.0",
      cacheMode: "non_durable_demo",
      warnings: [],
      sources: [],
      matchedCount: 1,
      truncated: false,
      executionStatus: "execution_not_enabled",
      records: [{
        id: "modelsdev:forge-e2e",
        sourceId: "modelsdev",
        sourceName: "models.dev",
        accessMode: "official_catalog",
        freshness: "cached_live",
        observedAt: at,
        sourceUrl: "https://models.dev/",
        executionStatus: "execution_not_enabled",
        dataQuality: { ...quality, priceConfidence: "estimated" },
        listingType: "service_offer",
        name: "Observed model listing",
        description: "Public model catalog record.",
        capabilities: ["data_extract", "synthesis"],
        providerType: "api",
        pricing: { model: "per_token", parseConfidence: "estimated", rawPriceText: "Published token units" },
        access: { actionability: "catalog_only", requiresApiKey: true, requiresWallet: false, requiresReputation: false, requirementsKnown: true, executionEnabled: false },
        tags: [],
      }],
    }),
  }));
  await page.route("**/api/v1/opportunities/evaluate", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: '{"error":"Unavailable"}',
  }));

  const opportunities = page.waitForResponse((response) =>
    response.url().includes("/api/v1/opportunities?mode=observed") && response.status() === 200,
  );
  const catalog = page.waitForResponse((response) =>
    response.url().includes("/api/v1/catalog?listingType=service_offer") && response.status() === 200,
  );
  await page.goto("/en/lab/v2");
  await Promise.all([opportunities, catalog]);
  await expect(page.getByText("Extract and synthesize a bounded public dataset").first()).toBeVisible();
  const forgeTab = page.getByRole("tab", { name: "D", exact: true });
  await forgeTab.focus();
  await page.keyboard.press("Enter");
  await expect(forgeTab).toHaveAttribute("aria-selected", "true");
  const forge = page.locator('[data-forge-stage]');
  await expect(forge).toBeVisible();
  await expect(page.locator('[data-observation-id="agentbounties:forge-e2e"]')).toHaveCount(1);
  await expect(page.locator("[data-observation-id]")).toHaveCount(1);
  await expect(page.locator('[data-route-candidate-set="absent"]').first()).toContainText("RouteCandidateSet");
  await expect(forge).toHaveAttribute("data-decision", "insufficient_data");
  await expect(forge).not.toContainText("100000");
  await expect(forge).toContainText("0.1 USDC");
  await expect(forge).toContainText("CAPITAL ≠ EXPENSE");

  if (info.project.name === "desktop") {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 1728, height: 1117 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForFunction(() => document.fonts.status === "loaded");
      const collisions = await page.evaluate(() => {
        const heading = document.querySelector<HTMLElement>("[data-forge-heading]")?.getBoundingClientRect();
        if (!heading) return ["missing-heading"];
        return [...document.querySelectorAll<HTMLElement>("[data-forge-market-mark]")]
          .filter((mark) => {
            const rect = mark.getBoundingClientRect();
            return rect.left < heading.right && rect.right > heading.left && rect.top < heading.bottom && rect.bottom > heading.top;
          })
          .map((mark) => mark.dataset.observationId ?? "unknown");
      });
      expect(collisions).toEqual([]);
      const splitTextSafety = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-forge-heading] > *")].map((line) => ({
        overflow: getComputedStyle(line).overflow,
        text: line.textContent,
      })));
      expect(splitTextSafety.length).toBeGreaterThan(0);
      expect(splitTextSafety.every((line) => line.overflow === "visible" && Boolean(line.text?.trim()))).toBe(true);
    }
    const routeChapter = page.getByRole("button", { name: /03\s+ROUTE/i });
    await routeChapter.click();
    await expect(page.locator('[data-forge-stage="route"]')).toBeVisible();
    expect(await page.locator("[data-forge-layer]").evaluateAll((layers) => layers.filter((layer) => {
      const style = getComputedStyle(layer);
      return style.visibility === "visible" && Number(style.opacity) > 0.99;
    }).length)).toBe(1);
    const routeVerdict = page.locator("[data-forge-route-verdict]").first();
    await expect(routeVerdict).toHaveText("INSUFFICIENT DATA");
    expect(await routeVerdict.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement?.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth + 1 && Boolean(parent) && rect.right <= parent!.right + 1;
    })).toBe(true);
    const economicsChapter = page.getByRole("button", { name: /04\s+ECONOMICS/i });
    await economicsChapter.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-forge-stage="economics"]')).toBeVisible();
    expect(await page.locator("[data-forge-layer]").evaluateAll((layers) => layers.filter((layer) => {
      const style = getComputedStyle(layer);
      return style.visibility === "visible" && Number(style.opacity) > 0.99;
    }).length)).toBe(1);
  } else {
    await page.setViewportSize({ width: 430, height: 932 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  await page.getByRole("button", { name: /apply explicit lab scenario/i }).click();
  await expect(forge).toHaveAttribute("data-scenario-active", "true");
  const challengeInstrument = page.locator("[data-challenge-instrument]");
  await expect(challengeInstrument).toBeVisible();
  await expect(challengeInstrument.getByText("RESULT", { exact: true })).toBeVisible();
  await expect(challengeInstrument.getByRole("status").filter({ hasText: "INSUFFICIENT DATA" })).toBeVisible();
  const probability = page.locator("label").filter({ hasText: "Success probability" }).locator('input[type="range"]');
  await expect(probability).toHaveValue("70");
  await probability.fill("42");
  await expect(forge).toContainText("42% · $0.25 review · USER ASSUMPTION");

  await page.getByRole("button", { name: "SKIP STORY" }).click();
  await expect(forge).toHaveAttribute("data-story-skipped", "true");
  await page.getByRole("button", { name: "REPLAY" }).click();
  await expect(forge).toHaveAttribute("data-story-skipped", "false");
  await page.getByRole("tab", { name: "A", exact: true }).click();
  await expect(page.locator(".pin-spacer")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("the Forge reduced-motion mode exposes the resolved causal structure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/lab/v2");
  await page.getByLabel("UNKNOWN", { exact: true }).check();
  await page.getByRole("tab", { name: "D", exact: true }).click();
  const resolvedFlow = page.getByLabel("Complete underwriting sequence");
  await expect(resolvedFlow).toBeVisible();
  await expect(page.getByRole("button", { name: "REPLAY" })).toBeDisabled();
  await expect(resolvedFlow.getByText("CAPITAL ≠ EXPENSE")).toBeVisible();
  await expect(page.locator('[data-forge-stage]')).toContainText("INSUFFICIENT DATA");
  await expect(page.locator(".pin-spacer")).toHaveCount(0);

  for (const locale of ["es", "fr"]) {
    await page.goto(`/${locale}/lab/v2`);
    await page.getByLabel(locale === "es" ? "DESCONOCIDO" : "INCONNU", { exact: true }).check();
    await page.getByRole("tab", { name: "D", exact: true }).click();
    const verdict = page.locator("[data-forge-mobile-verdict]");
    await expect(verdict).toBeVisible();
    expect(await verdict.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
