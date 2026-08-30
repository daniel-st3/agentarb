import { it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const script = resolve("scripts/check-client-boundary.mjs");
function fixture(
  path?: string,
  content = "console.log('safe static fixture')",
) {
  const dir = mkdtempSync(join(tmpdir(), "signalforge-boundary-"));
  dirs.push(dir);
  if (path) {
    mkdirSync(join(dir, path), { recursive: true });
    writeFileSync(join(dir, path, "test.js"), content);
  }
  return spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, VERCEL: "0" },
  });
}
it.each([
  ".next/static/chunks",
  ".next/static/immutable/chunks",
  ".vercel/output/static/_next/static/chunks",
])("scans %s output layouts", (path) => {
  const result = fixture(path);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("1 chunks");
});
it("fails closed when there is no browser output", () => {
  expect(fixture().status).not.toBe(0);
});
it("detects server-only identifiers in packaged Vercel browser output", () => {
  expect(
    fixture(
      ".vercel/output/static/_next/static/chunks",
      'const identifier = "GROQ_API_KEY"',
    ).status,
  ).not.toBe(0);
});
