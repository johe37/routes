import { GenerateError } from "@/lib/http/errors";
import type { LonLat } from "@/lib/generators/types";
import { profileFor } from "@/lib/ors/profiles";
import type { Activity } from "@/lib/generators/types";
import { stripElev } from "@/lib/geo/geodesic";

const ORS_HOST = "https://api.heigit.org/openrouteservice/v2/directions";
const TIMEOUT_MS = 8_000;

export interface OrsSummary {
  distance: number;
  duration: number;
}

export interface OrsRoute {
  coordinates: LonLat[];
  summary: OrsSummary;
  bbox: [number, number, number, number];
}

interface OrsGeojson {
  bbox?: number[];
  features?: Array<{
    geometry?: { type?: string; coordinates?: number[][] };
    properties?: { summary?: OrsSummary };
  }>;
  error?: { code?: number; message?: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapOrsError(status: number, message: string): GenerateError {
  const lower = message.toLowerCase();
  if (status === 403) {
    return new GenerateError(
      "PROVIDER_QUOTA",
      "The routing service is out of daily quota. Try again tomorrow.",
    );
  }
  if (status === 429) {
    return new GenerateError(
      "PROVIDER_BUSY",
      "Slow down — try again in a few seconds.",
    );
  }
  if (status >= 500) {
    return new GenerateError(
      "PROVIDER_TIMEOUT",
      "The routing service timed out. Retry.",
    );
  }
  if (lower.includes("routable point") || lower.includes("could not find")) {
    return new GenerateError(
      "START_NOT_SNAPPED",
      "Nothing routable here (water or no paths). Move the pin.",
    );
  }
  return new GenerateError(
    "ROUTE_NOT_FOUND",
    "Couldn't find a route from here. Move the pin or try out-and-back.",
  );
}

async function orsPost(
  profilePath: string,
  body: unknown,
  retried = false,
): Promise<OrsGeojson> {
  const key = process.env.ORS_API_KEY;
  if (!key) {
    throw new GenerateError("INTERNAL", "ORS_API_KEY is not set");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ORS_HOST}/${profilePath}/geojson`, {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify(body),
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

  let json: OrsGeojson = {};
  try {
    json = (await res.json()) as OrsGeojson;
  } catch {
    json = {};
  }

  if (res.status === 429 && !retried) {
    const waitSec = Number(res.headers.get("retry-after"));
    await sleep((Number.isFinite(waitSec) ? Math.min(waitSec, 3) : 1) * 1000);
    return orsPost(profilePath, body, true);
  }

  if (res.status >= 500 && !retried) {
    await sleep(1000);
    return orsPost(profilePath, body, true);
  }

  if (!res.ok) {
    const message =
      json.error?.message ?? `OpenRouteService returned ${res.status}`;
    throw mapOrsError(res.status, message);
  }

  return json;
}

function parseRoute(json: OrsGeojson): OrsRoute {
  const feature = json.features?.[0];
  const coords = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!coords?.length || !summary || typeof summary.distance !== "number") {
    throw new GenerateError(
      "ROUTE_NOT_FOUND",
      "Couldn't find a route from here. Move the pin or try out-and-back.",
    );
  }
  const coordinates = coords.map(stripElev);
  const bbox = (json.bbox ?? [
    Math.min(...coordinates.map((c) => c[0])),
    Math.min(...coordinates.map((c) => c[1])),
    Math.max(...coordinates.map((c) => c[0])),
    Math.max(...coordinates.map((c) => c[1])),
  ]) as [number, number, number, number];
  return { coordinates, summary, bbox };
}

function optionsFor(
  activity: Activity,
  extra: Record<string, unknown>,
  includeWeightings: boolean,
) {
  const profile = profileFor(activity);
  const options: Record<string, unknown> = {
    ...extra,
    avoid_features: profile.avoid,
  };
  if (includeWeightings && profile.weightings) {
    options.profile_params = { weightings: profile.weightings };
  }
  return options;
}

export async function roundTrip(args: {
  start: LonLat;
  activity: Activity;
  lengthMeters: number;
  points: number;
  seed: number;
}): Promise<OrsRoute> {
  const profile = profileFor(args.activity);
  const body = (includeWeightings: boolean) => ({
    coordinates: [args.start],
    radiuses: [1500],
    instructions: false,
    geometry: true,
    elevation: false,
    preference: "recommended",
    units: "m",
    options: optionsFor(
      args.activity,
      {
        round_trip: {
          length: args.lengthMeters,
          points: args.points,
          seed: args.seed,
        },
      },
      includeWeightings,
    ),
  });

  try {
    return parseRoute(await orsPost(profile.path, body(true)));
  } catch (err) {
    if (err instanceof GenerateError && err.code === "ROUTE_NOT_FOUND") {
      return parseRoute(await orsPost(profile.path, body(false)));
    }
    throw err;
  }
}

export async function pointToPoint(args: {
  start: LonLat;
  end: LonLat;
  activity: Activity;
}): Promise<OrsRoute> {
  const profile = profileFor(args.activity);
  const body = (includeWeightings: boolean) => ({
    coordinates: [args.start, args.end],
    radiuses: [1500, 2000],
    instructions: false,
    geometry: true,
    elevation: false,
    preference: "recommended",
    units: "m",
    options: optionsFor(args.activity, {}, includeWeightings),
  });

  try {
    return parseRoute(await orsPost(profile.path, body(true)));
  } catch (err) {
    if (err instanceof GenerateError && err.code === "ROUTE_NOT_FOUND") {
      return parseRoute(await orsPost(profile.path, body(false)));
    }
    throw err;
  }
}
