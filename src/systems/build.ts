/**
 * The gun build for one run: the barrel (fusing modules, GDD: Barrel fusion), the muzzle
 * (GDD: Muzzle) and Core Tier, plus
 * the level-up card draw that changes it. Support perks and run stat perks live on the run.
 *
 * CardDraw builds the list of VALID cards first and only then picks (TDD: CardDraw algorithm):
 * - module cards are always valid (tiers have no cap; a full barrel can still fuse or replace);
 * - a module that could upgrade one already in the barrel weighs more (cards.upgradesOwnedMult);
 * - Mutation only when two maxed, different elements sit side by side;
 * - Core Tier only below the max tier; a support perk only below its max level;
 * - Tinker only when the barrel has a module that can go up a tier;
 * - muzzle cards are always valid (same piece = upgrade, else fit or replace).
 */
import type { RNG } from '../core/rng';
import type { CardType, GameData, GunDef, ModFamily, Rarity, StatId, StatMode } from '../data/types';
import {
  maxTier,
  moveModule,
  mutate,
  mutationPairs,
  place,
  upgradesOwned,
  type FusionEvent,
  type Side,
} from './fusion';
import { chainOfSlot, layoutOf, type BarrelLayout } from './modPipeline';
import { placeMuzzle, type MuzzleSlot } from './muzzle';
import { addBonus, type StatBonuses } from './stats';

export interface ModSlot {
  id: string;
  /** Copies fused in (1 = a fresh module). No cap. */
  tier: number;
}

export interface RunBuild {
  barrel: (ModSlot | null)[];
  /** Muzzle slots at the end of the barrel; every fitted piece applies to every shot. */
  muzzle: (MuzzleSlot | null)[];
  coreTier: number;
}

/** Support perk id → level taken (1..its number of levels). */
export type SupportLevels = Record<string, number>;

export type Card =
  /** A fresh tier-1 module; the player picks the slot (place / fuse / replace). */
  /** `upgrades`: dropping it on a module already in the barrel would upgrade that one. */
  | { type: 'module'; modId: string; family: ModFamily; upgrades: boolean }
  /** Mutation: drag onto two maxed, different elements side by side to make their hybrid. */
  | { type: 'mutation' }
  | { type: 'coreTier'; toTier: number }
  | { type: 'runStat'; cardId: string; rarity: Rarity; stat: StatId; mode: StatMode; value: number }
  | { type: 'supportPerk'; perkId: string; toLevel: number }
  /** A muzzle piece; the player picks the muzzle slot. `owned`: the gun already has one (can upgrade). */
  | { type: 'muzzle'; muzzleId: string; owned: boolean }
  /** Tinker: random +1 tiers for modules in the barrel, chosen when drawn (a surprise). */
  | { type: 'randomUpgrade'; upgrades: { slot: number; modId: string }[] };

/** What a picked card changes on the run. */
export interface BuildTarget {
  build: RunBuild;
  runBonuses: StatBonuses;
  support: SupportLevels;
}

export function createBuild(barrelSlots = 8, muzzleSlots = 3): RunBuild {
  return {
    barrel: Array.from({ length: barrelSlots }, () => null),
    muzzle: Array.from({ length: muzzleSlots }, () => null),
    coreTier: 1,
  };
}

export function buildForGun(gun: GunDef): RunBuild {
  return createBuild(gun.barrel.slots, gun.muzzleSlots);
}

/** Support perks the gun starts every run with (Double Barrel: Grenade Mag level 1). */
export function startingSupport(gun: GunDef): SupportLevels {
  return { ...(gun.startingSupport ?? {}) };
}

/**
 * The player level each barrel slot opens at. config.slots.barrelUnlockLevels lists the levels in
 * unlock ORDER (entries past its end use the last one). The order:
 * - a crit chamber (the gun's twist) opens first, so the twist works from the start;
 * - then the halves of a split barrel take turns (left 1, right 1, left 2, right 2, ...), so a
 *   Double Barrel never fires every other shot through a fully locked half.
 */
export function slotUnlockLevels(data: GameData, layout: BarrelLayout): number[] {
  const levels = data.config.slots.barrelUnlockLevels;
  const at = (rank: number) => levels[rank] ?? levels[levels.length - 1] ?? 1;
  const crit = layout.critChamberMult > 0 ? layout.slots - 1 : -1;
  const out: number[] = [];
  for (let i = 0; i < layout.slots; i++) {
    if (i === crit) {
      out.push(at(0));
      continue;
    }
    const rank = (i % layout.slotsPerChain) * layout.chains + chainOfSlot(layout, i) + (crit >= 0 ? 1 : 0);
    out.push(at(rank));
  }
  return out;
}

/** Which barrel slots are open at this player level. */
export function openSlots(data: GameData, layout: BarrelLayout, level: number): boolean[] {
  return slotUnlockLevels(data, layout).map((l) => level >= l);
}

/** Every slot open (Training Ground workbench, tests). */
export const allOpen = (slots: number): boolean[] => Array.from({ length: slots }, () => true);

