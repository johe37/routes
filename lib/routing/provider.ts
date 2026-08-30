export function hasOrsKey(): boolean {
  return Boolean(process.env.ORS_API_KEY?.trim());
}
