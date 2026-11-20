/**
 * Barrel rules (GDD: Barrel fusion, revised 2026-11-21). Pure rules, no Phaser.
 *
 * - Nothing merges by itself. Modules side by side stay separate.
 * - UPGRADE: a module card dropped onto the same module raises it one tier. Elements stop at
 *   config.slots.maxElementTier; grey modules have no cap; fittings and hybrids never upgrade.
 * - Placing a card on an empty slot puts it there; on a different module (or a maxed one) it is
 *   INSERTED and the modules on one side slide towards the nearest empty slot of the same chain.
 *   A full chain: the module there is replaced.
 * - MUTATION (a Favor of the Gods card): dropped on two different elements side by side, both at
 *   the max tier, they become their hybrid in one slot and the other slot empties. Hybrids are
 *   final: they never upgrade or mutate again.
 * - Moving a module only moves or swaps it.
 * - Neighbours are slots in the same chain: on a Double Barrel nothing mutates across the gap.
 */
import type { GameData, TieredModDef } from '../data/types';
import type { ModSlot, RunBuild } from './build';
import { chainOfSlot, type BarrelLayout } from './modPipeline';

/** What a placement, move or mutation did, step by step; `after` is the barrel after that step. */
export type FusionEvent =
  | { kind: 'place'; at: number; mod: ModSlot; after: Barrel }
  /** Put in at `at`; the modules between `at` and `gap` slid one slot towards `gap`. */
  | { kind: 'insert'; at: number; mod: ModSlot; gap: number; after: Barrel }
  /** A card dropped on the same module: `before` → `result` (one tier up). */
  | { kind: 'upgrade'; at: number; before: ModSlot; result: ModSlot; after: Barrel }
  | { kind: 'replace'; at: number; old: ModSlot; by: ModSlot; after: Barrel }
  /** Mutation: `a` (at `at`) and `b` (from `from`, now empty) became the hybrid `result` at `at`. */
  | { kind: 'mutate'; at: number; from: number; a: ModSlot; b: ModSlot; result: ModSlot; after: Barrel }
  | { kind: 'move'; from: number; to: number; after: Barrel };

type Barrel = (ModSlot | null)[];

/** Which neighbour a mutation dropped on a slot prefers when both would work. */
export type Side = 'left' | 'right';

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

/** Highest tier a module can reach by upgrades: elements cap, grey modules do not. */
export function maxTier(data: GameData, id: string): number {
  const def = modDef(data, id);
  if (def.family === 'element') return data.config.slots.maxElementTier;
  if (def.family === 'grey') return Infinity;
  return 1; // fittings and hybrids never upgrade
}

/** The tier a hybrid is made at (it never changes afterwards). */
export const hybridTier = (data: GameData): number => data.config.slots.maxElementTier;

/** Can a fresh card of `id` dropped on `slot` upgrade it? */
export function canUpgrade(data: GameData, slot: ModSlot | null, id: string): boolean {
  return !!slot && slot.id === id && slot.tier < maxTier(data, id);
}

/** The hybrid two different elements make, or null. */
export function hybridOf(data: GameData, aId: string, bId: string): string | null {
  const a = modDef(data, aId);
  const b = modDef(data, bId);
  if (a.family !== 'element' || b.family !== 'element' || a.element === b.element) return null;
  const h = data.barrelMods.find(
    (m) => m.family === 'hybrid' && m.parents.includes(a.element) && m.parents.includes(b.element),
  );
  return h?.id ?? null;
}

/** Can these two modules mutate? Different elements, both at the max tier, with a hybrid. */
export function canMutate(data: GameData, a: ModSlot | null, b: ModSlot | null): boolean {
  if (!a || !b) return false;
  const max = data.config.slots.maxElementTier;
  return a.tier >= max && b.tier >= max && hybridOf(data, a.id, b.id) !== null;
}

/** Slot indices next to `i` in the same chain: [left, right] (null at an edge or a chain gap). */
export function neighbours(layout: BarrelLayout, i: number): [number | null, number | null] {
  const left = i > 0 && chainOfSlot(layout, i - 1) === chainOfSlot(layout, i) ? i - 1 : null;
  const right = i + 1 < layout.slots && chainOfSlot(layout, i + 1) === chainOfSlot(layout, i) ? i + 1 : null;
  return [left, right];
}

/** Slots `i` shares a chain with: [start, end). */
function chainRange(layout: BarrelLayout, i: number): [number, number] {
  const start = chainOfSlot(layout, i) * layout.slotsPerChain;
  return [start, Math.min(start + layout.slotsPerChain, layout.slots)];
}

const snapshot = (build: RunBuild) => build.barrel.map((s) => (s ? { ...s } : null));

