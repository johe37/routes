import type { Activity } from "@/lib/generators/types";

/** Display-only moving speed. Not fitness-adjusted. */
export const PACE_KMH: Record<Activity, number> = {
  run: 10,
  bike: 18,
};

export function estimateDurationSeconds(
  distanceMeters: number,
  activity: Activity,
): number {
  const kmh = PACE_KMH[activity];
  return (distanceMeters / 1000 / kmh) * 3600;
}
