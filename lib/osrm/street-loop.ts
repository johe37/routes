import { bboxOf, destinationPoint } from "@/lib/geo/geodesic";
import type {
  GenerateInput,
  GeneratedRoute,
  LonLat,
} from "@/lib/generators/types";
import { GenerateError } from "@/lib/http/errors";
import { osrmRoute, sleep } from "@/lib/osrm/client";
import { roundTripPoints } from "@/lib/ors/profiles";

const ACCEPT_LOW = 0.88;
const ACCEPT_HIGH = 1.12;
/** Streets are longer than the circle, so ask short. */
const RADIUS_FACTORS = [0.86, 0.74, 0.62] as const;

function ringWaypoints(
  start: LonLat,
  targetMeters: number,
  seed: number,
  vertexCount: number,
  radiusFactor: number,
): LonLat[] {
  const radius = (targetMeters * radiusFactor) / (2 * Math.PI);
  const pts: LonLat[] = [start];
  for (let i = 0; i < vertexCount; i++) {
    const heading = (seed % 360) + (360 * i) / vertexCount;
    pts.push(destinationPoint(start, heading, radius));
  }
  pts.push(start);
  return pts;
}

export async function osrmLoop(input: GenerateInput): Promise<GeneratedRoute> {
  const vertices = roundTripPoints(input.activity, input.targetMeters);
  let best: GeneratedRoute | null = null;
  let bestDelta = Infinity;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1100);
    const seed = input.seed + attempt * 47;
    const waypoints = ringWaypoints(
      input.start,
      input.targetMeters,
      seed,
      vertices,
      RADIUS_FACTORS[attempt],
    );
    let routed;
    try {
      routed = await osrmRoute(waypoints, input.activity);
    } catch (err) {
      if (
        err instanceof GenerateError &&
        (err.code === "ROUTE_NOT_FOUND" || err.code === "START_NOT_SNAPPED") &&
        attempt < 2
      ) {
        continue;
      }
      throw err;
    }
    const route: GeneratedRoute = {
      id: crypto.randomUUID(),
      geometry: { type: "LineString", coordinates: routed.coordinates },
      bbox: bboxOf(routed.coordinates),
      distanceMeters: routed.distanceMeters,
      activity: input.activity,
      shape: "loop",
      seed,
      provider: "osrm",
      attempts: attempt + 1,
      distanceSoftMiss: false,
      warnings: [],
    };
    const delta = Math.abs(route.distanceMeters - input.targetMeters);
    if (delta < bestDelta) {
      best = route;
      bestDelta = delta;
    }
    const ratio = route.distanceMeters / input.targetMeters;
    if (ratio >= ACCEPT_LOW && ratio <= ACCEPT_HIGH) return route;
  }

  if (!best) {
    throw new Error("OSRM loop produced no candidate");
  }
  return {
    ...best,
    attempts: 3,
    distanceSoftMiss: true,
    warnings: ["Closest loop we found. Try Regenerate or Out-and-back."],
  };
}