/** The card's type for weights and paths (module cards by family). */
export function cardType(card: Card): CardType {
  switch (card.type) {
    case 'module':
      if (card.family === 'hybrid') throw new Error('Hybrids are never cards');
      return card.family;
    case 'randomUpgrade':
      return 'tinker';
    case 'mutation':
    case 'coreTier':
    case 'runStat':
    case 'supportPerk':
    case 'muzzle':
      return card.type;
  }
}

/** Which level-up path a card belongs to (cards.json > paths). */
export function pathOf(data: GameData, card: Card): string {
  const type = cardType(card);
  const path = data.cards.paths.find((p) => p.types.includes(type));
  if (!path) throw new Error(`Card type "${type}" is in no path`);
  return path.id;
}

/** A stable key: two cards with the same key are the same offer. */
export function cardKey(c: Card): string {
  switch (c.type) {
    case 'module':
      return `mod:${c.modId}`;
    case 'coreTier':
      return 'core';
    case 'runStat':
      return `stat:${c.cardId}`;
    case 'supportPerk':
      return `support:${c.perkId}`;
    case 'muzzle':
      return `muzzle:${c.muzzleId}`;
    case 'mutation':
      return 'mutation';
    case 'randomUpgrade':
      return 'tinker';
  }
}

/**
 * Every valid module / Core Tier / support perk card, with its weight. typeWeights are per TYPE
 * and shared by that type's cards. Hybrids are never offered: they are only made by a Mutation.
 * `gun` sets the barrel layout (Double Barrel halves) for the Mutation check.
 */
export function candidateCards(
  data: GameData,
  build: RunBuild,
  support: SupportLevels = {},
  gun: GunDef | null = null,
): [Card, number][] {
  const w = data.cards.typeWeights;
  const out: [Card, number][] = [];
  for (const family of ['element', 'grey', 'fitting'] as const) {
    const defs = data.barrelMods.filter((m) => m.family === family);
    for (const def of defs) {
      const upgrades = upgradesOwned(data, build, def.id);
      const weight = (w[family] / defs.length) * (upgrades ? data.cards.upgradesOwnedMult : 1);
      out.push([{ type: 'module', modId: def.id, family, upgrades }, weight]);
    }
  }
  if (mutationPairs(data, build, layoutOf(gun, build.barrel.length)).length > 0)
    out.push([{ type: 'mutation' }, w.mutation]);
  const pieces = data.muzzles.pieces;
  for (const m of pieces) {
    const owned = build.muzzle.some((s) => s?.id === m.id);
    out.push([{ type: 'muzzle', muzzleId: m.id, owned }, w.muzzle / pieces.length]);
  }
  if (build.coreTier < data.config.slots.maxCoreTier)
    out.push([{ type: 'coreTier', toTier: build.coreTier + 1 }, w.coreTier]);

  const perks = data.supportPerks.filter((p) => (support[p.id] ?? 0) < p.levels.length);
  for (const p of perks)
    out.push([
      { type: 'supportPerk', perkId: p.id, toLevel: (support[p.id] ?? 0) + 1 },
      w.supportPerk / perks.length,
    ]);
  return out;
}

/** Tinker card: random +1 tiers among modules that can still upgrade. Null when there are none. */
export function rollTinker(data: GameData, build: RunBuild, rng: RNG): Card | null {
  const pool: { slot: number; modId: string }[] = [];
  build.barrel.forEach((s, slot) => {
    if (s && s.tier < maxTier(data, s.id)) pool.push({ slot, modId: s.id });
  });
  if (pool.length === 0) return null;
  // Track the tier each upgrade plans, so the card never promises more than a module's cap.
  const planned = new Map<number, number>();
  const upgrades: { slot: number; modId: string }[] = [];
  for (let i = 0; i < data.cards.randomUpgrade.upgrades; i++) {
    const room = pool.filter(
      (p) => (planned.get(p.slot) ?? build.barrel[p.slot]!.tier) < maxTier(data, p.modId),
    );
    if (room.length === 0) break;
    const up = rng.pick(room);
    planned.set(up.slot, (planned.get(up.slot) ?? build.barrel[up.slot]!.tier) + 1);
    upgrades.push(up);
  }
  return { type: 'randomUpgrade', upgrades };
}

export function rollRarity(data: GameData, level: number, rng: RNG): Rarity {
  const r = data.cards.rarity;
  const lv = Math.max(0, level - 1);
  return rng.weightedKey({
    common: r.weights.common,
    rare: r.weights.rare + r.shiftPerLevel.rare * lv,
    epic: r.weights.epic + r.shiftPerLevel.epic * lv,
  });
}

/**
 * Draw `count` distinct valid cards (TDD: CardDraw). With `path`, only that path's card types
 * (cards.json > paths) are in the pool.
 */
