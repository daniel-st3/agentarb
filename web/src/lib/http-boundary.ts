/** Bounded request parsing; no filesystem, cookies, authentication, or alternate targets. */
export async function readLimitedJson(
  message: Request | Response,
  limit = 16_384,
): Promise<unknown> {
  const reader = message.body?.getReader();
  if (!reader) throw new Error("Empty JSON");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("JSON exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(joined));
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const incoming = new URL(origin);
    // Next can rewrite request.url to an internal localhost origin. Host is the
    // public inbound host; it is never used to construct an upstream URL.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return (
      ["http:", "https:"].includes(incoming.protocol) && incoming.host === host
    );
  } catch {
    return false;
  }
}
