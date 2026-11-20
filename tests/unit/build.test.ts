import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';
import {
  applyCard,
  cardKey,
  createBuild,
  drawCards,
  isCardValid,
  rollTinker,
  swapSlots,
  unlockedSlots,
  type Card,
} from '../../src/systems/build';
import { emptyBonuses } from '../../src/systems/stats';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();

describe('slot unlocks', () => {
  it('all 4 barrel slots and both magazine slots are open from level 1', () => {
    expect([1, 5, 20].map((l) => unlockedSlots(data, 'barrel', l, 4))).toEqual([4, 4, 4]);
    expect([1, 5, 20].map((l) => unlockedSlots(data, 'magazine', l, 2))).toEqual([2, 2, 2]);
  });
});

describe('card draw never offers an invalid card (property test over many seeds)', () => {
  it('holds for 300 simulated runs of 25 level-ups each', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new RNG(seed);
      const build = createBuild();
      const bonuses = emptyBonuses();
      for (let level = 2; level <= 26; level++) {
        const hand = drawCards(data, build, level, rng);
        expect(hand).toHaveLength(3);
        expect(new Set(hand.map(cardKey)).size).toBe(3); // distinct
        for (const c of hand)
          expect(isCardValid(data, build, level, c), `seed ${seed} level ${level} ${cardKey(c)}`).toBe(true);

        // Pick one at random, like a player would.
        const card = rng.pick(hand);
        const replaceSlot =
          card.type === 'newMod' && card.replace
            ? rng.int(0, unlockedSlots(data, card.kind, level, build[card.kind].length) - 1)
            : undefined;
        applyCard(build, bonuses, card, replaceSlot);

        for (const kind of ['barrel', 'magazine'] as const) {
          const ids = build[kind].filter(Boolean).map((s) => s!.id);
          expect(new Set(ids).size).toBe(ids.length); // never the same mod twice
          for (const s of build[kind]) if (s) expect(s.level).toBeLessThanOrEqual(3);
          // Nothing sits in a slot that is not unlocked yet.
          build[kind]
            .slice(unlockedSlots(data, kind, level, build[kind].length))
            .forEach((s) => expect(s).toBeNull());
        }
        expect(build.coreTier).toBeLessThanOrEqual(5);
      }
    }
  });
});

describe('specific card rules', () => {
  it('offers replace cards only when every unlocked slot is full', () => {
    const build = createBuild();
    build.barrel = ['ricochet', 'split_shot', 'twin_shot', 'ember_shot'].map((id) => ({ id, level: 1 }));
    const rng = new RNG(1);
    for (let i = 0; i < 50; i++) {
      for (const c of drawCards(data, build, 2, rng)) {
        if (c.type === 'newMod' && c.kind === 'barrel') expect(c.replace).toBe(true);
      }
    }
  });

  it('upgrades owned mods instead of offering them again, and stops at level 3', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'ricochet', level: 3 };
    const rng = new RNG(2);
    for (let i = 0; i < 100; i++) {
      for (const c of drawCards(data, build, 2, rng)) {
        expect(c.type === 'newMod' && c.modId === 'ricochet').toBe(false);
        expect(c.type === 'modUpgrade' && c.modId === 'ricochet').toBe(false);
      }
    }
  });

  it('a replace card needs a slot, and the new mod starts at level 1', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'ricochet', level: 2 };
    const card: Card = { type: 'newMod', kind: 'barrel', modId: 'split_shot', replace: true };
    expect(() => applyCard(build, emptyBonuses(), card)).toThrow();
    applyCard(build, emptyBonuses(), card, 0);
    expect(build.barrel[0]).toEqual({ id: 'split_shot', level: 1 });
  });

  it('run stat cards carry the value for their rarity', () => {
    const rng = new RNG(4);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const c of drawCards(data, createBuild(), 30, rng)) {
        if (c.type !== 'runStat') continue;
        const def = data.cards.runStats.find((r) => r.id === c.cardId)!;
        expect(c.value).toBe(def.values[c.rarity]);
        seen.add(c.rarity);
      }
    }
    expect(seen).toEqual(new Set(['common', 'rare', 'epic']));
  });

  it('swapping barrel slots changes their order', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'split_shot', level: 1 };
    build.barrel[1] = { id: 'ricochet', level: 2 };
    swapSlots(build, 'barrel', 0, 1);
    expect(build.barrel.slice(0, 2).map((s) => s!.id)).toEqual(['ricochet', 'split_shot']);
  });
});

describe('Tinker (random upgrades) and perks', () => {
  it('is only offered when an owned mod can still level up', () => {
    expect(rollTinker(data, createBuild(), new RNG(1))).toBeNull();
    const maxed = createBuild();
    maxed.barrel[0] = { id: 'ricochet', level: 3 };
    expect(rollTinker(data, maxed, new RNG(1))).toBeNull();
  });

  it('gives 2 level-ups, never past level 3, and can hit the same mod twice', () => {
    let sameModTwice = false;
    for (let seed = 1; seed <= 200; seed++) {
      const build = createBuild();
      build.barrel[0] = { id: 'ricochet', level: 1 };
      build.barrel[1] = { id: 'split_shot', level: 2 };
      const card = rollTinker(data, build, new RNG(seed))!;
      expect(card.type).toBe('randomUpgrade');
      if (card.type !== 'randomUpgrade') continue;
      expect(card.upgrades).toHaveLength(2);
      expect(isCardValid(data, build, 2, card)).toBe(true);
      if (card.upgrades[0]!.modId === card.upgrades[1]!.modId) sameModTwice = true;
      applyCard(build, emptyBonuses(), card);
      const levels = build.barrel.slice(0, 2).map((s) => s!.level);
      expect(levels[0]! + levels[1]!).toBe(1 + 2 + 2);
      for (const l of levels) expect(l).toBeLessThanOrEqual(3);
    }
    expect(sameModTwice).toBe(true);
  });

  it('with one mod one level from max, only that one upgrade is possible', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'ricochet', level: 2 };
    const card = rollTinker(data, build, new RNG(3))!;
    expect(card.type === 'randomUpgrade' && card.upgrades.length).toBe(1);
  });

  it('perks are a real option: most hands early in a run include one', () => {
    const rng = new RNG(11);
    let withPerk = 0;
    for (let i = 0; i < 400; i++) {
      if (drawCards(data, createBuild(), 2, rng).some((c) => c.type === 'runStat')) withPerk++;
    }
    expect(withPerk / 400).toBeGreaterThan(0.4);
  });
});
