/**
 * Frost (GDD: Barrel fusion): chill stacks slow, full stacks freeze (shatter), freeze immunity,
 * the boss only slows, and the three Frost hybrids.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { createBuild, type RunBuild } from '../../src/systems/build';
import { BulletSystem } from '../../src/systems/bullets';
import { EnemySystem, type Enemy } from '../../src/systems/enemies';
import { hybridOf } from '../../src/systems/fusion';
import { buildPipeline, HitResolver } from '../../src/systems/modPipeline';
import { ObstacleField } from '../../src/systems/obstacles';
import { StatusEffectSystem, type ChillSpec } from '../../src/systems/status';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;
const IMMUNE = data.config.combat.freezeImmunitySec;
const spec: ChillSpec = { slow: 0.1, sec: 2, stacks: 3, freezeSec: 1, shatter: 0.5 };

function world(barrel: string[] = []) {
  const bus = new EventBus<GameEvents>();
  const field = new ObstacleField(u(160), u(90));
  const enemies = new EnemySystem({
    capacity: 40,
    config: data.config,
    defs: data.enemies,
    field,
    rng: new RNG(1),
    bus,
    cullDistance: 1e6,
  });
  const bullets = new BulletSystem(100, 4);
  const status = new StatusEffectSystem(enemies, data.config.combat.statusTickSec, IMMUNE);
  const build: RunBuild = createBuild();
  barrel.forEach((id, i) => (build.barrel[i] = { id, tier: 1 }));
  const resolver = new HitResolver(
    () => buildPipeline(data, build),
    bullets,
    enemies,
    status,
    data.config.caps,
  );
  const shoot = (x: number, y: number, damage = 1) => {
    bullets.spawn(
      {
        angle: 0,
        speed: 600,
        range: 3000,
        damage,
        pierce: 0,
        knockback: 0,
        spreadDeg: 0,
        crit: false,
        volleyId: Math.random(),
      },
      x,
      y,
    );
    for (let i = 0; i < 20; i++)
      bullets.update(DT, field, (b, x0, y0, x1, y1) => enemies.hitSegment(b, x0, y0, x1, y1, 4, resolver));
  };
  /** One frame of movement towards a player far to the right. */
  const move = (e: Enemy) => {
    const x0 = e.x;
    enemies.update(DT, e.x + 2000, e.y, []);
    return e.x - x0;
  };
  return { enemies, status, shoot, move };
}

describe('chill and freeze', () => {
  it('each chill stack slows the enemy; slow is capped by config.combat.maxChillSlow', () => {
    const w = world();
    const e = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    const free = w.move(e);
    w.status.applyChill(e, { ...spec, stacks: 99, freezeSec: 0 });
    w.status.applyChill(e, { ...spec, stacks: 99, freezeSec: 0 });
    expect(w.move(e)).toBeCloseTo(free * 0.8, 3);
    for (let i = 0; i < 20; i++) w.status.applyChill(e, { ...spec, stacks: 99, freezeSec: 0 });
    expect(w.move(e)).toBeCloseTo(free * (1 - data.config.combat.maxChillSlow), 3);
  });

  it('full stacks freeze: no movement, hits shatter for extra damage, then it thaws', () => {
    const w = world();
    const e = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    expect(w.status.applyChill(e, spec)).toBe(false);
    expect(w.status.applyChill(e, spec)).toBe(false);
    expect(w.status.applyChill(e, spec)).toBe(true);
    expect(e.frozenTime).toBe(1);
    expect(w.move(e)).toBe(0);
    const hp = e.hp;
    w.enemies.damage(e, 10, true);
    expect(hp - e.hp).toBeCloseTo(15); // +50% shatter
    for (let i = 0; i < 70; i++) w.move(e);
    expect(e.frozenTime).toBeLessThanOrEqual(0);
    expect(w.move(e)).toBeGreaterThan(0);
  });

  it('after a freeze it cannot freeze again for a while (it can still be chilled)', () => {
    const w = world();
    const e = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    for (let i = 0; i < 3; i++) w.status.applyChill(e, spec);
    for (let i = 0; i < 70; i++) w.move(e); // thaw
    for (let i = 0; i < 3; i++) expect(w.status.applyChill(e, spec)).toBe(false);
    expect(e.chillStacks).toBe(3);
    for (let i = 0; i < Math.ceil(IMMUNE / DT) + 5; i++) w.move(e);
    e.chillStacks = 0;
    let froze = false;
    for (let i = 0; i < 3; i++) froze = w.status.applyChill(e, spec) || froze;
    expect(froze).toBe(true);
  });

  it('the boss is slowed but never frozen', () => {
    const w = world();
    const boss = w.enemies.spawnBoss(data.boss, 400, 500)!;
    for (let i = 0; i < 10; i++) expect(w.status.applyChill(boss, spec)).toBe(false);
    expect(boss.frozenTime).toBe(0);
    expect(boss.chillStacks).toBe(3);
  });
});

describe('Frost Shot and its hybrids', () => {
  it('Frost mutates with each element into its hybrid', () => {
    expect(hybridOf(data, 'frost_shot', 'ember_shot')).toBe('steam');
    expect(hybridOf(data, 'venom_shot', 'frost_shot')).toBe('frostbite');
    expect(hybridOf(data, 'frost_shot', 'thunder_spark')).toBe('hailstorm');
  });

  it('Frost Shot hits add chill stacks', () => {
    const w = world(['frost_shot']);
    const e = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    w.enemies.update(DT, 4000, 2500, []);
    w.shoot(300, 500);
    expect(e.chillStacks).toBe(1);
  });

  it('Steam burns and chills; a freeze bursts in steam and hurts neighbours', () => {
    const w = world(['steam']);
    const a = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    const near = w.enemies.spawn('devi_brute', 400, 540, { minutes: 0 })!;
    w.enemies.update(DT, 4000, 2500, []);
    w.shoot(300, 500);
    expect(a.burnStacks).toBe(1);
    expect(a.chillStacks).toBe(1);
    const hp = near.hp;
    a.chillStacks = 3; // one more hit freezes it (Steam freezes at 4)
    w.shoot(300, 500);
    expect(a.frozenTime).toBeGreaterThan(0);
    expect(near.hp).toBeLessThan(hp);
  });

  it('Frostbite: poison deals more damage to a chilled enemy', () => {
    const w = world(['frostbite']);
    const a = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    w.enemies.update(DT, 4000, 2500, []);
    w.shoot(300, 500);
    expect(a.poisonTime).toBeGreaterThan(0);
    expect(a.chillStacks).toBe(1);
    const chilledHp = a.hp;
    w.status.update(data.config.combat.statusTickSec);
    const chilledTick = chilledHp - a.hp;
    a.chillStacks = 0;
    const plainHp = a.hp;
    w.status.update(data.config.combat.statusTickSec);
    expect(chilledTick).toBeCloseTo((plainHp - a.hp) * 2);
  });

  it('Hailstorm chills every enemy its chain reaches', () => {
    const w = world(['hailstorm']);
    w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 });
    const b = w.enemies.spawn('devi_brute', 440, 500, { minutes: 0 })!;
    w.enemies.update(DT, 4000, 2500, []);
    w.shoot(300, 500);
    expect(b.chillStacks).toBe(1);
  });
});
