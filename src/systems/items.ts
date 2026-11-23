/**
 * Gear (GDD: Gear): named items the Svan wears for one run. Pure: no Phaser.
 *
 * - An item is a main THEME (it names the item and sets its main stat) at a LEVEL, plus extra
 *   stats rolled on reaching each of items.extraStatLevels (3 = Magic, 5 = Rare). No level cap.
 *   Numbers: base + perLevel × (level − 1), for the main stat and the extras alike.
 * - Legendaries have a fixed main stat and a passive (systems/passives.ts), no extras.
 * - Element themes raise the strength of that element's modules and its hybrids (modPipeline).
 * - Chests offer `chests.choices` choices: a new item (it replaces what is in its slot, which is
 *   salvaged into scrap) or an upgrade (+1 level to an item worn). While a slot is empty, at
 *   least one choice is a new item for an empty slot.
 */
import type { RNG } from '../core/rng';
import type {
  Element,
  GameData,
  ItemEffect,
  ItemSlotKind,
  ItemStat,
  ItemThemeDef,
  LegendaryDef,
  LegendaryPassive,
  Rarity,
  StatMode,
} from '../data/types';
import { addBonus, emptyBonuses, type StatBonuses } from './stats';

export interface ItemExtra {
  stat: ItemStat;
  mode: StatMode;
}

export interface Item {
  /** A theme id or a legendary id (items.json). */
  id: string;
  level: number;
  /** Extra stats in the order they were rolled. */
  extras: ItemExtra[];
}

/** The paper doll: one entry per items.equipment position. */
export type Equipment = (Item | null)[];

export type ChestKind = 'supply' | 'elite';
/** Chest pickups carry their kind as their value (1 = supply, 2 = elite). */
export const CHEST_KINDS: readonly ChestKind[] = ['supply', 'elite'];
export const chestValue = (kind: ChestKind): number => CHEST_KINDS.indexOf(kind) + 1;
export const chestKindOf = (value: number): ChestKind => CHEST_KINDS[value - 1] ?? 'supply';

export type ChestChoice =
  /** Put `item` in equipment position `slot` (whatever is there is salvaged). */
  | { kind: 'new'; slot: number; item: Item }
  /** +1 level to the item in position `slot`; `extra` is the stat it gains at that level, if any. */
  | { kind: 'upgrade'; slot: number; extra: ItemExtra | null };

export type ItemDefRef = { kind: 'theme'; def: ItemThemeDef } | { kind: 'legendary'; def: LegendaryDef };

export function createEquipment(data: GameData): Equipment {
  return data.items.equipment.map(() => null);
}

export function itemDef(data: GameData, id: string): ItemDefRef {
  const theme = data.items.themes.find((t) => t.id === id);
  if (theme) return { kind: 'theme', def: theme };
  const legendary = data.items.legendaries.find((l) => l.id === id);
  if (legendary) return { kind: 'legendary', def: legendary };
  throw new Error(`Unknown item id "${id}"`);
}

export const isLegendary = (data: GameData, id: string): boolean =>
  data.items.legendaries.some((l) => l.id === id);

export const itemName = (data: GameData, id: string): string => itemDef(data, id).def.name;

export const itemSlotKind = (data: GameData, id: string): ItemSlotKind => itemDef(data, id).def.slot;

/** The name of equipment position `slot` ("Ring"). */
export const slotName = (data: GameData, slot: number): string =>
  data.items.slotNames[data.items.equipment[slot]!];

/** base + perLevel × (level − 1). */
export const levelValue = (n: { base: number; perLevel: number }, level: number): number =>
  n.base + n.perLevel * (level - 1);

/** How many extra stats an item of this level has (non-legendary). */
export const extrasAtLevel = (data: GameData, level: number): number =>
  data.items.extraStatLevels.filter((l) => level >= l).length;

/** Rarity follows from the level (Common, Magic, Rare); legendaries are always Legendary. */
export function rarityOf(data: GameData, item: Item): Rarity {
  if (isLegendary(data, item.id)) return 'legendary';
  const n = extrasAtLevel(data, item.level);
  return n === 0 ? 'common' : n === 1 ? 'magic' : 'rare';
}

/** The item's main effect and its value at the item's level. */
export function mainStat(data: GameData, item: Item): { effect: ItemEffect; value: number } {
  const ref = itemDef(data, item.id);
  const src = ref.kind === 'theme' ? ref.def : ref.def.main;
  return { effect: src.effect, value: levelValue(src, item.level) };
}

