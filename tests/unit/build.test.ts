import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';
import { getById } from '../../src/data/registry';
import {
  applyCard,
  candidateCards,
  cardKey,
  createBuild,
  drawCards,
  isCardValid,
  rollTinker,
  swapSlots,
  unlockedSlots,
  type BuildTarget,
  type Card,
} from '../../src/systems/build';
import { modDef } from '../../src/systems/fusion';
import { emptyBonuses } from '../../src/systems/stats';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const target = (slots = 8): BuildTarget => ({
  build: createBuild(slots),
  runBonuses: emptyBonuses(),
  support: {},
});

describe('slot unlocks', () => {
  it('opens slots by level from config.slots.barrelUnlockLevels', () => {
    const levels = data.config.slots.barrelUnlockLevels;
    expect(unlockedSlots(data, 1, 8)).toBe(levels.filter((l) => l <= 1).length);
    expect(unlockedSlots(data, 99, 8)).toBe(8);
    // More levels, never fewer slots.
    let prev = 0;
    for (let lv = 1; lv <= 20; lv++) {
      const open = unlockedSlots(data, lv, 8);
      expect(open).toBeGreaterThanOrEqual(prev);
      prev = open;
    }
  });
});

describe('card draw never offers an invalid card (property test over many seeds)', () => {
  it('holds for 300 simulated runs of 25 level-ups each', () => {
    const gun = getById(data.guns, 'double_barrel', 'gun');
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new RNG(seed);
      const t = target(gun.barrel.slots);
      for (let level = 2; level <= 26; level++) {
        const hand = drawCards(data, t.build, level, rng, t.support);
        expect(hand).toHaveLength(3);
        expect(new Set(hand.map(cardKey)).size).toBe(3); // distinct
        for (const c of hand)
          expect(isCardValid(data, t.build, c, t.support), `seed ${seed} level ${level} ${cardKey(c)}`).toBe(
            true,
          );

        // Pick one at random and put modules in a random open slot, like a player would.
        const card = rng.pick(hand);
        const open = unlockedSlots(data, level, t.build.barrel.length);
        const slot =
          card.type === 'module'
            ? rng.int(0, open - 1)
            : card.type === 'muzzle'
              ? rng.int(0, t.build.muzzle.length - 1)
              : undefined;
        applyCard(data, gun, t, card, slot, open);

        for (const s of t.build.barrel) if (s) expect(s.tier).toBeGreaterThanOrEqual(1);
        // Nothing sits in a slot that is not unlocked yet.
        t.build.barrel.slice(open).forEach((s) => expect(s).toBeNull());
        expect(t.build.coreTier).toBeLessThanOrEqual(data.config.slots.maxCoreTier);
        for (const p of data.supportPerks) expect(t.support[p.id] ?? 0).toBeLessThanOrEqual(p.levels.length);
      }
    }
  });
});

describe('module cards', () => {
  it('never offers a hybrid: hybrids are only made by fusing', () => {
    const ids = candidateCards(data, createBuild()).flatMap(([c]) => (c.type === 'module' ? [c.modId] : []));
    for (const id of ids) expect(modDef(data, id).family).not.toBe('hybrid');
    expect(ids).toContain('ember_shot');
    expect(ids).toContain('booster_right');
  });

  it('a module that would fuse with one in the barrel weighs more and says so', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'twin_shot', tier: 3 };
    const cards = candidateCards(data, build);
    const weight = (id: string) => cards.find(([c]) => c.type === 'module' && c.modId === id)!;
    const [twin, twinW] = weight('twin_shot');
    const [rico, ricoW] = weight('ricochet');
    expect(twin.type === 'module' && twin.fuses).toBe(true);
    expect(rico.type === 'module' && rico.fuses).toBe(false);
    expect(twinW / ricoW).toBeCloseTo(data.cards.fusesWithOwnedMult);
  });

  it('a module card needs a slot; placing it next to a match fuses', () => {
    const t = target();
    t.build.barrel[0] = { id: 'ember_shot', tier: 2 };
    const card: Card = { type: 'module', modId: 'ember_shot', family: 'element', fuses: true };
    expect(() => applyCard(data, null, t, card)).toThrow();
    const events = applyCard(data, null, t, card, 1);
    expect(events.some((e) => e.kind === 'fuse')).toBe(true);
    expect(t.build.barrel[1]).toEqual({ id: 'ember_shot', tier: 3 });
  });

  it('swapping can bring matches together, and they fuse', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'twin_shot', tier: 1 };
    build.barrel[1] = { id: 'ricochet', tier: 1 };
    build.barrel[2] = { id: 'twin_shot', tier: 1 };
    swapSlots(data, null, build, 1, 2);
    expect(build.barrel.slice(0, 3)).toEqual([
      null,
      { id: 'twin_shot', tier: 2 },
      { id: 'ricochet', tier: 1 },
    ]);
  });
});

