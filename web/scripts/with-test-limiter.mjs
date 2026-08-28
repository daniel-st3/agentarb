// Hermetic build/preview harness, not an application bypass. No cloud store is contacted.
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!["build", "start"].includes(command))
  throw new Error("Expected build or start.");
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  UPSTASH_REDIS_REST_URL: "https://hermetic-fixture.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: randomBytes(48).toString("base64"),
  RATE_LIMIT_SALT: randomBytes(32).toString("hex"),
};
// Production endpoints stay closed on a non-Vercel host; tests mock only UI responses.
delete env.VERCEL;
delete env.VERCEL_ENV;
console.log(
  "Hermetic production verification: synthetic configuration; live API admission remains closed.",
);
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", command, ...args],
  { env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
