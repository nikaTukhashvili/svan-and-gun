import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { getById } from '../../src/data/registry';
import { BulletSystem, REDIRECTED } from '../../src/systems/bullets';
import { createBuild, type RunBuild, type SupportLevels } from '../../src/systems/build';
import { EnemySystem } from '../../src/systems/enemies';
import { applyOnFire, buildPipeline, HitResolver, type Pipeline } from '../../src/systems/modPipeline';
import { ObstacleField } from '../../src/systems/obstacles';
import { baseStats, computeStats, emptyBonuses } from '../../src/systems/stats';
import { StatusEffectSystem } from '../../src/systems/status';
import { computeWeaponStats, WeaponSystem, type ShotSpec } from '../../src/systems/weapon';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const DT = 1 / 60;

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

/** A build from module ids; "id:3" means tier 3. */
function buildWith(barrel: (string | null)[]): RunBuild {
  const b = createBuild();
  barrel.forEach((spec, i) => {
    if (!spec) return;
    const [id, tier] = spec.split(':');
    b.barrel[i] = { id: id!, tier: tier ? Number(tier) : 1 };
  });
  return b;
}

const supportPipeline = (support: SupportLevels) => buildPipeline(data, createBuild(), null, support);

/** A small world: enemies, bullets, statuses and the resolver for a given build. */
function world(build: RunBuild) {
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
  const bullets = new BulletSystem(200, 4);
  const status = new StatusEffectSystem(enemies, data.config.combat.statusTickSec);
  let pipeline: Pipeline = buildPipeline(data, build);
  const resolver = new HitResolver(() => pipeline, bullets, enemies, status, data.config.caps);
  const step = (frames = 1) => {
    for (let i = 0; i < frames; i++) {
      bullets.update(DT, field, (b, x0, y0, x1, y1) => enemies.hitSegment(b, x0, y0, x1, y1, 4, resolver));
    }
  };
  const settle = () => enemies.update(DT, 4000, 2500, []); // builds the hash; the player is far away
  return {
    bus,
    enemies,
    bullets,
    status,
    resolver,
    step,
    settle,
    setBuild: (b: RunBuild) => (pipeline = buildPipeline(data, b)),
  };
}

describe('onFire mods', () => {
  it('Twin Shot fires 2 bullets at 65% damage, spread around the aim', () => {
    const shots = [shot({ damage: 60 })];
    applyOnFire(buildPipeline(data, buildWith(['twin_shot'])), shots);
    expect(shots).toHaveLength(2);
    expect(shots.map((s) => s.damage)).toEqual([39, 39]);
    expect(shots[0]!.angle).toBeLessThan(0);
    expect(shots[1]!.angle).toBeGreaterThan(0);
  });

  it('Twin Shot doubles every Double Barrel pellet', () => {
    const shots = Array.from({ length: 6 }, () => shot());
    applyOnFire(buildPipeline(data, buildWith(['twin_shot'])), shots);
    expect(shots).toHaveLength(12);
  });

  it('Long Rifling, Piercing Bore and Heavy Slug change the numbers', () => {
    const shots = [shot({ speed: 100, range: 100, damage: 10, pierce: 1, knockback: 1 })];
    applyOnFire(buildPipeline(data, buildWith(['long_rifling', 'piercing_bore', 'heavy_slug'])), shots);
    expect(shots[0]).toMatchObject({ speed: 150, range: 130, pierce: 2, damage: 14, knockback: 1.5 });
  });

  it('Heavy Slug slows the fire rate by 15%', () => {
    const p = buildPipeline(data, buildWith(['heavy_slug']));
    const gun = getById(data.guns, 'scrap_smg', 'gun');
    const stats = computeStats(baseStats(data.config, data.cards), emptyBonuses(), emptyBonuses());
    expect(computeWeaponStats(gun, stats, 1, p.weaponMods).shotsPerSecond).toBeCloseTo(8.5);
  });
});

