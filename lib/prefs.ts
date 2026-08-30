import { ACTIVITY_DEFAULTS } from "@/lib/activity";
import type { Units } from "@/lib/format";
import type { Activity, RouteShape } from "@/lib/generators/types";

const KEY = "rg:v1";

export interface PersistedPrefs {
  v: 1;
  activity: Activity;
  shape: RouteShape;
  targetMeters: number;
  units: Units;
  lastStart?: { lat: number; lng: number };
}

function isActivity(v: unknown): v is Activity {
  return v === "run" || v === "bike";
}

function isShape(v: unknown): v is RouteShape {
  return v === "loop" || v === "out_and_back";
}

function isUnits(v: unknown): v is Units {
  return v === "km" || v === "mi";
}

export function loadPrefs(): PersistedPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedPrefs>;
    if (parsed.v !== 1) return null;
    if (!isActivity(parsed.activity) || !isShape(parsed.shape) || !isUnits(parsed.units)) {
      return null;
    }
    if (typeof parsed.targetMeters !== "number" || !Number.isFinite(parsed.targetMeters)) {
      return null;
    }
    const limits = ACTIVITY_DEFAULTS[parsed.activity];
    const targetMeters = Math.min(
      limits.maxMeters,
      Math.max(limits.minMeters, parsed.targetMeters),
    );
    const lastStart =
      parsed.lastStart &&
      typeof parsed.lastStart.lat === "number" &&
      typeof parsed.lastStart.lng === "number"
        ? parsed.lastStart
        : undefined;
    return {
      v: 1,
      activity: parsed.activity,
      shape: parsed.shape,
      targetMeters,
      units: parsed.units,
      lastStart,
    };
  } catch {
    return null;
  }
}

export function savePrefs(prefs: PersistedPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // quota / private mode
  }
}
