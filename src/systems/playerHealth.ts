/**
 * Player HP, defence, invulnerability after a hit, regen and death (T10).
 */
import type { EventBus } from '../core/eventBus';
import type { GameEvents } from '../core/events';
import { applyDefence } from './damage';
import type { PlayerStats } from './stats';

export interface PlayerHealthOptions {
  invulnerableSec: number;
  minDamage: number;
  reviveHpFraction: number;
  reviveInvulnerableSec: number;
}

export class PlayerHealth {
  hp: number;
  maxHp: number;
  private defence: number;
  private regen: number;
  invulnerableLeft = 0;
  dead = false;
  /** Second Wind charges (market buff): revive instead of dying. */
  revivesLeft: number;
  /** Debug/test only: ignore all hits (stress test, ?debug=1). */
  godMode = false;

  constructor(
    stats: PlayerStats,
    private readonly opts: PlayerHealthOptions,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.defence = stats.defence;
    this.regen = stats.hpRegen;
    this.revivesLeft = Math.round(stats.revives);
  }

  /** Apply new stats (level-up card). Raising max HP heals by the same amount. */
  setStats(stats: PlayerStats): void {
    const gained = stats.maxHp - this.maxHp;
    this.maxHp = stats.maxHp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, gained));
    this.defence = stats.defence;
    this.regen = stats.hpRegen;
  }

  get invulnerable(): boolean {
    return this.invulnerableLeft > 0;
  }

  update(dt: number): void {
    if (this.dead) return;
    if (this.invulnerableLeft > 0) this.invulnerableLeft = Math.max(0, this.invulnerableLeft - dt);
    if (this.regen > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
  }

  /**
   * A hit from an enemy. Returns the damage actually taken (0 while invulnerable or dead).
   * `ignoreDefence` is for explosions.
   */
  takeHit(raw: number, ignoreDefence = false): number {
    if (this.dead || this.invulnerable || this.godMode || raw <= 0) return 0;
    const amount = applyDefence(raw, ignoreDefence ? 0 : this.defence, this.opts.minDamage);
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableLeft = this.opts.invulnerableSec;
    this.bus.emit('player:damaged', { amount, hpLeft: this.hp });
    if (this.hp <= 0 && this.revivesLeft > 0) {
      this.revivesLeft--;
      this.hp = this.maxHp * this.opts.reviveHpFraction;
      this.invulnerableLeft = this.opts.reviveInvulnerableSec;
      this.bus.emit('player:revived', { hpLeft: this.hp });
    } else if (this.hp <= 0) {
      this.dead = true;
      this.bus.emit('run:ended', { result: 'defeat' });
    }
    return amount;
  }

  heal(amount: number): void {
    if (this.dead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
