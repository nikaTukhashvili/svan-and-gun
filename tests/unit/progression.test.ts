import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/eventBus';
import type { GameEvents } from '../../src/core/events';
import { RNG } from '../../src/core/rng';
import { Destructibles } from '../../src/systems/destructibles';
import { chestValue } from '../../src/systems/items';
import { PickupSystem, rollEnemyDrops, scrapSize } from '../../src/systems/pickups';
import { Progression, scrapToNext, totalScrapFor } from '../../src/systems/progression';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();

describe('XP curve (GDD: 5 + 10 x (L - 1))', () => {
  it('matches the GDD totals', () => {
    expect([1, 2, 3, 4].map((l) => scrapToNext(data.config.xp, l))).toEqual([5, 15, 25, 35]);
    expect(totalScrapFor(data.config.xp, 5)).toBe(80);
    expect(totalScrapFor(data.config.xp, 10)).toBe(405);
    expect(totalScrapFor(data.config.xp, 15)).toBe(980);
    expect(totalScrapFor(data.config.xp, 18)).toBe(1445);
  });

  it('queues several level-ups from one big pickup', () => {
    const bus = new EventBus<GameEvents>();
    const onLevel = vi.fn();
    bus.on('player:levelUp', onLevel);
    const p = new Progression(data.config.xp, bus);
    expect(p.add(25)).toBe(2); // 5 + 15, with 5 left over
    expect(p).toMatchObject({ level: 3, scrap: 5, pending: 2 });
    expect(onLevel).toHaveBeenCalledTimes(2);
    p.consume();
    expect(p.pending).toBe(1);
  });
});

describe('pickups', () => {
  it('fly to the player inside the pickup radius and are collected on touch', () => {
    const sys = new PickupSystem(10, 200);
    sys.spawn('scrap', 3, 100, 0);
    sys.spawn('scrap', 3, 1000, 0); // outside the radius: stays
    const got = vi.fn();
    for (let i = 0; i < 60; i++) sys.update(1 / 60, 0, 0, 128, 14, 448, got);
    expect(got).toHaveBeenCalledTimes(1);
    expect(sys.activeCount).toBe(1);
  });

  it('the Hunting Horn pulls in all scrap', () => {
    const sys = new PickupSystem(10, 200);
    sys.spawn('scrap', 1, 2000, 0);
    sys.spawn('silver', 1, 2000, 0);
    sys.magnetAllScrap();
    const got = vi.fn();
    for (let i = 0; i < 400; i++) sys.update(1 / 60, 0, 0, 64, 14, 448, got);
    expect(got).toHaveBeenCalledTimes(1);
    expect(got.mock.calls[0]![0].kind).toBe('scrap');
  });

  it('merges scrap into the nearest piece above the threshold', () => {
    const sys = new PickupSystem(10, 2);
    sys.spawn('scrap', 1, 0, 0);
    sys.spawn('scrap', 1, 500, 0);
    const merged = sys.spawn('scrap', 4, 480, 0)!;
    expect(sys.activeCount).toBe(2);
    expect(merged.value).toBe(5);
    expect(merged.x).toBe(500);
  });

  it('enemies drop scrap by type; elites also drop an elite chest and silver', () => {
    const rng = new RNG(1);
    expect(rollEnemyDrops(data.drops, rng, 'devi_brute', false)[0]).toEqual({ kind: 'scrap', value: 8 });
    const elite = rollEnemyDrops(data.drops, rng, 'ali', true);
    expect(elite).toEqual(
      expect.arrayContaining([
        { kind: 'scrap', value: 10 },
        { kind: 'chest', value: chestValue('elite') },
        { kind: 'silver', value: 10 },
      ]),
    );
  });

  it('picks the piece size from its value', () => {
    expect([1, 4, 5, 19, 20].map((v) => scrapSize(data.drops, v))).toEqual([
      'small',
      'small',
      'medium',
      'medium',
      'large',
    ]);
  });
});

describe('destructibles', () => {
  it('builds barrels and crates from the map; bullets hit and break them', () => {
    const d = Destructibles.fromMap(data.maps.level1!, data.drops);
    expect(d.items.filter((i) => i.kind === 'powderBarrel')).toHaveLength(5);
    const barrel = d.items[0]!;
    const hit = d.firstHit(barrel.x - 100, barrel.y, barrel.x + 100, barrel.y, 4);
    expect(hit?.item).toBe(barrel);
    expect(d.damage(barrel, 10)).toBe(false);
    expect(d.damage(barrel, 30)).toBe(true);
    expect(d.firstHit(barrel.x - 100, barrel.y, barrel.x + 100, barrel.y, 4)?.item).not.toBe(barrel);
  });
});
