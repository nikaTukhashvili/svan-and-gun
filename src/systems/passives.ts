/**
 * Legendary passives (GDD: Gear > Legendaries). Pure: the scene feeds it movement, kills and
 * shots, and reads back the bonuses.
 *
 * - towerKeeper: standing still for stillSec gives +damagePct% damage until the Svan moves.
 * - wolfPelt: a kill gives +speedPct% move speed for durationSec (a new kill refreshes it).
 * - emberSmith: fire modules count as `tiers` tiers higher (read by modPipeline, not here).
 * - feast: each scrap pickup heals `heal` HP.
 * - mountainRunner: moving for chargeSec charges the gun; the next shot pierces every enemy.
 */
import type { GameData, PassiveType } from '../data/types';
import { itemDef, passiveParams, type Equipment } from './items';
import { addBonus, emptyBonuses, type StatBonuses } from './stats';

/** Passive numbers of every legendary worn, by passive type. */
export type ActivePassives = Partial<Record<PassiveType, Record<string, number>>>;

export function activePassives(data: GameData, equipment: Equipment): ActivePassives {
  const out: ActivePassives = {};
  for (const item of equipment) {
    if (!item) continue;
    const ref = itemDef(data, item.id);
    if (ref.kind !== 'legendary') continue;
    out[ref.def.passive.type] = passiveParams(ref.def.passive, item.level);
  }
  return out;
}

/** Ember Smith: how many tiers higher the fire modules count (0 without it). */
export const fireTierBonus = (p: ActivePassives): number => p.emberSmith?.tiers ?? 0;

/** Pierce given to a fully charged shot: every enemy in its path. */
export const PIERCE_ALL = 999;

export class PassiveRuntime {
  private still = 0;
  private wolfLeft = 0;
  private charge = 0;
  private towerOn = false;
  private wolfOn = false;

  constructor(private readonly passives: () => ActivePassives) {}

  /** Per frame. Returns true when the stat bonuses changed (recompute the stats). */
  update(dt: number, moving: boolean): boolean {
    const p = this.passives();
    const tower = this.towerOn;
    const wolf = this.wolfOn;

    if (p.towerKeeper) {
      this.still = moving ? 0 : this.still + dt;
      this.towerOn = this.still >= p.towerKeeper.stillSec!;
    } else this.towerOn = false;

    this.wolfLeft = p.wolfPelt ? Math.max(0, this.wolfLeft - dt) : 0;
    this.wolfOn = this.wolfLeft > 0;

    if (p.mountainRunner && moving) this.charge = Math.min(p.mountainRunner.chargeSec!, this.charge + dt);
    if (!p.mountainRunner) this.charge = 0;

    return tower !== this.towerOn || wolf !== this.wolfOn;
  }

  /** A kill. Returns true when the stat bonuses changed. */
  onKill(): boolean {
    const wolf = this.passives().wolfPelt;
    if (!wolf) return false;
    const was = this.wolfOn;
    this.wolfLeft = wolf.durationSec!;
    this.wolfOn = true;
    return !was;
  }

  /** HP healed by one scrap pickup. */
  scrapHeal(): number {
    return this.passives().feast?.heal ?? 0;
  }

  /** Mountain Runner: 0..1 charge (1 = the next shot pierces everything). */
  get chargeFraction(): number {
    const p = this.passives().mountainRunner;
    return p ? this.charge / p.chargeSec! : 0;
  }

  /** A shot is fired: true (and the charge is spent) when it is fully charged. */
  consumeCharge(): boolean {
    if (this.chargeFraction < 1) return false;
    this.charge = 0;
    return true;
  }

  get towerKeeperActive(): boolean {
    return this.towerOn;
  }

  get wolfActive(): boolean {
    return this.wolfOn;
  }

  /** Bonuses the passives give right now. */
  bonuses(): StatBonuses {
    const p = this.passives();
    const out = emptyBonuses();
    if (this.towerOn && p.towerKeeper) addBonus(out, 'damage', 'mult', p.towerKeeper.damagePct! / 100);
    if (this.wolfOn && p.wolfPelt) addBonus(out, 'moveSpeed', 'mult', p.wolfPelt.speedPct! / 100);
    return out;
  }

  reset(): void {
    this.still = 0;
    this.wolfLeft = 0;
    this.charge = 0;
    this.towerOn = false;
    this.wolfOn = false;
  }
}
