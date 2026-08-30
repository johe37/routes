import type { LonLat } from "@/lib/generators/types";

const EARTH_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Destination from a lon/lat start, heading in degrees, distance in meters. */
export function destinationPoint(
  start: LonLat,
  headingDeg: number,
  distanceM: number,
): LonLat {
  const [lon, lat] = start;
  const δ = distanceM / EARTH_M;
  const θ = toRad(headingDeg);
  const φ1 = toRad(lat);
  const λ1 = toRad(lon);
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
  return [((toDeg(λ2) + 540) % 360) - 180, toDeg(φ2)];
}

export function haversineMeters(a: LonLat, b: LonLat): number {
  const φ1 = toRad(a[1]);
  const φ2 = toRad(b[1]);
  const Δφ = toRad(b[1] - a[1]);
  const Δλ = toRad(b[0] - a[0]);
  const s =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function pathLengthMeters(coords: LonLat[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversineMeters(coords[i - 1], coords[i]);
  }
  return d;
}

export function bboxOf(
  coords: LonLat[],
): [minLon: number, minLat: number, maxLon: number, maxLat: number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function stripElev(coord: number[]): LonLat {
  return [coord[0], coord[1]];
}
