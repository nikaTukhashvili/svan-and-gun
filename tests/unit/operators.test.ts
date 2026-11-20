import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { getById } from '../../src/data/registry';
import { BulletSystem } from '../../src/systems/bullets';
import { buildForGun, createBuild, type RunBuild } from '../../src/systems/build';
import { EnemySystem } from '../../src/systems/enemies';
import { applyOnFire, buildPipeline, HitResolver, type Pipeline } from '../../src/systems/modPipeline';
import { ObstacleField } from '../../src/systems/obstacles';
import { StatusEffectSystem } from '../../src/systems/status';
import type { ShotSpec } from '../../src/systems/weapon';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;
const gun = (id: string) => getById(data.guns, id, 'gun');

const shot = (o: Partial<ShotSpec> = {}): ShotSpec => ({
  angle: 0,
  speed: 600,
  range: 3000,
  damage: 10,
  pierce: 0,
  knockback: 0,
  spreadDeg: 0,
  crit: false,
  volleyId: 1,
  ...o,
});

function withSlots(build: RunBuild, ids: (string | null)[]): RunBuild {
  ids.forEach((id, i) => (build.barrel[i] = id ? { id, level: 1 } : null));
  return build;
}

function world(build: RunBuild, gunId: string | null = null) {
  const bus = new EventBus<GameEvents>();
  const field = new ObstacleField(u(160), u(90));
  const enemies = new EnemySystem({
    capacity: 80,
    config: data.config,
    defs: data.enemies,
    field,
    rng: new RNG(1),
    bus,
    cullDistance: 1e6,
  });
  const bullets = new BulletSystem(300, 4);
  const status = new StatusEffectSystem(enemies, data.config.combat.statusTickSec);
  const pipeline: Pipeline = buildPipeline(data, build, gunId ? gun(gunId) : null);
  const resolver = new HitResolver(() => pipeline, bullets, enemies, status, data.config.caps);
  const fire = (spec: ShotSpec, frames = 20) => {
    const shots = [spec];
    applyOnFire(pipeline, shots);
    for (const s of shots) bullets.spawn(s, 300, 500);
    for (let i = 0; i < frames; i++) {
      bullets.update(DT, field, (b, x0, y0, x1, y1) => enemies.hitSegment(b, x0, y0, x1, y1, 4, resolver));
      resolver.update(DT);
    }
    return shots;
  };
  const settle = () => enemies.update(DT, 4000, 2500, []);
  return { enemies, bullets, status, resolver, pipeline, fire, settle };
}

/** A target brute at x=400 with `n` more brutes close behind it (lightning targets). */
function targets(w: ReturnType<typeof world>, n: number) {
  const first = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
  for (let i = 0; i < n; i++) {
    w.enemies.spawn('devi_brute', 400 + (i % 3) * 30, 560 + Math.floor(i / 3) * 30, { minutes: 0 });
  }
  w.settle();
  return first;
}

