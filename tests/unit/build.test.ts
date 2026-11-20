import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';
import { getById } from '../../src/data/registry';
import {
  applyCard,
  candidateCards,
  cardKey,
  cardType,
  createBuild,
  drawCards,
  isCardValid,
  pathOf,
  rollTinker,
  swapSlots,
  openSlots,
  slotUnlockLevels,
  type BuildTarget,
  type Card,
} from '../../src/systems/build';
import { modDef, mutationPairs } from '../../src/systems/fusion';
import { layoutOf } from '../../src/systems/modPipeline';
import { emptyBonuses } from '../../src/systems/stats';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const target = (slots = 8): BuildTarget => ({
  build: createBuild(slots),
  runBonuses: emptyBonuses(),
  support: {},
});

describe('slot unlocks', () => {
  const layout = (id: string) => {
    const gun = getById(data.guns, id, 'gun');
    return layoutOf(gun, gun.barrel.slots);
  };
  const count = (open: boolean[]) => open.filter(Boolean).length;

  it('opens slots by level from config.slots.barrelUnlockLevels; more levels never close one', () => {
    const levels = data.config.slots.barrelUnlockLevels;
    const l = layout('long_gun');
    expect(count(openSlots(data, l, 1))).toBe(levels.filter((x) => x <= 1).length);
    expect(count(openSlots(data, l, 99))).toBe(8);
    expect(openSlots(data, l, 1).slice(0, 4)).toEqual([true, true, true, true]); // one chain: left first
    let prev = openSlots(data, l, 1);
    for (let lv = 2; lv <= 20; lv++) {
      const open = openSlots(data, l, lv);
      prev.forEach((was, i) => was && expect(open[i]).toBe(true));
      prev = open;
    }
  });

  it('Double Barrel: the two halves take turns, so both have open slots from level 1', () => {
    const l = layout('double_barrel');
    const open = openSlots(data, l, 1);
    const half = l.slotsPerChain;
    expect(open.slice(0, half).some(Boolean)).toBe(true);
    expect(open.slice(half).some(Boolean)).toBe(true);
    expect(count(open.slice(0, half))).toBe(count(open.slice(half)));
  });

  it('Scrap SMG: the crit chamber (its twist) is open from level 1', () => {
    const l = layout('scrap_smg');
    expect(slotUnlockLevels(data, l)[l.slots - 1]).toBe(1);
    expect(openSlots(data, l, 1)[l.slots - 1]).toBe(true);
  });
});

