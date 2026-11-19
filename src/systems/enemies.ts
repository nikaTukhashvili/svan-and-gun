/**
 * EnemySystem (T11-T14): pooled regular enemies and elites.
 *
 * - Behaviours are small state machines picked by `behaviour.type` in enemies.json
 *   (swarm, flank, charge, caster, tank; TDD: Enemy behaviours).
 * - Movement is steering (seek + separation) with positional push-out from obstacles, so enemies
 *   slide around rocks and houses. No pathfinding grid in Phase 1.
 * - A spatial hash, rebuilt every frame, serves separation, bullet hits and contact checks.
 *
 * Pure: positions are world pixels; the scene draws enemy i with sprite i.
 */
import type { EventBus } from '../core/eventBus';
import type { GameEvents } from '../core/events';
import { segmentCircle } from '../core/geometry';
import { u } from '../core/math';
import type { RNG } from '../core/rng';
import { SpatialHash } from '../core/spatialHash';
import type { BossDef, EnemyDef, GameConfig } from '../data/types';
import { applyDefence } from './damage';
import type { ProjectileRequest } from './enemyProjectiles';
import { REDIRECTED, type Bullet } from './bullets';
import type { ObstacleField, PushResult } from './obstacles';

export type AiState = 'chase' | 'approach' | 'circle' | 'windup' | 'dash' | 'recover' | 'charge' | 'stunned';

export type EliteTrait = 'fast' | 'deathBurst';

export interface Enemy {
  readonly index: number;
  /** Unique per spawn, so a recycled slot is never mistaken for the enemy a bullet already hit. */
  uid: number;
  active: boolean;
  def: EnemyDef;
  x: number;
  y: number;
  /** Velocity this frame (steering + knockback), for facing. */
  vx: number;
  vy: number;
  kbx: number;
  kby: number;
  hp: number;
  maxHp: number;
  defence: number;
  /** px/s */
  speed: number;
  contactDamage: number;
  /** px */
  radius: number;
  elite: boolean;
  eliteTrait: EliteTrait | null;
  state: AiState;
  stateTime: number;
  dirX: number;
  dirY: number;
  orbitSign: 1 | -1;
  castCooldown: number;
  avoidTime: number;
  avoidX: number;
  avoidY: number;
  /** Last volley that hit this enemy: knockback and on-hit mods apply once per volley. */
  lastVolleyId: number;
  // Status effects (StatusEffectSystem). Elements never read each other.
  burnStacks: number;
  burnTime: number;
  burnDps: number;
  poisonTime: number;
  poisonDps: number;
  /** Full duration of the poison, so spread poison starts fresh. */
  poisonDuration: number;
  poisonSpreadTargets: number;
  poisonSpreadRadius: number;
  /** False for poison that already spread once (spread poison does not spread again). */
  poisonCanSpread: boolean;
  /** Seconds left of the white hit flash. */
  hitFlash: number;
  /** The area boss: moved by BossController through externalVx/Vy, never by behaviours. */
  isBoss: boolean;
  externalVx: number;
  externalVy: number;
}

/** Bullet hit hooks for the mod pipeline (elements, ricochet, split shot). */
export interface HitHandler {
  /** After damage. `firstOfVolley`: first pellet of this trigger pull to hit this enemy. */
  onHit(b: Bullet, e: Enemy, firstOfVolley: boolean, x: number, y: number): void;
  /** The bullet would stop at this enemy. Return true if the handler redirected it (ricochet). */
  onStop(b: Bullet, e: Enemy, x: number, y: number): boolean;
}

export interface SpawnOptions {
  /** Minutes survived; HP scales with it at spawn time. */
  minutes: number;
  elite?: boolean;
  trait?: EliteTrait;
}

export interface DeathBurst {
  x: number;
  y: number;
  timeLeft: number;
  radius: number;
  damage: number;
}

