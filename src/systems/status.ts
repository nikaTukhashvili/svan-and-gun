/**
 * StatusEffectSystem (T21): Fire, Poison, Lightning. Effects tick every statusTickSec (0.5 s),
 * not every frame. Elements never read each other; an enemy can carry all three at once.
 * Status damage ignores defence and counts as kills for scrap, score and Scavenger.
 */
import type { Enemy, EnemySystem } from './enemies';

export interface LightningArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Brimstone burst: where it went off, for the effects layer. */
export interface Blast {
  x: number;
  y: number;
  radius: number;
}

export class StatusEffectSystem {
  private tickTimer = 0;
  private readonly scratch: Enemy[] = [];
  /** Brimstone: an enemy that dies burning AND poisoned bursts (px radius). Set from the pipeline. */
  deathBlast: { damage: number; radius: number } | null = null;
  /** Bursts since the scene last drained this list. */
  readonly blasts: Blast[] = [];

  constructor(
    private readonly enemies: EnemySystem,
    private readonly tickSec: number,
  ) {
    enemies.onKill = (e) => {
      this.blast(e);
      this.spreadPoison(e);
    };
  }

  /** Ember Shot: +1 burn stack (up to maxStacks), timer refreshed. */
  applyBurn(e: Enemy, dps: number, durationSec: number, maxStacks: number): void {
    e.burnStacks = Math.min(e.burnStacks + 1, maxStacks);
    e.burnDps = dps;
    e.burnTime = durationSec;
  }

  /** Venom Shot: does not stack; a new hit only refreshes the timer. */
  applyPoison(
    e: Enemy,
    dps: number,
    durationSec: number,
    spreadTargets: number,
    spreadRadius: number,
    canSpread = true,
  ): void {
    if (e.poisonTime > 0) {
      e.poisonTime = Math.max(e.poisonTime, durationSec);
      return;
    }
    e.poisonTime = durationSec;
    e.poisonDps = dps;
    e.poisonDuration = durationSec;
    e.poisonSpreadTargets = spreadTargets;
    e.poisonSpreadRadius = spreadRadius;
    e.poisonCanSpread = canSpread;
  }

  /**
   * Thunder Spark: hit up to `chains` more enemies near `from` for `damage` each (defence
   * applies). Never hits the same enemy twice in one chain. Arcs are appended to `arcs`.
   */
  chainLightning(
    from: Enemy,
    chains: number,
    radius: number,
    damage: number,
    arcs: LightningArc[],
    /** Hybrids: called for each enemy the chain reaches, before its damage. */
    onReach?: (e: Enemy) => void,
  ): void {
    const hit = new Set<number>([from.uid]);
    let x = from.x;
    let y = from.y;
    for (let i = 0; i < chains; i++) {
      const [next] = this.enemies.nearest(x, y, radius, 1, (e) => hit.has(e.uid), this.scratch);
      if (!next) break;
      hit.add(next.uid);
      arcs.push({ x0: x, y0: y, x1: next.x, y1: next.y });
      x = next.x;
      y = next.y;
      onReach?.(next);
      this.enemies.damage(next, damage, false);
    }
  }

  update(dt: number): void {
    this.tickTimer += dt;
    while (this.tickTimer >= this.tickSec) {
      this.tickTimer -= this.tickSec;
      this.tick(this.tickSec);
    }
  }

  private tick(t: number): void {
    for (const e of this.enemies.enemies) {
      if (!e.active) continue;
      let damage = 0;
      if (e.burnStacks > 0) {
        damage += e.burnStacks * e.burnDps * t;
        e.burnTime -= t;
        if (e.burnTime <= 0) e.burnStacks = 0;
      }
      if (e.poisonTime > 0) {
        damage += e.poisonDps * Math.min(t, e.poisonTime);
        e.poisonTime -= t;
      }
      if (damage > 0) this.enemies.damage(e, damage, true, true);
    }
  }

  /** Brimstone: a burning, poisoned enemy bursts on death (damage ignores defence). */
  private blast(dead: Enemy): void {
    const b = this.deathBlast;
    if (!b || dead.burnStacks <= 0 || dead.poisonTime <= 0) return;
    this.blasts.push({ x: dead.x, y: dead.y, radius: b.radius });
    for (const e of this.enemies.inRadius(dead.x, dead.y, b.radius, [])) {
      if (e !== dead) this.enemies.damage(e, b.damage, true, true);
    }
  }

  /** A poisoned enemy dies: the poison jumps once to the nearest enemies, and stops there. */
  private spreadPoison(dead: Enemy): void {
    if (dead.poisonTime <= 0 || !dead.poisonCanSpread || dead.poisonSpreadTargets <= 0) return;
    const targets = this.enemies.nearest(
      dead.x,
      dead.y,
      dead.poisonSpreadRadius,
      dead.poisonSpreadTargets,
      (e) => e === dead,
      [],
    );
    for (const e of targets) this.applyPoison(e, dead.poisonDps, dead.poisonDuration, 0, 0, false);
  }
}
