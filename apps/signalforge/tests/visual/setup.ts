import { execFileSync } from "node:child_process";
export default function setup() {
  execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/visual/prepare.test.ts"], { stdio: "inherit" });
}