export interface EnemySystemOptions {
  capacity: number;
  config: GameConfig;
  defs: readonly EnemyDef[];
  field: ObstacleField;
  rng: RNG;
  bus: EventBus<GameEvents>;
  /** Skip separation for enemies farther than this from the player (px). */
  cullDistance: number;
}

/** Knockback decays exponentially at this rate (1/s); total push = initial speed / rate. */
const KNOCKBACK_DECAY = 12;
const SEPARATION_STRENGTH = 0.5;
const AVOID_SEC = 0.35;
/** Cosmetic: how long an enemy flashes white when hit. */
const HIT_FLASH_SEC = 0.08;

export class EnemySystem {
  readonly enemies: readonly Enemy[];
  readonly bursts: DeathBurst[] = [];
  private readonly free: number[] = [];
  private active = 0;
  private nextUid = 1;
  private readonly hash: SpatialHash;
  private readonly defsById: Map<string, EnemyDef>;
  private readonly ids: number[] = [];
  private readonly push: PushResult = { x: 0, y: 0, nx: 0, ny: 0 };
  /** Largest radius any enemy can have, for query margins. */
  maxRadius: number;

  constructor(private readonly opts: EnemySystemOptions) {
    const { capacity, config, defs, field } = opts;
    this.defsById = new Map(defs.map((d) => [d.id, d]));
    this.maxRadius = u(Math.max(...defs.map((d) => d.radius)) * config.enemies.elite.scale);
    this.hash = new SpatialHash(field.width, field.height, u(config.world.spatialHashCellUnits), capacity);

    const list: Enemy[] = [];
    for (let i = 0; i < capacity; i++) {
      list.push({
        index: i,
        uid: 0,
        active: false,
        def: defs[0]!,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        kbx: 0,
        kby: 0,
        hp: 0,
        maxHp: 0,
        defence: 0,
        speed: 0,
        contactDamage: 0,
        radius: 0,
        elite: false,
        eliteTrait: null,
        state: 'chase',
        stateTime: 0,
        dirX: 0,
        dirY: 0,
        orbitSign: 1,
        castCooldown: 0,
        avoidTime: 0,
        avoidX: 0,
        avoidY: 0,
        lastVolleyId: 0,
        burnStacks: 0,
        burnTime: 0,
        burnDps: 0,
        poisonTime: 0,
        poisonDps: 0,
        poisonDuration: 0,
        poisonSpreadTargets: 0,
        poisonSpreadRadius: 0,
        poisonCanSpread: false,
        isBoss: false,
        hitFlash: 0,
        externalVx: 0,
        externalVy: 0,
      });
      this.free.push(capacity - 1 - i);
    }
    this.enemies = list;
  }

  get activeCount(): number {
    return this.active;
  }

  get capacity(): number {
    return this.opts.capacity;
  }

  /**
   * Spawn the area boss as a pooled enemy, so bullets, the pellet rule, statuses and contact
   * damage all work on it. BossController moves it and runs its attacks.
   */
  spawnBoss(boss: BossDef, x: number, y: number): Enemy | null {
    if (!this.defsById.has(boss.id)) {
      this.defsById.set(boss.id, {
        id: boss.id,
        name: boss.name,
        folklore: '',
        hp: boss.hp,
        defence: boss.defence,
        speed: boss.speed,
        contactDamage: boss.contactDamage,
        radius: boss.radius,
        knockbackResist: 1,
        visual: boss.visual,
        behaviour: { type: 'tank' },
      });
      this.maxRadius = Math.max(this.maxRadius, u(boss.radius));
    }
    const e = this.spawn(boss.id, x, y, { minutes: 0 }); // the boss does not scale with time
    if (e) e.isBoss = true;
    return e;
  }

  def(id: string): EnemyDef {
    const d = this.defsById.get(id);
    if (!d) throw new Error(`Unknown enemy id "${id}"`);
    return d;
  }

  // ---------- spawning and death ----------