describe('operators change only the slot to their right', () => {
  it('your example: Fire | Amplifier | Lightning: lightning chains to 4 instead of 2, fire is unchanged', () => {
    const w = world(withSlots(createBuild(), ['ember_shot', 'amplifier', 'thunder_spark']));
    const first = targets(w, 6);
    w.fire(shot());
    expect(w.resolver.arcs).toHaveLength(4);
    expect(first.burnDps).toBe(3); // not amplified
  });

  it('without the Amplifier lightning chains to 2', () => {
    const w = world(withSlots(createBuild(), ['ember_shot', 'thunder_spark']));
    targets(w, 6);
    w.fire(shot());
    expect(w.resolver.arcs).toHaveLength(2);
  });

  it('an operator next to another operator, or in the last slot, does nothing', () => {
    const p = buildPipeline(
      data,
      withSlots(createBuild(), ['amplifier', 'echo', 'thunder_spark', 'amplifier']),
    );
    expect(p.operators).toEqual([
      { slot: 0, id: 'amplifier', target: null },
      { slot: 1, id: 'echo', target: 2 },
      { slot: 3, id: 'amplifier', target: null },
    ]);
    const thunder = p.barrel.find((m) => m.id === 'thunder_spark')!;
    expect(thunder.k).toBe(1); // only the echo reached it
    expect(thunder.echo).toEqual({ delaySec: 0.5, strength: 0.5 });
  });

  it('Amplifier scales onFire mods too: Twin Shot fires 3 bullets instead of 2', () => {
    const p = buildPipeline(data, withSlots(createBuild(), ['amplifier', 'twin_shot']));
    const shots = [shot()];
    applyOnFire(p, shots);
    expect(shots).toHaveLength(3);
  });

  it('Hammer Spring: the next mod works only on every 4th shot, at x3', () => {
    const p = buildPipeline(data, withSlots(createBuild(), ['every_nth', 'piercing_bore']));
    const pierce = [1, 2, 3, 4, 8].map((v) => {
      const shots = [shot({ volleyId: v })];
      applyOnFire(p, shots);
      return shots[0]!.pierce;
    });
    expect(pierce).toEqual([0, 0, 0, 3, 3]);
  });

  it('Death Trigger: the next effect fires only when the hit kills, at x3', () => {
    const w = world(withSlots(createBuild(), ['on_kill', 'split_shot']));
    w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 }); // survives the hit: no split
    w.settle();
    w.fire(shot({ damage: 20 }), 10);
    expect(w.bullets.bullets.filter((b) => b.active && b.generation === 1)).toHaveLength(0);

    const w2 = world(withSlots(createBuild(), ['on_kill', 'split_shot']));
    w2.enemies.spawn('kaji', 400, 500, { minutes: 0 }); // dies: split x3 (9 shards, capped)
    w2.settle();
    w2.fire(shot({ damage: 20 }), 10);
    expect(w2.bullets.bullets.filter((b) => b.active && b.generation === 1)).toHaveLength(
      data.config.caps.maxChildrenPerHit,
    );
  });

  it('Echo Chamber repeats the next effect later at reduced strength', () => {
    const w = world(withSlots(createBuild(), ['echo', 'ember_shot']));
    const target = targets(w, 0);
    w.fire(shot({ damage: 1 }), 14); // reaches the target after ~10 frames; the echo is due at 30
    expect(target.burnStacks).toBe(1);
    expect(w.resolver.pendingEchoes).toBe(1);
    w.fire(shot({ damage: 1, volleyId: 99, angle: Math.PI }), 40); // aimed away: only advances time
    expect(target.burnStacks).toBe(2);
    expect(target.burnDps).toBeCloseTo(1.5); // the echo burns at 0.5x
  });
});

describe('gun twists', () => {
  it('each gun gets its own barrel length; all stay at 12 slots or fewer', () => {
    expect(buildForGun(gun('long_gun')).barrel).toHaveLength(6);
    expect(buildForGun(gun('double_barrel')).barrel).toHaveLength(6);
    expect(buildForGun(gun('scrap_smg')).barrel).toHaveLength(4);
    expect(buildForGun(gun('scrap_smg')).magazine).toHaveLength(3);
  });

  it('Long Gun: the muzzle (last slot) works x2', () => {
    const build = withSlots(buildForGun(gun('long_gun')), [null, null, null, null, null, 'thunder_spark']);
    const w = world(build, 'long_gun');
    targets(w, 6);
    w.fire(shot());
    expect(w.resolver.arcs).toHaveLength(4);
  });

  it('Double Barrel: shots alternate between the left and right chains', () => {
    const build = withSlots(buildForGun(gun('double_barrel')), [
      'piercing_bore',
      null,
      null,
      'heavy_slug',
      null,
      null,
    ]);
    const p = buildPipeline(data, build, gun('double_barrel'));
    const fireOne = (volleyId: number) => {
      const shots = [shot({ volleyId })];
      applyOnFire(p, shots);
      return shots[0]!;
    };
    expect(fireOne(1)).toMatchObject({ chain: 0, pierce: 1, damage: 10 });
    expect(fireOne(2)).toMatchObject({ chain: 1, pierce: 0, damage: 14 });
  });

  it('Double Barrel: an operator never reaches across into the other chain', () => {
    const build = withSlots(buildForGun(gun('double_barrel')), [
      null,
      null,
      'amplifier',
      'thunder_spark',
      null,
      null,
    ]);
    const p = buildPipeline(data, build, gun('double_barrel'));
    expect(p.operators[0]!.target).toBeNull();
  });

  it('Scrap SMG: the crit chamber works only on crit bullets, at x3', () => {
    const build = withSlots(buildForGun(gun('scrap_smg')), [null, null, null, 'piercing_bore']);
    const p = buildPipeline(data, build, gun('scrap_smg'));
    const normal = [shot({ crit: false })];
    const crit = [shot({ crit: true })];
    applyOnFire(p, normal);
    applyOnFire(p, crit);
    expect(normal[0]!.pierce).toBe(0);
    expect(crit[0]!.pierce).toBe(3);
  });
});
