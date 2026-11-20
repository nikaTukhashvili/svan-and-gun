/**
 * Human-readable text for level-up cards and barrel slots. Module descriptions come from the data
 * files, with {param} placeholders filled from the tier's numbers.
 */
import type { CardPathDef, CardType, GameData, GunDef } from '../data/types';
import type { Card, ModSlot } from '../systems/build';
import { fuseResult, modDef, tierParams, type FusionEvent } from '../systems/fusion';
import type { BarrelLayout } from '../systems/modPipeline';
import {
  isUpside,
  MUZZLE_STATS,
  muzzleDef,
  muzzleStats,
  type MuzzleEvent,
  type MuzzleSlot,
  type MuzzleStatKey,
  type MuzzleTotals,
} from '../systems/muzzle';

export interface CardText {
  label: string;
  name: string;
  body: string;
  /** Border colour as a number. */
  color: number;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (n: number): string => ROMAN[n] ?? String(n);

const RARITY_COLORS = { common: 0x9aa0a6, rare: 0x3d8bfd, epic: 0xb455ff } as const;
const CORE_COLOR = 0xe0533d;
const SUPPORT_COLOR = 0x5fc46a;
const FAMILY_LABEL = {
  element: 'ELEMENT',
  hybrid: 'HYBRID',
  grey: 'BARREL MODULE',
  fitting: 'FITTING',
} as const;

export const hexColor = (css: string): number => parseInt(css.slice(1), 16);

export function fillTemplate(template: string, params: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = params[k];
    if (v === undefined) return `{${k}}`;
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  });
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function modName(data: GameData, id: string): string {
  return modDef(data, id).name;
}

export function modColor(data: GameData, id: string): number {
  return hexColor(modDef(data, id).color);
}

/** A module's description at a tier (fittings show their percentages). */
export function modDescription(data: GameData, id: string, tier = 1): string {
  const def = modDef(data, id);
  if (def.family === 'fitting') {
    return def.description.replace(/\{(left|right)\}/g, (_, side: 'left' | 'right') =>
      pct(Math.abs(def[side])),
    );
  }
  return fillTemplate(def.description, tierParams(def, tier) as Record<string, number>);
}

/** "Ember Shot 3", or "Booster ▶" for fittings, or "empty". */
export function slotLabel(data: GameData, slot: ModSlot | null): string {
  if (!slot) return 'empty';
  const def = modDef(data, slot.id);
  return def.family === 'fitting' ? def.name : `${def.name} ${slot.tier}`;
}

/** What fuses with this module card, for the card body. */
function fusesWithText(data: GameData, modId: string): string {
  const def = modDef(data, modId);
  if (def.family === 'fitting') return 'Never fuses. Place it next to the modules it should change.';
  if (def.family === 'grey') return `Fuses with another ${def.name}.`;
  const hybrids = data.barrelMods
    .filter((m) => m.family === 'element' && m.id !== def.id)
    .map((m) => fuseResult(data, { id: def.id, tier: 1 }, { id: m.id, tier: 1 }))
    .flatMap((r) => (r ? [modName(data, r.id)] : []));
  return `Fuses with ${def.name}; next to another element it becomes ${hybrids.join(' or ')}.`;
}

const MUZZLE_LABEL: Record<MuzzleStatKey, (v: number) => string> = {
  bullets: (v) => `${sign(v)}${Math.abs(v)} bullet${Math.abs(v) === 1 ? '' : 's'}`,
  spreadDeg: (v) => `${sign(v)}${round1(Math.abs(v))}° spread`,
  spreadPct: (v) => `${sign(v)}${pct(Math.abs(v))} spread`,
  rangePct: (v) => `${sign(v)}${pct(Math.abs(v))} range`,
  damagePct: (v) => `${sign(v)}${pct(Math.abs(v))} damage`,
  fireRatePct: (v) => `${sign(v)}${pct(Math.abs(v))} fire rate`,
  bulletSpeedPct: (v) => `${sign(v)}${pct(Math.abs(v))} bullet speed`,
  critChance: (v) => `${sign(v)}${pct(Math.abs(v))} crit chance`,
};
const sign = (v: number) => (v < 0 ? '−' : '+');
const round1 = (v: number) => Math.round(v * 10) / 10;