  spawn(defId: string, x: number, y: number, o: SpawnOptions): Enemy | null {
    const index = this.free.pop();
    if (index === undefined) return null;
    const def = this.def(defId);
    const { enemies: ec } = this.opts.config;
    const elite = o.elite ?? false;
    const e = this.enemies[index]!;

    e.uid = this.nextUid++;
    e.active = true;
    e.def = def;
    e.x = x;
    e.y = y;
    e.vx = e.vy = e.kbx = e.kby = 0;
    e.maxHp = def.hp * (1 + ec.hpScalePerMinute * o.minutes) * (elite ? ec.elite.hpMult : 1);
    e.hp = e.maxHp;
    e.defence = def.defence + (elite ? ec.elite.defenceBonus : 0);
    e.speed = u(def.speed) * (elite && o.trait === 'fast' ? ec.elite.fastSpeedMult : 1);
    e.contactDamage = def.contactDamage;
    e.radius = u(def.radius) * (elite ? ec.elite.scale : 1);
    e.elite = elite;
    e.eliteTrait = elite ? (o.trait ?? null) : null;
    e.state = def.behaviour.type === 'flank' || def.behaviour.type === 'charge' ? 'approach' : 'chase';
    e.stateTime = 0;
    e.dirX = e.dirY = 0;
    e.orbitSign = this.opts.rng.chance(0.5) ? 1 : -1;
    e.castCooldown =
      def.behaviour.type === 'caster' ? this.opts.rng.range(0.5, def.behaviour.castCooldownSec) : 0;
    e.avoidTime = 0;
    e.lastVolleyId = 0;
    e.burnStacks = e.burnTime = e.burnDps = 0;
    e.poisonTime = e.poisonDps = e.poisonDuration = e.poisonSpreadTargets = e.poisonSpreadRadius = 0;
    e.poisonCanSpread = false;
    e.isBoss = false;
    e.hitFlash = 0;
    e.externalVx = e.externalVy = 0;
    this.active++;
    return e;
  }

  /** Damage from any source. Returns damage dealt. Kills at 0 HP. */
  damage(e: Enemy, raw: number, ignoreDefence: boolean, byStatus = false, crit = false): number {
    if (!e.active) return 0;
    const amount = ignoreDefence ? raw : applyDefence(raw, e.defence, this.opts.config.combat.minDamage);
    e.hp -= amount;
    if (!byStatus) e.hitFlash = HIT_FLASH_SEC;
    this.opts.bus.emit('enemy:damaged', { x: e.x, y: e.y, amount, crit, byStatus });
    if (e.hp <= 0) this.kill(e, byStatus);
    return amount;
  }

  kill(e: Enemy, byStatus = false): void {
    if (!e.active) return;
    if (e.eliteTrait === 'deathBurst') {
      const b = this.opts.config.enemies.elite.deathBurst;
      this.bursts.push({ x: e.x, y: e.y, timeLeft: b.delaySec, radius: u(b.radius), damage: b.damage });
    }
    this.onKill?.(e); // before release, while statuses are still readable (poison spread)
    this.release(e);
    this.opts.bus.emit('enemy:killed', { type: e.def.id, elite: e.elite, x: e.x, y: e.y, byStatus });
  }

  /** Called with each enemy as it dies, before its slot is freed. */
  onKill: ((e: Enemy) => void) | null = null;

  /** Active enemies within `radius` (px) of a point, edge-inclusive, written to `out`. */
  inRadius(x: number, y: number, radius: number, out: Enemy[]): Enemy[] {
    out.length = 0;
    const m = radius + this.maxRadius;
    this.hash.query(x - m, y - m, x + m, y + m, this.ids);
    for (const i of this.ids) {
      const e = this.enemies[i]!;
      if (e.active && (e.x - x) ** 2 + (e.y - y) ** 2 <= (radius + e.radius) ** 2) out.push(e);
    }
    return out;
  }

