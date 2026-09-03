import {
  bboxOf,
  haversineMeters,
  pathLengthMeters,
} from "@/lib/geo/geodesic";
import type { GeneratedRoute, LonLat } from "@/lib/generators/types";

/** Snap geometry to this grid when deciding "same place / same edge". */
const GRID_METERS = 20;
/** Excursions whose unique length is this share of path length are out-and-backs. */
const SKINNY_UNIQUE_RATIO = 0.75;
/** Always drop wiggles shorter than this, even if they look like a tiny loop. */
const ALWAYS_PRUNE_METERS = 55;

export const LOOP_ACCEPT_LOW = 0.88;
export const LOOP_ACCEPT_HIGH = 1.12;
/** Double-traveled share of a loop we still treat as a loop, not a lollipop. */
export const LOOP_MAX_RETRACE = 0.12;

function cellKey(p: LonLat, gridMeters: number): string {
  const latM = 111_320;
  const lonM = Math.max(latM * Math.cos((p[1] * Math.PI) / 180), 1e-6);
  const x = Math.round((p[0] * lonM) / gridMeters);
  const y = Math.round((p[1] * latM) / gridMeters);
  return `${x}:${y}`;
}

function undirectedCellEdge(
  a: LonLat,
  b: LonLat,
  gridMeters: number,
): string | null {
  const ca = cellKey(a, gridMeters);
  const cb = cellKey(b, gridMeters);
  if (ca === cb) return null;
  return ca < cb ? `${ca}|${cb}` : `${cb}|${ca}`;
}

export function uniquePathLengthMeters(
  coords: LonLat[],
  gridMeters = GRID_METERS,
): number {
  const seen = new Set<string>();
  let unique = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const key = undirectedCellEdge(a, b, gridMeters);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique += haversineMeters(a, b);
  }
  return unique;
}

/** 0 = every meter is unique (true loop). ~0.5 = pure out-and-back. */
export function retraceRatio(coords: LonLat[]): number {
  const total = pathLengthMeters(coords);
  if (total <= 0) return 1;
  return Math.max(0, 1 - uniquePathLengthMeters(coords) / total);
}

function isSkinnyExcursion(pts: LonLat[]): boolean {
  const total = pathLengthMeters(pts);
  if (total < ALWAYS_PRUNE_METERS) return true;
  const unique = uniquePathLengthMeters(pts);
  if (unique <= 0) return true;
  return unique / total <= SKINNY_UNIQUE_RATIO;
}

/**
 * Drop cul-de-sacs and other skinny out-and-backs that leave the loop
 * and immediately retrace. Leaves unavoidable stems (start on a dead-end
 * with a real loop beyond) alone — those are not skinny as a whole.
 */
export function pruneSkinnyOutAndBacks(coords: LonLat[]): LonLat[] {
  if (coords.length < 3) return coords.slice();

  const output: LonLat[] = [];
  const occurrences = new Map<string, number[]>();

  const push = (p: LonLat, cell: string) => {
    const list = occurrences.get(cell);
    if (list) list.push(output.length);
    else occurrences.set(cell, [output.length]);
    output.push(p);
  };

  const truncateTo = (keepLast: number) => {
    while (output.length > keepLast + 1) {
      const idx = output.length - 1;
      const cell = cellKey(output[idx], GRID_METERS);
      output.pop();
      const list = occurrences.get(cell);
      if (!list?.length) continue;
      if (list[list.length - 1] === idx) list.pop();
      if (list.length === 0) occurrences.delete(cell);
    }
  };

  for (const p of coords) {
    const cell = cellKey(p, GRID_METERS);
    if (output.length && cellKey(output[output.length - 1], GRID_METERS) === cell) {
      continue;
    }

    const prev = occurrences.get(cell);
    if (prev?.length) {
      const j = prev[prev.length - 1];
      // Never strip from the start pin — a dead-end driveway or lollipop
      // stem that the runner must use is not a spurious mid-loop spur.
      if (j > 0) {
        const excursion = output.slice(j);
        excursion.push(p);
        if (isSkinnyExcursion(excursion)) {
          truncateTo(j);
          continue;
        }
      }
    }

    push(p, cell);
  }

  if (
    output.length >= 2 &&
    haversineMeters(output[0], output[output.length - 1]) > GRID_METERS
  ) {
    output.push(output[0]);
  }

  return output;
}

export function refineLoopGeometry(
  coordinates: LonLat[],
  routedDistanceMeters: number,
): {
  coordinates: LonLat[];
  distanceMeters: number;
  retraceRatio: number;
  bbox: [number, number, number, number];
} | null {
  if (coordinates.length < 4) return null;
  const pruned = pruneSkinnyOutAndBacks(coordinates);
  if (pruned.length < 4) return null;
  const before = pathLengthMeters(coordinates);
  const after = pathLengthMeters(pruned);
  if (after < 80) return null;
  const distanceMeters =
    before > 0 ? routedDistanceMeters * (after / before) : routedDistanceMeters;
  return {
    coordinates: pruned,
    distanceMeters,
    retraceRatio: retraceRatio(pruned),
    bbox: bboxOf(pruned),
  };
}

export function loopDistanceOk(
  distanceMeters: number,
  targetMeters: number,
): boolean {
  const ratio = distanceMeters / targetMeters;
  return ratio >= LOOP_ACCEPT_LOW && ratio <= LOOP_ACCEPT_HIGH;
}

export function loopShapeOk(retrace: number): boolean {
  return retrace <= LOOP_MAX_RETRACE;
}

/** Lower is better. Retracing a loop counts more than a modest distance miss. */
export function loopCandidateScore(
  distanceMeters: number,
  targetMeters: number,
  retrace: number,
): number {
  const relErr = Math.abs(distanceMeters - targetMeters) / targetMeters;
  return retrace * 1.4 + relErr;
}

export function toLoopRoute(
  base: Omit<
    GeneratedRoute,
    "geometry" | "bbox" | "distanceMeters" | "distanceSoftMiss" | "warnings"
  > & { warnings?: string[] },
  refined: NonNullable<ReturnType<typeof refineLoopGeometry>>,
): GeneratedRoute {
  return {
    ...base,
    geometry: { type: "LineString", coordinates: refined.coordinates },
    bbox: refined.bbox,
    distanceMeters: refined.distanceMeters,
    distanceSoftMiss: false,
    warnings: base.warnings ?? [],
  };
}
