import { it, expect } from "vitest";
import { translations } from "../messages/translations";
import { messageKey } from "../src/i18n/core";
import { copyForLocale } from "../src/i18n/messages";
import { safeLocale, machinePath } from "../src/i18n/routing";
import { localizeObjectiveFrame } from "../src/i18n/objective";
import {
  ObjectiveInputSchema,
  decomposeObjective,
  ObjectiveFrameSchema,
} from "../src/domain/objective";
import { buildExecutionRoute } from "../src/domain/route-planner";
import { pageMetadata } from "../src/i18n/metadata";
import ts from "typescript";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
it("every controlled literal UI copy call has three translations", () => {
  const known = new Set(translations.map((r) => r[0]));
  const proper = new Set([
    "SignalForge",
    "SIGNALFORGE /",
    "Proofline Verify",
    "s",
    "⌘ K",
  ]);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
    );
  const missing: string[] = [];
  for (const file of [
    ...walk("src/components"),
    ...walk("src/app/[locale]"),
  ].filter((f) => f.endsWith(".tsx"))) {
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(ast) === "t" &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const value = node.arguments[0].text;
        if (/[A-Za-z]/.test(value) && !known.has(value) && !proper.has(value))
          missing.push(value);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  expect(missing).toEqual([]);
});
it("translates deterministic rationale templates without changing canonical payloads", () => {
  const text =
    "Selected by best value across budget-feasible dependency routes. Quality 0.9; reliability 0.95; no verification result claimed.";
  expect(copyForLocale("es")(text)).toContain("Seleccionado por");
  expect(copyForLocale("es")(text)).toContain("0.95");
  expect(copyForLocale("en")(text)).toBe(text);
  for (const path of [
    "../../README.md",
    "README.md",
    "examples/client-agent/README.md",
    "../../docs/i18n.md",
    "../../docs/demo-script.md",
    "public/architecture.svg",
  ])
    expect(existsSync(path)).toBe(true);
});
it("uses English by default and supports complete nonempty translation entries without hash collisions", () => {
  expect(safeLocale(undefined)).toBe("en");
  expect(safeLocale("pt")).toBe("en");
  const hashes = new Map<string, string>();
  for (const row of translations) {
    expect(row).toHaveLength(3);
    row.forEach((v) => expect(v.trim().length).toBeGreaterThan(0));
    const key = messageKey(row[0]);
    if (hashes.has(key)) expect(hashes.get(key)).toBe(row[0]);
    else hashes.set(key, row[0]);
  }
  expect(copyForLocale("es")("What should your agent accomplish?")).toBe(
    "¿Qué debería lograr tu agente?",
  );
  expect(copyForLocale("fr")("What should your agent accomplish?")).toBe(
    "Que doit accomplir votre agent ?",
  );
  expect(copyForLocale("invalid")("Execution disabled")).toBe(
    "Execution disabled",
  );
});
it.each([
  "/api/v1/routes/plan",
  "/api/mcp",
  "/.well-known/agent-card.json",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
])("keeps machine URL %s stable", (path) =>
  expect(machinePath(path)).toBe(true),
);
it.each([
  [
    "es",
    "Crear una ruta de diligencia debida para una empresa",
    "due_diligence",
  ],
  [
    "fr",
    "Créer un itinéraire de diligence raisonnable pour une entreprise",
    "due_diligence",
  ],
  [
    "es",
    "Diseñar seguimiento de precios de competidores por mes",
    "monitoring",
  ],
  [
    "fr",
    "Préparer la surveillance des tarifs concurrents par mois",
    "monitoring",
  ],
  [
    "es",
    "Extraer y resumir un documento público extenso",
    "document_extraction",
  ],
  ["fr", "Extraire et résumer un document public long", "document_extraction"],
] as const)(
  "%s fallback preserves canonical constraints for %s",
  (locale, objective, type) => {
    const input = ObjectiveInputSchema.parse({
      objective,
      budgetUsd: 0.25,
      optimizationPolicy: "most_verified",
    });
    const base = decomposeObjective(input),
      localized = localizeObjectiveFrame(base, locale);
    expect(localized.objectiveType).toBe(type);
    expect(ObjectiveFrameSchema.safeParse(localized).success).toBe(true);
    expect(localized.normalizedObjective).toBe(objective);
    expect(localized.constraints).toEqual(base.constraints);
    expect(localized.requiredCapabilities.map((c) => c.id)).toEqual(
      base.requiredCapabilities.map((c) => c.id),
    );
    expect(localized.title).not.toBe(base.title);
    expect(buildExecutionRoute(input, localized).executionStatus).toBe(
      "execution_not_enabled",
    );
  },
);
it("publishes localized canonical/hreflang metadata without touching machine contracts", async () => {
  const m = await pageMetadata(
    Promise.resolve({ locale: "fr" }),
    "network",
    "/network",
  );
  expect(m.alternates?.canonical).toBe(
    "https://signalforge-rose-two.vercel.app/fr/network",
  );
  expect(m.alternates?.languages?.es).toBe(
    "https://signalforge-rose-two.vercel.app/es/network",
  );
  expect(copyForLocale("es")("execution_not_enabled")).toBe(
    "execution_not_enabled",
  );
});