export const muzzleName = (data: GameData, id: string): string => muzzleDef(data, id).name;
export const muzzleColor = (data: GameData, id: string): number => hexColor(muzzleDef(data, id).color);
export const muzzleLabel = (data: GameData, s: MuzzleSlot | null): string =>
  s ? `${muzzleName(data, s.id)} ${roman(s.level)}` : 'empty';

/** Upsides and downsides of a set of muzzle numbers, e.g. ["+1 bullet"], ["+8° spread", "−15% range"]. */
export function muzzleEffects(t: MuzzleTotals): { up: string[]; down: string[] } {
  const up: string[] = [];
  const down: string[] = [];
  for (const k of MUZZLE_STATS) {
    const v = t[k];
    if (Math.abs(v) < 1e-9) continue;
    (isUpside(k, v) ? up : down).push(MUZZLE_LABEL[k](v));
  }
  return { up, down };
}

/** One muzzle piece at a level: "▲ +1 bullet   ▼ +8° spread, −15% range". */
export function muzzleDescription(data: GameData, id: string, level = 1): string {
  const { up, down } = muzzleEffects(muzzleStats(muzzleDef(data, id), level));
  return [up.length ? `▲ ${up.join(', ')}` : '', down.length ? `▼ ${down.join(', ')}` : '']
    .filter(Boolean)
    .join('   ');
}

/** One line for what dropping a muzzle card will do. */
export function describeMuzzleEvent(data: GameData, ev: MuzzleEvent): string {
  if (ev.kind === 'fit') return `Fit ${muzzleLabel(data, ev.piece)}`;
  if (ev.kind === 'upgrade')
    return `Upgrade → ${muzzleLabel(data, ev.piece).toUpperCase()}: ${muzzleDescription(data, ev.piece.id, ev.piece.level)}`;
  return `Replace ${muzzleLabel(data, ev.old)} with ${muzzleLabel(data, ev.by)}`;
}

export function describeCard(data: GameData, card: Card): CardText {
  switch (card.type) {
    case 'muzzle': {
      const def = muzzleDef(data, card.muzzleId);
      const { up, down } = muzzleEffects(muzzleStats(def, 1));
      return {
        label: `MUZZLE${card.owned ? ' · CAN UPGRADE' : ''}`,
        name: def.name,
        body:
          `▲ ${up.join('\n▲ ')}\n▼ ${down.join('\n▼ ')}\n\n` +
          'Stacks with your other muzzle pieces. Drop it on the same piece to upgrade it.',
        color: hexColor(def.color),
      };
    }
    case 'module': {
      const def = modDef(data, card.modId);
      return {
        label: `NEW ${FAMILY_LABEL[def.family]}${card.fuses ? ' · CAN FUSE' : ''}`,
        name: def.name,
        body: `${modDescription(data, card.modId, 1)}\n\n${fusesWithText(data, card.modId)}`,
        color: hexColor(def.color),
      };
    }
    case 'coreTier': {
      const gunBonus = data.guns[0]!.tierBonus;
      return {
        label: `CORE TIER ${roman(card.toTier)}`,
        name: 'Rework the Core',
        body: `+${pct(gunBonus.damage)} damage and +${pct(gunBonus.fireRate)} fire rate.`,
        color: CORE_COLOR,
      };
    }
    case 'supportPerk': {
      const def = data.supportPerks.find((p) => p.id === card.perkId)!;
      const params = def.levels[card.toLevel - 1] as Record<string, number>;
      return {
        label: `SUPPORT · LEVEL ${card.toLevel}/${def.levels.length}`,
        name: def.name,
        body: fillTemplate(def.description, params),
        color: SUPPORT_COLOR,
      };
    }
    case 'randomUpgrade':
      return {
        label: 'TINKER',
        name: "Gunsmith's Whim",
        body:
          card.upgrades.length === 1
            ? 'A random module in your barrel goes up 1 tier.'
            : `${card.upgrades.length} random +1 tiers for modules in your barrel (the same one can get more than one).`,
        color: 0x5bc0be,
      };
    case 'runStat': {
      const def = data.cards.runStats.find((r) => r.id === card.cardId)!;
      const value = card.mode === 'mult' ? `+${pct(card.value)}` : `+${card.value}`;
      return {
        label: `BLESSING · ${card.rarity.toUpperCase()}`,
        name: def.name,
        body: `${value} ${STAT_LABELS[card.stat] ?? card.stat} for this run.`,
        color: RARITY_COLORS[card.rarity],
      };
    }
  }
}

