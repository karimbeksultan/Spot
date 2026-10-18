let windowStart = Date.now();
let requests = 0;
/** Local prototype server has one bounded quota; no persistent client/IP tracking. */
export function rateLimit(): boolean {
  if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
  requests += 1;
  return requests <= 40;
}
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function boundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new Error("CONTENT_TYPE");
  if (Number(request.headers.get("content-length")) > 8192) throw new Error("BODY_TOO_LARGE");
  const origin = request.headers.get("origin");
  if (origin) {
    const internal = new URL(request.url);
    const host = request.headers.get("host") ?? internal.host;
    const expected = new URL(`${internal.protocol}//${host}`);
    const actual = new URL(origin);
    const loopback = ["127.0.0.1", "localhost", "[::1]"];
    // Next may normalize Request.url to localhost while the browser uses 127.0.0.1.
    // Host is accepted only for a loopback hostname and must still match the exact browser origin.
    if (!loopback.includes(expected.hostname) || expected.host !== host || expected.pathname !== "/"
      || actual.origin !== origin || actual.origin !== expected.origin) throw new Error("ORIGIN");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("BODY_EMPTY");
  let length = 0;
  const chunks: Uint8Array[] = [];
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 3000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut || request.signal.aborted) throw new Error("BODY_TIMEOUT");
      if (done) break;
      length += value.length;
      if (length > 8192) { await reader.cancel(); throw new Error("BODY_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { clearTimeout(deadline); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