export function drawCards(
  data: GameData,
  build: RunBuild,
  level: number,
  rng: RNG,
  support: SupportLevels = {},
  count = data.cards.cardsPerLevelUp,
  path: string | null = null,
  gun: GunDef | null = null,
): Card[] {
  let pool: [Card, number][] = [...candidateCards(data, build, support, gun)];
  // Blessings (run stat cards) share the runStat weight.
  const perkWeight = data.cards.typeWeights.runStat / data.cards.runStats.length;
  for (const rs of data.cards.runStats) {
    pool.push([
      { type: 'runStat', cardId: rs.id, rarity: 'common', stat: rs.stat, mode: rs.mode, value: 0 },
      perkWeight,
    ]);
  }
  const tinker = rollTinker(data, build, rng);
  if (tinker) pool.push([tinker, data.cards.typeWeights.tinker]);
  if (path !== null) pool = pool.filter(([c]) => pathOf(data, c) === path);

  const hand: Card[] = [];
  while (hand.length < count && pool.length > 0) {
    const picked = rng.weighted(pool.map((entry, i) => [i, entry[1]] as const));
    hand.push(pool[picked]![0]);
    pool.splice(picked, 1);
  }

  // Run stat cards get their rarity (and so their value) only once drawn.
  return hand.map((c) => {
    if (c.type !== 'runStat') return c;
    const def = data.cards.runStats.find((r) => r.id === c.cardId)!;
    const rarity = rollRarity(data, level, rng);
    return { ...c, rarity, value: def.values[rarity] };
  });
}

/**
 * Apply a picked card. A module card needs `slot` (an open barrel slot; `open` = which slots are
 * unlocked, so an insert never shifts into a locked one). A muzzle card needs `slot` too: the
 * muzzle slot. A Mutation needs the barrel `slot` it was dropped on (`prefer`: which neighbour
 * when both would work). Returns what happened in the barrel step by step; empty for other cards.
 */
export function applyCard(
  data: GameData,
  gun: GunDef | null,
  target: BuildTarget,
  card: Card,
  slot?: number,
  open?: readonly boolean[],
  prefer: Side = 'right',
): FusionEvent[] {
  const { build } = target;
  switch (card.type) {
    case 'mutation':
      if (slot === undefined) throw new Error('A Mutation needs a slot');
      return mutate(data, build, layoutOf(gun, build.barrel.length), slot, prefer);
    case 'module':
      if (slot === undefined) throw new Error('A module card needs a slot');
      return place(data, build, layoutOf(gun, build.barrel.length), slot, { id: card.modId, tier: 1 }, open);
    case 'muzzle':
      if (slot === undefined) throw new Error('A muzzle card needs a muzzle slot');
      placeMuzzle(build.muzzle, slot, card.muzzleId);
      return [];
    case 'coreTier':
      build.coreTier = card.toTier;
      return [];
    case 'runStat':
      addBonus(target.runBonuses, card.stat, card.mode, card.value);
      return [];
    case 'supportPerk':
      target.support[card.perkId] = card.toLevel;
      return [];
    case 'randomUpgrade':
      for (const up of card.upgrades) {
        // Slots may have moved since the draw (swaps), and a module may have reached its max:
        // fall back to the same module elsewhere, then to any module that can still upgrade.
        const ok = (s: ModSlot | null | undefined) => !!s && s.tier < maxTier(data, s.id);
        let i =
          build.barrel[up.slot]?.id === up.modId && ok(build.barrel[up.slot])
            ? up.slot
            : build.barrel.findIndex((s) => s?.id === up.modId && ok(s));
        if (i === -1) i = build.barrel.findIndex((s) => ok(s));
        if (i !== -1) build.barrel[i]!.tier++;
      }
      return [];
  }
}

/** Put a module in a slot directly, exactly as given (Training Ground). `null` empties it. */
export function setSlot(build: RunBuild, index: number, slot: ModSlot | null): void {
  if (index < 0 || index >= build.barrel.length) throw new Error(`No barrel slot ${index}`);
  build.barrel[index] = slot ? { id: slot.id, tier: slot.tier } : null;
}

/** Drag a module to another slot (free, on the level-up screen): move or swap. Never merges. */
export function swapSlots(build: RunBuild, a: number, b: number): FusionEvent[] {
  return moveModule(build, a, b);
}

/** Is this card a valid offer for this build? For tests. */
export function isCardValid(
  data: GameData,
  build: RunBuild,
  card: Card,
  support: SupportLevels = {},
  gun: GunDef | null = null,
): boolean {
  switch (card.type) {
    case 'runStat':
      return true;
    case 'mutation':
      return mutationPairs(data, build, layoutOf(gun, build.barrel.length)).length > 0;
    case 'module':
      return data.barrelMods.some((m) => m.id === card.modId && m.family !== 'hybrid');
    case 'muzzle':
      return data.muzzles.pieces.some((m) => m.id === card.muzzleId);
    case 'randomUpgrade': {
      const planned = new Map<number, number>();
      return (
        card.upgrades.length > 0 &&
        card.upgrades.every((u) => {
          const s = build.barrel[u.slot];
          if (s?.id !== u.modId) return false;
          const tier = planned.get(u.slot) ?? s.tier;
          planned.set(u.slot, tier + 1);
          return tier < maxTier(data, s.id);
        })
      );
    }
    default:
      return candidateCards(data, build, support).some(
        ([c]) => cardKey(c) === cardKey(card) && JSON.stringify(c) === JSON.stringify(card),
      );
  }
}
