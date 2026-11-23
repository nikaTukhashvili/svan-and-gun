/**
 * Gear (GDD: Gear): item levels and rarity, extra stats, stat bonuses, element themes, chest
 * offers, salvage, supply chests and the legendary passives.
 */
import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';
import { createBuild } from '../../src/systems/build';
import {
  applyChoice,
  chestKindOf,
  chestOffer,
  chestValue,
  createEquipment,
  createItem,
  extrasAtLevel,
  itemBonuses,
  mainStat,
  rarityOf,
  salvageScrap,
  SupplyChestTimer,
  targetSlot,
  type Equipment,
  type Item,
} from '../../src/systems/items';
import { buildPipeline } from '../../src/systems/modPipeline';
import { activePassives, fireTierBonus, PassiveRuntime } from '../../src/systems/passives';
import { baseStats, computeStats, emptyBonuses } from '../../src/systems/stats';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const items = data.items;
const theme = (id: string) => items.themes.find((t) => t.id === id)!;
const pos = (kind: string) => items.equipment.indexOf(kind as never);
const ringPositions = items.equipment.flatMap((k, i) => (k === 'ring' ? [i] : []));
const [MAGIC_AT, RARE_AT] = items.extraStatLevels as [number, number];

describe('items: levels, rarity and extra stats', () => {
  it('rarity follows the level: Common, then Magic, then Rare; legendaries are Legendary', () => {
    const rng = new RNG(1);
    expect(rarityOf(data, createItem(data, 'quick_ring', 1, rng))).toBe('common');
    expect(rarityOf(data, createItem(data, 'quick_ring', MAGIC_AT, rng))).toBe('magic');
    expect(rarityOf(data, createItem(data, 'quick_ring', RARE_AT, rng))).toBe('rare');
    expect(rarityOf(data, createItem(data, items.legendaries[0]!.id, 1, rng))).toBe('legendary');
  });

  it('a found Magic or Rare item comes with its extra stats, never the main stat, never twice', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new RNG(seed);
      for (const t of items.themes) {
        const item = createItem(data, t.id, RARE_AT + 2, rng);
        expect(item.extras).toHaveLength(extrasAtLevel(data, item.level));
        const keys = item.extras.map((e) => `${e.stat}:${e.mode}`);
        expect(new Set(keys).size).toBe(keys.length);
        if (t.effect.kind === 'stat') expect(keys).not.toContain(`${t.effect.stat}:${t.effect.mode}`);
      }
    }
  });

  it('numbers grow with the level: base + perLevel × (level − 1)', () => {
    const t = theme('boots_of_speed');
    const item: Item = { id: t.id, level: 4, extras: [] };
    expect(mainStat(data, item).value).toBeCloseTo(t.base + t.perLevel * 3);
  });

  it('legendaries roll no extra stats, and chests offer them at level 1', () => {
    expect(createItem(data, items.legendaries[0]!.id, 5, new RNG(1)).extras).toEqual([]);
    const legendaryIds = items.legendaries.map((l) => l.id);
    let seen = 0;
    for (let seed = 1; seed <= 300; seed++)
      for (const c of chestOffer(data, createEquipment(data), 'elite', new RNG(seed)))
        if (c.kind === 'new' && legendaryIds.includes(c.item.id)) {
          expect(c.item.level).toBe(1);
          seen++;
        }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('items: what they give', () => {
  it('stat items raise the player stats; element themes raise their element modules', () => {
    const eq = createEquipment(data);
    eq[pos('boots')] = { id: 'boots_of_speed', level: 1, extras: [] };
    eq[pos('chokha')] = { id: 'ember_chokha', level: 1, extras: [] };
    eq[ringPositions[0]!] = { id: 'ring_of_fury', level: 1, extras: [{ stat: 'maxHp', mode: 'add' }] };
    const b = itemBonuses(data, eq);
    expect(b.stats.mult.moveSpeed).toBeCloseTo(theme('boots_of_speed').base);
    expect(b.stats.mult.damage).toBeCloseTo(theme('ring_of_fury').base);
    expect(b.stats.add.maxHp).toBeCloseTo(items.extraStats.find((e) => e.stat === 'maxHp')!.base);
    expect(b.elements.fire).toBeCloseTo(theme('ember_chokha').base);

    const base = baseStats(data.config, data.cards);
    const stats = computeStats(base, emptyBonuses(), b.stats);
    expect(stats.moveSpeed).toBeCloseTo(base.moveSpeed * (1 + theme('boots_of_speed').base));
  });

  it('an element theme makes that element and its hybrids stronger, nothing else', () => {
    const build = createBuild(8);
    build.barrel[0] = { id: 'ember_shot', tier: 1 };
    build.barrel[2] = { id: 'plasma', tier: 3 };
    build.barrel[4] = { id: 'thunder_spark', tier: 1 };
    build.barrel[6] = { id: 'twin_shot', tier: 1 };
    const k = (boost: number) =>
      buildPipeline(data, build, null, {}, { elements: { fire: boost } }).barrel.map((m) => m.k);
    expect(k(0.5)).toEqual([1.5, 1.5, 1, 1]);
    expect(k(0)).toEqual([1, 1, 1, 1]);
  });

  it('Ring of the Ember Smith: fire modules count as tiers higher', () => {
    const build = createBuild(8);
    build.barrel[0] = { id: 'ember_shot', tier: 2 };
    build.barrel[2] = { id: 'frost_shot', tier: 2 };
    const eq = createEquipment(data);
    eq[ringPositions[0]!] = { id: 'ring_of_the_ember_smith', level: 1, extras: [] };
    const tiers = fireTierBonus(activePassives(data, eq));
    expect(tiers).toBe(1);
    const p = buildPipeline(data, build, null, {}, { fireTiers: tiers });
    expect(p.barrel.map((m) => m.tier)).toEqual([3, 2]);
  });
});

describe('chests', () => {
  const offer = (eq: Equipment, seed: number, kind: 'supply' | 'elite' = 'supply') =>
    chestOffer(data, eq, kind, new RNG(seed));

  it('chest pickups carry their kind', () => {
    expect(chestKindOf(chestValue('elite'))).toBe('elite');
    expect(chestKindOf(chestValue('supply'))).toBe('supply');
  });

  it('the first chest offers 3 new items, at least one for an empty slot', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const choices = offer(createEquipment(data), seed);
      expect(choices).toHaveLength(items.chests.choices);
      expect(choices.every((c) => c.kind === 'new')).toBe(true);
    }
  });

  it('while a slot is empty, at least one choice is a new item for an empty slot', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new RNG(seed);
      const eq = createEquipment(data);
      // Fill all but one slot.
      const leave = rng.int(0, eq.length - 1);
      eq.forEach((_, i) => {
        if (i === leave) return;
        const t = items.themes.find((x) => x.slot === items.equipment[i])!;
        eq[i] = createItem(data, t.id, 1, rng);
      });
      const choices = offer(eq, seed);
      expect(choices.some((c) => c.kind === 'new' && c.slot === leave)).toBe(true);
    }
  });

  it('never offers the same item twice, a theme already worn, or a slot that does not fit', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new RNG(seed * 7);
      const eq = createEquipment(data);
      for (let n = 0; n < 6; n++)
        for (const c of chestOffer(data, eq, 'elite', rng).slice(0, 1)) applyChoice(eq, c);
      const worn = eq.flatMap((it) => (it ? [it.id] : []));
      const choices = offer(eq, seed, 'elite');
      const newIds = choices.flatMap((c) => (c.kind === 'new' ? [c.item.id] : []));
      expect(new Set(newIds).size).toBe(newIds.length);
      for (const id of newIds) expect(worn).not.toContain(id);
      const ups = choices.flatMap((c) => (c.kind === 'upgrade' ? [c.slot] : []));
      expect(new Set(ups).size).toBe(ups.length);
      for (const c of choices) {
        if (c.kind === 'new') {
          const kind =
            items.themes.find((t) => t.id === c.item.id)?.slot ??
            items.legendaries.find((l) => l.id === c.item.id)!.slot;
          expect(items.equipment[c.slot]).toBe(kind);
        } else expect(eq[c.slot]).not.toBeNull();
      }
    }
  });

  it('with every slot full, a chest still offers upgrades', () => {
    let upgrades = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const rng = new RNG(seed);
      const eq = createEquipment(data);
      eq.forEach((_, i) => {
        const t = items.themes.find((x) => x.slot === items.equipment[i])!;
        eq[i] = createItem(data, t.id, 1, rng);
      });
      upgrades += offer(eq, seed).filter((c) => c.kind === 'upgrade').length;
    }
    expect(upgrades).toBeGreaterThan(100); // about half of 300 choices
  });

  it('elite chests give at least Magic items', () => {
    for (let seed = 1; seed <= 100; seed++)
      for (const c of offer(createEquipment(data), seed, 'elite'))
        if (c.kind === 'new' && rarityOf(data, c.item) !== 'legendary')
          expect(c.item.level).toBeGreaterThanOrEqual(MAGIC_AT);
  });

  it('an upgrade adds a level, and the extra stat for reaching Magic', () => {
    const eq = createEquipment(data);
    const slot = pos('boots');
    eq[slot] = { id: 'boots_of_speed', level: MAGIC_AT - 1, extras: [] };
    applyChoice(eq, { kind: 'upgrade', slot, extra: { stat: 'damage', mode: 'mult' } });
    expect(eq[slot]).toEqual({
      id: 'boots_of_speed',
      level: MAGIC_AT,
      extras: [{ stat: 'damage', mode: 'mult' }],
    });
    expect(rarityOf(data, eq[slot]!)).toBe('magic');
  });

  it('a new item replaces the one in its slot, which is returned for salvage', () => {
    const eq = createEquipment(data);
    const slot = pos('boots');
    const old: Item = { id: 'boots_of_speed', level: 3, extras: [] };
    eq[slot] = old;
    const replaced = applyChoice(eq, {
      kind: 'new',
      slot,
      item: { id: 'boots_of_pursuit', level: 1, extras: [] },
    });
    expect(replaced).toBe(old);
    expect(eq[slot]!.id).toBe('boots_of_pursuit');
    expect(salvageScrap(data, old)).toBe(
      Math.round(items.salvageScrap.base + items.salvageScrap.perLevel * 2),
    );
  });

  it('a second ring goes into the empty ring slot, then replaces the weaker ring', () => {
    const eq = createEquipment(data);
    const [a, b] = ringPositions as [number, number];
    expect(targetSlot(data, eq, 'ring')).toBe(a);
    eq[a] = { id: 'quick_ring', level: 4, extras: [] };
    expect(targetSlot(data, eq, 'ring')).toBe(b);
    eq[b] = { id: 'far_ring', level: 2, extras: [] };
    expect(targetSlot(data, eq, 'ring')).toBe(b);
  });
});

