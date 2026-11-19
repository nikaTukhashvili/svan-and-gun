import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { SpatialHash } from '../../src/core/spatialHash';
import { BulletSystem } from '../../src/systems/bullets';
import { EnemySystem } from '../../src/systems/enemies';
import { EnemyProjectileSystem, type ProjectileRequest } from '../../src/systems/enemyProjectiles';
import { ObstacleField } from '../../src/systems/obstacles';
import { SlowEffect } from '../../src/systems/slow';
import type { ShotSpec } from '../../src/systems/weapon';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;

function setup(field = new ObstacleField(u(160), u(90))) {
  const bus = new EventBus<GameEvents>();
  const enemies = new EnemySystem({
    capacity: 50,
    config: data.config,
    defs: data.enemies,
    field,
    rng: new RNG(3),
    bus,
    cullDistance: 10_000,
  });
  return { bus, enemies, field };
}

function tick(sys: EnemySystem, seconds: number, px: number, py: number, out: ProjectileRequest[] = []) {
  for (let i = 0; i < Math.round(seconds / DT); i++) sys.update(DT, px, py, out);
  return out;
}

const shot = (o: Partial<ShotSpec> = {}): ShotSpec => ({
  angle: 0,
  speed: 600,
  range: 2000,
  damage: 10,
  pierce: 0,
  knockback: 0,
  spreadDeg: 0,
  crit: false,
  volleyId: 1,
  ...o,
});

describe('SpatialHash', () => {
  it('returns ids from the cells a box overlaps', () => {
    const h = new SpatialHash(640, 640, 64, 10);
    h.insert(0, 10, 10);
    h.insert(1, 300, 300);
    h.insert(2, 330, 290);
    const out: number[] = [];
    expect(h.query(280, 280, 340, 340, out).sort()).toEqual([1, 2]);
    expect(h.query(0, 0, 20, 20, out)).toEqual([0]);
    h.clear();
    expect(h.query(0, 0, 640, 640, out)).toEqual([]);
  });
});

describe('EnemySystem spawning', () => {
  it('uses enemies.json stats and scales HP +12% per minute at spawn time', () => {
    const { enemies } = setup();
    const a = enemies.spawn('kaji', 100, 100, { minutes: 0 })!;
    const b = enemies.spawn('kaji', 100, 100, { minutes: 5 })!;
    expect(a.hp).toBe(10);
    expect(b.hp).toBeCloseTo(16);
    expect(a.speed).toBe(u(3.5));
  });

  it('elites have 5x HP, +1 defence, 1.4x size; fast elites move faster', () => {
    const { enemies } = setup();
    const e = enemies.spawn('ali', 100, 100, { minutes: 0, elite: true, trait: 'fast' })!;
    expect(e.hp).toBe(90);
    expect(e.defence).toBe(1);
    expect(e.radius).toBeCloseTo(u(0.4) * 1.4);
    expect(e.speed).toBeCloseTo(u(4.5) * 1.3);
  });

  it('drops spawns past the pool cap', () => {
    const { enemies } = setup();
    for (let i = 0; i < 50; i++) enemies.spawn('kaji', 100, 100, { minutes: 0 });
    expect(enemies.spawn('kaji', 100, 100, { minutes: 0 })).toBeNull();
    expect(enemies.activeCount).toBe(50);
  });
});

describe('EnemySystem damage and death', () => {
  it('subtracts defence (min 1) and emits enemy:killed at 0 HP', () => {
    const { enemies, bus } = setup();
    const killed = vi.fn();
    bus.on('enemy:killed', killed);
    const brute = enemies.spawn('devi_brute', 500, 500, { minutes: 0 })!;
    expect(enemies.damage(brute, 8, false)).toBe(5); // defence 3
    expect(enemies.damage(brute, 2, false)).toBe(1);
    enemies.damage(brute, 500, false);
    expect(brute.active).toBe(false);
    expect(killed).toHaveBeenCalledWith({
      type: 'devi_brute',
      elite: false,
      x: 500,
      y: 500,
      byStatus: false,
    });
  });

  it('a deathBurst elite leaves a delayed explosion', () => {
    const { enemies } = setup();
    const e = enemies.spawn('ochopintre', 300, 300, { minutes: 0, elite: true, trait: 'deathBurst' })!;
    enemies.kill(e);
    const boom = vi.fn();
    enemies.updateBursts(0.3, boom);
    expect(boom).not.toHaveBeenCalled();
    enemies.updateBursts(0.4, boom);
    expect(boom).toHaveBeenCalledWith(expect.objectContaining({ x: 300, y: 300, damage: 15 }));
  });
});

