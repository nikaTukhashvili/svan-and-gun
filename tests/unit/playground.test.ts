import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { createBuild, setSlot } from '../../src/systems/build';
import { EnemySystem } from '../../src/systems/enemies';
import { ObstacleField } from '../../src/systems/obstacles';
import { dummyEnemyDef } from '../../src/systems/playground';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;
const dummy = (id: string) => data.playground.dummies.find((d) => d.id === id)!;

function setup() {
  const bus = new EventBus<GameEvents>();
  const enemies = new EnemySystem({
    capacity: 20,
    config: data.config,
    defs: data.enemies,
    field: new ObstacleField(u(60), u(40)),
    rng: new RNG(1),
    bus,
    cullDistance: 10_000,
  });
  for (const d of data.playground.dummies) enemies.registerDef(dummyEnemyDef(d));
  return { bus, enemies };
}

describe('Training Ground dummies', () => {
  it('refill instead of dying, and the whole hit is reported (DPS is not capped by HP)', () => {
    const { bus, enemies } = setup();
    const seen: number[] = [];
    let killed = 0;
    bus.on('enemy:damaged', ({ amount, uid }) => seen.push(uid, amount));
    bus.on('enemy:killed', () => killed++);
    const e = enemies.spawn('dummy_plain', 100, 100, { minutes: 0, immortal: true })!;
    enemies.damage(e, e.maxHp * 3, true);
    expect(e.active).toBe(true);
    expect(e.hp).toBe(e.maxHp);
    expect(killed).toBe(0);
    expect(seen).toEqual([e.uid, e.maxHp * 3]);
  });

  it('the armoured dummy takes defence off every hit', () => {
    const { enemies } = setup();
    const e = enemies.spawn('dummy_armoured', 100, 100, { minutes: 0, immortal: true })!;
    const dealt = enemies.damage(e, 20, false);
    expect(dealt).toBeLessThan(20);
  });

  it('a standing dummy does not move towards the player, and is not pushed by enemies', () => {
    const { enemies } = setup();
    const e = enemies.spawn('dummy_plain', 300, 300, { minutes: 0, immortal: true })!;
    enemies.spawn('kaji', 305, 300, { minutes: 0 });
    for (let i = 0; i < 120; i++) enemies.update(DT, 600, 300, [], 16);
    expect(e.x).toBe(300);
    expect(e.y).toBe(300);
    expect(dummy('dummy_plain').patrol).toBeUndefined();
  });

  it('the moving dummy walks to home + patrol and back', () => {
    const { enemies } = setup();
    const p = dummy('dummy_mover').patrol!;
    const e = enemies.spawn('dummy_mover', 300, 300, { minutes: 0, immortal: true })!;
    const legSec = Math.hypot(p.dx, p.dy) / p.speed;
    let far = 0;
    for (let i = 0; i < Math.round(legSec / DT) + 3; i++) {
      enemies.update(DT, 0, 0, [], 16);
      far = Math.max(far, Math.hypot(e.x - 300, e.y - 300));
    }
    expect(far).toBeCloseTo(u(Math.hypot(p.dx, p.dy)), 0);
    for (let i = 0; i < Math.round(legSec / DT) + 5; i++) enemies.update(DT, 0, 0, [], 16);
    expect(Math.hypot(e.x - 300, e.y - 300)).toBeLessThan(u(0.5));
  });
});

describe('setSlot (Training Ground build editing)', () => {
  it('puts a module at a tier without fusing, and empties with null', () => {
    const b = createBuild(4);
    setSlot(b, 1, { id: 'ember_shot', tier: 5 });
    setSlot(b, 2, { id: 'ember_shot', tier: 1 }); // next to a match: still no fusion
    expect(b.barrel).toEqual([null, { id: 'ember_shot', tier: 5 }, { id: 'ember_shot', tier: 1 }, null]);
    setSlot(b, 1, null);
    expect(b.barrel[1]).toBeNull();
    expect(() => setSlot(b, 9, null)).toThrow();
  });
});
