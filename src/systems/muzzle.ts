/**
 * Muzzle (GDD: Muzzle): a few slots at the end of the barrel. Each piece shapes the shot with an
 * upside and a downside, and every fitted piece applies to every shot (they stack).
 *
 * - A piece's numbers: value(level) = base + perLevel × (level − 1); bullets are rounded. No cap.
 * - Dropping a muzzle card on the SAME piece raises its level; on an empty slot it is fitted at
 *   level 1; on a different piece it replaces it. Muzzle pieces never fuse.
 * - Across pieces the stats add (bullets, spread degrees, percentages). The totals become weapon
 *   multipliers with floors from muzzles.json, so stacked downsides never break the gun.
 */
import type { GameData, MuzzlePieceDef, MuzzleStats } from '../data/types';

export interface MuzzleSlot {
  id: string;
  /** 1 = freshly fitted. No cap. */
  level: number;
}

export type MuzzleEvent =
  | { kind: 'fit'; at: number; piece: MuzzleSlot }
  | { kind: 'upgrade'; at: number; piece: MuzzleSlot }
  | { kind: 'replace'; at: number; old: MuzzleSlot; by: MuzzleSlot };

export const MUZZLE_STATS = [
  'bullets',
  'spreadDeg',
  'spreadPct',
  'rangePct',
  'damagePct',
  'fireRatePct',
  'bulletSpeedPct',
  'critChance',
] as const satisfies readonly (keyof MuzzleStats)[];
export type MuzzleStatKey = (typeof MUZZLE_STATS)[number];
export type MuzzleTotals = Record<MuzzleStatKey, number>;

export const noMuzzleStats = (): MuzzleTotals =>
  Object.fromEntries(MUZZLE_STATS.map((k) => [k, 0])) as MuzzleTotals;

export function muzzleDef(data: GameData, id: string): MuzzlePieceDef {
  const def = data.muzzles.pieces.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown muzzle piece "${id}"`);
  return def;
}

export const isMuzzleId = (data: GameData, id: string): boolean =>
  data.muzzles.pieces.some((m) => m.id === id);

/** A piece's numbers at a level. */
export function muzzleStats(def: MuzzlePieceDef, level: number): MuzzleTotals {
  const out = noMuzzleStats();
  const steps = Math.max(1, level) - 1;
  for (const k of MUZZLE_STATS) {
    const v = (def.base[k] ?? 0) + (def.perLevel[k] ?? 0) * steps;
    out[k] = k === 'bullets' ? Math.round(v) : v;
  }
  return out;
}

/** Every fitted piece added up. */
export function totalMuzzle(data: GameData, muzzle: readonly (MuzzleSlot | null)[]): MuzzleTotals {
  const out = noMuzzleStats();
  for (const slot of muzzle) {
    if (!slot) continue;
    const s = muzzleStats(muzzleDef(data, slot.id), slot.level);
    for (const k of MUZZLE_STATS) out[k] += s[k];
  }
  return out;
}

/** Is this value good for the player? (More bullets, less spread, higher percentages.) */
export function isUpside(key: MuzzleStatKey, value: number): boolean {
  return key === 'spreadDeg' || key === 'spreadPct' ? value < 0 : value > 0;
}

/** What dropping a muzzle card with `id` on slot `i` does. Pure. */
export function previewMuzzle(muzzle: readonly (MuzzleSlot | null)[], i: number, id: string): MuzzleEvent {
  if (i < 0 || i >= muzzle.length) throw new Error(`No muzzle slot ${i}`);
  const cur = muzzle[i];
  if (!cur) return { kind: 'fit', at: i, piece: { id, level: 1 } };
  if (cur.id === id) return { kind: 'upgrade', at: i, piece: { id, level: cur.level + 1 } };
  return { kind: 'replace', at: i, old: { ...cur }, by: { id, level: 1 } };
}

/** Drop a muzzle card on slot `i`: fit, upgrade (same piece) or replace. */
export function placeMuzzle(muzzle: (MuzzleSlot | null)[], i: number, id: string): MuzzleEvent {
  const ev = previewMuzzle(muzzle, i, id);
  muzzle[i] = ev.kind === 'replace' ? { ...ev.by } : { ...ev.piece };
  return ev;
}

/** Drag a fitted piece to another muzzle slot: move or swap. Never merges. */
export function moveMuzzle(muzzle: (MuzzleSlot | null)[], from: number, to: number): void {
  if (from === to) return;
  const a = muzzle[from] ?? null;
  muzzle[from] = muzzle[to] ?? null;
  muzzle[to] = a;
}

/** The muzzle's effect on the gun, as multipliers with the floors applied. */
export interface MuzzleWeaponMods {
  extraBullets: number;
  spreadAddDeg: number;
  spreadMult: number;
  damageMult: number;
  fireRateMult: number;
  rangeMult: number;
  speedMult: number;
  critChance: number;
  /** Extra bullets fan out over at least this many degrees (Long Gun has no spread). */
  minFanDeg: number;
}

export function muzzleWeaponMods(data: GameData, t: MuzzleTotals): MuzzleWeaponMods {
  const f = data.muzzles.floors;
  return {
    extraBullets: Math.max(0, t.bullets),
    spreadAddDeg: t.spreadDeg,
    spreadMult: Math.max(0, 1 + t.spreadPct),
    damageMult: Math.max(f.damage, 1 + t.damagePct),
    fireRateMult: Math.max(f.fireRate, 1 + t.fireRatePct),
    rangeMult: Math.max(f.range, 1 + t.rangePct),
    speedMult: Math.max(f.bulletSpeed, 1 + t.bulletSpeedPct),
    critChance: Math.min(1, Math.max(0, t.critChance)),
    minFanDeg: t.bullets > 0 ? data.muzzles.minFanDeg : 0,
  };
}
