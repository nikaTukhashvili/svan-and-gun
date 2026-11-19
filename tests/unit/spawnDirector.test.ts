import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';
import type { TimelineEvent } from '../../src/data/types';
import { pickSpawnPoint, SpawnDirector, type SpawnRequest } from '../../src/systems/spawnDirector';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;

/** Simulate the director from `from` to `to` seconds with a fixed alive count. */
function simulate(dir: SpawnDirector, from: number, to: number, alive: (spawned: number) => number) {
  const spawns: SpawnRequest[] = [];
  const fired: TimelineEvent[] = [];
  for (let t = from, i = 0; t < to; i++, t = from + i * DT) {
    const regular = spawns.filter((s) => s.kind === 'regular').length;
    dir.update(DT, t, alive(regular), spawns, fired);
  }
  return { spawns, fired, regular: spawns.filter((s) => s.kind === 'regular') };
}

describe('SpawnDirector', () => {
  it('spawns at the segment rate (2/s in Arrival) with only Kaji', () => {
    const { regular } = simulate(new SpawnDirector(data.timeline, new RNG(1)), 0, 10, () => 0);
    expect(regular.length).toBeGreaterThanOrEqual(19);
    expect(regular.length).toBeLessThanOrEqual(20);
    expect(new Set(regular.map((s) => s.kind === 'regular' && s.enemy))).toEqual(new Set(['kaji']));
  });

  it('never spawns past maxAlive, and does not bank a burst at the cap', () => {
    const dir = new SpawnDirector(data.timeline, new RNG(1));
    const { regular } = simulate(dir, 0, 30, (n) => n); // nothing dies
    expect(regular.length).toBe(20);
    const after = simulate(dir, 30, 31, () => 10); // 10 die
    expect(after.regular.length).toBeLessThanOrEqual(3);
  });

  it('follows the segment weights (Siege mixes all five types)', () => {
    const { regular } = simulate(new SpawnDirector(data.timeline, new RNG(5)), 210, 300, () => 0);
    const types = new Set(regular.map((s) => s.kind === 'regular' && s.enemy));
    expect(types).toEqual(new Set(['kaji', 'ali', 'ochopintre', 'rokapi', 'devi_brute']));
  });

  it('stops regular spawns during the Calm', () => {
    const { regular } = simulate(new SpawnDirector(data.timeline, new RNG(1)), 300, 330, () => 0);
    expect(regular).toHaveLength(0);
  });

  it('halves maxAlive while the boss is active', () => {
    const dir = new SpawnDirector(data.timeline, new RNG(1));
    expect(dir.maxAliveAt(400)).toBe(90);
    dir.bossActive = true;
    expect(dir.maxAliveAt(400)).toBe(45);
  });

  it('fires each timeline event once, and all of them when time is skipped', () => {
    const dir = new SpawnDirector(data.timeline, new RNG(1));
    const spawns: SpawnRequest[] = [];
    const fired: TimelineEvent[] = [];
    dir.update(DT, 250, 0, spawns, fired); // skipped from 0 to 250
    expect(fired.map((e) => e.type)).toEqual([
      'tutorial',
      'tutorial',
      'tutorial',
      'elite',
      'swarmRing',
      'elite',
    ]);
    expect(spawns.filter((s) => s.kind !== 'regular')).toEqual([
      { kind: 'elite', enemy: 'ali', trait: 'fast' },
      { kind: 'ring', enemy: 'kaji', count: 30, radius: 13 },
      { kind: 'elite', enemy: 'ochopintre', trait: 'deathBurst' },
    ]);
    fired.length = 0;
    dir.update(DT, 251, 0, spawns, fired);
    expect(fired).toHaveLength(0);
  });

  it('events ignore maxAlive', () => {
    const dir = new SpawnDirector(data.timeline, new RNG(1));
    const spawns: SpawnRequest[] = [];
    dir.update(DT, 120, 9999, spawns, []);
    expect(spawns.some((s) => s.kind === 'elite')).toBe(true);
  });
});

describe('pickSpawnPoint', () => {
  it('picks points off screen, inside the map, not blocked', () => {
    const rng = new RNG(9);
    for (let i = 0; i < 200; i++) {
      const p = pickSpawnPoint(rng, 2560, 1440, 640, 360, 32, (x) => x > 3000 && x < 3300, 5120, 2880);
      expect(Math.abs(p.x - 2560) >= 640 || Math.abs(p.y - 1440) >= 360).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(32);
      expect(p.y).toBeLessThanOrEqual(2880 - 32);
      expect(p.x > 3000 && p.x < 3300).toBe(false);
    }
  });
});
