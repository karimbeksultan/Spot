import { afterEach, expect, it, vi } from "vitest";
import { boundedJson } from "../../src/lib/http";
afterEach(() => vi.useRealTimers());
const request = (body: string, extra: HeadersInit = {}) => new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body });
it("reads small JSON bodies", async () => expect(await boundedJson(request('{"query":"парк"}'))).toEqual({ query: "парк" }));
it("rejects over-limit bodies without trusting Content-Length", async () => await expect(boundedJson(request(JSON.stringify({ query: "x".repeat(9000) })))).rejects.toThrow("BODY_TOO_LARGE"));
it("rejects a different browser origin", async () => await expect(boundedJson(request("{}", { Origin: "https://attacker.example" }))).rejects.toThrow("ORIGIN"));
it("accepts the browser Host when Next normalizes its internal URL to localhost", async () => {
  const browserRequest = request("{}", { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" });
  expect(await boundedJson(browserRequest)).toEqual({});
});
it("refuses attacker-controlled nonloopback Host and origin", async () => await expect(boundedJson(request("{}", { Host: "attacker.example", Origin: "http://attacker.example" }))).rejects.toThrow("ORIGIN"));
it("cancels stalled bodies at the deadline", async () => {
  vi.useFakeTimers();
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } });
  const slow = new Request("http://localhost:3000/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
  const outcome = boundedJson(slow).catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(3001);
  expect(await outcome).toBe("BODY_TIMEOUT");
});