describe('bullet hits', () => {
  function fireAt(enemies: EnemySystem, s: ShotSpec, frames = 90) {
    const bullets = new BulletSystem(10, 4);
    const field = new ObstacleField(u(160), u(90));
    const b = bullets.spawn(s, 100, 500)!;
    for (let i = 0; i < frames; i++) {
      enemies.update(DT, 5000, 500, []);
      bullets.update(DT, field, (bb, x0, y0, x1, y1) => enemies.hitSegment(bb, x0, y0, x1, y1, 4));
    }
    return b;
  }

  it('a bullet stops at the first enemy it hits', () => {
    const { enemies } = setup();
    const a = enemies.spawn('devi_brute', 300, 500, { minutes: 0 })!;
    const b = enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    fireAt(enemies, shot({ damage: 13 }));
    expect(a.hp).toBeLessThan(120);
    expect(b.hp).toBe(120);
  });

  it('a piercing bullet hits each enemy in its path once', () => {
    const { enemies } = setup();
    const a = enemies.spawn('devi_brute', 300, 500, { minutes: 0 })!;
    const b = enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    const c = enemies.spawn('devi_brute', 500, 500, { minutes: 0 })!;
    fireAt(enemies, shot({ damage: 13, pierce: 1 }));
    expect([a.hp, b.hp, c.hp]).toEqual([110, 110, 120]);
  });

  it('crits deal x2 before defence', () => {
    const { enemies } = setup();
    const e = enemies.spawn('devi_brute', 300, 500, { minutes: 0 })!;
    fireAt(enemies, shot({ damage: 8, crit: true }));
    expect(e.hp).toBe(120 - (16 - 3));
  });

  it('knocks back once per volley, so six pellets do not push six times', () => {
    const { enemies } = setup();
    const e = enemies.spawn('devi_brute', 300, 500, { minutes: 0 })!;
    const bullets = new BulletSystem(10, 4);
    const field = new ObstacleField(u(160), u(90));
    for (let i = 0; i < 6; i++) bullets.spawn(shot({ knockback: 1.5, volleyId: 7, damage: 1 }), 250, 500 + i);
    enemies.update(DT, e.x, e.y, []); // builds the spatial hash; the player is on top of it, so it stays put
    for (let f = 0; f < 6; f++)
      bullets.update(DT, field, (bb, x0, y0, x1, y1) => enemies.hitSegment(bb, x0, y0, x1, y1, 4));
    expect(e.hp).toBe(120 - 6); // all six pellets hit (min 1 damage each)
    const pushOnce = u(1.5) * 12 * (1 - 0.8);
    expect(e.kbx).toBeCloseTo(pushOnce);
  });
});

