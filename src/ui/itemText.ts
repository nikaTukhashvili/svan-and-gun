/**
 * Human-readable text for items (GDD: Gear): chest choices, the build sheet, the Training Ground.
 */
import type { GameData, ItemEffect, Rarity } from '../data/types';
import {
  itemDef,
  itemLines,
  itemName,
  passiveParams,
  rarityOf,
  slotName,
  type ChestChoice,
  type Equipment,
  type Item,
} from '../systems/items';
import { fillTemplate, STAT_LABELS } from './cardText';

/** Rarity colours (cosmetic). */
export const RARITY_COLORS: Record<Rarity, number> = {
  common: 0xc9ccd1,
  magic: 0x6aa8ff,
  rare: 0xf2d23a,
  legendary: 0xff8a3d,
};
export const rarityCss = (r: Rarity): string => '#' + RARITY_COLORS[r].toString(16).padStart(6, '0');

const ELEMENT_NAMES = { fire: 'Fire', poison: 'Poison', lightning: 'Lightning', frost: 'Frost' } as const;

const round = (v: number, digits = 1) => Math.round(v * 10 ** digits) / 10 ** digits;

/** "+12% move speed", "+15 max HP", "+20% Fire module strength". */
export function effectText(effect: ItemEffect, value: number): string {
  if (effect.kind === 'element')
    return `+${Math.round(value * 100)}% ${ELEMENT_NAMES[effect.element]} module strength`;
  const label = effect.stat === 'defence' ? 'armour' : (STAT_LABELS[effect.stat] ?? effect.stat);
  return effect.mode === 'mult' ? `+${Math.round(value * 100)}% ${label}` : `+${round(value)} ${label}`;
}

/** "Magic", "Legendary". */
export const rarityName = (r: Rarity): string => r[0]!.toUpperCase() + r.slice(1);

/** One item's stat lines at its level (main first). */
export const itemStatLines = (data: GameData, item: Item): string[] =>
  itemLines(data, item).map((l) => effectText(l.effect, l.value));

/** A legendary's passive at its level, or null for normal items. */
export function passiveText(data: GameData, item: Item): string | null {
  const ref = itemDef(data, item.id);
  if (ref.kind !== 'legendary') return null;
  return fillTemplate(ref.def.description, passiveParams(ref.def.passive, item.level));
}

/** "Boots of Speed · Lv 4 · Magic". */
export const itemTitle = (data: GameData, item: Item): string =>
  `${itemName(data, item.id)}  ·  Lv ${item.level}  ·  ${rarityName(rarityOf(data, item))}`;

/** One compact line for lists: "Quick Ring Lv 3: +13% fire rate, +7% damage". */
export function itemSummary(data: GameData, item: Item): string {
  const passive = passiveText(data, item);
  return `${itemName(data, item.id)} Lv ${item.level}: ${[...itemStatLines(data, item), ...(passive ? [passive] : [])].join(', ')}`;
}

export interface ChoiceText {
  /** Small line on top: "NEW · RING" or "UPGRADE · BOOTS". */
  label: string;
  name: string;
  /** Lines in the body; `color` overrides the normal text colour (CSS). */
  lines: { text: string; color?: string }[];
  /** Compare view: what is worn in that slot now (null when the slot is empty or for upgrades). */
  replaces: { name: string; lines: string[] } | null;
  rarity: Rarity;
}

const GOOD = '#7be08a';

/** Everything a chest choice card shows, including the compare view for a new item. */
export function describeChoice(
  data: GameData,
  equipment: Readonly<Equipment>,
  choice: ChestChoice,
): ChoiceText {
  const where = slotName(data, choice.slot).toUpperCase();
  if (choice.kind === 'new') {
    const item = choice.item;
    const rarity = rarityOf(data, item);
    const passive = passiveText(data, item);
    const old = equipment[choice.slot];
    return {
      label: `NEW · ${where}`,
      name: itemName(data, item.id),
      rarity,
      lines: [
        { text: `Level ${item.level}  ·  ${rarityName(rarity)}`, color: rarityCss(rarity) },
        ...itemStatLines(data, item).map((text) => ({ text })),
        ...(passive ? [{ text: passive, color: rarityCss('legendary') }] : []),
      ],
      replaces: old
        ? { name: `${itemName(data, old.id)} Lv ${old.level}`, lines: itemStatLines(data, old) }
        : null,
    };
  }
  const item = equipment[choice.slot];
  if (!item) throw new Error(`No item in slot ${choice.slot} to upgrade`);
  const next: Item = {
    ...item,
    level: item.level + 1,
    extras: choice.extra ? [...item.extras, choice.extra] : item.extras,
  };
  const before = itemLines(data, item);
  const after = itemLines(data, next);
  const rarity = rarityOf(data, next);
  const passiveBefore = passiveText(data, item);
  const passiveAfter = passiveText(data, next);
  const lines: { text: string; color?: string }[] = [
    { text: `Level ${item.level} → ${next.level}  ·  ${rarityName(rarity)}`, color: rarityCss(rarity) },
  ];
  after.forEach((l, i) => {
    const b = before[i];
    lines.push(
      b
        ? { text: `${effectText(l.effect, b.value)} → ${effectText(l.effect, l.value).split(' ')[0]}` }
        : { text: `NEW: ${effectText(l.effect, l.value)}`, color: GOOD },
    );
  });
  if (passiveAfter && passiveAfter !== passiveBefore)
    lines.push({ text: passiveAfter, color: rarityCss('legendary') });
  return { label: `UPGRADE · ${where}`, name: itemName(data, item.id), rarity, lines, replaces: null };
}
