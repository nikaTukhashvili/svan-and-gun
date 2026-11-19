/**
 * Damage formula (GDD: Player character):
 *   final = raw - defence, at least minDamage.
 * Defence applies to bullet hits, shards, ricochets, lightning and contact hits.
 * Status ticks and explosions skip it (callers pass defence 0).
 */
export function applyDefence(raw: number, defence: number, minDamage: number): number {
  return Math.max(minDamage, raw - defence);
}
