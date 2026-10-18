import { afterEach, beforeEach, expect, it, vi } from "vitest";
import saved from "./fixtures/valhalla-pedestrian.json";
import { decodePolyline6, walkingRoute } from "../../src/lib/routing";
import type { Poi } from "../../src/lib/types";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
beforeEach(() => vi.stubEnv("APP_MODE", "live"));
it("decodes the actual saved Valhalla path at six-digit precision", () => {
  const line = decodePolyline6(saved.trip.legs[0].shape);
  expect(line).not.toBeNull(); expect(line!.length).toBeGreaterThan(50);
  expect(line![0][0]).toBeCloseTo(71.40758, 5);
  // Summary bounds and compressed shape round independently at the last decimal place.
  expect(Math.min(...line!.map((point) => point[1]))).toBeCloseTo(saved.trip.legs[0].summary.min_lat, 5);
  expect(Math.max(...line!.map((point) => point[1]))).toBeCloseTo(saved.trip.legs[0].summary.max_lat, 5);
  expect(line!.at(-1)![0]).toBeCloseTo(71.414778, 5);
});
it("rejects malformed and incomplete polylines", () => {
  expect(decodePolyline6("broken~")).toBeNull(); expect(decodePolyline6("?")).toBeNull(); expect(decodePolyline6("\u0000")).toBeNull();
});
it("accepts native pedestrian polyline6 without inventing straight connections", async () => {
  vi.stubEnv("ROUTING_ENABLED", "true");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(saved));
  const target = { id: "public-route-fixture", location: { longitude: 71.41478, latitude: 51.08969 } } as Poi;
  const legs = await walkingRoute({ longitude: 71.40733, latitude: 51.08909 }, [target], false);
  expect(legs).toHaveLength(1); expect(legs![0].seconds).toBe(440.508); expect(legs![0].metres).toBe(614);
  expect(legs![0].geometry!.coordinates.length).toBeGreaterThan(50);
});
it("rejects a response containing driving maneuvers", async () => {
  vi.stubEnv("ROUTING_ENABLED", "true");
  const wrong = structuredClone(saved); wrong.trip.legs[0].maneuvers[0].travel_mode = "drive";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(wrong));
  const target = { id: "fixture", location: { longitude: 71.41478, latitude: 51.08969 } } as Poi;
  expect(await walkingRoute({ longitude: 71.40733, latitude: 51.08909 }, [target], false)).toBeNull();
});
