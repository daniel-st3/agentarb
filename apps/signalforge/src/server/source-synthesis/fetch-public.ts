import "server-only";

import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const MAX_SOURCE_BYTES = 96 * 1024;
const MAX_TEXT_BYTES = 12 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");

export function publicSourceUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("source_url_invalid"); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" || url.port || url.username || url.password ||
    url.hash || value.length > 2048 ||
    isIP(host) || !host.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)
  ) throw new Error("source_url_invalid");
  return url;
}

export function isPublicIpv4(address: string): boolean {
  return isIP(address) === 4 && !blocked.check(address, "ipv4") &&
    !/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\./.test(address);
}

function readableText(body: string, mime: string): string {
  const withoutMarkup = mime === "text/html"
    ? body.replace(/<!--[\s\S]*?-->|<(?:script|style|noscript|iframe|svg)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|iframe|svg)\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/gi, (entity) => ({
        "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " ",
      })[entity.toLowerCase()] ?? " ")
    : body;
  const text = withoutMarkup.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < 40) throw new Error("source_text_insufficient");
  return Buffer.from(text).subarray(0, MAX_TEXT_BYTES).toString("utf8");
}

export async function fetchPublicSource(value: string, signal: AbortSignal) {
  const url = publicSourceUrl(value);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    dnsLookup(url.hostname, { all: true }),
    new Promise<never>((_resolve, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("source_dns_timeout")), 3000);
      dnsTimer.unref();
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  // Reject an entire DNS answer set if it advertises *any* internal address.
  // This route deliberately supports public IPv4 only; IPv6-only sites fail closed.
  if (!addresses.length || addresses.some((entry) =>
    entry.family === 4 ? !isPublicIpv4(entry.address) :
    entry.family === 6 ? !/^[23][0-9a-f]{3}:/i.test(entry.address) : true,
  )) throw new Error("source_dns_unsafe");
  const pinned = addresses.find((entry) => entry.family === 4);
  if (!pinned) throw new Error("source_dns_unsupported");

  const body = await new Promise<{ bytes: Buffer; mime: string }>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "GET", agent: false, signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      headers: { Accept: "text/html, text/plain", "Accept-Encoding": "identity", "User-Agent": "SignalForge/1.0 (+https://signalforge-rose-two.vercel.app)" },
      lookup: (_host, _options, callback) => callback(null, pinned.address, 4),
    }, async (response) => {
      try {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300)
          throw new Error("source_http_unavailable");
        const mime = String(response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
        if (!["text/html", "text/plain"].includes(mime)) throw new Error("source_mime_invalid");
        if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")
          throw new Error("source_encoding_invalid");
        const length = Number(response.headers["content-length"] ?? 0);
        if (length > MAX_SOURCE_BYTES) throw new Error("source_payload_too_large");
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > MAX_SOURCE_BYTES) throw new Error("source_payload_too_large");
          chunks.push(bytes);
        }
        resolve({ bytes: Buffer.concat(chunks, size), mime });
      } catch (error) {
        response.destroy();
        reject(error);
      }
    });
    request.on("error", reject);
    request.setTimeout(5000, () => request.destroy(new Error("source_timeout")));
    request.end();
  });
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body.bytes);
  return {
    url: url.toString(),
    retrievedAt: new Date().toISOString(),
    contentSha256: createHash("sha256").update(body.bytes).digest("hex"),
    bytesRead: body.bytes.length,
    text: readableText(decoded, body.mime),
  };
}
