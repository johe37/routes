import { destinationPoint } from "@/lib/geo/geodesic";
import {
  loopCandidateScore,
  loopDistanceOk,
  loopShapeOk,
  refineLoopGeometry,
  toLoopRoute,
} from "@/lib/geo/loop-shape";
import type {
  GenerateInput,
  GeneratedRoute,
  LonLat,
} from "@/lib/generators/types";
import { GenerateError } from "@/lib/http/errors";
import { osrmRoute, sleep } from "@/lib/osrm/client";
import { roundTripPoints } from "@/lib/ors/profiles";

/** Streets are longer than the circle, so ask short. */
const RADIUS_FACTORS = [0.86, 0.74, 0.62] as const;

function isMissingRoute(err: unknown): boolean {
  return (
    err instanceof GenerateError &&
    (err.code === "ROUTE_NOT_FOUND" || err.code === "START_NOT_SNAPPED")
  );
}

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
  let bestScore = Infinity;

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
      routed = await osrmRoute(waypoints, input.activity, {
        continueStraight: true,
      });
    } catch (err) {
      if (!isMissingRoute(err)) throw err;
      // Dead-end via points can fail with continue_straight; allow a U-turn
      // and let pruneSkinnyOutAndBacks strip the spur.
      try {
        await sleep(1100);
        routed = await osrmRoute(waypoints, input.activity);
      } catch (retryErr) {
        if (isMissingRoute(retryErr) && attempt < 2) continue;
        throw retryErr;
      }
    }
    const refined = refineLoopGeometry(
      routed.coordinates,
      routed.distanceMeters,
    );
    if (!refined) continue;
    const route = toLoopRoute(
      {
        id: crypto.randomUUID(),
        activity: input.activity,
        shape: "loop",
        seed,
        provider: "osrm",
        attempts: attempt + 1,
      },
      refined,
    );
    const score = loopCandidateScore(
      route.distanceMeters,
      input.targetMeters,
      refined.retraceRatio,
    );
    if (score < bestScore) {
      best = route;
      bestScore = score;
    }
    if (
      loopDistanceOk(route.distanceMeters, input.targetMeters) &&
      loopShapeOk(refined.retraceRatio)
    ) {
      return route;
    }
  }

  if (!best) {
    throw new Error("OSRM loop produced no candidate");
  }
  return {
    ...best,
    attempts: 3,
    distanceSoftMiss: !loopDistanceOk(best.distanceMeters, input.targetMeters),
    warnings: loopDistanceOk(best.distanceMeters, input.targetMeters)
      ? []
      : ["Closest loop we found. Try Regenerate or Out-and-back."],
  };
}
