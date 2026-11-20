/**
 * The gun build for one run: the barrel (fusing modules, GDD: Barrel fusion) and Core Tier, plus
 * the level-up card draw that changes it. Support perks and run stat perks live on the run.
 *
 * CardDraw builds the list of VALID cards first and only then picks (TDD: CardDraw algorithm):
 * - module cards are always valid (tiers have no cap; a full barrel can still fuse or replace);
 * - a module that would fuse with one already in the barrel weighs more (cards.fusesWithOwnedMult);
 * - Core Tier only below the max tier; a support perk only below its max level;
 * - Tinker only when the barrel has a module that can go up a tier.
 */
import type { RNG } from '../core/rng';
import type { GameData, GunDef, ModFamily, Rarity, StatId, StatMode } from '../data/types';
import { fusesWithOwned, modDef, place, swapAndFuse, type FusionEvent } from './fusion';
import { layoutOf } from './modPipeline';
import { addBonus, type StatBonuses } from './stats';

export interface ModSlot {
  id: string;
  /** Copies fused in (1 = a fresh module). No cap. */
  tier: number;
}

export interface RunBuild {
  barrel: (ModSlot | null)[];
  coreTier: number;
}

/** Support perk id → level taken (1..its number of levels). */
export type SupportLevels = Record<string, number>;

export type Card =
  /** A fresh tier-1 module; the player picks the slot (place / fuse / replace). */
  | { type: 'module'; modId: string; family: ModFamily; fuses: boolean }
  | { type: 'coreTier'; toTier: number }
  | { type: 'runStat'; cardId: string; rarity: Rarity; stat: StatId; mode: StatMode; value: number }
  | { type: 'supportPerk'; perkId: string; toLevel: number }
  /** Tinker: random +1 tiers for modules in the barrel, chosen when drawn (a surprise). */
  | { type: 'randomUpgrade'; upgrades: { slot: number; modId: string }[] };

/** What a picked card changes on the run. */
export interface BuildTarget {
  build: RunBuild;
  runBonuses: StatBonuses;
  support: SupportLevels;
}

export function createBuild(barrelSlots = 8): RunBuild {
  return { barrel: Array.from({ length: barrelSlots }, () => null), coreTier: 1 };
}

export function buildForGun(gun: GunDef): RunBuild {
  return createBuild(gun.barrel.slots);
}

/**
 * How many of `slotCount` barrel slots are open at this player level. Unlock levels come from
 * config.slots.barrelUnlockLevels; slots past the end of the list use its last entry.
 */
export function unlockedSlots(data: GameData, level: number, slotCount: number): number {
  const levels = data.config.slots.barrelUnlockLevels;
  let open = 0;
  for (let i = 0; i < slotCount; i++) if (level >= (levels[i] ?? levels[levels.length - 1] ?? 1)) open++;
  return open;
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
    case 'randomUpgrade':
      return 'tinker';
  }
}

/**
 * Every valid module / Core Tier / support perk card, with its weight. typeWeights are per TYPE
 * and shared by that type's cards. Hybrids are never offered: they are only made by fusing.
 */
export function candidateCards(
  data: GameData,
  build: RunBuild,
  support: SupportLevels = {},
): [Card, number][] {
  const w = data.cards.typeWeights;
  const out: [Card, number][] = [];
  for (const family of ['element', 'grey', 'fitting'] as const) {
    const defs = data.barrelMods.filter((m) => m.family === family);
    for (const def of defs) {
      const fuses = fusesWithOwned(data, build, def.id);
      const weight = (w[family] / defs.length) * (fuses ? data.cards.fusesWithOwnedMult : 1);
      out.push([{ type: 'module', modId: def.id, family, fuses }, weight]);
    }
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

/** Tinker card: random +1 tiers among tiered modules in the barrel. Null when there are none. */
export function rollTinker(data: GameData, build: RunBuild, rng: RNG): Card | null {
  const pool: { slot: number; modId: string }[] = [];
  build.barrel.forEach((s, slot) => {
    if (s && modDef(data, s.id).family !== 'fitting') pool.push({ slot, modId: s.id });
  });
  if (pool.length === 0) return null;
  const upgrades: { slot: number; modId: string }[] = [];
  for (let i = 0; i < data.cards.randomUpgrade.upgrades; i++) upgrades.push(rng.pick(pool));
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

/** Draw `count` distinct valid cards (TDD: CardDraw). */
export function drawCards(
  data: GameData,
  build: RunBuild,
  level: number,
  rng: RNG,
  support: SupportLevels = {},
  count = data.cards.cardsPerLevelUp,
): Card[] {
  const pool: [Card, number][] = [...candidateCards(data, build, support)];
  // Run stat perks share the runStat weight; Tinker weighs the same as one perk.
  const perkWeight = data.cards.typeWeights.runStat / data.cards.runStats.length;
  for (const rs of data.cards.runStats) {
    pool.push([
      { type: 'runStat', cardId: rs.id, rarity: 'common', stat: rs.stat, mode: rs.mode, value: 0 },
      perkWeight,
    ]);
  }
  const tinker = rollTinker(data, build, rng);
  if (tinker) pool.push([tinker, perkWeight]);

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
 * Apply a picked card. A module card needs `slot` (an open barrel slot). Returns what happened
 * in the barrel (place / fuse / replace events); empty for other cards.
 */
export function applyCard(
  data: GameData,
  gun: GunDef | null,
  target: BuildTarget,
  card: Card,
  slot?: number,
): FusionEvent[] {
  const { build } = target;
  switch (card.type) {
    case 'module':
      if (slot === undefined) throw new Error('A module card needs a slot');
      return place(data, build, layoutOf(gun, build.barrel.length), slot, { id: card.modId, tier: 1 });
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
        // Slots may have moved since the draw (swaps): fall back to any slot with that module.
        let i =
          build.barrel[up.slot]?.id === up.modId
            ? up.slot
            : build.barrel.findIndex((s) => s?.id === up.modId);
        if (i === -1)
          i = build.barrel.findIndex((s) => s !== null && modDef(data, s.id).family !== 'fitting');
        if (i !== -1) build.barrel[i]!.tier++;
      }
      return [];
  }
}

/** Put a module in a slot directly, without fusing (Training Ground). `null` empties it. */
export function setSlot(build: RunBuild, index: number, slot: ModSlot | null): void {
  if (index < 0 || index >= build.barrel.length) throw new Error(`No barrel slot ${index}`);
  build.barrel[index] = slot ? { id: slot.id, tier: slot.tier } : null;
}

/** Swap two barrel slots (free, on the level-up screen); matches brought together fuse. */
export function swapSlots(
  data: GameData,
  gun: GunDef | null,
  build: RunBuild,
  a: number,
  b: number,
): FusionEvent[] {
  return swapAndFuse(data, build, layoutOf(gun, build.barrel.length), a, b);
}

/** Is this card a valid offer for this build? For tests. */
export function isCardValid(
  data: GameData,
  build: RunBuild,
  card: Card,
  support: SupportLevels = {},
): boolean {
  switch (card.type) {
    case 'runStat':
      return true;
    case 'module':
      return data.barrelMods.some((m) => m.id === card.modId && m.family !== 'hybrid');
    case 'randomUpgrade':
      return (
        card.upgrades.length > 0 &&
        card.upgrades.every((u) => {
          const s = build.barrel[u.slot];
          return s?.id === u.modId && modDef(data, s.id).family !== 'fitting';
        })
      );
    default:
      return candidateCards(data, build, support).some(
        ([c]) => cardKey(c) === cardKey(card) && JSON.stringify(c) === JSON.stringify(card),
      );
  }
}
