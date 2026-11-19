/**
 * The gun build for one run (T18, T19, T22, T23): barrel slots (4), magazine slots (2), Core
 * Tier, plus the level-up card draw that changes it.
 *
 * CardDraw builds the list of VALID cards first and only then picks, so it can never offer an
 * invalid card (TDD: CardDraw algorithm):
 * - a new mod only if that mod is not owned; as a `replace` card when every unlocked slot is full;
 * - an upgrade only for an owned mod below the max level;
 * - Core Tier only below the max tier;
 * - run stat cards are always valid and fill the hand if fewer than 3 cards are valid.
 */
import type { RNG } from '../core/rng';
import type { GameData, Rarity, StatId, StatMode } from '../data/types';
import { addBonus, type StatBonuses } from './stats';

export type SlotKind = 'barrel' | 'magazine';

export interface ModSlot {
  id: string;
  level: number;
}

export interface RunBuild {
  barrel: (ModSlot | null)[];
  magazine: (ModSlot | null)[];
  coreTier: number;
}

export type Card =
  | { type: 'newMod'; kind: SlotKind; modId: string; replace: boolean }
  | { type: 'modUpgrade'; kind: SlotKind; modId: string; toLevel: number }
  | { type: 'coreTier'; toTier: number }
  | { type: 'runStat'; cardId: string; rarity: Rarity; stat: StatId; mode: StatMode; value: number }
  /** Tinker: random level-ups for owned mods, chosen when the card is drawn (a surprise for the player). */
  | { type: 'randomUpgrade'; upgrades: { kind: SlotKind; modId: string }[] };

export function createBuild(): RunBuild {
  return { barrel: [null, null, null, null], magazine: [null, null], coreTier: 1 };
}

/** How many slots of a kind are open at this player level. */
export function unlockedSlots(data: GameData, kind: SlotKind, level: number): number {
  const levels =
    kind === 'barrel' ? data.config.slots.barrelUnlockLevels : data.config.slots.magazineUnlockLevels;
  return levels.filter((l) => level >= l).length;
}

const slotsOf = (build: RunBuild, kind: SlotKind) => (kind === 'barrel' ? build.barrel : build.magazine);

export function findMod(build: RunBuild, kind: SlotKind, modId: string): number {
  return slotsOf(build, kind).findIndex((s) => s?.id === modId);
}

/** A stable key: two cards with the same key are the same offer. */
export function cardKey(c: Card): string {
  switch (c.type) {
    case 'newMod':
      return `new:${c.kind}:${c.modId}`;
    case 'modUpgrade':
      return `up:${c.kind}:${c.modId}`;
    case 'coreTier':
      return 'core';
    case 'runStat':
      return `stat:${c.cardId}`;
    case 'randomUpgrade':
      return 'tinker';
  }
}

/**
 * Every valid mod / Core Tier card for this build at this level, with its weight.
 * typeWeights are per TYPE and shared by that type's cards, so the chance of seeing a type does
 * not grow with the number of mods in the game (9 barrel mods used to drown out perks).
 */
export function candidateCards(data: GameData, build: RunBuild, level: number): [Card, number][] {
  const w = data.cards.typeWeights;
  const maxLevel = data.config.slots.maxModLevel;
  const out: [Card, number][] = [];

  for (const kind of ['barrel', 'magazine'] as const) {
    const slots = slotsOf(build, kind);
    const open = unlockedSlots(data, kind, level);
    if (open === 0) continue;
    const hasFree = slots.slice(0, open).some((s) => s === null);
    const defs = kind === 'barrel' ? data.barrelMods : data.magazineMods;
    const weight = kind === 'barrel' ? w.newBarrelMod : w.newMagazineMod;

    for (const def of defs) {
      const idx = findMod(build, kind, def.id);
      if (idx === -1) {
        out.push([{ type: 'newMod', kind, modId: def.id, replace: !hasFree }, weight]);
      } else if (slots[idx]!.level < maxLevel) {
        out.push([{ type: 'modUpgrade', kind, modId: def.id, toLevel: slots[idx]!.level + 1 }, w.modUpgrade]);
      }
    }
  }

  if (build.coreTier < data.config.slots.maxCoreTier)
    out.push([{ type: 'coreTier', toTier: build.coreTier + 1 }, w.coreTier]);

  // Split each type's weight across its cards.
  const typeOf = (c: Card) => (c.type === 'newMod' ? 'new:' + c.kind : c.type);
  const counts = new Map<string, number>();
  for (const [c] of out) counts.set(typeOf(c), (counts.get(typeOf(c)) ?? 0) + 1);
  return out.map(([c, weight]): [Card, number] => [c, weight / counts.get(typeOf(c))!]);
}