/** What a level-up path offers, one line per card type (path choice screen). */
export function pathContents(data: GameData, path: CardPathDef): string[] {
  /** "A, B and 4 more" keeps a long list on one line. */
  const few = (names: string[], n = 2) =>
    names.length <= n + 1 ? names.join(', ') : `${names.slice(0, n).join(', ')} and ${names.length - n} more`;
  const names = (family: string) => data.barrelMods.filter((m) => m.family === family).map((m) => m.name);
  const line: Record<CardType, () => string> = {
    element: () => `Elements: ${few(names('element'), 4)}`,
    runStat: () => 'Blessings: stats for this run',
    grey: () => `Barrel modules: ${few(names('grey'))}`,
    fitting: () => 'Fittings: boost their neighbours',
    muzzle: () => 'Muzzle pieces: trade-offs that stack',
    supportPerk: () => `Magazine work: ${few(data.supportPerks.map((p) => p.name))}`,
    coreTier: () => 'Core Tier: more damage and fire rate',
    tinker: () => 'Tinker: random +1 tiers in your barrel',
  };
  return path.types.map((t) => line[t]());
}

/** One line for what placing or swapping will do (level-up preview). */
export function describeEvents(data: GameData, events: readonly FusionEvent[]): string {
  const parts: string[] = [];
  for (const ev of events) {
    if (ev.kind === 'place') parts.push(`Place ${slotLabel(data, ev.mod)}`);
    else if (ev.kind === 'insert') parts.push(`Insert ${slotLabel(data, ev.mod)} (modules slide over)`);
    else if (ev.kind === 'move') parts.push('Move');
    else if (ev.kind === 'replace')
      parts.push(`Replace ${slotLabel(data, ev.old)} with ${slotLabel(data, ev.by)}`);
    else
      parts.push(
        `${slotLabel(data, ev.a)} + ${slotLabel(data, ev.b)} → ${slotLabel(data, ev.result).toUpperCase()}`,
      );
  }
  return parts.join('   ·   ');
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

/** Tag over a barrel slot: LEFT/RIGHT BARREL, CRIT CHAMBER ×n, or null. */
export function barrelSlotTag(layout: BarrelLayout, i: number): string | null {
  const last = i === layout.slots - 1;
  let tag: string | null = null;
  if (layout.chains > 1 && i % layout.slotsPerChain === 0) tag = i === 0 ? 'LEFT BARREL' : 'RIGHT BARREL';
  if (last && layout.critChamberMult > 0) tag = `CRIT CHAMBER ×${layout.critChamberMult}`;
  return tag;
}

/** One line describing a gun's barrel twist (gun select, build sheet). */
export function gunTwistText(gun: GunDef): string {
  const b = gun.barrel;
  if (b.chains > 1) return `Two barrels: shots alternate between ${b.chains} halves of ${b.slots / b.chains}`;
  if (b.critChamberMult > 0) return `Crit chamber: last slot works only on crits, ×${b.critChamberMult}`;
  return `${gun.muzzleSlots} muzzle slots: stack trade-offs on every shot`;
}