  /** Push every enemy within `radius` away from a point by about `distanceUnits` (Shock Reload). */
  knockFrom(x: number, y: number, radius: number, distanceUnits: number): void {
    for (const e of this.inRadius(x, y, radius, [])) {
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const push = u(distanceUnits) * KNOCKBACK_DECAY * (1 - e.def.knockbackResist);
      e.kbx += (dx / d) * push;
      e.kby += (dy / d) * push;
    }
  }

  /** Up to `count` nearest active enemies within `radius` of a point, skipping `exclude`. */
  nearest(
    x: number,
    y: number,
    radius: number,
    count: number,
    exclude: (e: Enemy) => boolean,
    out: Enemy[],
  ): Enemy[] {
    this.inRadius(x, y, radius, out);
    for (let i = out.length - 1; i >= 0; i--) if (exclude(out[i]!)) out.splice(i, 1);
    out.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
    if (out.length > count) out.length = count;
    return out;
  }

  /** Remove without a kill (clean-up, tests). */
  release(e: Enemy): void {
    if (!e.active) return;
    e.active = false;
    this.free.push(e.index);
    this.active--;
  }

  releaseAll(): void {
    for (const e of this.enemies) this.release(e);
    this.bursts.length = 0;
  }

  // ---------- per-frame update ----------

  /**
   * Run behaviours, move, push out of obstacles, separate, rebuild the hash.
   * Projectiles that casters fire are appended to `projectiles`.
   */
  update(dt: number, px: number, py: number, projectiles: ProjectileRequest[], playerRadius = 0): void {
    const field = this.opts.field;
    const decay = Math.exp(-KNOCKBACK_DECAY * dt);

    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      const dx = px - e.x;
      const dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;

      let vx: number;
      let vy: number;
      [vx, vy] = this.steer(e, dt, ux, uy, dist, projectiles);

      if (e.avoidTime > 0) {
        e.avoidTime -= dt;
        vx += e.avoidX * e.speed * 0.9;
        vy += e.avoidY * e.speed * 0.9;
      }

      vx += e.kbx;
      vy += e.kby;
      e.kbx *= decay;
      e.kby *= decay;
      e.vx = vx;
      e.vy = vy;

      if (field.pushOut(e.x + vx * dt, e.y + vy * dt, e.radius, this.push)) {
        // A charge or dash into a wall ends early: stunned (charge) or recovering (dash).
        const b = e.def.behaviour;
        if (e.state === 'charge' && b.type === 'charge') this.enter(e, 'stunned', b.stunSec);
        else if (e.state === 'dash' && b.type === 'flank') this.enter(e, 'recover', b.recoverSec);
        // Slide around the obstacle: go along its edge, towards the player's side.
        let tx = -this.push.ny;
        let ty = this.push.nx;
        const dot = tx * ux + ty * uy;
        const sign =
          e.avoidTime > 0
            ? Math.sign(tx * e.avoidX + ty * e.avoidY) || 1
            : Math.abs(dot) < 0.2
              ? e.orbitSign
              : Math.sign(dot);
        tx *= sign;
        ty *= sign;
        e.avoidX = tx;
        e.avoidY = ty;
        e.avoidTime = AVOID_SEC;
      }
      e.x = this.push.x;
      e.y = this.push.y;
    }

