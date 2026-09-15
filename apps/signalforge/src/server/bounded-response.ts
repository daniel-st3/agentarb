import "server-only";

/** Read a public upstream body without retaining bytes beyond the allowed bound. */
export async function readBoundedResponseText(
  response: Response,
  maximumBytes: number,
  tooLargeCode: string,
): Promise<string> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
    throw new Error("response_limit_invalid");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel(tooLargeCode).catch(() => undefined);
        throw new Error(tooLargeCode);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof Error && error.message === tooLargeCode) throw error;
    throw new Error("upstream_body_invalid");
  } finally {
    reader.releaseLock();
  }
}

export function jsonMime(contentType: string | null): boolean {
  return (contentType ?? "").split(";", 1)[0].trim().toLowerCase() === "application/json";
}
