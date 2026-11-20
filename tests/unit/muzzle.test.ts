import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { u } from '../../src/core/math';
import { RNG } from '../../src/core/rng';
import { getById } from '../../src/data/registry';
import {
  applyCard,
  buildForGun,
  candidateCards,
  createBuild,
  isCardValid,
  startingSupport,
  type BuildTarget,
} from '../../src/systems/build';
import { buildPipeline } from '../../src/systems/modPipeline';
import {
  moveMuzzle,
  muzzleDef,
  muzzleStats,
  muzzleWeaponMods,
  placeMuzzle,
  previewMuzzle,
  totalMuzzle,
  type MuzzleSlot,
} from '../../src/systems/muzzle';
import { baseStats, computeStats, emptyBonuses } from '../../src/systems/stats';
import { computeWeaponStats, WeaponSystem, type ShotSpec } from '../../src/systems/weapon';
import { muzzleDescription } from '../../src/ui/cardText';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const stats = computeStats(baseStats(data.config, data.cards), emptyBonuses(), emptyBonuses());
const def = (id: string) => muzzleDef(data, id);
const row = (...pieces: (MuzzleSlot | null)[]) => pieces;
const gunWith = (gunId: string, ...pieces: (MuzzleSlot | null)[]) => {
  const gun = getById(data.guns, gunId, 'gun');
  const build = buildForGun(gun);
  pieces.forEach((p, i) => (build.muzzle[i] = p));
  const pipeline = buildPipeline(data, build, gun);
  return { gun, build, pipeline, weapon: computeWeaponStats(gun, stats, 1, pipeline.weaponMods) };
};

describe('muzzle pieces', () => {
  it('numbers grow by level: base + perLevel × (level − 1), bullets rounded, no cap', () => {
    const flared = def('flared_muzzle');
    expect(muzzleStats(flared, 1)).toMatchObject({ bullets: 1, spreadDeg: 8, rangePct: -0.15 });
    expect(muzzleStats(flared, 3)).toMatchObject({ bullets: 3, spreadDeg: 16 });
    expect(muzzleStats(flared, 3).rangePct).toBeCloseTo(-0.29);
    expect(muzzleStats(flared, 20).bullets).toBe(20);
  });

  it('every piece has at least one upside and one downside', () => {
    for (const m of data.muzzles.pieces) {
      const text = muzzleDescription(data, m.id, 1);
      expect(text, m.id).toContain('▲');
      expect(text, m.id).toContain('▼');
    }
  });

  it('a card on an empty slot fits it, on the same piece upgrades it, on another piece replaces it', () => {
    const m = row(null, null, null);
    expect(placeMuzzle(m, 0, 'choke')).toEqual({ kind: 'fit', at: 0, piece: { id: 'choke', level: 1 } });
    expect(placeMuzzle(m, 0, 'choke')).toEqual({ kind: 'upgrade', at: 0, piece: { id: 'choke', level: 2 } });
    expect(m[0]).toEqual({ id: 'choke', level: 2 });
    const before = JSON.stringify(m);
    expect(previewMuzzle(m, 0, 'wild_muzzle').kind).toBe('replace'); // preview changes nothing
    expect(JSON.stringify(m)).toBe(before);
    placeMuzzle(m, 0, 'wild_muzzle');
    expect(m[0]).toEqual({ id: 'wild_muzzle', level: 1 });
  });

  it('the same piece can still sit in two slots; moving swaps and never merges', () => {
    const m = row({ id: 'choke', level: 1 }, null, null);
    placeMuzzle(m, 1, 'choke');
    expect(m.slice(0, 2)).toEqual([
      { id: 'choke', level: 1 },
      { id: 'choke', level: 1 },
    ]);
    moveMuzzle(m, 0, 2);
    expect(m).toEqual([null, { id: 'choke', level: 1 }, { id: 'choke', level: 1 }]);
  });

  it('stacks: stats from every slot add up', () => {
    const t = totalMuzzle(
      data,
      row({ id: 'flared_muzzle', level: 1 }, { id: 'flared_muzzle', level: 2 }, null),
    );
    expect(t.bullets).toBe(3);
    expect(t.spreadDeg).toBe(8 + 12);
    expect(t.rangePct).toBeCloseTo(-0.15 - 0.22);
  });

  it('floors keep stacked downsides from breaking the gun', () => {
    const t = totalMuzzle(data, row({ id: 'scatter_mouth', level: 6 }, { id: 'scatter_mouth', level: 6 }));
    const mods = muzzleWeaponMods(data, t);
    expect(mods.rangeMult).toBe(data.muzzles.floors.range);
    expect(mods.damageMult).toBe(data.muzzles.floors.damage);
  });
});

