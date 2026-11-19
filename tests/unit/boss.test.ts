import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { BossController, type SummonRequest } from '../../src/systems/boss';
import { EnemySystem } from '../../src/systems/enemies';
import { ObstacleField } from '../../src/systems/obstacles';
import { computeScore, computeSilver } from '../../src/systems/score';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;

function setup() {
  const bus = new EventBus<GameEvents>();
  const field = new ObstacleField(u(160), u(90));
  const enemies = new EnemySystem({
    capacity: 60,
    config: data.config,
    defs: data.enemies,
    field,
    rng: new RNG(1),
    bus,
    cullDistance: 1e6,
  });
  const boss = new BossController(data.boss, enemies, field, new RNG(2), bus);
  const hurt = vi.fn();
  const summons: SummonRequest[] = [];
  /** Advance boss + enemies; the player stands at (px, py). */
  const run = (seconds: number, px: number, py: number, t0 = 0) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      boss.update(DT, t0 + i * DT, px, py, u(0.45), hurt, summons);
      enemies.update(DT, px, py, [], u(0.45));
    }
  };
  return { bus, field, enemies, boss, hurt, summons, run };
}

describe('Devi Chieftain', () => {
  it('spawns with 4,000 HP regardless of time and walks to the player', () => {
    const { boss, bus, run } = setup();
    const spawned = vi.fn();
    bus.on('boss:spawned', spawned);
    boss.spawn(1000, 1000, 330);
    expect(boss.enemy!.hp).toBe(4000);
    expect(spawned).toHaveBeenCalledWith({ phase: 1, hpLeft: 4000 });
    run(1, 2000, 1000, 330);
    expect(boss.enemy!.x).toBeGreaterThan(1000 + u(1));
  });

  it('changes phase at 67% and 34% HP', () => {
    const { boss, bus, enemies, run } = setup();
    const phases: number[] = [];
    bus.on('boss:phase', ({ phase }) => phases.push(phase));
    boss.spawn(1000, 1000, 0);
    enemies.damage(boss.enemy!, 1400, true); // 65%
    run(DT, 3000, 1000);
    expect(boss.phase).toBe(1);
    enemies.damage(boss.enemy!, 1400, true); // 30%
    run(DT, 3000, 1000);
    expect(phases).toEqual([2, 3]);
  });

  it('phase 1 slams: the shockwave ring hurts the player once', () => {
    const { boss, hurt, run } = setup();
    boss.spawn(1000, 1000, 0);
    run(8, 1000 + u(4), 1000); // the player stands 4 units away, inside the ring's reach
    expect(hurt).toHaveBeenCalledWith(20, false);
    const ringHits = hurt.mock.calls.filter(([dmg]) => dmg === 20).length;
    expect(ringHits).toBeGreaterThanOrEqual(1);
  });

  it('boulders are telegraphed, hurt on impact and leave rubble that expires', () => {
    const { boss, enemies, field, hurt, run } = setup();
    boss.spawn(1000, 1000, 0);
    enemies.damage(boss.enemy!, 1500, true); // phase 2: boulders and summons
    const before = field.shapes.length;
    let t = 0;
    while (boss.boulders.length === 0 && t < 30) {
      run(0.1, 1000 + u(8), 1000);
      t += 0.1;
    }
    expect(boss.boulders.length).toBe(1);
    const target = { ...boss.boulders[0]! };
    expect(Math.hypot(target.x - (1000 + u(8)), target.y - 1000)).toBeLessThan(u(1)); // aimed at the player
    run(1.05, target.x, target.y); // stay on the mark
    expect(hurt).toHaveBeenCalledWith(25, true);
    run(1.05, target.x + u(5), target.y); // later boulders land away from the player
    expect(field.shapes.length).toBeGreaterThanOrEqual(before);
    run(11, 4000, 2500); // rubble lasts 10 s
    expect(boss.rubble.every((r) => r.timeLeft > 0)).toBe(true);
  });

  it('summons Kaji in phase 2', () => {
    const { boss, enemies, summons, run } = setup();
    boss.spawn(1000, 1000, 0);
    enemies.damage(boss.enemy!, 1500, true);
    let t = 0;
    while (summons.length === 0 && t < 40) {
      run(0.1, 1000 + u(8), 1000);
      t += 0.1;
    }
    expect(summons[0]).toMatchObject({ enemy: 'kaji', count: 8 });
  });

  it('enrages 180 s after spawning: +50% damage', () => {
    const { boss, run } = setup();
    boss.spawn(1000, 1000, 330);
    run(DT, 3000, 1000, 330);
    expect(boss.enemy!.contactDamage).toBe(25);
    run(DT, 3000, 1000, 330 + 180);
    expect(boss.enraged).toBe(true);
    expect(boss.enemy!.contactDamage).toBe(37.5);
  });

  it('dies like an enemy: enemy:killed with the boss id', () => {
    const { boss, bus, enemies } = setup();
    const killed = vi.fn();
    bus.on('enemy:killed', killed);
    boss.spawn(1000, 1000, 0);
    enemies.damage(boss.enemy!, 5000, true);
    expect(killed).toHaveBeenCalledWith(expect.objectContaining({ type: 'devi_chieftain' }));
    expect(boss.alive).toBe(false);
  });
});

describe('score and silver', () => {
  const run = {
    result: 'victory' as const,
    timeSec: 400.7,
    kills: 610,
    eliteKills: 2,
    bossKilled: true,
    silverPicked: 23,
  };

  it('score = kills + 25/elite + 500 boss + 2/s + 1000 victory', () => {
    expect(computeScore(data.config.score, run)).toBe(610 + 50 + 500 + 800 + 1000);
    expect(computeScore(data.config.score, { ...run, result: 'defeat', bossKilled: false })).toBe(
      610 + 50 + 800,
    );
  });

  it('silver = picked + kills/20 + 100 victory + 50 boss', () => {
    expect(computeSilver(data.config.silver, data.drops, run)).toEqual({
      picked: 23,
      fromKills: 30,
      victory: 100,
      boss: 50,
      total: 203,
    });
  });
});