describe('no slot order; the loop guard (GDD: Barrel fusion)', () => {
  it('order does not matter: Split Shot and Ricochet either way give the same shots', () => {
    for (const order of [
      ['split_shot', 'ricochet'],
      ['ricochet', 'split_shot'],
    ]) {
      const w = world(buildWith(order));
      w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 });
      w.enemies.spawn('devi_brute', 400, 640, { minutes: 0 });
      w.settle();
      const b = w.bullets.spawn(shot(), 300, 500)!;
      w.step(15);
      expect(b.vy).toBeGreaterThan(0); // bounced towards the second brute
      expect(w.bullets.bullets.filter((x) => x.active && x.generation === 1).length).toBeGreaterThan(0);
    }
  });

  it('a shard never bounces and never splits again', () => {
    const w = world(buildWith(['ricochet', 'split_shot']));
    const e = w.enemies.spawn('devi_brute', 600, 500, { minutes: 0 })!;
    w.enemies.spawn('kaji', 650, 500, { minutes: 0 });
    w.settle();
    const shard = w.bullets.spawn(shot(), 500, 500, 1)!;
    expect(w.resolver.onStop(shard, e, 600, 500)).toBe(false);
    const before = w.bullets.activeCount;
    w.resolver.onHit(shard, e, true, 600, 500);
    expect(w.bullets.activeCount).toBe(before);
  });

  it('a redirected bullet reports REDIRECTED to the bullet system', () => {
    const w = world(buildWith(['ricochet']));
    w.enemies.spawn('kaji', 400, 500, { minutes: 0 });
    w.enemies.spawn('kaji', 400, 600, { minutes: 0 });
    w.settle();
    const b = w.bullets.spawn(shot(), 300, 500)!;
    const t = w.enemies.hitSegment(b, 300, 500, 420, 500, 4, w.resolver);
    expect(t).toBe(REDIRECTED);
    expect(b.bouncesLeft).toBe(0);
  });
});

describe('tiers, fittings and twists', () => {
  it('a module uses its tier numbers: Piercing Bore 3 pierces 3 more', () => {
    const shots = [shot({ pierce: 0 })];
    applyOnFire(buildPipeline(data, buildWith(['piercing_bore:3'])), shots);
    expect(shots[0]!.pierce).toBe(3);
  });

  it('Booster ▶ makes its right neighbour 40% stronger and nothing else', () => {
    const p = buildPipeline(data, buildWith(['heavy_slug', 'booster_right', 'heavy_slug']));
    expect(p.strength.slice(0, 3)).toEqual([1, 1, 1.4]);
    expect(p.fittings).toEqual([{ slot: 1, id: 'booster_right', left: null, right: 2 }]);
  });

  it('Overcharger: left ×2, right ×0.5; a fitting next to empty slots or fittings does nothing', () => {
    const p = buildPipeline(
      data,
      buildWith(['ember_shot', 'overcharger', 'venom_shot', null, 'brace', 'siphon']),
    );
    expect(p.strength[0]).toBeCloseTo(2);
    expect(p.strength[2]).toBeCloseTo(0.5);
    expect(p.fittings.find((f) => f.id === 'brace')).toMatchObject({ left: null, right: null });
    expect(p.fittings.find((f) => f.id === 'siphon')).toMatchObject({ left: null, right: null });
  });

  it('fittings do not reach across the Double Barrel gap', () => {
    const gun = getById(data.guns, 'double_barrel', 'gun');
    const b = createBuild(gun.barrel.slots);
    b.barrel[3] = { id: 'booster_right', tier: 1 }; // last slot of the left half
    b.barrel[4] = { id: 'ember_shot', tier: 1 }; // first slot of the right half
    const p = buildPipeline(data, b, gun);
    expect(p.strength[4]).toBe(1);
  });

  it('the Long Gun muzzle doubles the last slot, stacking with a fitting', () => {
    const gun = getById(data.guns, 'long_gun', 'gun');
    const b = createBuild(gun.barrel.slots);
    const last = gun.barrel.slots - 1;
    b.barrel[last - 1] = { id: 'booster_right', tier: 1 };
    b.barrel[last] = { id: 'heavy_slug', tier: 1 };
    expect(buildPipeline(data, b, gun).strength[last]).toBeCloseTo(2 * 1.4);
  });
});

describe('hybrids', () => {
  it('Plasma chains and burns every enemy it reaches', () => {
    const w = world(buildWith(['plasma']));
    const a = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    const others = [440, 480].map((x) => w.enemies.spawn('devi_brute', x, 500, { minutes: 0 })!);
    w.settle();
    w.bullets.spawn(shot(), 300, 500);
    w.step(20);
    expect(a.burnStacks).toBe(1);
    for (const o of others) {
      expect(o.burnStacks).toBe(1);
      expect(o.hp).toBeLessThan(120);
    }
  });

  it('Blight Arc poisons every enemy its chain reaches (that poison does not spread)', () => {
    const w = world(buildWith(['blight_arc']));
    w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 });
    const b = w.enemies.spawn('devi_brute', 440, 500, { minutes: 0 })!;
    w.settle();
    w.bullets.spawn(shot(), 300, 500);
    w.step(20);
    expect(b.poisonTime).toBeGreaterThan(0);
    expect(b.poisonCanSpread).toBe(false);
  });

  it('Brimstone burns and poisons; a burning, poisoned enemy bursts on death', () => {
    const w = world(buildWith(['brimstone']));
    const a = w.enemies.spawn('kaji', 400, 500, { minutes: 0 })!;
    const near = w.enemies.spawn('devi_brute', 430, 500, { minutes: 0 })!;
    w.settle();
    w.resolver.update(DT); // syncs the burst from the pipeline
    w.bullets.spawn(shot({ damage: 1 }), 300, 500);
    w.step(20);
    expect(a.burnStacks).toBeGreaterThan(0);
    expect(a.poisonTime).toBeGreaterThan(0);
    const hp = near.hp;
    w.enemies.kill(a);
    expect(near.hp).toBeLessThan(hp);
    expect(w.status.blasts).toHaveLength(1);
  });
});

