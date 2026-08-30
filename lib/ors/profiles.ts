import type { Activity } from "@/lib/generators/types";

export interface OrsProfile {
  path: "foot-walking" | "cycling-regular";
  avoid: string[];
  weightings?: Record<string, number | { factor: number }>;
}

export function profileFor(activity: Activity): OrsProfile {
  if (activity === "bike") {
    return {
      path: "cycling-regular",
      avoid: ["ferries", "steps"],
      weightings: { steepness_difficulty: 1 },
    };
  }
  return {
    path: "foot-walking",
    avoid: ["ferries", "fords"],
    weightings: {
      green: { factor: 0.8 },
      quiet: { factor: 1.0 },
    },
  };
}

/** Ask a bit short: ORS round-trip usually overshoots. Later attempts shorten further. */
export function lengthFactors(
  activity: Activity,
  targetMeters: number,
): [number, number, number] {
  const table =
    activity === "run"
      ? targetMeters <= 6_000
        ? 0.92
        : 0.9
      : targetMeters <= 25_000
        ? 0.9
        : 0.88;
  return [table, 0.84, 0.76];
}

export function roundTripPoints(activity: Activity, targetMeters: number): number {
  if (activity === "run") return targetMeters <= 6_000 ? 3 : 4;
  return targetMeters <= 25_000 ? 3 : 4;
}
