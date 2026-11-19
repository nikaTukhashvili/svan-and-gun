import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { applyDefence } from '../../src/systems/damage';
import { PlayerHealth } from '../../src/systems/playerHealth';
import { addBonus, baseStats, computeStats, emptyBonuses } from '../../src/systems/stats';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const base = baseStats(data.config, data.cards);

describe('player stats', () => {
  it('starts from the GDD base values', () => {
    const s = computeStats(base, emptyBonuses(), emptyBonuses());
    expect(s).toMatchObject({
      maxHp: 100,
      defence: 0,
      moveSpeed: 5,
      pickupRadius: 2,
      rerolls: 1,
      revives: 0,
    });
  });

  it('adds flat bonuses and multiplies percentage bonuses (TDD: Applying stats)', () => {
    const meta = emptyBonuses();
    const run = emptyBonuses();
    addBonus(meta, 'maxHp', 'add', 20); // 2 market levels
    addBonus(run, 'maxHp', 'add', 15); // a run card
    addBonus(meta, 'fireRate', 'mult', 0.08);
    addBonus(run, 'fireRate', 'mult', 0.1);
    const s = computeStats(base, meta, run);
    expect(s.maxHp).toBe(135);
    expect(s.fireRate).toBeCloseTo(1.08 * 1.1);
  });

  it('stacks repeated bonuses of the same kind', () => {
    const run = emptyBonuses();
    addBonus(run, 'moveSpeed', 'mult', 0.1);
    addBonus(run, 'moveSpeed', 'mult', 0.1);
    expect(computeStats(base, emptyBonuses(), run).moveSpeed).toBeCloseTo(6);
  });
});

describe('damage formula', () => {
  it('subtracts defence with a minimum of 1', () => {
    expect(applyDefence(20, 3, 1)).toBe(17);
    expect(applyDefence(2, 3, 1)).toBe(1);
    expect(applyDefence(8, 0, 1)).toBe(8);
  });
});

describe('PlayerHealth', () => {
  const opts = { invulnerableSec: 0.5, minDamage: 1, reviveHpFraction: 0.5, reviveInvulnerableSec: 2 };
  const make = (overrides: Partial<typeof base> = {}) => {
    const bus = new EventBus<GameEvents>();
    const health = new PlayerHealth({ ...base, ...overrides }, opts, bus);
    return { bus, health };
  };

  it('takes defence off each hit, at least 1 damage', () => {
    const { health } = make({ defence: 3 });
    expect(health.takeHit(5)).toBe(2);
    health.update(0.6);
    expect(health.takeHit(2)).toBe(1);
    expect(health.hp).toBe(97);
  });

  it('ignores hits during the invulnerability window, then takes them again', () => {
    const { health } = make();
    health.takeHit(10);
    expect(health.takeHit(10)).toBe(0);
    health.update(0.49);
    expect(health.takeHit(10)).toBe(0);
    health.update(0.02);
    expect(health.takeHit(10)).toBe(10);
    expect(health.hp).toBe(80);
  });

  it('emits player:damaged and, at 0 HP, run:ended once', () => {
    const { bus, health } = make();
    const damaged = vi.fn();
    const ended = vi.fn();
    bus.on('player:damaged', damaged);
    bus.on('run:ended', ended);
    health.takeHit(150);
    health.update(1);
    health.takeHit(10);
    expect(damaged).toHaveBeenCalledWith({ amount: 150, hpLeft: 0 });
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith({ result: 'defeat' });
    expect(health.dead).toBe(true);
  });

  it('regenerates up to max HP', () => {
    const { health } = make({ hpRegen: 2 });
    health.takeHit(5);
    health.update(1);
    expect(health.hp).toBe(97);
    health.update(10);
    expect(health.hp).toBe(100);
  });

  it('heals by the max HP gained from new stats', () => {
    const { health } = make();
    health.takeHit(30);
    health.setStats({ ...base, maxHp: 115 });
    expect(health.maxHp).toBe(115);
    expect(health.hp).toBe(85);
  });

  it('Second Wind revives once at 50% HP, then death is final', () => {
    const { bus, health } = make({ revives: 1 });
    const ended = vi.fn();
    bus.on('run:ended', ended);
    health.takeHit(150);
    expect(health).toMatchObject({ dead: false, hp: 50, revivesLeft: 0 });
    expect(health.invulnerableLeft).toBe(2);
    health.update(2.1);
    health.takeHit(150);
    expect(health.dead).toBe(true);
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
