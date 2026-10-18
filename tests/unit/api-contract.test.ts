import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "../../src/app/api/pois/route";
import { POST as searchPost } from "../../src/app/api/search/route";
beforeEach(() => vi.stubEnv("APP_MODE", "demo"));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const origin = { longitude: 71.40733, latitude: 51.08909 };
const request = (url: string, body: unknown, extra: HeadersInit = {}) => new Request(`http://127.0.0.1:3000${url}`, { method: "POST", headers: { "Content-Type": "application/json", ...extra }, body: JSON.stringify(body) });
it("rejects exact coordinates in GET URL and accepts a bounded POST area", async () => {
  expect((await GET(new Request("http://127.0.0.1:3000/api/pois?longitude=71.4&latitude=51.1"))).status).toBe(400);
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
  const response = await POST(request("/api/pois", { origin, radius: 1500 })); const body = await response.json();
  expect(response.status).toBe(200); expect(body.items.length).toBeGreaterThan(0); expect(fetch).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects invalid coordinates, extra executable fields and foreign Origin", async () => {
  for (const body of [{ origin: { longitude: 0, latitude: 0 } }, { origin, sql: "DROP TABLE pois" }]) expect((await POST(request("/api/pois", body))).status).toBe(400);
  expect((await POST(request("/api/pois", { origin }, { Origin: "https://attacker.example" }))).status).toBe(400);
});
it("real API demo response clarifies airport without external calls", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
  const response = await searchPost(request("/api/search", { origin, query: "2 часа до вылета" })); const body = await response.json();
  expect(response.status).toBe(200); expect(body.kind).toBe("clarification"); expect(body.items).toEqual([]); expect(fetch).not.toHaveBeenCalled();
});
it("dense city snapshot does not hide an exact named destination behind the nearest map limit", async () => {
  const response = await searchPost(request("/api/search", { origin: { longitude: 71.4165705, latitude: 51.1061652 }, query: "Байтерек", maxDistanceMetres: 5000 }));
  const body = await response.json(); expect(response.status).toBe(200); expect(body.items.length).toBeGreaterThan(0);
  expect(body.items.some((p: { name: string }) => p.name.includes("Байтерек"))).toBe(true);
});
