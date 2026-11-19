import { describe, expect, it } from 'vitest';
import { getById } from '../../src/data/registry';
import { buffCost, buyBuff, canBuy, metaBonuses, refundAll, spentSilver } from '../../src/systems/market';
import {
  addHighScore,
  freshSave,
  SaveSystem,
  type HighScoreEntry,
  type KeyValueStore,
} from '../../src/systems/save';
import { baseStats, computeStats, emptyBonuses } from '../../src/systems/stats';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const KEY = 'svan-and-gun:save';
const BROKEN = 'svan-and-gun:save:broken';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

class BlockedStore implements KeyValueStore {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('SecurityError');
  }
}

describe('SaveSystem', () => {
  it('starts fresh, and round-trips silver, buffs, scores and settings', () => {
    const store = new MemoryStore();
    const a = new SaveSystem(store, KEY, BROKEN);
    expect(a.load()).toEqual(freshSave());
    a.state.silver = 250;
    a.state.buffLevels.max_hp = 2;
    a.state.settings.autoFire = true;
    a.save();
    const b = new SaveSystem(store, KEY, BROKEN);
    expect(b.load()).toMatchObject({ silver: 250, buffLevels: { max_hp: 2 }, settings: { autoFire: true } });
    expect(b.notice).toBeNull();
  });

  it('backs up a broken save, starts fresh, and says so', () => {
    const store = new MemoryStore();
    store.setItem(KEY, '{"version":1,"silver":"lots"}');
    const s = new SaveSystem(store, KEY, BROKEN);
    expect(s.load()).toEqual(freshSave());
    expect(s.notice).toBe('broken');
    expect(store.getItem(BROKEN)).toBe('{"version":1,"silver":"lots"}');
    expect(JSON.parse(store.getItem(KEY)!)).toEqual(freshSave());
  });

  it('treats unreadable JSON as broken too', () => {
    const store = new MemoryStore();
    store.setItem(KEY, '{not json');
    const s = new SaveSystem(store, KEY, BROKEN);
    s.load();
    expect(s.notice).toBe('broken');
  });

  it('keeps working in memory when storage is blocked', () => {
    const s = new SaveSystem(new BlockedStore(), KEY, BROKEN);
    expect(s.load()).toEqual(freshSave());
    expect(s.notice).toBe('unavailable');
    s.state.silver = 10;
    expect(s.save()).toBe(false);
    expect(s.state.silver).toBe(10);
  });
});

describe('high scores', () => {
  const entry = (score: number): HighScoreEntry => ({
    score,
    gun: 'long_gun',
    timeSec: 100,
    result: 'defeat',
    date: '2026-11-20',
  });

  it('keeps the top 10, best first, and flags a new best', () => {
    let list: HighScoreEntry[] = [];
    for (const s of [500, 900, 100, 700, 300, 800, 200, 600, 400, 1000, 50])
      list = addHighScore(list, entry(s), 10).list;
    expect(list.map((e) => e.score)).toEqual([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100]);
    const r = addHighScore(list, entry(1200), 10);
    expect(r).toMatchObject({ rank: 1, newBest: true });
    expect(addHighScore(list, entry(10), 10)).toMatchObject({ rank: null, newBest: false });
  });

  it('the first score ever is a new best', () => {
    expect(addHighScore([], entry(0), 10).newBest).toBe(true);
  });
});

describe('market', () => {
  const maxHp = getById(data.buffs, 'max_hp', 'buff');
  const secondWind = getById(data.buffs, 'second_wind', 'buff');

  it('cost = base x 1.5^level', () => {
    expect([0, 1, 2, 3].map((l) => buffCost(maxHp, l))).toEqual([50, 75, 113, 169]);
  });

  it('buys a level when affordable, never past max', () => {
    const save = freshSave();
    save.silver = 130;
    expect(buyBuff(save, maxHp)).toBe(true);
    expect(buyBuff(save, maxHp)).toBe(true);
    expect(save).toMatchObject({ silver: 5, buffLevels: { max_hp: 2 } });
    expect(canBuy(save, maxHp)).toBe(false);
    save.silver = 5000;
    expect(buyBuff(save, secondWind)).toBe(true);
    expect(buyBuff(save, secondWind)).toBe(false); // max level 1
  });

  it('refund all returns exactly what was spent', () => {
    const save = freshSave();
    save.silver = 1000;
    buyBuff(save, maxHp);
    buyBuff(save, maxHp);
    buyBuff(save, getById(data.buffs, 'damage', 'buff'));
    const spent = spentSilver(save, data.buffs);
    expect(spent).toBe(50 + 75 + 120);
    expect(refundAll(save, data.buffs)).toBe(spent);
    expect(save).toMatchObject({ silver: 1000, buffLevels: {} });
  });

  it("bought levels change the next run's stats", () => {
    const save = freshSave();
    save.buffLevels = { max_hp: 3, walk_speed: 2, defence: 1 };
    const stats = computeStats(
      baseStats(data.config, data.cards),
      metaBonuses(save, data.buffs),
      emptyBonuses(),
    );
    expect(stats.maxHp).toBe(130);
    expect(stats.moveSpeed).toBeCloseTo(5 * 1.06);
    expect(stats.defence).toBe(1);
  });
});
