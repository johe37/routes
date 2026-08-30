import { bboxOf, destinationPoint } from "@/lib/geo/geodesic";
import type { GeneratedRoute, LonLat, RouteGenerator } from "@/lib/generators/types";
import { pointToPoint } from "@/lib/ors/client";
import { osrmOutAndBack } from "@/lib/osrm/street-out-and-back";
import { hasOrsKey } from "@/lib/routing/provider";

const ACCEPT_LOW = 0.88;
const ACCEPT_HIGH = 1.12;
const CHORD_FACTOR = 0.75;

function closeOutAndBack(outbound: LonLat[]): LonLat[] {
  const back = outbound.slice(0, -1).reverse();
  return [...outbound, ...back];
}

export const distanceOutAndBackGenerator: RouteGenerator = {
  id: "distance-out-and-back",
  criterion: "distance",
  shapes: ["out_and_back"],
  activities: ["run", "bike"],

  async generate(input) {
    if (!hasOrsKey()) return osrmOutAndBack(input);

    let best: GeneratedRoute | null = null;
    let bestDelta = Infinity;

    for (let attempt = 0; attempt < 3; attempt++) {
      const heading = (input.seed % 360) + 90 * attempt;
      const chord = (input.targetMeters / 2) * CHORD_FACTOR;
      const turnaround = destinationPoint(input.start, heading, chord);
      const ors = await pointToPoint({
        start: input.start,
        end: turnaround,
        activity: input.activity,
      });
      const coordinates = closeOutAndBack(ors.coordinates);
      const distanceMeters = ors.summary.distance * 2;
      const route: GeneratedRoute = {
        id: crypto.randomUUID(),
        geometry: { type: "LineString", coordinates },
        bbox: bboxOf(coordinates),
        distanceMeters,
        activity: input.activity,
        shape: "out_and_back",
        seed: input.seed,
        provider: "ors",
        attempts: attempt + 1,
        distanceSoftMiss: false,
        warnings: [],
      };
      const delta = Math.abs(distanceMeters - input.targetMeters);
      if (delta < bestDelta) {
        best = route;
        bestDelta = delta;
      }
      const ratio = distanceMeters / input.targetMeters;
      if (ratio >= ACCEPT_LOW && ratio <= ACCEPT_HIGH) {
        return route;
      }
    }

    if (!best) {
      throw new Error("out-and-back generator produced no candidate");
    }
    return {
      ...best,
      attempts: 3,
      distanceSoftMiss: true,
      warnings: ["Closest out-and-back we found. Try Regenerate or a loop."],
    };
  },
};
