export type Units = "km" | "mi";

export const METERS_PER_MILE = 1609.344;

export function metersToDisplay(meters: number, units: Units): number {
  return units === "mi" ? meters / METERS_PER_MILE : meters / 1000;
}

export function displayToMeters(value: number, units: Units): number {
  return units === "mi" ? value * METERS_PER_MILE : value * 1000;
}

export function formatDistance(meters: number, units: Units): string {
  const n = metersToDisplay(meters, units);
  const digits = n >= 10 ? 0 : 1;
  return `${n.toFixed(digits)} ${units}`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `~${h} h ${m} min` : `~${h} h`;
}

export function formatChip(meters: number, units: Units): string {
  const n = metersToDisplay(meters, units);
  const rounded = units === "mi" ? n.toFixed(n >= 10 ? 0 : 1) : String(Math.round(n));
  return rounded;
}
