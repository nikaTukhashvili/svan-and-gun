/**
 * Score and silver for a finished run (T30; GDD: Meta progression, TDD: Save, score).
 *   score  = kills + 25 x elites + 500 x boss killed + 2 x seconds survived + 1000 x victory
 *   silver = silver picked up + floor(kills / 20) + 100 on victory + 50 boss drop
 */
import type { RunResult } from '../core/events';
import type { GameConfig, DropsDef } from '../data/types';

export interface RunSummary {
  result: RunResult;
  timeSec: number;
  kills: number;
  eliteKills: number;
  bossKilled: boolean;
  silverPicked: number;
}

export function computeScore(cfg: GameConfig['score'], r: RunSummary): number {
  return Math.round(
    r.kills * cfg.perKill +
      r.eliteKills * cfg.perElite +
      (r.bossKilled ? cfg.boss : 0) +
      Math.floor(r.timeSec) * cfg.perSecond +
      (r.result === 'victory' ? cfg.victory : 0),
  );
}

export interface SilverBreakdown {
  picked: number;
  fromKills: number;
  victory: number;
  boss: number;
  total: number;
}

export function computeSilver(cfg: GameConfig['silver'], drops: DropsDef, r: RunSummary): SilverBreakdown {
  const fromKills = Math.floor(r.kills / cfg.perKills);
  const victory = r.result === 'victory' ? cfg.victoryBonus : 0;
  const boss = r.bossKilled ? drops.silver.boss : 0;
  return {
    picked: r.silverPicked,
    fromKills,
    victory,
    boss,
    total: r.silverPicked + fromKills + victory + boss,
  };
}
