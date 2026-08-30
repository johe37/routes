import { stripElev } from "@/lib/geo/geodesic";
import type { Activity, LonLat } from "@/lib/generators/types";
import { GenerateError } from "@/lib/http/errors";

const TIMEOUT_MS = 8_000;
const USER_AGENT =
  process.env.ROUTING_USER_AGENT ??
  "Loop-routeGenerator/0.1 (personal running app)";

export interface StreetRoute {
  coordinates: LonLat[];
  distanceMeters: number;
}

function profileHost(activity: Activity): string {
  const profile = activity === "bike" ? "routed-bike" : "routed-foot";
  return `https://routing.openstreetmap.de/${profile}`;
}

export async function osrmRoute(
  coords: LonLat[],
  activity: Activity,
): Promise<StreetRoute> {
  if (coords.length < 2) {
    throw new GenerateError("VALIDATION", "Need at least two points to route.");
  }

  const path = coords.map(([lon, lat]) => `${lon},${lat}`).join(";");
  const radiuses = coords.map(() => "1500").join(";");
  const url =
    `${profileHost(activity)}/route/v1/driving/${path}` +
    `?overview=full&geometries=geojson&steps=false&radiuses=${radiuses}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new GenerateError(
        "PROVIDER_TIMEOUT",
        "The routing service timed out. Retry.",
      );
    }
    throw new GenerateError(
      "PROVIDER_TIMEOUT",
      "Couldn't reach the routing service. Retry.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429) {
    throw new GenerateError(
      "PROVIDER_BUSY",
      "Slow down — try again in a few seconds.",
      1,
    );
  }

  let json: {
    code?: string;
    message?: string;
    routes?: Array<{
      distance?: number;
      geometry?: { coordinates?: number[][] };
    }>;
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    json = {};
  }

  if (!res.ok || json.code !== "Ok" || !json.routes?.[0]) {
    const code = json.code ?? "";
    if (code === "NoRoute" || code === "NoSegment" || res.status === 400) {
      throw new GenerateError(
        "ROUTE_NOT_FOUND",
        "Couldn't find a route from here. Move the pin or try out-and-back.",
      );
    }
    if (res.status >= 500) {
      throw new GenerateError(
        "PROVIDER_TIMEOUT",
        "The routing service timed out. Retry.",
      );
    }
    throw new GenerateError(
      "ROUTE_NOT_FOUND",
      "Couldn't find a route from here. Move the pin or try out-and-back.",
    );
  }

  const route = json.routes[0];
  const raw = route.geometry?.coordinates;
  if (!raw?.length || typeof route.distance !== "number") {
    throw new GenerateError(
      "ROUTE_NOT_FOUND",
      "Couldn't find a route from here. Move the pin or try out-and-back.",
    );
  }

  return {
    coordinates: raw.map(stripElev),
    distanceMeters: route.distance,
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
