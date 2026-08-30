import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const walk = (path) =>
  readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(path, entry.name))
      : [join(path, entry.name)],
  );
const chunks = walk(".next/static/chunks").filter((file) =>
  file.endsWith(".js"),
);
if (!chunks.length)
  throw new Error("Build client chunks before checking the framing boundary.");
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
