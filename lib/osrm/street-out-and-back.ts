import { bboxOf, destinationPoint } from "@/lib/geo/geodesic";
import type { GenerateInput, GeneratedRoute, LonLat } from "@/lib/generators/types";
import { GenerateError } from "@/lib/http/errors";
import { osrmRoute, sleep } from "@/lib/osrm/client";

const ACCEPT_LOW = 0.88;
const ACCEPT_HIGH = 1.12;
const CHORD_FACTOR = 0.75;

function closeOutAndBack(outbound: LonLat[]): LonLat[] {
  const back = outbound.slice(0, -1).reverse();
  return [...outbound, ...back];
}

export async function osrmOutAndBack(
  input: GenerateInput,
): Promise<GeneratedRoute> {
  let best: GeneratedRoute | null = null;
  let bestDelta = Infinity;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1100);
    const heading = (input.seed % 360) + 90 * attempt;
    const chord = (input.targetMeters / 2) * CHORD_FACTOR;
    const turnaround = destinationPoint(input.start, heading, chord);
    let oneWay;
    try {
      oneWay = await osrmRoute([input.start, turnaround], input.activity);
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
    const coordinates = closeOutAndBack(oneWay.coordinates);
    const distanceMeters = oneWay.distanceMeters * 2;
    const route: GeneratedRoute = {
      id: crypto.randomUUID(),
      geometry: { type: "LineString", coordinates },
      bbox: bboxOf(coordinates),
      distanceMeters,
      activity: input.activity,
      shape: "out_and_back",
      seed: input.seed,
      provider: "osrm",
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
    if (ratio >= ACCEPT_LOW && ratio <= ACCEPT_HIGH) return route;
  }

  if (!best) {
    throw new Error("OSRM out-and-back produced no candidate");
  }
  return {
    ...best,
    attempts: 3,
    distanceSoftMiss: true,
    warnings: ["Closest out-and-back we found. Try Regenerate or a loop."],
  };
}
