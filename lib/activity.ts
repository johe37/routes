import type { Activity } from "@/lib/generators/types";

export const ACTIVITY_DEFAULTS: Record<
  Activity,
  {
    defaultMeters: number;
    minMeters: number;
    maxMeters: number;
    chipsMeters: readonly number[];
  }
> = {
  run: {
    defaultMeters: 5_000,
    minMeters: 1_000,
    maxMeters: 30_000,
    chipsMeters: [3_000, 5_000, 8_000, 10_000, 15_000],
  },
  bike: {
    defaultMeters: 20_000,
    minMeters: 5_000,
    maxMeters: 80_000,
    chipsMeters: [10_000, 20_000, 30_000, 40_000, 60_000],
  },
};

export const ACCENT: Record<Activity, string> = {
  run: "#ff4d3a",
  bike: "#0f9b8e",
};
