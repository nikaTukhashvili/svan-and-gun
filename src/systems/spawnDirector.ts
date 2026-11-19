/**
 * SpawnDirector (T13): reads timeline.json and keeps the enemy count on schedule.
 *
 * - Each segment has maxAlive, spawnPerSecond and weighted enemy types.
 * - maxAlive only gates regular spawns; events (elites, swarm rings, boss summons) ignore it
 *   and are limited only by the enemy pool. During the boss, maxAlive x bossSpawnFactor.
 * - Events fire once when the run timer passes their time (skipping time fires them all).
 *
 * Pure: returns spawn requests; the scene picks positions and calls EnemySystem.spawn.
 */
import type { RNG } from '../core/rng';
import type { TimelineDef, TimelineEvent, TimelineSegment } from '../data/types';
import type { EliteTrait } from './enemies';

export type SpawnRequest =
  | { kind: 'regular'; enemy: string }
  | { kind: 'elite'; enemy: string; trait: EliteTrait }
  | { kind: 'ring'; enemy: string; count: number; radius: number };

export class SpawnDirector {
  private accumulator = 0;
  private nextEvent = 0;
  private readonly events: TimelineEvent[];
  /** Set by the scene when the boss spawns (M4). */
  bossActive = false;

  constructor(
    private readonly timeline: TimelineDef,
    private readonly rng: RNG,
  ) {
    this.events = [...timeline.events].sort((a, b) => a.at - b.at);
  }

  segmentAt(timeSec: number): TimelineSegment {
    const segs = this.timeline.segments;
    for (const s of segs) if (timeSec >= s.from && (s.to === null || timeSec < s.to)) return s;
    return segs[segs.length - 1]!;
  }

  maxAliveAt(timeSec: number): number {
    const max = this.segmentAt(timeSec).maxAlive;
    return this.bossActive ? Math.floor(max * this.timeline.bossSpawnFactor) : max;
  }

  /**
   * Advance to `timeSec`. Appends spawn requests to `spawns` and fired timeline events to
   * `fired`. `alive` is the current regular+elite enemy count.
   */
  update(dt: number, timeSec: number, alive: number, spawns: SpawnRequest[], fired: TimelineEvent[]): void {
    while (this.nextEvent < this.events.length && this.events[this.nextEvent]!.at <= timeSec) {
      const ev = this.events[this.nextEvent++]!;
      fired.push(ev);
      if (ev.type === 'elite') spawns.push({ kind: 'elite', enemy: ev.enemy, trait: ev.trait });
      else if (ev.type === 'swarmRing')
        spawns.push({ kind: 'ring', enemy: ev.enemy, count: ev.count, radius: ev.radius });
    }

    const seg = this.segmentAt(timeSec);
    const max = this.maxAliveAt(timeSec);
    if (seg.spawnPerSecond <= 0 || max <= 0) {
      this.accumulator = 0;
      return;
    }

    this.accumulator += seg.spawnPerSecond * dt;
    let room = max - alive;
    const weights = Object.entries(seg.weights) as [string, number][];
    while (this.accumulator >= 1 && room > 0) {
      spawns.push({ kind: 'regular', enemy: this.rng.weighted(weights) });
      this.accumulator -= 1;
      room--;
    }
    // At the cap, do not bank spawns for a burst when room frees up.
    if (this.accumulator > 1) this.accumulator = 1;
  }
}

/**
 * A spawn point on a ring just outside the camera view, inside the map and not inside an
 * obstacle (TDD: SpawnDirector). Falls back to the last clamped candidate after `tries`.
 */
export function pickSpawnPoint(
  rng: RNG,
  px: number,
  py: number,
  halfViewW: number,
  halfViewH: number,
  margin: number,
  isBlocked: (x: number, y: number) => boolean,
  worldW: number,
  worldH: number,
  tries = 10,
): { x: number; y: number } {
  const ring = Math.hypot(halfViewW, halfViewH) + margin;
  let x = px;
  let y = py;
  for (let i = 0; i < tries; i++) {
    const a = rng.range(0, Math.PI * 2);
    x = Math.min(worldW - margin, Math.max(margin, px + Math.cos(a) * ring));
    y = Math.min(worldH - margin, Math.max(margin, py + Math.sin(a) * ring));
    const onScreen = Math.abs(x - px) < halfViewW && Math.abs(y - py) < halfViewH;
    if (!onScreen && !isBlocked(x, y)) return { x, y };
  }
  return { x, y };
}
