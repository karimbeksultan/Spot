import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { boundedJson } from "../../src/lib/http";
beforeEach(() => vi.stubEnv("SPOT_ALLOWED_ORIGINS", ""));
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const request = (body: string, extra: HeadersInit = {}) => new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body });
it("reads small JSON bodies", async () => expect(await boundedJson(request('{"query":"парк"}'))).toEqual({ query: "парк" }));
it("rejects over-limit bodies without trusting Content-Length", async () => await expect(boundedJson(request(JSON.stringify({ query: "x".repeat(9000) })))).rejects.toThrow("BODY_TOO_LARGE"));
it("rejects a different browser origin", async () => await expect(boundedJson(request("{}", { Origin: "https://attacker.example" }))).rejects.toThrow("ORIGIN"));
it("accepts the browser Host when Next normalizes its internal URL to localhost", async () => {
  const browserRequest = request("{}", { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" });
  expect(await boundedJson(browserRequest)).toEqual({});
});
it("refuses attacker-controlled nonloopback Host and origin", async () => await expect(boundedJson(request("{}", { Host: "attacker.example", Origin: "http://attacker.example" }))).rejects.toThrow("ORIGIN"));
it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("preserves the exact loopback origin for %s", async (host) => {
  expect(await boundedJson(request("{}", { Host: host, Origin: `http://${host}` }))).toEqual({});
});
it("accepts an explicitly allowed HTTPS origin behind a TLS-terminating proxy", async () => {
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", "https://other.example, https://spot.example:8443");
  expect(await boundedJson(request("{}", { Host: "spot.example:8443", Origin: "https://spot.example:8443" }))).toEqual({});
});
it("does not authorize a different subdomain or port", async () => {
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", "https://spot.example");
  for (const host of ["other.spot.example", "spot.example:8443"]) {
    await expect(boundedJson(request("{}", { Host: host, Origin: `https://${host}` }))).rejects.toThrow("ORIGIN");
  }
});
it("requires the actual Host to match even when the Origin is allowed", async () => {
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", "https://spot.example");
  for (const host of ["attacker.example", "localhost:3000", "spot.example/path", "spot.example@attacker.example"]) {
    await expect(boundedJson(request("{}", { Host: host, Origin: "https://spot.example", "X-Forwarded-Host": "spot.example", "X-Forwarded-Proto": "https" }))).rejects.toThrow("ORIGIN");
  }
});
it("does not trust forwarded headers or a matching public Host without an allowlist", async () => {
  await expect(boundedJson(request("{}", { Host: "spot.example", Origin: "https://spot.example", "X-Forwarded-Proto": "https" }))).rejects.toThrow("ORIGIN");
});
it.each(["null", "", "/", "https://spot.example/", "https://user@spot.example", "https://spot.example?query=1", "https://spot.example#part", "https://*.example", "ftp://spot.example", "https://spot.example:443"])("rejects a noncanonical or invalid Origin %j even if configured", async (origin) => {
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", origin);
  await expect(boundedJson(request("{}", { Host: "spot.example", Origin: origin }))).rejects.toThrow("ORIGIN");
});
it.each(["*", "https://*.example", "https://spot.example/", "https://spot.example/path"])("does not treat allowlist entry %j as a pattern", async (entry) => {
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", entry);
  await expect(boundedJson(request("{}", { Host: "spot.example", Origin: "https://spot.example" }))).rejects.toThrow("ORIGIN");
});
it.each(["10.1.2.3:3000", "172.16.0.1:3000", "172.31.255.254:3000", "192.168.1.10:3000", "[fd00::1]:3000"])("allows private HTTP %s only when explicitly listed", async (host) => {
  const origin = `http://${host}`;
  await expect(boundedJson(request("{}", { Host: host, Origin: origin }))).rejects.toThrow("ORIGIN");
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", origin);
  expect(await boundedJson(request("{}", { Host: host, Origin: origin }))).toEqual({});
});
it.each(["203.0.113.10", "172.15.255.255", "172.32.0.1", "spot.example"])("refuses public HTTP %s even when configured", async (host) => {
  const origin = `http://${host}`;
  vi.stubEnv("SPOT_ALLOWED_ORIGINS", origin);
  await expect(boundedJson(request("{}", { Host: host, Origin: origin }))).rejects.toThrow("ORIGIN");
});
it("preserves non-browser JSON clients without an Origin header", async () => {
  expect(await boundedJson(request("{}", { Host: "spot.example" }))).toEqual({});
});
it("cancels stalled bodies at the deadline", async () => {
  vi.useFakeTimers();
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } });
  const slow = new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  const outcome = boundedJson(slow).catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(3001);
  expect(await outcome).toBe("BODY_TIMEOUT");
});
