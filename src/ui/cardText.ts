/**
 * Human-readable text for level-up cards and slots. Mod descriptions come from the data files,
 * with {param} placeholders filled from the level the card would give.
 */
import type { GameData } from '../data/types';
import type { Card, ModSlot, SlotKind } from '../systems/build';

export interface CardText {
  label: string;
  name: string;
  body: string;
  /** Border colour as a number. */
  color: number;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
export const roman = (n: number): string => ROMAN[n] ?? String(n);

const RARITY_COLORS = { common: 0x9aa0a6, rare: 0x3d8bfd, epic: 0xb455ff } as const;
const KIND_COLORS = { barrel: 0xf2b632, magazine: 0x5fc46a, core: 0xe0533d } as const;

function modDef(data: GameData, kind: SlotKind, id: string) {
  const list = kind === 'barrel' ? data.barrelMods : data.magazineMods;
  const def = list.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown ${kind} mod ${id}`);
  return def;
}

export function fillTemplate(template: string, params: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) return `{${k}}`;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  });
}

export function modName(data: GameData, kind: SlotKind, id: string): string {
  return modDef(data, kind, id).name;
}

export function modDescription(data: GameData, kind: SlotKind, id: string, level: number): string {
  const def = modDef(data, kind, id);
  return fillTemplate(def.description, def.levels[level - 1] as Record<string, number>);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function describeCard(data: GameData, card: Card): CardText {
  switch (card.type) {
    case 'newMod': {
      const what = card.kind === 'barrel' ? 'BARREL MOD' : 'MAGAZINE MOD';
      return {
        label: card.replace ? `NEW ${what} · REPLACES A SLOT` : `NEW ${what}`,
        name: modName(data, card.kind, card.modId),
        body: modDescription(data, card.kind, card.modId, 1),
        color: KIND_COLORS[card.kind],
      };
    }
    case 'modUpgrade':
      return {
        label: `UPGRADE · LEVEL ${card.toLevel}`,
        name: modName(data, card.kind, card.modId),
        body: modDescription(data, card.kind, card.modId, card.toLevel),
        color: KIND_COLORS[card.kind],
      };
    case 'coreTier': {
      const gunBonus = data.guns[0]!.tierBonus;
      return {
        label: `CORE TIER ${roman(card.toTier)}`,
        name: 'Rework the Core',
        body: `+${pct(gunBonus.damage)} damage and +${pct(gunBonus.fireRate)} fire rate.`,
        color: KIND_COLORS.core,
      };
    }
    case 'randomUpgrade':
      return {
        label: 'TINKER',
        name: "Gunsmith's Whim",
        body:
          card.upgrades.length === 1
            ? 'Upgrade a random mod on your gun.'
            : `Upgrade ${card.upgrades.length} random mods on your gun (the same mod can get more than one).`,
        color: 0x5bc0be,
      };
    case 'runStat': {
      const def = data.cards.runStats.find((r) => r.id === card.cardId)!;
      const value = card.mode === 'mult' ? `+${pct(card.value)}` : `+${card.value}`;
      return {
        label: `RUN STAT · ${card.rarity.toUpperCase()}`,
        name: def.name,
        body: `${value} ${STAT_LABELS[card.stat] ?? card.stat} for this run.`,
        color: RARITY_COLORS[card.rarity],
      };
    }
  }
}

export const STAT_LABELS: Record<string, string> = {
  maxHp: 'max HP',
  defence: 'defence',
  moveSpeed: 'move speed',
  fireRate: 'fire rate',
  bulletSpeed: 'bullet speed and range',
  damage: 'damage',
  reloadSpeed: 'reload speed',
  pickupRadius: 'pickup radius',
  hpRegen: 'HP regen per second',
  scrapGain: 'scrap gain',
};

export function slotLabel(data: GameData, kind: SlotKind, slot: ModSlot | null): string {
  if (!slot) return 'empty';
  return `${modName(data, kind, slot.id)} ${roman(slot.level)}`;
}
