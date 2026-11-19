/**
 * BulletSystem (T07): fixed-size pool of player bullets moved by swept segments.
 * Pure state; the scene draws slot i with sprite i. Enemy hits are added in T11 through the
 * `onSegment` callback, which receives the segment each bullet travelled this frame.
 */
import type { ObstacleField } from './obstacles';
import type { ShotSpec } from './weapon';

export interface Bullet {
  readonly index: number;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Distance left before the bullet expires (px). */
  distLeft: number;
  damage: number;
  /** Enemies it can still pass through. */
  pierceLeft: number;
  knockback: number;
  crit: boolean;
  volleyId: number;
  /** 0 = fired by the trigger; children (shards, ricochets) are 1, 2. */
  generation: number;
  /** First barrel slot whose on-hit mods apply to this bullet (children only get later slots). */
  fromSlot: number;
  /** Ricochet bounces left; -1 = ricochet has not triggered for this bullet yet. */
  bouncesLeft: number;
  /** Ids of enemies already hit, so a piercing bullet hits each once. */
  readonly hitIds: Set<number>;
}

/** Returned by a SegmentHandler that moved the bullet itself (a ricochet bounce). */
export const REDIRECTED = -1;

/**
 * Called once per active bullet per frame with the segment it moved along. Return the
 * fraction (0..1) at which the bullet stopped, or null if it kept going. May release it.
 */
export type SegmentHandler = (
  bullet: Bullet,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => number | null;

export class BulletSystem {
  readonly bullets: readonly Bullet[];
  private readonly free: number[] = [];
  private active = 0;

  constructor(
    readonly capacity: number,
    readonly radius: number,
  ) {
    const list: Bullet[] = [];
    for (let i = 0; i < capacity; i++) {
      list.push({
        index: i,
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        distLeft: 0,
        damage: 0,
        pierceLeft: 0,
        knockback: 0,
        crit: false,
        volleyId: 0,
        generation: 0,
        fromSlot: 0,
        bouncesLeft: -1,
        hitIds: new Set(),
      });
      this.free.push(capacity - 1 - i); // pop() hands out slot 0 first
    }
    this.bullets = list;
  }

  get activeCount(): number {
    return this.active;
  }

  /** Spawn from a ShotSpec at (x, y). Returns null when the cap is reached (the shot is dropped). */
  spawn(spec: ShotSpec, x: number, y: number, generation = 0, fromSlot = 0): Bullet | null {
    const index = this.free.pop();
    if (index === undefined) return null;
    const b = this.bullets[index]!;
    b.active = true;
    b.x = x;
    b.y = y;
    b.vx = Math.cos(spec.angle) * spec.speed;
    b.vy = Math.sin(spec.angle) * spec.speed;
    b.distLeft = spec.range;
    b.damage = spec.damage;
    b.pierceLeft = spec.pierce;
    b.knockback = spec.knockback;
    b.crit = spec.crit;
    b.volleyId = spec.volleyId;
    b.generation = generation;
    b.fromSlot = fromSlot;
    b.bouncesLeft = -1;
    b.hitIds.clear();
    this.active++;
    return b;
  }

  release(b: Bullet): void {
    if (!b.active) return;
    b.active = false;
    this.free.push(b.index);
    this.active--;
  }

  releaseAll(): void {
    for (const b of this.bullets) this.release(b);
  }

  /**
   * Move every bullet along its segment for this frame. Obstacles stop bullets; range expires
   * them. `onSegment` (enemy hits, T11) runs on the part of the segment before any obstacle.
   */
  update(dt: number, obstacles: ObstacleField, onSegment?: SegmentHandler): void {
    for (const b of this.bullets) {
      if (!b.active) continue;

      const speed = Math.hypot(b.vx, b.vy);
      const step = Math.min(speed * dt, b.distLeft);
      const f = speed > 0 ? step / speed : 0;
      const x0 = b.x;
      const y0 = b.y;
      let x1 = x0 + b.vx * f;
      let y1 = y0 + b.vy * f;

      const tWall = obstacles.firstHit(x0, y0, x1, y1, this.radius);
      if (tWall !== null) {
        x1 = x0 + (x1 - x0) * tWall;
        y1 = y0 + (y1 - y0) * tWall;
      }

      if (onSegment) {
        const tStop = onSegment(b, x0, y0, x1, y1);
        if (!b.active) continue;
        if (tStop !== null) {
          if (tStop < 0) continue; // REDIRECTED: the handler moved the bullet (ricochet)
          b.x = x0 + (x1 - x0) * tStop;
          b.y = y0 + (y1 - y0) * tStop;
          this.release(b);
          continue;
        }
      }

      b.x = x1;
      b.y = y1;
      b.distLeft -= tWall === null ? step : step * tWall;
      if (tWall !== null || b.distLeft <= 0) this.release(b);
    }
  }
}
