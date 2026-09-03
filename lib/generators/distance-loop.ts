import {
  loopCandidateScore,
  loopDistanceOk,
  loopShapeOk,
  refineLoopGeometry,
  toLoopRoute,
} from "@/lib/geo/loop-shape";
import type { GeneratedRoute, RouteGenerator } from "@/lib/generators/types";
import { roundTrip } from "@/lib/ors/client";
import { lengthFactors, roundTripPoints } from "@/lib/ors/profiles";
import { osrmLoop } from "@/lib/osrm/street-loop";
import { hasOrsKey } from "@/lib/routing/provider";

export const distanceLoopGenerator: RouteGenerator = {
  id: "distance-loop",
  criterion: "distance",
  shapes: ["loop"],
  activities: ["run", "bike"],

  async generate(input) {
    if (!hasOrsKey()) return osrmLoop(input);

    const factors = lengthFactors(input.activity, input.targetMeters);
    const points = roundTripPoints(input.activity, input.targetMeters);
    let best: GeneratedRoute | null = null;
    let bestScore = Infinity;

    for (let attempt = 0; attempt < 3; attempt++) {
      const reqLength = Math.round(input.targetMeters * factors[attempt]);
      const seed = input.seed + attempt;
      const ors = await roundTrip({
        start: input.start,
        activity: input.activity,
        lengthMeters: reqLength,
        points,
        seed,
      });
      const refined = refineLoopGeometry(ors.coordinates, ors.summary.distance);
      if (!refined) continue;
      const route = toLoopRoute(
        {
          id: crypto.randomUUID(),
          activity: input.activity,
          shape: "loop",
          seed,
          provider: "ors",
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
      throw new Error("loop generator produced no candidate");
    }
    return {
      ...best,
      attempts: 3,
      distanceSoftMiss: !loopDistanceOk(best.distanceMeters, input.targetMeters),
      warnings: loopDistanceOk(best.distanceMeters, input.targetMeters)
        ? []
        : ["Closest loop we found. Try Regenerate or Out-and-back."],
    };
  },
};
