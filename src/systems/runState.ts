/**
 * RunState: everything about the current run. Created when a run starts, thrown away after
 * the results screen turns it into score, silver and a high-score entry (TDD: Scenes).
 */
import type { RunResult } from '../core/events';
import type { Rarity, StatId, StatMode } from '../data/types';
import { createBuild, type RunBuild } from './build';
import { emptyBonuses, type StatBonuses } from './stats';

export type RunPick =
  | { kind: 'perk'; cardId: string; rarity: Rarity; stat: StatId; mode: StatMode; value: number }
  | { kind: 'tinker'; upgrades: { kind: 'barrel' | 'magazine'; modId: string }[] };

export interface RunState {
  readonly seed: number;
  readonly gunId: string;
  /** Barrel and magazine slots, Core Tier. */
  build: RunBuild;
  kills: number;
  eliteKills: number;
  bossKilled: boolean;
  /** Silver picked up during the run (bonuses are added at the results screen). */
  silver: number;
  timeSec: number;
  /** Run stat cards and other run-only bonuses. */
  runBonuses: StatBonuses;
  rerollsUsed: number;
  /** Perks (run stat cards) and Tinker picks, in the order they were chosen (build sheet). */
  picks: RunPick[];
  result: RunResult | null;
}

export function createRunState(gunId: string, seed: number): RunState {
  return {
    seed,
    gunId,
    build: createBuild(),
    kills: 0,
    eliteKills: 0,
    bossKilled: false,
    silver: 0,
    timeSec: 0,
    runBonuses: emptyBonuses(),
    rerollsUsed: 0,
    picks: [],
    result: null,
  };
}
