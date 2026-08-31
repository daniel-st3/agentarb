import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const tracked = execFileSync("git", ["diff", "--name-only", "HEAD", "-z"], {
  cwd: root,
  encoding: "utf8",
});
const added = execFileSync(
  "git",
  ["ls-files", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
);
const rules = [
  ["provider_credential", /\b(?:gsk_|sk-proj-|sk-or-v1-)[A-Za-z0-9_-]{20,}/],
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  [
    "jwt_literal",
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  ],
  [
    "public_secret_variable",
    /NEXT_PUBLIC_(?:GROQ_API_KEY|UPSTASH_REDIS_REST_TOKEN|RATE_LIMIT_SALT)\s*[:=]/,
  ],
];
let checked = 0,
  findings = 0;
for (const name of new Set((tracked + added).split("\0").filter(Boolean))) {
  // Never open configuration secrets, even when mistakenly present in a diff.
  if (/(?:^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith(".env.example")) {
    findings++;
    console.error(
      "Excluded secret configuration is changed; remove it from the delivery.",
    );
    continue;
  }
  const file = resolve(root, name);
  if (relative(root, file).startsWith("..") || !existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0) || /\.(png|jpe?g|webp|woff2?|zip)$/.test(file))
    continue;
  checked++;
  for (const [category, pattern] of rules)
    if (pattern.test(bytes.toString("utf8"))) {
      findings++;
      console.error(`Security finding: ${category}; file: ${name}`);
    }
}
console.log(
  `Targeted changed-file scan: ${checked} text files; ${findings} findings. No credential values inspected or reported.`,
);
process.exitCode = findings ? 1 : 0;
