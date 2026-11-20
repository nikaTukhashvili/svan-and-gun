/**
 * The event catalog from the Technical Design Document. Add new events here first.
 */
export type RunResult = 'victory' | 'defeat';

export interface GameEvents {
  'player:damaged': { amount: number; hpLeft: number };
  'player:levelUp': { level: number };
  /** Second Wind saved the player from death. */
  'player:revived': { hpLeft: number };
  'player:scrap': { scrap: number; toNext: number };
  'weapon:fired': { ammo: number; magSize: number };
  /** Reload started (R pressed or magazine emptied). */
  'weapon:reload': { ammo: number; magSize: number };
  /** Reload finished; the magazine is full. */
  'weapon:reloaded': { ammo: number; magSize: number };
  /** A module card was placed; `fused` = it fused (tier is the result's). */
  'mod:applied': { modId: string; slot: number; tier: number; fused: boolean };
  /** Every damage instance on an enemy (damage numbers, hit flash, hit sound, DPS meter). `uid`: Enemy.uid. */
  'enemy:damaged': { uid: number; x: number; y: number; amount: number; crit: boolean; byStatus: boolean };
  'enemy:killed': { type: string; elite: boolean; x: number; y: number; byStatus: boolean };
  'timeline:event': { type: string; at: number };
  'boss:spawned': { phase: number; hpLeft: number };
  'boss:phase': { phase: number; hpLeft: number };
  'boss:dead': { phase: number; hpLeft: number };
  'pickup:collected': { kind: string; value: number };
  'run:ended': { result: RunResult };
}
