/**
 * Enemy projectiles (Rokapi's slowing curse; boss boulders use their own telegraphed attack).
 * Fixed pool, swept against obstacles and the player.
 */
import { segmentCircle } from '../core/geometry';
import type { ObstacleField } from './obstacles';

export interface EnemyProjectile {
  readonly index: number;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  distLeft: number;
  damage: number;
  slowFactor: number;
  slowSec: number;
}

export interface ProjectileRequest {
  x: number;
  y: number;
  angle: number;
  speed: number;
  range: number;
  damage: number;
  slowFactor: number;
  slowSec: number;
}

export class EnemyProjectileSystem {
  readonly projectiles: readonly EnemyProjectile[];
  private readonly free: number[] = [];
  private active = 0;

  constructor(
    readonly capacity: number,
    readonly radius: number,
  ) {
    const list: EnemyProjectile[] = [];
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
        slowFactor: 0,
        slowSec: 0,
      });
      this.free.push(capacity - 1 - i);
    }
    this.projectiles = list;
  }

  get activeCount(): number {
    return this.active;
  }

  spawn(r: ProjectileRequest): EnemyProjectile | null {
    const i = this.free.pop();
    if (i === undefined) return null;
    const p = this.projectiles[i]!;
    p.active = true;
    p.x = r.x;
    p.y = r.y;
    p.vx = Math.cos(r.angle) * r.speed;
    p.vy = Math.sin(r.angle) * r.speed;
    p.distLeft = r.range;
    p.damage = r.damage;
    p.slowFactor = r.slowFactor;
    p.slowSec = r.slowSec;
    this.active++;
    return p;
  }

  release(p: EnemyProjectile): void {
    if (!p.active) return;
    p.active = false;
    this.free.push(p.index);
    this.active--;
  }

  releaseAll(): void {
    for (const p of this.projectiles) this.release(p);
  }

  /** Move projectiles; call `onHitPlayer` for each one that reaches the player (it is then removed). */
  update(
    dt: number,
    obstacles: ObstacleField,
    player: { x: number; y: number; radius: number },
    onHitPlayer: (p: EnemyProjectile) => void,
  ): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      const speed = Math.hypot(p.vx, p.vy);
      const step = Math.min(speed * dt, p.distLeft);
      const f = speed > 0 ? step / speed : 0;
      const x1 = p.x + p.vx * f;
      const y1 = p.y + p.vy * f;

      const tPlayer = segmentCircle(p.x, p.y, x1, y1, player.x, player.y, player.radius + this.radius);
      const tWall = obstacles.firstHit(p.x, p.y, x1, y1, this.radius);
      if (tPlayer !== null && (tWall === null || tPlayer <= tWall)) {
        onHitPlayer(p);
        this.release(p);
        continue;
      }
      p.x = x1;
      p.y = y1;
      p.distLeft -= step;
      if (tWall !== null || p.distLeft <= 0) this.release(p);
    }
  }
}
