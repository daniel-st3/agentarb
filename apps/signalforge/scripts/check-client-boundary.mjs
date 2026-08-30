import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(path, entry.name))
      : [join(path, entry.name)],
  );
// Next's Vercel adapter may relocate/static-package assets before this script.
// Scan static output, not functions, and never skip the boundary on Vercel.
const candidates = new Set([resolve(".next/static")]);
let directory = process.cwd();
while (true) {
  candidates.add(join(directory, ".vercel/output/static"));
  if (process.env.VERCEL === "1")
    candidates.add(join(directory, "output/static"));
  const parent = dirname(directory);
  if (parent === directory) break;
  directory = parent;
}
const roots = [...candidates].filter(existsSync);
const chunks = roots.flatMap(walk).filter((file) => file.endsWith(".js"));
if (!chunks.length)
  throw new Error(
    "No browser JavaScript found in Next/Vercel static output; boundary check cannot pass.",
  );
for (const file of chunks) {
  // Check server-only identifiers, never read or compare any real secret value.
  if (
    /GROQ_API_KEY|OPENROUTER_API_KEY|UPSTASH_REDIS_REST_TOKEN|RATE_LIMIT_SALT|api\.groq\.com|openrouter\.ai\/api/.test(
      readFileSync(file, "utf8"),
    )
  )
    throw new Error("Server-only framing code reached a client chunk.");
}
console.log(
  `Client boundary passed: ${chunks.length} chunks; no server-only framing identifiers.`,
);
