/**
 * BossController (T26): the Devi Chieftain's phase state machine (TDD: Boss).
 *
 * The boss body is a pooled Enemy (EnemySystem.spawnBoss), so bullets and statuses work on it.
 * This controller decides where it walks and which attack it uses:
 *  - phases change at the HP thresholds in boss.json (boss:phase event);
 *  - slam: wind-up, then an expanding shockwave ring that hurts once on contact;
 *  - boulder: the landing point is marked `telegraphSec` ahead, hurts on impact, leaves rubble
 *    that blocks movement and bullets for `rubbleSec`;
 *  - summon: a ring of Kaji around the boss;
 *  - enrage after `enrageAfterSec`: +50% damage.
 */
import type { EventBus } from '../core/eventBus';
import type { GameEvents } from '../core/events';
import { u } from '../core/math';
import type { RNG } from '../core/rng';
import type { BossDef } from '../data/types';
import type { Enemy, EnemySystem } from './enemies';
import type { ObstacleField, ObstacleShape } from './obstacles';

export type BossState = 'walk' | 'slamWindup' | 'dead';

export interface ShockRing {
  x: number;
  y: number;
  radius: number;
  hitPlayer: boolean;
}

export interface Boulder {
  x: number;
  y: number;
  timeLeft: number;
}

export interface Rubble {
  x: number;
  y: number;
  radius: number;
  timeLeft: number;
  shape: ObstacleShape;
}

export interface SummonRequest {
  enemy: string;
  count: number;
  radius: number;
  x: number;
  y: number;
}

export class BossController {
  enemy: Enemy | null = null;
  phase = 0;
  state: BossState = 'walk';
  enraged = false;
  readonly rings: ShockRing[] = [];
  readonly boulders: Boulder[] = [];
  readonly rubble: Rubble[] = [];
  private stateTime = 0;
  private cooldown = 0;
  private slamsLeft = 0;
  private spawnedAt = 0;
  private uid = 0;

