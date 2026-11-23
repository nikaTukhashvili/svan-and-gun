/**
 * RunState: everything about the current run. Created when a run starts, thrown away after
 * the results screen turns it into score, silver and a high-score entry (TDD: Scenes).
 */
import type { RunResult } from '../core/events';
import { createBuild, type RunBuild, type SupportLevels } from './build';
import type { Equipment } from './items';

export type RunPick = { kind: 'tinker'; upgrades: { slot: number; modId: string }[] };

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
  /** Items worn (GDD: Gear), one entry per paper-doll position. Run stats come from these. */
  equipment: Equipment;
  /** Support perks taken (were magazine mods): id → level. */
  support: SupportLevels;
  rerollsUsed: number;
  /** Tinker picks, in the order they were chosen (build sheet). */
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
    equipment: [],
    support: {},
    rerollsUsed: 0,
    picks: [],
    result: null,
  };
}