    this.rebuildHash();
    this.separate(px, py, playerRadius);
    this.rebuildHash();
  }

  /** Behaviour state machines. Returns the desired velocity. */
  private steer(
    e: Enemy,
    dt: number,
    ux: number,
    uy: number,
    dist: number,
    projectiles: ProjectileRequest[],
  ): [number, number] {
    if (e.isBoss) return [e.externalVx, e.externalVy];
    const b = e.def.behaviour;
    const s = e.speed;
    e.stateTime -= dt;

    switch (b.type) {
      case 'swarm':
      case 'tank':
        return [ux * s, uy * s];

      case 'flank': {
        const orbit = u(b.circleRadius);
        switch (e.state) {
          case 'approach':
            if (dist <= orbit * 1.3) this.enter(e, 'circle', b.circleSec);
            return [ux * s, uy * s];
          case 'circle': {
            if (e.stateTime <= 0) {
              this.enter(e, 'windup', b.windupSec, ux, uy); // direction locked at the start of the telegraph
              return [0, 0];
            }
            // Tangent around the player, corrected towards the orbit radius.
            const corr = Math.max(-1, Math.min(1, (dist - orbit) / orbit)) * 1.5;
            const tx = -uy * e.orbitSign + ux * corr;
            const ty = ux * e.orbitSign + uy * corr;
            const len = Math.hypot(tx, ty) || 1;
            return [(tx / len) * s, (ty / len) * s];
          }
          case 'windup':
            if (e.stateTime <= 0) this.enter(e, 'dash', b.dashSec, e.dirX, e.dirY);
            return [0, 0];
          case 'dash': {
            if (e.stateTime <= 0) this.enter(e, 'recover', b.recoverSec);
            const ds = u(b.dashSpeed);
            return [e.dirX * ds, e.dirY * ds];
          }
          case 'recover':
            if (e.stateTime <= 0) this.enter(e, dist > orbit * 2 ? 'approach' : 'circle', b.circleSec);
            return [ux * s * 0.4, uy * s * 0.4];
          default:
            this.enter(e, 'approach');
            return [ux * s, uy * s];
        }
      }

      case 'charge':
        switch (e.state) {
          case 'approach':
            if (dist <= u(b.triggerRange)) this.enter(e, 'windup', b.windupSec, ux, uy);
            return [ux * s, uy * s];
          case 'windup':
            if (e.stateTime <= 0) this.enter(e, 'charge', b.chargeMaxSec, e.dirX, e.dirY);
            return [0, 0];
          case 'charge': {
            if (e.stateTime <= 0) this.enter(e, 'stunned', b.stunSec);
            const cs = u(b.chargeSpeed);
            return [e.dirX * cs, e.dirY * cs];
          }
          case 'stunned':
            if (e.stateTime <= 0) this.enter(e, 'approach');
            return [0, 0];
          default:
            this.enter(e, 'approach');
            return [ux * s, uy * s];
        }

      case 'caster': {
        e.castCooldown -= dt;
        if (e.castCooldown <= 0 && dist <= u(b.projectileRange)) {
          e.castCooldown = b.castCooldownSec;
          projectiles.push({
            x: e.x,
            y: e.y,
            angle: Math.atan2(uy, ux),
            speed: u(b.projectileSpeed),
            range: u(b.projectileRange),
            damage: b.projectileDamage,
            slowFactor: b.slowFactor,
            slowSec: b.slowSec,
          });
        }
        if (dist > u(b.keepMax)) return [ux * s, uy * s];
        if (dist < u(b.keepMin)) return [-ux * s, -uy * s];
        // In the band: drift sideways so it is not a sitting target.
        return [-uy * e.orbitSign * s * 0.4, ux * e.orbitSign * s * 0.4];
      }
    }
  }

  private enter(e: Enemy, state: AiState, time = 0, dirX = e.dirX, dirY = e.dirY): void {
    e.state = state;
    e.stateTime = time;
    e.dirX = dirX;
    e.dirY = dirY;
  }

  private rebuildHash(): void {
    this.hash.clear();
    for (const e of this.enemies) if (e.active) this.hash.insert(e.index, e.x, e.y);
  }

  /** Soft positional separation between overlapping neighbours. */
  private separate(px: number, py: number, playerRadius: number): void {
    const cull2 = this.opts.cullDistance * this.opts.cullDistance;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const pdx = e.x - px;
      const pdy = e.y - py;
      const pd2 = pdx * pdx + pdy * pdy;
      if (pd2 > cull2) continue;

      // Stop at the player's edge instead of piling on top of him. Leave 1 px of overlap so
      // contact damage still registers.
      const touch = e.radius + playerRadius - 1;
      if (playerRadius > 0 && pd2 < touch * touch) {
        const pd = Math.sqrt(pd2) || 1;
        e.x = px + (pdx / pd) * touch;
        e.y = py + (pdy / pd) * touch;
      }
      if (e.isBoss) continue; // others make room for the boss, not the other way round
      const reach = e.radius + this.maxRadius;
      this.hash.query(e.x - reach, e.y - reach, e.x + reach, e.y + reach, this.ids);
      for (const j of this.ids) {
        if (j === e.index) continue;
        const o = this.enemies[j]!;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const min = e.radius + o.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        // Each side of a pair is processed once, so each moves half the overlap (softened).
        const pushLen = (min - d) * 0.5 * SEPARATION_STRENGTH;
        if (d > 0) {
          e.x += (dx / d) * pushLen;
          e.y += (dy / d) * pushLen;
        } else {
          e.x += e.index < j ? pushLen : -pushLen;
        }
      }
    }
  }

  // ---------- queries used by the scene ----------

  /**
   * Bullet hit test along the segment a bullet moved this frame (TDD: ModPipeline).
   * Hits each enemy once per bullet; piercing bullets continue. Returns where the bullet
   * stopped (0..1) or null if it passed through everything.
   */
  hitSegment(
    b: Bullet,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    bulletRadius: number,
    handler?: HitHandler,
  ): number | null {
    const m = this.maxRadius + bulletRadius;
    const config = this.opts.config;
    for (;;) {
      this.hash.query(
        Math.min(x0, x1) - m,
        Math.min(y0, y1) - m,
        Math.max(x0, x1) + m,
        Math.max(y0, y1) + m,
        this.ids,
      );
      let best: Enemy | null = null;
      let bestT = 2;
      for (const i of this.ids) {
        const e = this.enemies[i]!;
        if (!e.active || b.hitIds.has(e.uid)) continue;
        const t = segmentCircle(x0, y0, x1, y1, e.x, e.y, e.radius + bulletRadius);
        if (t !== null && t < bestT) {
          bestT = t;
          best = e;
        }
      }
      if (!best) return null;

      b.hitIds.add(best.uid);
      const hx = x0 + (x1 - x0) * bestT;
      const hy = y0 + (y1 - y0) * bestT;
      // Knockback and on-hit mods once per enemy per volley (the pellet rule), so six Double
      // Barrel pellets push and burn like one shot.
      const firstOfVolley = best.lastVolleyId !== b.volleyId;
      if (firstOfVolley) {
        best.lastVolleyId = b.volleyId;
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const push = u(b.knockback) * KNOCKBACK_DECAY * (1 - best.def.knockbackResist);
        best.kbx += (b.vx / speed) * push;
        best.kby += (b.vy / speed) * push;
      }
      this.damage(best, b.damage * (b.crit ? config.combat.critMultiplier : 1), false, false, b.crit);
      handler?.onHit(b, best, firstOfVolley, hx, hy);

      if (b.pierceLeft > 0) {
        b.pierceLeft--;
        continue;
      }
      if (handler?.onStop(b, best, hx, hy)) return REDIRECTED;
      return bestT;
    }
  }

  /** Largest contact damage among enemies touching a circle (the player). 0 if none. */
  contactDamageAt(x: number, y: number, r: number): number {
    const m = r + this.maxRadius;
    this.hash.query(x - m, y - m, x + m, y + m, this.ids);
    let best = 0;
    for (const i of this.ids) {
      const e = this.enemies[i]!;
      if (!e.active) continue;
      const min = e.radius + r;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 < min * min && e.contactDamage > best) best = e.contactDamage;
    }
    return best;
  }

  /** Tick elite death bursts; `onExplode` gets each one that goes off. */
  updateBursts(dt: number, onExplode: (b: DeathBurst) => void): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.timeLeft -= dt;
      if (b.timeLeft <= 0) {
        this.bursts.splice(i, 1);
        onExplode(b);
      }
    }
  }
}
