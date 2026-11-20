/**
 * Barrel fusion (GDD: Barrel fusion). Pure rules, no Phaser.
 *
 * - Tier = how many copies are fused into a module. No cap. A new card is tier 1.
 * - Fusing ADDS tiers: same module + same module → that module; element + a different element →
 *   their hybrid. A hybrid grows only from the same hybrid (its parent elements do not feed it).
 *   Grey modules only fuse with themselves. Fittings never fuse.
 * - Placing (dragging a card onto a slot): an empty slot takes it; on a filled slot it is inserted
 *   and the modules on one side slide towards the nearest empty slot. Matches that end up side by
 *   side merge at once, and keep merging (a cascade): same module first, then left before right.
 *   A full barrel half: a matching module is fed in place, anything else is replaced.
 * - Neighbours are slots in the same chain: on a Double Barrel nothing fuses across the gap.
 */
import type { GameData, TieredModDef } from '../data/types';
import type { ModSlot, RunBuild } from './build';
import { chainOfSlot, type BarrelLayout } from './modPipeline';

/** What a placement or move did, step by step; `after` is the barrel after that step (animation). */
export type FusionEvent =
  /** `a` (at `at`) and `b` (from `from`, now empty) became `result` at `at`. */
  | { kind: 'fuse'; at: number; from: number; a: ModSlot; b: ModSlot; result: ModSlot; after: Barrel }
  | { kind: 'replace'; at: number; old: ModSlot; by: ModSlot; after: Barrel }
  | { kind: 'place'; at: number; mod: ModSlot; after: Barrel }
  /** Put in at `at`; the modules between `at` and `gap` slid one slot towards `gap`. */
  | { kind: 'insert'; at: number; mod: ModSlot; gap: number; after: Barrel }
  | { kind: 'move'; from: number; to: number; after: Barrel };

type Barrel = (ModSlot | null)[];

/** Params that are counts: rounded after scaling (and never below their tier-1 value). */
const COUNT_PARAMS = new Set([
  'chains',
  'bullets',
  'bounces',
  'pierce',
  'shards',
  'maxStacks',
  'spreadTargets',
  'chillStacks',
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

/** Slots `i` shares a chain with, limited to the `open` (unlocked) slots: [start, end). */
function chainRange(layout: BarrelLayout, i: number, open: number): [number, number] {
  const start = chainOfSlot(layout, i) * layout.slotsPerChain;
  return [start, Math.min(start + layout.slotsPerChain, layout.slots, open)];
}

const snapshot = (build: RunBuild) => build.barrel.map((s) => (s ? { ...s } : null));

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
    events.push({
      kind: 'fuse',
      at: i,
      from: best.idx,
      a: cur,
      b: other,
      result: best.result,
      after: snapshot(build),
    });
  }
}

/**
 * Merge every pair of matching neighbours: the slot that changed first (`first`), then any other
 * pair left to right (a shift can bring two modules together), each with its own cascade.
 */
function settleAll(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  first: number[],
  events: FusionEvent[],
): void {
  for (const i of first) settle(data, build, layout, i, events);
  for (;;) {
    let found = -1;
    for (let k = 0; k + 1 < build.barrel.length && found === -1; k++) {
      const a = build.barrel[k];
      const b = build.barrel[k + 1];
      if (a && b && neighbours(layout, k)[1] === k + 1 && fuseResult(data, a, b)) found = k;
    }
    if (found === -1) return;
    settle(data, build, layout, found, events);
  }
}

/**
 * Drop a module on slot `i` (only the first `open` slots are usable):
 * - an empty slot: it is put there;
 * - a filled slot: it is INSERTED there, and the modules on one side slide one slot towards the
 *   nearest empty slot of the same chain (right first). It never upgrades by itself;
 * - a full chain: it feeds a matching module in place, or else replaces the one there.
 * Then every match that ends up side by side merges (with cascades). Mutates `build`.
 */
export function place(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  mod: ModSlot,
  open = build.barrel.length,
): FusionEvent[] {
  if (i < 0 || i >= build.barrel.length) throw new Error(`No barrel slot ${i}`);
  const events: FusionEvent[] = [];
  const placed = { id: mod.id, tier: mod.tier };
  const target = build.barrel[i];
  if (!target) {
    build.barrel[i] = placed;
    events.push({ kind: 'place', at: i, mod: placed, after: snapshot(build) });
  } else {
    const [start, end] = chainRange(layout, i, open);
    let gap = -1;
    for (let j = i + 1; j < end && gap === -1; j++) if (!build.barrel[j]) gap = j;
    for (let j = i - 1; j >= start && gap === -1; j--) if (!build.barrel[j]) gap = j;
    if (gap !== -1) {
      const step = gap > i ? -1 : 1; // pull each module one slot towards the gap
      for (let j = gap; j !== i; j += step) build.barrel[j] = build.barrel[j + step] ?? null;
      build.barrel[i] = placed;
      events.push({ kind: 'insert', at: i, mod: placed, gap, after: snapshot(build) });
    } else {
      const fed = fuseResult(data, target, placed);
      build.barrel[i] = fed ?? placed;
      events.push(
        fed
          ? { kind: 'fuse', at: i, from: i, a: target, b: placed, result: fed, after: snapshot(build) }
          : { kind: 'replace', at: i, old: target, by: placed, after: snapshot(build) },
      );
    }
  }
  settleAll(data, build, layout, [i], events);
  return events;
}

/**
 * Drag a module from slot `from` to slot `to`: into an empty slot it moves, onto a module the two
 * swap. Then matches that end up side by side merge.
 */
export function moveModule(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  from: number,
  to: number,
): FusionEvent[] {
  const events: FusionEvent[] = [];
  if (from === to || !build.barrel[from]) return events;
  const tmp = build.barrel[to] ?? null;
  build.barrel[to] = build.barrel[from] ?? null;
  build.barrel[from] = tmp;
  events.push({ kind: 'move', from, to, after: snapshot(build) });
  settleAll(data, build, layout, [to, from], events);
  return events;
}

const copyBuild = (b: RunBuild): RunBuild => ({
  barrel: b.barrel.map((s) => (s ? { ...s } : null)),
  muzzle: b.muzzle.map((s) => (s ? { ...s } : null)),
  coreTier: b.coreTier,
});

/** What placing would do, without changing `build` (level-up screen preview). */
export function previewPlace(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  mod: ModSlot,
  open = build.barrel.length,
): { events: FusionEvent[]; build: RunBuild } {
  const copy = copyBuild(build);
  return { events: place(data, copy, layout, i, mod, open), build: copy };
}

export function previewMove(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  from: number,
  to: number,
): { events: FusionEvent[]; build: RunBuild } {
  const copy = copyBuild(build);
  return { events: moveModule(data, copy, layout, from, to), build: copy };
}

/** True if a fresh tier-1 copy of `modId` would fuse with any module already in the barrel. */
export function fusesWithOwned(data: GameData, build: RunBuild, modId: string): boolean {
  return build.barrel.some((s) => s !== null && fuseResult(data, s, { id: modId, tier: 1 }) !== null);
}
