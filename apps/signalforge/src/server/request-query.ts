/** Bound query parsing and reject ambiguity before any catalog or model work. */
export function requestQuery(
  url: string,
  allowFields = false,
): Record<string, string> {
  if (url.length > 2048) throw new Error("invalid_request_url");
  const params = new URL(url).searchParams;
  const result: Record<string, string> = Object.create(null);
  let count = 0;
  for (const [key, value] of params) {
    if (!allowFields || ++count > 16 || Object.hasOwn(result, key))
      throw new Error("invalid_request_query");
    result[key] = value;
  }
  return result;
}
