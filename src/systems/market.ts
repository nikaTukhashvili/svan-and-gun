/**
 * Market (T31): permanent buffs bought with silver. Cost of the next level is
 * baseCost x costGrowth^(current level), rounded (GDD: Meta progression).
 * Buffs are read once when a run starts (TDD: Applying stats).
 */
import type { BuffDef } from '../data/types';
import type { SaveV1 } from './save';
import { addBonus, emptyBonuses, type StatBonuses } from './stats';

export function buffLevel(save: SaveV1, buff: BuffDef): number {
  return save.buffLevels[buff.id] ?? 0;
}

/** Cost to go from `level` to `level + 1`. */
export function buffCost(buff: BuffDef, level: number): number {
  return Math.round(buff.baseCost * buff.costGrowth ** level);
}

export function canBuy(save: SaveV1, buff: BuffDef): boolean {
  const level = buffLevel(save, buff);
  return level < buff.maxLevel && save.silver >= buffCost(buff, level);
}

/** Buy one level. Returns false (and changes nothing) if maxed or too expensive. */
export function buyBuff(save: SaveV1, buff: BuffDef): boolean {
  if (!canBuy(save, buff)) return false;
  const level = buffLevel(save, buff);
  save.silver -= buffCost(buff, level);
  save.buffLevels[buff.id] = level + 1;
  return true;
}

/** Silver spent on every bought level, using the same cost formula. */
export function spentSilver(save: SaveV1, buffs: readonly BuffDef[]): number {
  let total = 0;
  for (const b of buffs) for (let l = 0; l < buffLevel(save, b); l++) total += buffCost(b, l);
  return total;
}

/** Refund all: give back everything spent and reset every level to 0. Returns the refund. */
export function refundAll(save: SaveV1, buffs: readonly BuffDef[]): number {
  const refund = spentSilver(save, buffs);
  save.silver += refund;
  save.buffLevels = {};
  return refund;
}

/** Market levels as stat bonuses for computeStats. */
export function metaBonuses(save: SaveV1, buffs: readonly BuffDef[]): StatBonuses {
  const bonuses = emptyBonuses();
  for (const b of buffs) {
    const level = buffLevel(save, b);
    if (level > 0) addBonus(bonuses, b.stat, b.mode, b.perLevel * level);
  }
  return bonuses;
}