export function extraValue(data: GameData, extra: ItemExtra, level: number): number {
  const def = data.items.extraStats.find((e) => e.stat === extra.stat && e.mode === extra.mode);
  if (!def) throw new Error(`Unknown extra stat ${extra.stat}:${extra.mode}`);
  return levelValue(def, level);
}

/** Every number the item gives at its level: the main one first, then the extras. */
export function itemLines(data: GameData, item: Item): { effect: ItemEffect; value: number }[] {
  return [
    mainStat(data, item),
    ...item.extras.map((e) => ({
      effect: { kind: 'stat', stat: e.stat, mode: e.mode } as const,
      value: extraValue(data, e, item.level),
    })),
  ];
}

/** Roll one extra stat the item does not have yet (never its main stat). Null when none is left. */
export function rollExtra(data: GameData, item: Item, rng: RNG): ItemExtra | null {
  const main = mainStat(data, item).effect;
  const pool = data.items.extraStats.filter(
    (e) =>
      !(main.kind === 'stat' && main.stat === e.stat && main.mode === e.mode) &&
      !item.extras.some((x) => x.stat === e.stat && x.mode === e.mode),
  );
  if (pool.length === 0) return null;
  const e = rng.pick(pool);
  return { stat: e.stat, mode: e.mode };
}

/**
 * An item at a level: a Magic one comes with its extra already rolled, and so on. Legendaries roll
 * no extras (chests always offer them at level 1).
 */
export function createItem(data: GameData, id: string, level: number, rng: RNG): Item {
  const item: Item = { id, level, extras: [] };
  if (isLegendary(data, id)) return item;
  for (let i = extrasAtLevel(data, level); i > 0; i--) {
    const e = rollExtra(data, item, rng);
    if (e) item.extras.push(e);
  }
  return item;
}

export interface ItemBonuses {
  stats: StatBonuses;
  /** Strength bonus per element (+0.2 = that element's modules ×1.2). */
  elements: Partial<Record<Element, number>>;
}

/** What everything worn adds up to. */
export function itemBonuses(data: GameData, equipment: Equipment): ItemBonuses {
  const out: ItemBonuses = { stats: emptyBonuses(), elements: {} };
  for (const item of equipment) {
    if (!item) continue;
    for (const { effect, value } of itemLines(data, item)) {
      if (effect.kind === 'stat') addBonus(out.stats, effect.stat, effect.mode, value);
      else out.elements[effect.element] = (out.elements[effect.element] ?? 0) + value;
    }
  }
  return out;
}

/** A legendary's passive numbers at a level (a value never drops below 20% of its base). */
export function passiveParams(passive: LegendaryPassive, level: number): Record<string, number> {
  const base = passive.base as Record<string, number>;
  const per = passive.perLevel as Record<string, number>;
  const out: Record<string, number> = {};
  for (const k of Object.keys(base)) {
    const v = Math.max(base[k]! * 0.2, base[k]! + (per[k] ?? 0) * (level - 1));
    out[k] = k === 'tiers' ? Math.max(1, Math.round(v)) : Math.round(v * 100) / 100;
  }
  return out;
}

/** Scrap given for salvaging a replaced item. */
export const salvageScrap = (data: GameData, item: Item): number =>
  Math.round(levelValue(data.items.salvageScrap, item.level));

/** Equipment positions of a slot kind (two for rings). */
const positionsOf = (data: GameData, kind: ItemSlotKind): number[] =>
  data.items.equipment.flatMap((k, i) => (k === kind ? [i] : []));

/**
 * Where a new item of this kind goes: an empty position of its kind, else the lowest-level item
 * of its kind (so a second ring replaces the weaker ring).
 */
export function targetSlot(data: GameData, equipment: Equipment, kind: ItemSlotKind): number {
  const at = positionsOf(data, kind);
  const empty = at.find((i) => !equipment[i]);
  if (empty !== undefined) return empty;
  return at.reduce((best, i) => (equipment[i]!.level < equipment[best]!.level ? i : best), at[0]!);
}

/**
 * The choices a chest offers (GDD: Opening a chest). Never two choices for the same item, never a
 * theme or legendary that is already worn or already offered.
 */