describe('the muzzle on the gun', () => {
  it('Flared on the Long Gun: +1 bullet in a narrow fan, shorter range', () => {
    const plain = gunWith('long_gun');
    const { weapon } = gunWith('long_gun', { id: 'flared_muzzle', level: 1 });
    expect(weapon.pellets).toBe(plain.weapon.pellets + 1);
    expect(weapon.spreadDeg).toBeGreaterThanOrEqual(data.muzzles.minFanDeg);
    expect(weapon.range).toBeCloseTo(plain.weapon.range * 0.85);
  });

  it('a Choke halves the spread; Compensator and Heavy Crown change fire rate, damage and bullet speed', () => {
    const smg = getById(data.guns, 'scrap_smg', 'gun');
    expect(gunWith('scrap_smg', { id: 'choke', level: 1 }).weapon.spreadDeg).toBeCloseTo(smg.spreadDeg * 0.5);
    const comp = gunWith('scrap_smg', { id: 'compensator', level: 1 }).weapon;
    expect(comp.shotsPerSecond).toBeCloseTo(smg.shotsPerSecond * 1.2);
    expect(comp.spreadDeg).toBeCloseTo(smg.spreadDeg + 6);
    const heavy = gunWith('scrap_smg', { id: 'heavy_crown', level: 1 }).weapon;
    expect(heavy.damage).toBeCloseTo(smg.damage * 1.25);
    expect(heavy.bulletSpeed).toBeCloseTo(u(smg.bulletSpeed * 0.8));
  });

  it('muzzle bullets are part of the same volley (the pellet rule)', () => {
    const { weapon } = gunWith('double_barrel', { id: 'scatter_mouth', level: 1 });
    const w = new WeaponSystem(weapon, new RNG(1), new EventBus<GameEvents>());
    const out: ShotSpec[] = [];
    w.update(0.016, { fire: true, reload: false, aimAngle: 0 }, out);
    expect(out).toHaveLength(6 + 2);
    expect(new Set(out.map((s) => s.volleyId)).size).toBe(1);
  });

  it('Wild Muzzle gives every bullet a crit chance', () => {
    const { weapon } = gunWith('long_gun', { id: 'wild_muzzle', level: 10 }); // 15% + 9 × 10% → 100%
    expect(weapon.critChance).toBe(1);
    const w = new WeaponSystem({ ...weapon, shotsPerSecond: 1000 }, new RNG(3), new EventBus<GameEvents>());
    const out: ShotSpec[] = [];
    w.update(0.016, { fire: true, reload: false, aimAngle: 0 }, out);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((s) => s.crit)).toBe(true);
  });

  it('muzzle slots per gun: Long Gun 3, Double Barrel 2, Scrap SMG 3', () => {
    expect(buildForGun(getById(data.guns, 'long_gun', 'gun')).muzzle).toHaveLength(3);
    expect(buildForGun(getById(data.guns, 'double_barrel', 'gun')).muzzle).toHaveLength(2);
    expect(buildForGun(getById(data.guns, 'scrap_smg', 'gun')).muzzle).toHaveLength(3);
  });

  it('the Double Barrel starts with Grenade Mag level 1, and the pipeline arms the grenade', () => {
    const gun = getById(data.guns, 'double_barrel', 'gun');
    const support = startingSupport(gun);
    expect(support).toEqual({ grenade_mag: 1 });
    expect(buildPipeline(data, buildForGun(gun), gun, support).support.grenade).not.toBeNull();
    expect(startingSupport(getById(data.guns, 'long_gun', 'gun'))).toEqual({});
  });
});

describe('muzzle cards', () => {
  const t = (): BuildTarget => ({ build: createBuild(8, 3), runBonuses: emptyBonuses(), support: {} });

  it('every piece is offered, marked when the gun already has it (can upgrade)', () => {
    const target = t();
    target.build.muzzle[1] = { id: 'choke', level: 1 };
    const cards = candidateCards(data, target.build).flatMap(([c]) => (c.type === 'muzzle' ? [c] : []));
    expect(cards.map((c) => c.muzzleId).sort()).toEqual(data.muzzles.pieces.map((m) => m.id).sort());
    expect(cards.find((c) => c.muzzleId === 'choke')!.owned).toBe(true);
    expect(cards.find((c) => c.muzzleId === 'wild_muzzle')!.owned).toBe(false);
  });

  it('a muzzle card needs a muzzle slot and lands there', () => {
    const target = t();
    const card = { type: 'muzzle', muzzleId: 'compensator', owned: false } as const;
    expect(isCardValid(data, target.build, card)).toBe(true);
    expect(() => applyCard(data, null, target, card)).toThrow();
    applyCard(data, null, target, card, 2);
    applyCard(data, null, target, card, 2);
    expect(target.build.muzzle[2]).toEqual({ id: 'compensator', level: 2 });
    expect(target.build.barrel.every((s) => s === null)).toBe(true);
  });
});