describe('behaviours', () => {
  it('swarm walks straight at the player', () => {
    const { enemies } = setup();
    const e = enemies.spawn('kaji', 1000, 500, { minutes: 0 })!;
    tick(enemies, 1, 2000, 500);
    expect(e.x).toBeCloseTo(1000 + u(3.5), -1);
    expect(e.y).toBeCloseTo(500, 0);
  });

  it('flank circles, winds up, dashes, recovers', () => {
    const { enemies } = setup();
    const e = enemies.spawn('ali', 1000, 1000, { minutes: 0 })!;
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 8; i++) {
      enemies.update(DT, 1000 + u(4.5), 1000, []);
      seen.add(e.state);
    }
    expect([...seen]).toEqual(expect.arrayContaining(['circle', 'windup', 'dash', 'recover']));
  });

  it('charge winds up inside its trigger range, charges, then is stunned', () => {
    const { enemies } = setup();
    const e = enemies.spawn('ochopintre', 1000, 1000, { minutes: 0 })!;
    tick(enemies, 0.05, 1000 + u(6), 1000);
    expect(e.state).toBe('windup');
    tick(enemies, 0.8, 1000 + u(6), 1000);
    expect(e.state).toBe('charge');
    tick(enemies, 1.3, 1000 + u(6), 1000);
    expect(e.state).toBe('stunned');
  });

  it('a charge into a wall ends in a stun', () => {
    const field = new ObstacleField(u(160), u(90));
    field.addRect(1000 + u(3), 1000, 20, 400);
    const { enemies } = setup(field);
    const e = enemies.spawn('ochopintre', 1000, 1000, { minutes: 0 })!;
    tick(enemies, 0.9, 1000 + u(6), 1000);
    tick(enemies, 0.3, 1000 + u(6), 1000);
    expect(e.state).toBe('stunned');
    expect(e.x).toBeLessThan(1000 + u(3) - 10);
  });

  it('caster keeps its distance and throws slowing projectiles', () => {
    const { enemies } = setup();
    const e = enemies.spawn('rokapi', 1000, 1000, { minutes: 0 })!;
    const out = tick(enemies, 6, 1000 + u(3), 1000);
    const d = Math.hypot(e.x - (1000 + u(3)), e.y - 1000) / 32;
    expect(d).toBeGreaterThan(5);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0]).toMatchObject({ damage: 6, slowFactor: 0.3, slowSec: 2 });
  });

  it('slides around a rock instead of sticking to it', () => {
    const field = new ObstacleField(u(160), u(90));
    field.addCircle(1500, 500, u(2));
    const { enemies } = setup(field);
    const e = enemies.spawn('kaji', 1000, 500, { minutes: 0 })!;
    tick(enemies, 8, 2000, 500);
    expect(e.x).toBeGreaterThan(1500 + u(2)); // got past the rock
  });

  it('separates overlapping enemies', () => {
    const { enemies } = setup();
    const a = enemies.spawn('kaji', 1000, 1000, { minutes: 0 })!;
    const b = enemies.spawn('kaji', 1001, 1000, { minutes: 0 })!;
    tick(enemies, 0.5, 1000, 3000);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(u(0.375) * 1.5);
  });
});

describe('player edge', () => {
  it('enemies stop at the player instead of stacking on him, and still touch for contact damage', () => {
    const { enemies } = setup();
    const pr = u(0.45);
    for (let i = 0; i < 8; i++)
      enemies.spawn('kaji', 1000 + Math.cos(i) * 80, 1000 + Math.sin(i) * 80, { minutes: 0 });
    for (let i = 0; i < 120; i++) enemies.update(DT, 1000, 1000, [], pr);
    for (const e of enemies.enemies.filter((x) => x.active)) {
      expect(Math.hypot(e.x - 1000, e.y - 1000)).toBeGreaterThanOrEqual(e.radius + pr - 1.01);
    }
    expect(enemies.contactDamageAt(1000, 1000, pr)).toBe(5);
  });
});

describe('contact damage', () => {
  it('reports the strongest touching enemy', () => {
    const { enemies } = setup();
    enemies.spawn('kaji', 1000, 1000, { minutes: 0 });
    enemies.spawn('devi_brute', 1010, 1000, { minutes: 0 });
    tick(enemies, DT, 1000, 1000);
    expect(enemies.contactDamageAt(1000, 1000, u(0.45))).toBe(20);
    expect(enemies.contactDamageAt(3000, 1000, u(0.45))).toBe(0);
  });
});

describe('enemy projectiles and slow', () => {
  it('hit the player, are blocked by walls, and expire at range', () => {
    const field = new ObstacleField(5000, 5000);
    const sys = new EnemyProjectileSystem(5, 6);
    const req = { x: 100, y: 100, angle: 0, speed: 300, range: 1000, damage: 6, slowFactor: 0.3, slowSec: 2 };
    sys.spawn(req);
    const hit = vi.fn();
    for (let i = 0; i < 60; i++) sys.update(DT, field, { x: 300, y: 100, radius: 14 }, hit);
    expect(hit).toHaveBeenCalledTimes(1);

    field.addRect(200, 100, 20, 100);
    sys.spawn(req);
    for (let i = 0; i < 60; i++) sys.update(DT, field, { x: 300, y: 100, radius: 14 }, hit);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(sys.activeCount).toBe(0);
  });

  it('SlowEffect slows for its duration', () => {
    const slow = new SlowEffect();
    slow.apply(0.3, 2);
    expect(slow.multiplier).toBeCloseTo(0.7);
    slow.update(2.01);
    expect(slow.multiplier).toBe(1);
  });
});
