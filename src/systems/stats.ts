/**
 * Player stats: base values from config.json, raised by market buffs (meta, permanent) and
 * level-up cards (run only). Computed once per change and cached (TDD: Applying stats).
 *
 *   final = (base + metaAdd + runAdd) * (1 + metaMult) * (1 + runMult)
 *
 * "add" bonuses are flat (max HP +10); "mult" bonuses are percentages (fire rate +4% = 0.04).
 */
import type { CardsDef, GameConfig, StatId, StatMode } from '../data/types';

export type PlayerStats = Record<StatId, number>;

export interface StatBonuses {
  add: Partial<Record<StatId, number>>;
  mult: Partial<Record<StatId, number>>;
}

export const emptyBonuses = (): StatBonuses => ({ add: {}, mult: {} });

export const STAT_IDS: readonly StatId[] = [
  'maxHp',
  'defence',
  'moveSpeed',
  'fireRate',
  'bulletSpeed',
  'damage',
  'reloadSpeed',
  'pickupRadius',
  'hpRegen',
  'scrapGain',
  'rerolls',
  'revives',
];

export function baseStats(config: GameConfig, cards: CardsDef): PlayerStats {
  const p = config.player;
  return {
    maxHp: p.maxHp,
    defence: p.defence,
    moveSpeed: p.moveSpeed,
    fireRate: p.fireRate,
    bulletSpeed: p.bulletSpeed,
    damage: p.damage,
    reloadSpeed: p.reloadSpeed,
    pickupRadius: p.pickupRadius,
    hpRegen: p.hpRegen,
    scrapGain: p.scrapGain,
    rerolls: cards.baseRerolls,
    revives: 0,
  };
}

export function addBonus(bonuses: StatBonuses, stat: StatId, mode: StatMode, value: number): void {
  const bucket = bonuses[mode];
  bucket[stat] = (bucket[stat] ?? 0) + value;
}

export function computeStats(base: PlayerStats, meta: StatBonuses, run: StatBonuses): PlayerStats {
  const out = {} as PlayerStats;
  for (const id of STAT_IDS) {
    const flat = base[id] + (meta.add[id] ?? 0) + (run.add[id] ?? 0);
    out[id] = flat * (1 + (meta.mult[id] ?? 0)) * (1 + (run.mult[id] ?? 0));
  }
  return out;
}
