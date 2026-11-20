/**
 * Barrel fusion (GDD: Barrel fusion). Pure rules, no Phaser.
 *
 * - Tier = how many copies are fused into a module. No cap. A new card is tier 1.
 * - Fusing ADDS tiers: same module + same module → that module; element + a different element →
 *   their hybrid; hybrid + one of its parent elements (or the same hybrid) → the hybrid.
 *   Grey modules only fuse with themselves. Fittings never fuse.
 * - Placing into a slot: onto a compatible module, or into an empty slot next to one, fuses into
 *   that slot. The result keeps fusing with compatible neighbours (a cascade): same module
 *   first, then left before right. Onto an incompatible module = replace it.
 * - Neighbours are slots in the same chain: on a Double Barrel nothing fuses across the gap.
 */
import type { GameData, TieredModDef } from '../data/types';
import type { ModSlot, RunBuild } from './build';
import { chainOfSlot, type BarrelLayout } from './modPipeline';

export type FusionEvent =
  /** `a` (at `at`) and `b` (from `from`, which is now empty) became `result` at `at`. */
  | { kind: 'fuse'; at: number; from: number; a: ModSlot; b: ModSlot; result: ModSlot }
  | { kind: 'replace'; at: number; old: ModSlot; by: ModSlot }
  | { kind: 'place'; at: number; mod: ModSlot };

/** Params that are counts: rounded after scaling (and never below their tier-1 value). */
const COUNT_PARAMS = new Set([
  'chains',
  'bullets',
  'bounces',
  'pierce',
  'shards',
  'maxStacks',
  'spreadTargets',
]);

export function modDef(data: GameData, id: string): GameData['barrelMods'][number] {
  const def = data.barrelMods.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown barrel module ${id}`);
  return def;
}

/** A tiered module's numbers at a tier: base + perTier × (tier − 1). */
export function tierParams<D extends TieredModDef>(def: D, tier: number): D['base'] {
  const base = def.base as Record<string, number>;
  const per = def.perTier as Record<string, number>;
  const out: Record<string, number> = {};
  for (const k of Object.keys(base)) {
    const v = base[k]! + per[k]! * (tier - 1);
    out[k] = COUNT_PARAMS.has(k) ? Math.max(base[k]!, Math.round(v)) : v;
  }
  return out as D['base'];
}

/** What `a` and `b` fuse into, or null if they do not fuse. */
export function fuseResult(data: GameData, a: ModSlot, b: ModSlot): ModSlot | null {
  const da = modDef(data, a.id);
  const db = modDef(data, b.id);
  if (da.family === 'fitting' || db.family === 'fitting') return null;
  const tier = a.tier + b.tier;
  if (da.id === db.id) return { id: da.id, tier };
  // A hybrid absorbs one of its parent elements.
  if (da.family === 'hybrid' && db.family === 'element' && da.parents.includes(db.element))
    return { id: da.id, tier };
  if (db.family === 'hybrid' && da.family === 'element' && db.parents.includes(da.element))
    return { id: db.id, tier };
  // Two different elements make their hybrid.
  if (da.family === 'element' && db.family === 'element') {
    const h = data.barrelMods.find(
      (m) => m.family === 'hybrid' && m.parents.includes(da.element) && m.parents.includes(db.element),
    );
    return h ? { id: h.id, tier } : null;
  }
  return null;
}

/** Slot indices next to `i` in the same chain: [left, right] (null at an edge or a chain gap). */
export function neighbours(layout: BarrelLayout, i: number): [number | null, number | null] {
  const left = i > 0 && chainOfSlot(layout, i - 1) === chainOfSlot(layout, i) ? i - 1 : null;
  const right = i + 1 < layout.slots && chainOfSlot(layout, i + 1) === chainOfSlot(layout, i) ? i + 1 : null;
  return [left, right];
}

/** Fuse the module at `i` with compatible neighbours until none is left (the cascade). */
function settle(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  events: FusionEvent[],
): void {
  for (;;) {
    const cur = build.barrel[i];
    if (!cur) return;
    let best: { idx: number; result: ModSlot; same: boolean } | null = null;
    for (const idx of neighbours(layout, i)) {
      if (idx === null) continue;
      const other = build.barrel[idx];
      if (!other) continue;
      const result = fuseResult(data, cur, other);
      if (!result) continue;
      const same = other.id === cur.id;
      if (!best || (same && !best.same)) best = { idx, result, same }; // left first unless right is the same module
    }
    if (!best) return;
    const other = build.barrel[best.idx]!;
    build.barrel[i] = best.result;
    build.barrel[best.idx] = null;
    events.push({ kind: 'fuse', at: i, from: best.idx, a: cur, b: other, result: best.result });
  }
}

/** Place a module in slot `i` (fuse, replace or put), then cascade. Mutates `build`. */
export function place(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  mod: ModSlot,
): FusionEvent[] {
  if (i < 0 || i >= build.barrel.length) throw new Error(`No barrel slot ${i}`);
  const events: FusionEvent[] = [];
  const target = build.barrel[i];
  const placed = { id: mod.id, tier: mod.tier };
  if (target) {
    const result = fuseResult(data, target, placed);
    if (result) {
      build.barrel[i] = result;
      events.push({ kind: 'fuse', at: i, from: i, a: target, b: placed, result });
    } else {
      build.barrel[i] = placed;
      events.push({ kind: 'replace', at: i, old: target, by: placed });
    }
  } else {
    build.barrel[i] = placed;
    events.push({ kind: 'place', at: i, mod: placed });
  }
  settle(data, build, layout, i, events);
  return events;
}

/** Swap two slots, then let both settle (a swap can bring matches together). */
export function swapAndFuse(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  a: number,
  b: number,
): FusionEvent[] {
  const tmp = build.barrel[a] ?? null;
  build.barrel[a] = build.barrel[b] ?? null;
  build.barrel[b] = tmp;
  const events: FusionEvent[] = [];
  settle(data, build, layout, a, events);
  settle(data, build, layout, b, events);
  return events;
}

const copyBuild = (b: RunBuild): RunBuild => ({
  barrel: b.barrel.map((s) => (s ? { ...s } : null)),
  coreTier: b.coreTier,
});

/** What placing would do, without changing `build` (level-up screen preview). */
export function previewPlace(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  mod: ModSlot,
): { events: FusionEvent[]; build: RunBuild } {
  const copy = copyBuild(build);
  return { events: place(data, copy, layout, i, mod), build: copy };
}

export function previewSwap(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  a: number,
  b: number,
): { events: FusionEvent[]; build: RunBuild } {
  const copy = copyBuild(build);
  return { events: swapAndFuse(data, copy, layout, a, b), build: copy };
}

/** True if a fresh tier-1 copy of `modId` would fuse with any module already in the barrel. */
export function fusesWithOwned(data: GameData, build: RunBuild, modId: string): boolean {
  return build.barrel.some((s) => s !== null && fuseResult(data, s, { id: modId, tier: 1 }) !== null);
}
