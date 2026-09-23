import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const { lookupMock, requestMock } = vi.hoisted(() => ({ lookupMock: vi.fn(), requestMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));
vi.mock("node:https", () => ({ request: requestMock }));

import { fetchPublicSource } from "../src/server/source-synthesis/fetch-public";

function respond(statusCode: number, headers: Record<string, string>, chunks: Buffer[]) {
  requestMock.mockImplementation((_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void; setTimeout: (n: number, callback: () => void) => void; destroy: (error: Error) => void };
    request.setTimeout = vi.fn();
    request.destroy = (error) => request.emit("error", error);
    request.end = () => {
      expect(options.method).toBe("GET");
      expect(options.headers["Accept-Encoding"]).toBe("identity");
      expect(options.headers).not.toHaveProperty("Cookie");
      options.lookup("www.example.org", { all: true }, (_error: unknown, addresses: { address: string; family: number }[]) =>
        expect(addresses).toEqual([{ address: "8.8.8.8", family: 4 }]));
      const response = Readable.from(chunks) as Readable & { statusCode?: number; headers: Record<string, string> };
      response.statusCode = statusCode;
      response.headers = headers;
      queueMicrotask(() => callback(response));
    };
    return request;
  });
}

beforeEach(() => { lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]); });
afterEach(() => { vi.clearAllMocks(); });

it("pins the validated public DNS answer and reads bounded plain text", async () => {
  respond(200, { "content-type": "text/plain; charset=utf-8" }, [Buffer.from("A documented public source about agents and reliable source synthesis.")]);
  const result = await fetchPublicSource("https://www.example.org/report", new AbortController().signal);
  expect(result.text).toContain("reliable source synthesis");
  expect(result.bytesRead).toBeGreaterThan(40);
  expect(requestMock).toHaveBeenCalledOnce();
});

it("rejects private DNS answers before connecting", async () => {
  lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }, { address: "169.254.169.254", family: 4 }]);
  await expect(fetchPublicSource("https://www.example.org/report", new AbortController().signal)).rejects.toThrow("source_dns_unsafe");
  expect(requestMock).not.toHaveBeenCalled();
});

it.each([
  [302, { "content-type": "text/plain", location: "https://127.0.0.1/" }, "source_http_unavailable"],
  [200, { "content-type": "application/pdf" }, "source_mime_invalid"],
  [200, { "content-type": "text/plain", "content-encoding": "gzip" }, "source_encoding_invalid"],
  [200, { "content-type": "text/plain", "content-length": "98305" }, "source_payload_too_large"],
] as const)("rejects unsafe response status/MIME/encoding/length %i", async (status, headers, code) => {
  respond(status, headers, [Buffer.from("Enough public source text to pass the length limit in this test.")]);
  await expect(fetchPublicSource("https://www.example.org/report", new AbortController().signal)).rejects.toThrow(code);
});

it("aborts an oversized chunked response while streaming", async () => {
  respond(200, { "content-type": "text/html" }, [Buffer.alloc(96 * 1024 + 1, 65)]);
  await expect(fetchPublicSource("https://www.example.org/report", new AbortController().signal)).rejects.toThrow("source_payload_too_large");
});