describe('supply chests', () => {
  it('one at firstSec, then every intervalSec, none after untilSec', () => {
    const cfg = items.supplyChest;
    const t = new SupplyChestTimer(cfg);
    expect(t.update(cfg.firstSec - 0.1)).toBe(0);
    expect(t.update(cfg.firstSec)).toBe(1);
    expect(t.update(cfg.firstSec + cfg.intervalSec - 0.1)).toBe(0);
    expect(t.update(cfg.firstSec + cfg.intervalSec)).toBe(1);
    const total = 2 + t.update(cfg.untilSec + 1000);
    expect(total).toBe(Math.ceil((cfg.untilSec - cfg.firstSec) / cfg.intervalSec));
    // GDD: aim for 8–10 chests in a full run, with the two elites.
    expect(total + 2).toBeGreaterThanOrEqual(8);
    expect(total + 2).toBeLessThanOrEqual(10);
  });
});

describe('legendary passives', () => {
  const wearing = (id: string, level = 1) => {
    const eq = createEquipment(data);
    const l = items.legendaries.find((x) => x.id === id)!;
    eq[pos(l.slot)] = { id, level, extras: [] };
    const defs = activePassives(data, eq);
    return { defs, rt: new PassiveRuntime(() => defs) };
  };

  it('Tower Keeper: standing still gives bonus damage until the Svan moves', () => {
    const { defs, rt } = wearing('hat_of_the_tower_keeper');
    const still = defs.towerKeeper!.stillSec!;
    expect(rt.update(still / 2, false)).toBe(false);
    expect(rt.update(still / 2 + 0.01, false)).toBe(true);
    expect(rt.bonuses().mult.damage).toBeCloseTo(defs.towerKeeper!.damagePct! / 100);
    expect(rt.update(0.01, true)).toBe(true);
    expect(rt.bonuses().mult.damage).toBeUndefined();
  });

  it('Wolf-pelt Cloak: a kill gives a short burst of speed', () => {
    const { defs, rt } = wearing('wolf_pelt_cloak');
    expect(rt.onKill()).toBe(true);
    expect(rt.bonuses().mult.moveSpeed).toBeCloseTo(defs.wolfPelt!.speedPct! / 100);
    expect(rt.update(defs.wolfPelt!.durationSec! + 0.01, true)).toBe(true);
    expect(rt.bonuses().mult.moveSpeed).toBeUndefined();
  });

  it('Mountain Runner: moving charges the gun; the next shot spends it', () => {
    const { defs, rt } = wearing('boots_of_the_mountain_runner');
    rt.update(defs.mountainRunner!.chargeSec! / 2, true);
    rt.update(5, false); // standing still keeps the charge but does not add to it
    expect(rt.consumeCharge()).toBe(false);
    rt.update(defs.mountainRunner!.chargeSec!, true);
    expect(rt.chargeFraction).toBe(1);
    expect(rt.consumeCharge()).toBe(true);
    expect(rt.consumeCharge()).toBe(false);
  });

  it('Chokha of the Feast heals on scrap pickups; levels make passives stronger', () => {
    const lv1 = wearing('chokha_of_the_feast', 1);
    const lv3 = wearing('chokha_of_the_feast', 3);
    expect(lv1.rt.scrapHeal()).toBe(lv1.defs.feast!.heal);
    expect(lv3.rt.scrapHeal()).toBeGreaterThan(lv1.rt.scrapHeal());
  });

  it('without legendaries, passives do nothing', () => {
    const rt = new PassiveRuntime(() => ({}));
    expect(rt.update(10, false)).toBe(false);
    expect(rt.onKill()).toBe(false);
    expect(rt.consumeCharge()).toBe(false);
    expect(rt.scrapHeal()).toBe(0);
    expect(rt.bonuses()).toEqual(emptyBonuses());
  });
});