describe('card draw never offers an invalid card (property test over many seeds)', () => {
  it('holds for 300 simulated runs of 25 level-ups each', () => {
    const gun = getById(data.guns, 'double_barrel', 'gun');
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new RNG(seed);
      const t = target(gun.barrel.slots);
      for (let level = 2; level <= 26; level++) {
        const hand = drawCards(data, t.build, level, rng, t.support, undefined, null, gun);
        expect(hand).toHaveLength(3);
        expect(new Set(hand.map(cardKey)).size).toBe(3); // distinct
        for (const c of hand)
          expect(
            isCardValid(data, t.build, c, t.support, gun),
            `seed ${seed} level ${level} ${cardKey(c)}`,
          ).toBe(true);

        // Pick one at random and put modules in a random open slot, like a player would.
        const card = rng.pick(hand);
        const open = openSlots(data, layoutOf(gun, t.build.barrel.length), level);
        const openIdx = open.flatMap((o, i) => (o ? [i] : []));
        const slot =
          card.type === 'module'
            ? rng.pick(openIdx)
            : card.type === 'muzzle'
              ? rng.int(0, t.build.muzzle.length - 1)
              : card.type === 'mutation'
                ? mutationPairs(data, t.build, layoutOf(gun, t.build.barrel.length))[0]![0]
                : undefined;
        applyCard(data, gun, t, card, slot, open);

        for (const s of t.build.barrel) if (s) expect(s.tier).toBeGreaterThanOrEqual(1);
        // Nothing sits in a slot that is not unlocked yet.
        t.build.barrel.forEach((s, i) => !open[i] && expect(s).toBeNull());
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

  it('a module that could upgrade one in the barrel weighs more and says so', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'twin_shot', tier: 3 };
    const cards = candidateCards(data, build);
    const weight = (id: string) => cards.find(([c]) => c.type === 'module' && c.modId === id)!;
    const [twin, twinW] = weight('twin_shot');
    const [rico, ricoW] = weight('ricochet');
    expect(twin.type === 'module' && twin.upgrades).toBe(true);
    expect(rico.type === 'module' && rico.upgrades).toBe(false);
    expect(twinW / ricoW).toBeCloseTo(data.cards.upgradesOwnedMult);
  });

  it('a module card needs a slot; dropped on the same module it upgrades it, next to it nothing merges', () => {
    const t = target();
    t.build.barrel[0] = { id: 'ember_shot', tier: 2 };
    const card: Card = { type: 'module', modId: 'ember_shot', family: 'element', upgrades: true };
    expect(() => applyCard(data, null, t, card)).toThrow();
    applyCard(data, null, t, card, 1);
    expect(t.build.barrel.slice(0, 2)).toEqual([
      { id: 'ember_shot', tier: 2 },
      { id: 'ember_shot', tier: 1 },
    ]);
    const events = applyCard(data, null, t, card, 0);
    expect(events[0]!.kind).toBe('upgrade');
    expect(t.build.barrel[0]).toEqual({ id: 'ember_shot', tier: 3 });
  });

  it('swapping never merges', () => {
    const build = createBuild();
    build.barrel[0] = { id: 'twin_shot', tier: 1 };
    build.barrel[1] = { id: 'ricochet', tier: 1 };
    build.barrel[2] = { id: 'twin_shot', tier: 1 };
    swapSlots(build, 1, 2);
    expect(build.barrel.slice(0, 3).map((s) => s?.id)).toEqual(['twin_shot', 'twin_shot', 'ricochet']);
  });

  it('a Mutation is offered (Favor of the Gods) only when two maxed elements sit side by side', () => {
    const max = data.config.slots.maxElementTier;
    const t = target();
    t.build.barrel[0] = { id: 'ember_shot', tier: max };
    t.build.barrel[1] = { id: 'thunder_spark', tier: max - 1 };
    const has = () => candidateCards(data, t.build).some(([c]) => c.type === 'mutation');
    expect(has()).toBe(false);
    t.build.barrel[1]!.tier = max;
    expect(has()).toBe(true);
    const card: Card = { type: 'mutation' };
    expect(pathOf(data, card)).toBe('gods');
    expect(isCardValid(data, t.build, card)).toBe(true);
    applyCard(data, null, t, card, 1);
    expect(t.build.barrel.slice(0, 2)).toEqual([null, { id: 'plasma', tier: max }]);
    expect(isCardValid(data, t.build, card)).toBe(false);
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

  it('adds its tiers to modules in the barrel and can hit the same one twice', () => {
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
    swapSlots(t.build, 0, 3);
    applyCard(data, null, t, card);
    expect(t.build.barrel[3]).toEqual({ id: 'ricochet', tier: 2 });
  });
});

describe('level-up paths', () => {
  const pathTypes = (id: string) => data.cards.paths.find((p) => p.id === id)!.types as readonly string[];

  it('Favor of the Gods offers elements, Mutations and blessings; Gunsmith offers the rest', () => {
    expect([...pathTypes('gods')].sort()).toEqual(['element', 'mutation', 'runStat']);
    expect(pathTypes('gunsmith')).toEqual(
      expect.arrayContaining(['grey', 'fitting', 'muzzle', 'supportPerk', 'coreTier', 'tinker']),
    );
  });

  it('a hand drawn from a path only has that path’s cards (over many seeds)', () => {
    for (const path of data.cards.paths) {
      for (let seed = 1; seed <= 100; seed++) {
        const t = target();
        t.build.barrel[0] = { id: 'twin_shot', tier: 1 }; // so Tinker can show up
        const hand = drawCards(data, t.build, 5, new RNG(seed), t.support, 3, path.id);
        expect(hand).toHaveLength(3);
        for (const c of hand) expect(pathOf(data, c), `${path.id} seed ${seed}`).toBe(path.id);
      }
    }
  });

  it('every card type maps to a path', () => {
    const t = target();
    t.build.barrel[0] = { id: 'twin_shot', tier: 1 };
    const all = drawCards(data, t.build, 5, new RNG(1), t.support, 999);
    const types = new Set(all.map(cardType));
    for (const type of types) expect(data.cards.paths.some((p) => p.types.includes(type))).toBe(true);
  });
});

describe('Tinker never promises more than a cap allows', () => {
  it('a module one tier below its max is picked at most once', () => {
    const max = data.config.slots.maxElementTier;
    for (let seed = 1; seed <= 100; seed++) {
      const t = target();
      t.build.barrel[0] = { id: 'ember_shot', tier: max - 1 }; // the only module that can still upgrade
      t.build.barrel[1] = { id: 'venom_shot', tier: max };
      const card = rollTinker(data, t.build, new RNG(seed))!;
      if (card.type !== 'randomUpgrade') throw new Error('expected Tinker');
      expect(card.upgrades).toEqual([{ slot: 0, modId: 'ember_shot' }]);
      expect(isCardValid(data, t.build, card)).toBe(true);
      const twice: Card = { type: 'randomUpgrade', upgrades: [card.upgrades[0]!, card.upgrades[0]!] };
      expect(isCardValid(data, t.build, twice)).toBe(false);
    }
  });
});