/**
 * Tinker card: random level-ups among owned mods below the max level (the same mod can get more
 * than one). Null when nothing can be upgraded.
 */
export function rollTinker(data: GameData, build: RunBuild, rng: RNG): Card | null {
  const max = data.config.slots.maxModLevel;
  const pool: { kind: SlotKind; modId: string; level: number }[] = [];
  for (const kind of ['barrel', 'magazine'] as const)
    for (const s of slotsOf(build, kind))
      if (s && s.level < max) pool.push({ kind, modId: s.id, level: s.level });
  if (pool.length === 0) return null;
  const upgrades: { kind: SlotKind; modId: string }[] = [];
  for (let i = 0; i < data.cards.randomUpgrade.upgrades && pool.length > 0; i++) {
    const j = rng.int(0, pool.length - 1);
    const m = pool[j]!;
    upgrades.push({ kind: m.kind, modId: m.modId });
    m.level++;
    if (m.level >= max) pool.splice(j, 1);
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

/** Draw `count` distinct valid cards (TDD: CardDraw). */
export function drawCards(
  data: GameData,
  build: RunBuild,
  level: number,
  rng: RNG,
  count = data.cards.cardsPerLevelUp,
): Card[] {
  const pool: [Card, number][] = [...candidateCards(data, build, level)];
  // Perks (run stat cards) share the runStat weight; Tinker weighs the same as one perk.
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

  // Run stat cards get their rarity (and so their value) only once picked.
  return hand.map((c) => {
    if (c.type !== 'runStat') return c;
    const def = data.cards.runStats.find((r) => r.id === c.cardId)!;
    const rarity = rollRarity(data, level, rng);
    return { ...c, rarity, value: def.values[rarity] };
  });
}

/**
 * Apply a picked card. A `replace` card needs `replaceSlot` (an unlocked slot index); the new
 * mod starts at level 1 there. Returns the slot index changed, or -1 for non-slot cards.
 */
export function applyCard(
  build: RunBuild,
  runBonuses: StatBonuses,
  card: Card,
  replaceSlot?: number,
): number {
  switch (card.type) {
    case 'newMod': {
      const slots = slotsOf(build, card.kind);
      let idx: number;
      if (card.replace) {
        if (replaceSlot === undefined || slots[replaceSlot] === undefined || slots[replaceSlot] === null)
          throw new Error('A replace card needs a filled slot to replace');
        idx = replaceSlot;
      } else {
        idx = slots.indexOf(null);
        if (idx === -1) throw new Error('No free slot');
      }
      slots[idx] = { id: card.modId, level: 1 };
      return idx;
    }
    case 'modUpgrade': {
      const idx = findMod(build, card.kind, card.modId);
      if (idx === -1) throw new Error(`Mod ${card.modId} not owned`);
      slotsOf(build, card.kind)[idx]!.level = card.toLevel;
      return idx;
    }
    case 'coreTier':
      build.coreTier = card.toTier;
      return -1;
    case 'runStat':
      addBonus(runBonuses, card.stat, card.mode, card.value);
      return -1;
    case 'randomUpgrade':
      for (const up of card.upgrades) {
        const idx = findMod(build, up.kind, up.modId);
        if (idx === -1) throw new Error('Mod ' + up.modId + ' not owned');
        slotsOf(build, up.kind)[idx]!.level++;
      }
      return -1;
  }
}

/** Swap two barrel slots (free, on the level-up screen). Order changes the gun (GDD: Barrel). */
export function swapSlots(build: RunBuild, kind: SlotKind, a: number, b: number): void {
  const slots = slotsOf(build, kind);
  const tmp = slots[a] ?? null;
  slots[a] = slots[b] ?? null;
  slots[b] = tmp;
}

/** True if a new (non-replace) mod would need a free slot that does not exist. For tests. */
export function isCardValid(data: GameData, build: RunBuild, level: number, card: Card): boolean {
  if (card.type === 'runStat') return true;
  if (card.type === 'randomUpgrade') {
    // Every level-up must land on an owned mod and stay within the max level.
    const levels = new Map<string, number>();
    for (const up of card.upgrades) {
      const idx = findMod(build, up.kind, up.modId);
      if (idx === -1) return false;
      const key = up.kind + ':' + up.modId;
      const next = (levels.get(key) ?? slotsOf(build, up.kind)[idx]!.level) + 1;
      if (next > data.config.slots.maxModLevel) return false;
      levels.set(key, next);
    }
    return card.upgrades.length > 0;
  }
  return candidateCards(data, build, level).some(
    ([c]) => cardKey(c) === cardKey(card) && JSON.stringify(c) === JSON.stringify(card),
  );
}
