import { isIP } from "node:net";

const loopback = ["127.0.0.1", "localhost", "[::1]"];

function privateHttpHost(hostname: string): boolean {
  if (loopback.includes(hostname)) return true;
  if (isIP(hostname) === 4) {
    const [first, second] = hostname.split(".").map(Number);
    return first === 10 || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  const ipv6 = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  return isIP(ipv6) === 6 && (Number.parseInt(ipv6.split(":")[0], 16) & 0xfe00) === 0xfc00;
}

function checkOrigin(request: Request, origin: string): void {
  let actual: URL;
  try { actual = new URL(origin); } catch { throw new Error("ORIGIN"); }
  // Compare the canonical serialization too: paths, credentials, query strings,
  // fragments, wildcard hosts and non-HTTP schemes are never origins we trust.
  if (!["http:", "https:"].includes(actual.protocol) || actual.origin !== origin
    || actual.hostname.includes("*")) throw new Error("ORIGIN");
  const internal = new URL(request.url);
  const host = request.headers.get("host") ?? internal.host;
  if (actual.host !== host) throw new Error("ORIGIN");
  // Next can normalize its internal URL to localhost. Preserve exact loopback
  // browser Host matching without trusting forwarded headers.
  if (loopback.includes(actual.hostname) && actual.protocol === internal.protocol) return;
  const allowed = (process.env.SPOT_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  // A proxy may terminate TLS before forwarding HTTP to Next. Only an explicit
  // external origin and the same external Host authorize this case.
  if (!allowed.includes(origin) || (actual.protocol !== "https:" && !privateHttpHost(actual.hostname))) {
    throw new Error("ORIGIN");
  }
}

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
  if (origin !== null) checkOrigin(request, origin);
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