describe('support perks, run stats and Core Tier', () => {
  it('a support perk goes up a level each time and stops being offered at its max', () => {
    const t = target();
    const perk = data.supportPerks[0]!;
    for (let lv = 1; lv <= perk.levels.length; lv++) {
      const card = candidateCards(data, t.build, t.support).find(
        ([c]) => c.type === 'supportPerk' && c.perkId === perk.id,
      );
      expect(card?.[0]).toEqual({ type: 'supportPerk', perkId: perk.id, toLevel: lv });
      applyCard(data, null, t, card![0]);
    }
    expect(t.support[perk.id]).toBe(perk.levels.length);
    expect(
      candidateCards(data, t.build, t.support).some(
        ([c]) => c.type === 'supportPerk' && c.perkId === perk.id,
      ),
    ).toBe(false);
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

  it('Core Tier is offered only below the max', () => {
    const build = createBuild();
    build.coreTier = data.config.slots.maxCoreTier;
    expect(candidateCards(data, build).some(([c]) => c.type === 'coreTier')).toBe(false);
  });

  it('perks are a real option: most hands early in a run include one', () => {
    const rng = new RNG(11);
    let withPerk = 0;
    for (let i = 0; i < 400; i++) {
      if (
        drawCards(data, createBuild(), 2, rng).some((c) => c.type === 'runStat' || c.type === 'supportPerk')
      )
        withPerk++;
    }
    expect(withPerk / 400).toBeGreaterThan(0.4);
  });
});

describe('Tinker (random +1 tiers)', () => {
  it('is only offered when the barrel has a tiered module (fittings do not count)', () => {
    expect(rollTinker(data, createBuild(), new RNG(1))).toBeNull();
    const onlyFitting = createBuild();
    onlyFitting.barrel[0] = { id: 'brace', tier: 1 };
    expect(rollTinker(data, onlyFitting, new RNG(1))).toBeNull();
  });

  it('adds its tiers to modules in the barrel, with no cap, and can hit the same one twice', () => {
    let sameTwice = false;
    for (let seed = 1; seed <= 200; seed++) {
      const t = target();
      t.build.barrel[0] = { id: 'ricochet', tier: 5 };
      t.build.barrel[1] = { id: 'split_shot', tier: 2 };
      const card = rollTinker(data, t.build, new RNG(seed))!;
      if (card.type !== 'randomUpgrade') throw new Error('expected Tinker');
      expect(card.upgrades).toHaveLength(data.cards.randomUpgrade.upgrades);
      expect(isCardValid(data, t.build, card)).toBe(true);
      if (card.upgrades[0]!.slot === card.upgrades[1]!.slot) sameTwice = true;
      applyCard(data, null, t, card);
      expect(t.build.barrel[0]!.tier + t.build.barrel[1]!.tier).toBe(5 + 2 + card.upgrades.length);
    }
    expect(sameTwice).toBe(true);
  });

  it('still lands if the module was swapped to another slot before picking', () => {
    const t = target();
    t.build.barrel[0] = { id: 'ricochet', tier: 1 };
    const card: Card = { type: 'randomUpgrade', upgrades: [{ slot: 0, modId: 'ricochet' }] };
    swapSlots(data, null, t.build, 0, 3);
    applyCard(data, null, t, card);
    expect(t.build.barrel[3]).toEqual({ id: 'ricochet', tier: 2 });
  });
});
