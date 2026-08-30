import { bboxOf } from "@/lib/geo/geodesic";
import type { GeneratedRoute, RouteGenerator } from "@/lib/generators/types";
import { roundTrip } from "@/lib/ors/client";
import { lengthFactors, roundTripPoints } from "@/lib/ors/profiles";
import { osrmLoop } from "@/lib/osrm/street-loop";
import { hasOrsKey } from "@/lib/routing/provider";

const ACCEPT_LOW = 0.88;
const ACCEPT_HIGH = 1.12;

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
    let bestDelta = Infinity;

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
      const route: GeneratedRoute = {
        id: crypto.randomUUID(),
        geometry: { type: "LineString", coordinates: ors.coordinates },
        bbox: ors.bbox ?? bboxOf(ors.coordinates),
        distanceMeters: ors.summary.distance,
        activity: input.activity,
        shape: "loop",
        seed,
        provider: "ors",
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
      if (ratio >= ACCEPT_LOW && ratio <= ACCEPT_HIGH) {
        return route;
      }
    }

    if (!best) {
      throw new Error("loop generator produced no candidate");
    }
    return {
      ...best,
      attempts: 3,
      distanceSoftMiss: true,
      warnings: [
        "Closest loop we found. Try Regenerate or Out-and-back.",
      ],
    };
  },
};