export function chestOffer(data: GameData, equipment: Equipment, kind: ChestKind, rng: RNG): ChestChoice[] {
  const cfg = data.items.chests;
  const chest = cfg[kind];
  const out: ChestChoice[] = [];
  const used = new Set(equipment.flatMap((it) => (it ? [it.id] : [])));
  const upgraded = new Set<number>();
  const newSlots = new Set<number>();
  const emptySlots = () => equipment.flatMap((it, i) => (!it && !newSlots.has(i) ? [i] : []));

  const newItemAt = (slot: number): boolean => {
    const kindAt = data.items.equipment[slot]!;
    const themes = data.items.themes.filter((t) => t.slot === kindAt && !used.has(t.id));
    if (themes.length === 0) return false;
    const theme = rng.pick(themes);
    const level = rng.weighted(chest.levels.map((l) => [l.level, l.weight] as const));
    used.add(theme.id);
    newSlots.add(slot);
    out.push({ kind: 'new', slot, item: createItem(data, theme.id, level, rng) });
    return true;
  };

  // A legendary choice, now and then (more often from elites).
  const legendaries = data.items.legendaries.filter((l) => !used.has(l.id));
  if (legendaries.length > 0 && rng.chance(chest.legendaryChance)) {
    const l = rng.pick(legendaries);
    const slot = targetSlot(data, equipment, l.slot);
    used.add(l.id);
    newSlots.add(slot);
    out.push({ kind: 'new', slot, item: createItem(data, l.id, 1, rng) });
  }

  // While a slot is empty, at least one choice fills an empty slot.
  if (!out.some((c) => !equipment[c.slot])) {
    const empty = emptySlots();
    if (empty.length > 0) newItemAt(rng.pick(empty));
  }

  while (out.length < cfg.choices) {
    const upgradable = equipment.flatMap((it, i) => (it && !upgraded.has(i) ? [i] : []));
    // New items go to empty slots first; with every slot full they replace (compare view).
    const empty = emptySlots();
    const newTargets = (empty.length > 0 ? empty : equipment.map((_, i) => i)).filter((i) =>
      data.items.themes.some((t) => t.slot === data.items.equipment[i] && !used.has(t.id)),
    );
    const options: ['new' | 'upgrade', number][] = [];
    if (newTargets.length > 0) options.push(['new', cfg.newItemWeight]);
    if (upgradable.length > 0) options.push(['upgrade', cfg.upgradeWeight]);
    if (!options.some(([, w]) => w > 0)) break;
    if (rng.weighted(options) === 'new') {
      newItemAt(rng.pick(newTargets));
    } else {
      const slot = rng.pick(upgradable);
      upgraded.add(slot);
      const item = equipment[slot]!;
      out.push({ kind: 'upgrade', slot, extra: extraOnUpgrade(data, item, rng) });
    }
  }
  return rng.shuffle(out);
}

/** The extra stat an item gains when it goes up one level (null when that level adds none). */
export function extraOnUpgrade(data: GameData, item: Item, rng: RNG): ItemExtra | null {
  if (isLegendary(data, item.id)) return null;
  return data.items.extraStatLevels.includes(item.level + 1) ? rollExtra(data, item, rng) : null;
}

/** Take a chest choice. Returns the item it replaced (to be salvaged), if any. */
export function applyChoice(equipment: Equipment, choice: ChestChoice): Item | null {
  if (choice.kind === 'new') {
    const old = equipment[choice.slot] ?? null;
    equipment[choice.slot] = { ...choice.item, extras: choice.item.extras.map((e) => ({ ...e })) };
    return old;
  }
  const item = equipment[choice.slot];
  if (!item) throw new Error(`No item in equipment slot ${choice.slot} to upgrade`);
  item.level++;
  if (choice.extra) item.extras.push({ ...choice.extra });
  return null;
}

/**
 * Supply chests (GDD: Where items come from): one at firstSec, then every intervalSec, none from
 * untilSec on (the boss fight). Call update with the run time; it returns how many are due.
 */
export class SupplyChestTimer {
  private next: number;

  constructor(private readonly cfg: GameData['items']['supplyChest']) {
    this.next = cfg.firstSec;
  }

  update(timeSec: number): number {
    let due = 0;
    while (timeSec >= this.next && this.next < this.cfg.untilSec) {
      due++;
      this.next += this.cfg.intervalSec;
    }
    return due;
  }
}
