import type { Poi, Point, WalkingLeg } from "./types";
import { validPoint } from "./domain";
import { appMode, requestSignal } from "./server/config";
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

/** Native Valhalla JSON uses polyline6; decoding preserves the provider's actual pedestrian path. */
export function decodePolyline6(encoded: string): [number, number][] | null {
  if (encoded.length > 200_000) return null;
  const coordinates: [number, number][] = [];
  let offset = 0; let latitude = 0; let longitude = 0;
  const component = () => {
    let result = 0; let shift = 0; let byte: number;
    do {
      if (offset >= encoded.length || shift > 30) throw new Error("INVALID_POLYLINE");
      byte = encoded.charCodeAt(offset++) - 63;
      if (byte < 0 || byte > 63) throw new Error("INVALID_POLYLINE");
      result |= (byte & 31) << shift; shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  try {
    while (offset < encoded.length) {
      latitude += component(); longitude += component();
      const point: [number, number] = [longitude / 1e6, latitude / 1e6];
      if (!validPoint({ longitude: point[0], latitude: point[1] })) return null;
      coordinates.push(point);
    }
  } catch { return null; }
  return coordinates.length >= 2 ? coordinates : null;
}

async function fetchRoute(origin: Point, pois: Poi[], returnToStart: boolean, signal?: AbortSignal): Promise<WalkingLeg[] | null> {
  if (appMode() === "demo" || process.env.ROUTING_ENABLED === "false" || pois.length === 0) return null;
  const locations = [origin, ...pois.map((poi) => poi.location), ...(returnToStart ? [origin] : [])];
  const ids = ["start", ...pois.map((poi) => poi.id), ...(returnToStart ? ["start"] : [])];
  try {
    const url = new URL("https://valhalla1.openstreetmap.de/route");
    const body = JSON.stringify({ locations: locations.map((point) => ({ lat: point.latitude, lon: point.longitude })),
      costing: "pedestrian", units: "kilometers", language: "ru-RU", shape_format: "geojson" });
    const response = await fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json", "X-Client-Id": "spot-local-hackathon-prototype" }, signal: requestSignal(signal, 7000), cache: "no-store", redirect: "error" });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.trip?.status !== 0 || !Array.isArray(data.trip.legs) || data.trip.legs.length !== ids.length - 1) return null;
    const legs: WalkingLeg[] = [];
    for (let i = 0; i < data.trip.legs.length; i++) {
      const leg = data.trip.legs[i];
      const decoded = typeof leg.shape === "string" ? decodePolyline6(leg.shape) : null;
      const geometry = decoded ? { type: "LineString", coordinates: decoded } : leg.shape;
      if (!Number.isFinite(leg.summary?.time) || leg.summary.time < 0 || !Number.isFinite(leg.summary?.length) || leg.summary.length < 0
        || geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2
        || geometry.coordinates.some((p: unknown) => !Array.isArray(p) || p.length !== 2 || !validPoint({ longitude: p[0], latitude: p[1] }))
        || !Array.isArray(leg.maneuvers) || leg.maneuvers.some((maneuver: { travel_mode?: string }) => maneuver.travel_mode !== "pedestrian")) return null;
      legs.push({ fromId: ids[i], toId: ids[i + 1], profile: "walking", provider: "Valhalla · FOSSGIS", seconds: leg.summary.time,
        metres: Math.round(leg.summary.length * 1000), geometry });
    }
    return legs;
  } catch { return null; }
}

/** Serialize use of the public demo; at most three plan attempts per user request. */
export function walkingRoute(origin: Point, pois: Poi[], returnToStart: boolean, signal?: AbortSignal): Promise<WalkingLeg[] | null> {
  if (pending >= 2) return Promise.resolve(null);
  pending += 1;
  const next = queue.then(() => fetchRoute(origin, pois, returnToStart, signal), () => fetchRoute(origin, pois, returnToStart, signal));
  queue = next.catch(() => null).finally(() => { pending -= 1; });
  return next;
}