describe('elements and the pellet rule', () => {
  it('six pellets of one volley add one burn stack; separate volleys add more', () => {
    const w = world(buildWith(['ember_shot']));
    const e = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    w.settle();
    for (let i = 0; i < 6; i++) w.bullets.spawn(shot({ volleyId: 1, damage: 1 }), 300, 498 + i);
    w.step(20);
    expect(e.burnStacks).toBe(1);
    for (let v = 2; v <= 8; v++) w.bullets.spawn(shot({ volleyId: v, damage: 1 }), 300, 500);
    w.step(20);
    expect(e.burnStacks).toBe(5); // capped at 5 at tier 1
  });

  it('burn ticks for stacks x 3 dps, ignoring defence, every 0.5 s', () => {
    const w = world(createBuild());
    const e = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    w.status.applyBurn(e, 3, 3, 5);
    w.status.applyBurn(e, 3, 3, 5);
    w.status.update(0.5);
    expect(e.hp).toBeCloseTo(120 - 2 * 3 * 0.5);
  });

  it('poison does not stack, and spreads once on death to nearby enemies', () => {
    const w = world(createBuild());
    const a = w.enemies.spawn('kaji', 400, 500, { minutes: 0 })!;
    const b = w.enemies.spawn('kaji', 440, 500, { minutes: 0 })!;
    const c = w.enemies.spawn('kaji', 480, 500, { minutes: 0 })!;
    w.settle();
    w.status.applyPoison(a, 8, 6, 2, u(3));
    w.status.applyPoison(a, 8, 6, 2, u(3));
    expect(a.poisonDps).toBe(8);
    w.enemies.kill(a);
    expect(b.poisonTime).toBe(6);
    expect(c.poisonTime).toBe(6);
    expect(b.poisonCanSpread).toBe(false);
  });

  it('lightning chains to N enemies and never hits one twice', () => {
    const w = world(createBuild());
    const from = w.enemies.spawn('devi_brute', 400, 500, { minutes: 0 })!;
    const others = [440, 480].map((x) => w.enemies.spawn('devi_brute', x, 500, { minutes: 0 })!);
    w.settle();
    w.status.chainLightning(from, 5, u(4), 20, w.resolver.arcs);
    expect(w.resolver.arcs).toHaveLength(2); // only two others in range
    for (const o of others) expect(o.hp).toBe(120 - (20 - 3));
    expect(from.hp).toBe(120);
  });
});

describe('support perks (were magazine mods)', () => {
  const gun = getById(data.guns, 'long_gun', 'gun');
  const stats = computeStats(baseStats(data.config, data.cards), emptyBonuses(), emptyBonuses());

  it('Extended Mag and Quick Hands change magazine size and reload time', () => {
    const p = supportPipeline({ extended_mag: 1, quick_hands: 1 });
    const w = computeWeaponStats(gun, stats, 1, p.weaponMods);
    expect(w.magSize).toBe(8); // 5 x 1.5 = 7.5, rounded
    expect(w.reloadSec).toBeCloseTo(1.4);
  });

  it('Last Round makes the last bullet deal x3', () => {
    const p = supportPipeline({ last_round: 1 });
    const weapon = new WeaponSystem(
      computeWeaponStats(gun, stats, 1, p.weaponMods),
      new RNG(1),
      new EventBus(),
    );
    const out: ShotSpec[] = [];
    for (let i = 0; i < 60 * 6; i++) weapon.update(DT, { fire: true, reload: false, aimAngle: 0 }, out);
    expect(out.map((s) => s.damage)).toEqual([60, 60, 60, 60, 180]);
  });

  it('event mods are reported for the scene to trigger', () => {
    const p = supportPipeline({ grenade_mag: 1, scavenger: 1 });
    expect(p.support.grenade).toEqual({ damage: 80, radius: 2.5, throwRange: 6, fuseSec: 0.35 });
    expect(p.support.scavengerChance).toBe(0.1);
    expect(supportPipeline({ scavenger: 3 }).support.scavengerChance).toBeGreaterThan(0.1);
  });

  it('Scavenger rounds go back into the magazine, never above its size', () => {
    const weapon = new WeaponSystem(computeWeaponStats(gun, stats, 1), new RNG(1), new EventBus());
    weapon.addRound();
    expect(weapon.ammo).toBe(5);
    const out: ShotSpec[] = [];
    weapon.update(DT, { fire: true, reload: false, aimAngle: 0 }, out);
    weapon.addRound();
    expect(weapon.ammo).toBe(5);
  });
});
