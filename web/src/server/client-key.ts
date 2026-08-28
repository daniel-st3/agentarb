import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";

function firstAddress(value: string | null): string {
  if (!value || value.length > 512) throw new Error("Invalid client boundary.");
  const chain = value.split(",").map((part) => part.trim());
  if (
    chain.length > 8 ||
    chain.some((part) => part.includes("%") || !isIP(part))
  )
    throw new Error("Invalid client boundary.");
  return ipaddr.process(chain[0]).toString();
}

export function clientKey(request: Request, salt: string): string {
  // Only Vercel's edge may supply these headers. Never trust direct-origin traffic.
  if (process.env.VERCEL !== "1") throw new Error("Untrusted proxy boundary.");
  const normalized = firstAddress(request.headers.get("x-forwarded-for"));
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel !== null && firstAddress(vercel) !== normalized)
    throw new Error("Conflicting client boundary.");
  return createHmac("sha256", Buffer.from(salt, "hex"))
    .update("agent-arbiter/public-limit/v1\0" + normalized)
    .digest("hex");
}

export function isLocalRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      (!host ||
        ["127.0.0.1", "localhost", "[::1]"].includes(
          new URL(`http://${host}`).hostname,
        ))
    );
  } catch {
    return false;
  }
}