  constructor(
    readonly def: BossDef,
    private readonly enemies: EnemySystem,
    private readonly field: ObstacleField,
    private readonly rng: RNG,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  get alive(): boolean {
    return this.enemy !== null && this.enemy.active && this.enemy.uid === this.uid;
  }

  get hpFraction(): number {
    return this.alive ? Math.max(0, this.enemy!.hp / this.enemy!.maxHp) : 0;
  }

  get damageMult(): number {
    return this.enraged ? this.def.enrageDamageMult : 1;
  }

  spawn(x: number, y: number, timeSec: number): boolean {
    const e = this.enemies.spawnBoss(this.def, x, y);
    if (!e) return false;
    this.enemy = e;
    this.uid = e.uid;
    this.phase = 0;
    this.state = 'walk';
    this.cooldown = this.def.phases[0]!.cooldownSec;
    this.spawnedAt = timeSec;
    this.enraged = false;
    this.bus.emit('boss:spawned', { phase: 1, hpLeft: e.hp });
    return true;
  }

  /**
   * Advance the boss. `hurt(damage, ignoreDefence)` damages the player; summons are appended
   * to `summons`. Rubble that expires is removed from the obstacle field here.
   */
  update(
    dt: number,
    timeSec: number,
    px: number,
    py: number,
    playerRadius: number,
    hurt: (damage: number, ignoreDefence: boolean) => void,
    summons: SummonRequest[],
  ): void {
    this.updateHazards(dt, px, py, playerRadius, hurt);
    if (!this.alive || this.state === 'dead') return;
    const e = this.enemy!;
    const def = this.def;

    if (!this.enraged && timeSec - this.spawnedAt >= def.enrageAfterSec) this.enraged = true;
    e.contactDamage = def.contactDamage * this.damageMult;

    // Phase changes at HP thresholds.
    while (this.phase + 1 < def.phases.length && this.hpFraction < def.phases[this.phase + 1]!.fromHp) {
      this.phase++;
      this.bus.emit('boss:phase', { phase: this.phase + 1, hpLeft: e.hp });
    }
    const ph = def.phases[this.phase]!;
    const speed = u(def.speed) * ph.speedMult * (this.enraged ? 1.15 : 1);

    switch (this.state) {
      case 'walk': {
        const dx = px - e.x;
        const dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.externalVx = (dx / d) * speed;
        e.externalVy = (dy / d) * speed;
        this.cooldown -= dt;
        if (this.cooldown <= 0) this.startAttack(this.rng.pick(ph.attacks), px, py, summons);
        break;
      }
      case 'slamWindup':
        e.externalVx = e.externalVy = 0;
        e.state = 'windup'; // the view flashes enemies in wind-up
        this.stateTime -= dt;
        if (this.stateTime <= 0) {
          this.rings.push({ x: e.x, y: e.y, radius: e.radius, hitPlayer: false });
          this.slamsLeft--;
          if (this.slamsLeft > 0) this.stateTime = def.attacks.slam.windupSec * 0.6;
          else this.endAttack();
        }
        break;
      default:
        break;
    }
  }

  /** Boss died (EnemySystem emitted enemy:killed for it). */
  onDeath(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.boulders.length = 0;
    this.rings.length = 0;
    this.bus.emit('boss:dead', { phase: this.phase + 1, hpLeft: 0 });
  }

  private startAttack(
    attack: 'slam' | 'boulder' | 'summon',
    px: number,
    py: number,
    summons: SummonRequest[],
  ): void {
    const e = this.enemy!;
    const a = this.def.attacks;
    switch (attack) {
      case 'slam':
        this.state = 'slamWindup';
        this.stateTime = a.slam.windupSec;
        this.slamsLeft = this.def.phases[this.phase]!.slamRepeat;
        return;
      case 'boulder': {
        // Aim where the player is now; they have telegraphSec to move away.
        const dx = px - e.x;
        const dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(d, u(a.boulder.throwRange));
        this.boulders.push({
          x: e.x + (dx / d) * reach,
          y: e.y + (dy / d) * reach,
          timeLeft: a.boulder.telegraphSec,
        });
        break;
      }
      case 'summon':
        summons.push({
          enemy: a.summon.enemy,
          count: a.summon.count,
          radius: u(a.summon.radius),
          x: e.x,
          y: e.y,
        });
        break;
    }
    this.endAttack();
  }

  private endAttack(): void {
    this.state = 'walk';
    if (this.enemy) this.enemy.state = 'chase';
    this.cooldown = this.def.phases[this.phase]!.cooldownSec;
  }

  private updateHazards(
    dt: number,
    px: number,
    py: number,
    playerRadius: number,
    hurt: (damage: number, ignoreDefence: boolean) => void,
  ): void {
    const a = this.def.attacks;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.radius += u(a.slam.ringSpeed) * dt;
      const d = Math.hypot(px - r.x, py - r.y);
      if (!r.hitPlayer && Math.abs(d - r.radius) <= u(a.slam.ringThickness) / 2 + playerRadius) {
        r.hitPlayer = true;
        hurt(a.slam.damage * this.damageMult, false);
      }
      if (r.radius >= u(a.slam.ringMaxRadius)) this.rings.splice(i, 1);
    }

    for (let i = this.boulders.length - 1; i >= 0; i--) {
      const b = this.boulders[i]!;
      b.timeLeft -= dt;
      if (b.timeLeft > 0) continue;
      this.boulders.splice(i, 1);
      if (Math.hypot(px - b.x, py - b.y) <= u(a.boulder.impactRadius) + playerRadius) {
        hurt(a.boulder.damage * this.damageMult, true);
      }
      const radius = u(a.boulder.rubbleRadius);
      // No rubble on top of the player, or they would be stuck inside it.
      if (Math.hypot(px - b.x, py - b.y) > radius + playerRadius) {
        this.rubble.push({
          x: b.x,
          y: b.y,
          radius,
          timeLeft: a.boulder.rubbleSec,
          shape: this.field.addCircle(b.x, b.y, radius),
        });
      }
    }

    for (let i = this.rubble.length - 1; i >= 0; i--) {
      const r = this.rubble[i]!;
      r.timeLeft -= dt;
      if (r.timeLeft > 0) continue;
      this.field.remove(r.shape);
      this.rubble.splice(i, 1);
    }
  }
}