/**
 * Drop a module card on slot `i` (`open`: which slots are unlocked; locked ones are never used):
 * - the same module, below its max tier: it goes up one tier;
 * - an empty slot: it is put there;
 * - another module: it is inserted, the modules on one side slide towards the nearest empty slot
 *   of the same chain (right first), never across a locked slot; no room: it replaces the module.
 * Hybrids (workbench only; never cards) are placed at their fixed tier. Mutates `build`.
 */
export function place(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  mod: ModSlot,
  open: readonly boolean[] = build.barrel.map(() => true),
): FusionEvent[] {
  if (i < 0 || i >= build.barrel.length) throw new Error(`No barrel slot ${i}`);
  const target = build.barrel[i] ?? null;
  if (canUpgrade(data, target, mod.id)) {
    const before = { ...target! };
    const result = { id: before.id, tier: before.tier + 1 };
    build.barrel[i] = result;
    return [{ kind: 'upgrade', at: i, before, result, after: snapshot(build) }];
  }
  const tier = modDef(data, mod.id).family === 'hybrid' ? hybridTier(data) : mod.tier;
  const placed = { id: mod.id, tier };
  if (!target) {
    build.barrel[i] = placed;
    return [{ kind: 'place', at: i, mod: placed, after: snapshot(build) }];
  }
  const [start, end] = chainRange(layout, i);
  let gap = -1;
  // Search outwards through open slots only: a slide never crosses a locked slot.
  for (let j = i + 1; j < end && open[j] && gap === -1; j++) if (!build.barrel[j]) gap = j;
  for (let j = i - 1; j >= start && open[j] && gap === -1; j--) if (!build.barrel[j]) gap = j;
  if (gap === -1) {
    build.barrel[i] = placed;
    return [{ kind: 'replace', at: i, old: target, by: placed, after: snapshot(build) }];
  }
  const step = gap > i ? -1 : 1; // pull each module one slot towards the gap
  for (let j = gap; j !== i; j += step) build.barrel[j] = build.barrel[j + step] ?? null;
  build.barrel[i] = placed;
  return [{ kind: 'insert', at: i, mod: placed, gap, after: snapshot(build) }];
}

/**
 * The pair a Mutation dropped on slot `i` would fuse: `i` and the neighbour on `prefer`'s side if
 * that pair can mutate, else the other neighbour. Null if neither can.
 */
export function mutationPair(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  prefer: Side = 'right',
): [number, number] | null {
  const [l, r] = neighbours(layout, i);
  const order = prefer === 'left' ? [l, r] : [r, l];
  for (const j of order) {
    if (j !== null && canMutate(data, build.barrel[i] ?? null, build.barrel[j] ?? null)) return [i, j];
  }
  return null;
}

/** Every pair of neighbours that could mutate now (the Mutation card is only offered if any). */
export function mutationPairs(data: GameData, build: RunBuild, layout: BarrelLayout): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k + 1 < build.barrel.length; k++) {
    if (
      neighbours(layout, k)[1] === k + 1 &&
      canMutate(data, build.barrel[k] ?? null, build.barrel[k + 1] ?? null)
    )
      out.push([k, k + 1]);
  }
  return out;
}

/** Mutation dropped on slot `i`: the pair becomes its hybrid at `i`. Empty if nothing can mutate. */
export function mutate(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  prefer: Side = 'right',
): FusionEvent[] {
  const pair = mutationPair(data, build, layout, i, prefer);
  if (!pair) return [];
  const [at, from] = pair;
  const a = { ...build.barrel[at]! };
  const b = { ...build.barrel[from]! };
  const result = { id: hybridOf(data, a.id, b.id)!, tier: hybridTier(data) };
  build.barrel[at] = result;
  build.barrel[from] = null;
  return [{ kind: 'mutate', at, from, a, b, result, after: snapshot(build) }];
}

/** Drag a module from `from` to `to`: into an empty slot it moves, onto a module the two swap. */
export function moveModule(build: RunBuild, from: number, to: number): FusionEvent[] {
  if (from === to || !build.barrel[from]) return [];
  const tmp = build.barrel[to] ?? null;
  build.barrel[to] = build.barrel[from] ?? null;
  build.barrel[from] = tmp;
  return [{ kind: 'move', from, to, after: snapshot(build) }];
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
  open: readonly boolean[] = build.barrel.map(() => true),
): { events: FusionEvent[]; build: RunBuild } {
  const copy = copyBuild(build);
  return { events: place(data, copy, layout, i, mod, open), build: copy };
}

export function previewMutate(
  data: GameData,
  build: RunBuild,
  layout: BarrelLayout,
  i: number,
  prefer: Side = 'right',
): FusionEvent[] {
  return mutate(data, copyBuild(build), layout, i, prefer);
}

/** True if a fresh copy of `modId` could upgrade a module already in the barrel. */
export function upgradesOwned(data: GameData, build: RunBuild, modId: string): boolean {
  return build.barrel.some((s) => canUpgrade(data, s, modId));
}
