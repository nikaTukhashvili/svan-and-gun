import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { getById } from '../../src/data/registry';
import { baseStats, computeStats, emptyBonuses, type PlayerStats } from '../../src/systems/stats';
import { computeWeaponStats, WeaponSystem, type ShotSpec } from '../../src/systems/weapon';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const stats = computeStats(baseStats(data.config, data.cards), emptyBonuses(), emptyBonuses());
const DT = 1 / 60;

function makeWeapon(gunId: string, playerStats: PlayerStats = stats, tier = 1) {
  const bus = new EventBus<GameEvents>();
  const gun = getById(data.guns, gunId, 'gun');
  const weapon = new WeaponSystem(computeWeaponStats(gun, playerStats, tier), new RNG(1), bus);
  return { weapon, bus };
}

/** Run the weapon for `seconds` and return every shot fired. */
function run(weapon: WeaponSystem, seconds: number, fire = true, reload = false): ShotSpec[] {
  const out: ShotSpec[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) weapon.update(DT, { fire, reload: reload && i === 0, aimAngle: 0 }, out);
  return out;
}

const volleys = (shots: ShotSpec[]) => new Set(shots.map((s) => s.volleyId)).size;

describe('computeWeaponStats', () => {
  const gun = getById(data.guns, 'long_gun', 'gun');

  it('converts ranges and speeds from units to pixels', () => {
    const w = computeWeaponStats(gun, stats, 1);
    expect(w.range).toBe(u(14));
    expect(w.bulletSpeed).toBe(u(30));
  });

  it('applies Core Tiers: Tier V is +40% damage and +20% fire rate', () => {
    const w = computeWeaponStats(gun, stats, 5);
    expect(w.damage).toBeCloseTo(60 * 1.4);
    expect(w.shotsPerSecond).toBeCloseTo(0.8 * 1.2);
  });

  it('makes reloads faster as reload speed goes up', () => {
    const w = computeWeaponStats(gun, { ...stats, reloadSpeed: 1.25 }, 1);
    expect(w.reloadSec).toBeCloseTo(1.6);
  });

  it('scales range with the bullet speed stat', () => {
    const w = computeWeaponStats(gun, { ...stats, bulletSpeed: 1.5 }, 1);
    expect(w.range).toBeCloseTo(u(21));
    expect(w.bulletSpeed).toBeCloseTo(u(45));
  });
});

describe('WeaponSystem', () => {
  it('Scrap SMG fires 10 rounds per second', () => {
    const { weapon } = makeWeapon('scrap_smg');
    expect(volleys(run(weapon, 1))).toBeGreaterThanOrEqual(10);
    expect(volleys(run(weapon, 1))).toBeLessThanOrEqual(11);
  });

  it('empties the magazine, auto-reloads, and cannot fire while reloading', () => {
    const { weapon } = makeWeapon('long_gun'); // 5 rounds at 0.8/s, 2 s reload
    const shots = run(weapon, 5.1);
    expect(shots).toHaveLength(5);
    expect(weapon.ammo).toBe(0);
    expect(weapon.reloading).toBe(true);
    expect(run(weapon, 1.5)).toHaveLength(0);
  });

  it('refills after the reload time', () => {
    const { weapon } = makeWeapon('double_barrel'); // 2 rounds, 1.6 s reload
    run(weapon, 0.6);
    expect(weapon.ammo).toBe(0);
    run(weapon, 1.65, false);
    expect(weapon.ammo).toBe(2);
    expect(weapon.reloading).toBe(false);
  });

  it('R reloads a partly used magazine, and is ignored when the magazine is full', () => {
    const { weapon, bus } = makeWeapon('scrap_smg');
    const onReload = vi.fn();
    bus.on('weapon:reload', onReload);
    run(weapon, 0.05, false, true); // full mag
    expect(onReload).not.toHaveBeenCalled();
    run(weapon, 0.5);
    run(weapon, 0.05, false, true);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(weapon.reloading).toBe(true);
  });

  it('does not release a burst after holding the trigger through a reload', () => {
    const { weapon } = makeWeapon('long_gun');
    run(weapon, 5.1); // empty, now reloading
    run(weapon, 2.0); // trigger held through the whole reload
    // One shot right after the reload finishes, not several banked ones.
    const out: ShotSpec[] = [];
    weapon.update(DT, { fire: true, reload: false, aimAngle: 0 }, out);
    expect(volleys(out)).toBeLessThanOrEqual(1);
  });

  it('Double Barrel fires 6 pellets per trigger pull inside a 30° cone, sharing one volley id', () => {
    const { weapon } = makeWeapon('double_barrel');
    const out: ShotSpec[] = [];
    weapon.update(DT, { fire: true, reload: false, aimAngle: 1 }, out);
    expect(out).toHaveLength(6);
    expect(new Set(out.map((s) => s.volleyId)).size).toBe(1);
    const half = (15 * Math.PI) / 180;
    for (const s of out) {
      expect(s.angle).toBeGreaterThanOrEqual(1 - half);
      expect(s.angle).toBeLessThanOrEqual(1 + half);
      expect(s.damage).toBe(10);
    }
    expect(weapon.ammo).toBe(1);
  });

  it('Scrap SMG makes every 10th bullet a crit', () => {
    const { weapon } = makeWeapon('scrap_smg');
    const shots = run(weapon, 2.5); // 25 shots
    const crits = shots.map((s, i) => (s.crit ? i + 1 : 0)).filter(Boolean);
    expect(crits).toEqual([10, 20]);
  });

  it('Long Gun bullets pierce 1 enemy and fire straight', () => {
    const { weapon } = makeWeapon('long_gun');
    const out = run(weapon, 0.05);
    expect(out[0]).toMatchObject({ pierce: 1, angle: 0, damage: 60 });
  });

  it('emits weapon:fired and weapon:reloaded', () => {
    const { weapon, bus } = makeWeapon('double_barrel');
    const fired = vi.fn();
    const reloaded = vi.fn();
    bus.on('weapon:fired', fired);
    bus.on('weapon:reloaded', reloaded);
    run(weapon, 2.5);
    expect(fired).toHaveBeenNthCalledWith(1, { ammo: 1, magSize: 2 });
    expect(reloaded).toHaveBeenCalledWith({ ammo: 2, magSize: 2 });
  });

  it('is deterministic for the same seed', () => {
    const a = run(makeWeapon('scrap_smg').weapon, 1).map((s) => s.angle);
    const b = run(makeWeapon('scrap_smg').weapon, 1).map((s) => s.angle);
    expect(a).toEqual(b);
  });
});
