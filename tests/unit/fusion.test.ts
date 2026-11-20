/**
 * Barrel rules (revised 2026-11-21): nothing merges by itself; a card dropped on the same module
 * upgrades it (elements cap at maxElementTier); a Mutation turns two maxed, different elements side
 * by side into their hybrid; hybrids are final; moving only moves or swaps.
 */
import { describe, expect, it } from 'vitest';
import { getById } from '../../src/data/registry';
import type { TieredModDef } from '../../src/data/types';
import { createBuild, type RunBuild } from '../../src/systems/build';
import {
  canMutate,
  hybridOf,
  maxTier,
  modDef,
  moveModule,
  mutate,
  mutationPairs,
  place,
  previewMutate,
  previewPlace,
  tierParams,
  upgradesOwned,
} from '../../src/systems/fusion';
import { layoutOf } from '../../src/systems/modPipeline';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
const MAX = data.config.slots.maxElementTier;
const m = (id: string, tier = 1) => ({ id, tier });

/** A plain 8-slot barrel (one chain, no twist) from "id:tier" specs. */
function barrel(specs: (string | null)[], slots = 8): RunBuild {
  const b = createBuild(slots);
  specs.forEach((spec, i) => {
    if (!spec) return;
    const [id, tier] = spec.split(':');
    b.barrel[i] = m(id!, tier ? Number(tier) : 1);
  });
  return b;
}
const plain = (b: RunBuild) => layoutOf(null, b.barrel.length);
const show = (b: RunBuild) => b.barrel.map((s) => (s ? `${s.id}:${s.tier}` : null));

describe('tierParams: base + perTier × (tier − 1)', () => {
  const def = (id: string) => modDef(data, id) as TieredModDef;

  it('tier 1 is the base; numbers grow per tier', () => {
    const d = def('ember_shot');
    expect(tierParams(d, 1)).toEqual(d.base);
    const t5 = tierParams(d, 5) as Record<string, number>;
    const base = d.base as Record<string, number>;
    const per = d.perTier as Record<string, number>;
    expect(t5.maxStacks).toBe(base.maxStacks! + per.maxStacks! * 4);
  });

  it('count params are whole numbers and never drop below tier 1', () => {
    for (const tier of [1, 2, 3, 4, 7]) {
      const p = tierParams(def('twin_shot'), tier) as Record<string, number>;
      expect(Number.isInteger(p.bullets)).toBe(true);
      expect(p.bullets).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('placing: nothing merges by itself', () => {
  it('two of the same element side by side stay separate', () => {
    const b = barrel(['ember_shot']);
    const ev = place(data, b, plain(b), 1, m('ember_shot'));
    expect(ev.map((e) => e.kind)).toEqual(['place']);
    expect(show(b).slice(0, 2)).toEqual(['ember_shot:1', 'ember_shot:1']);
  });

  it('two different elements side by side stay separate (no automatic hybrid)', () => {
    const b = barrel([`ember_shot:${MAX}`]);
    place(data, b, plain(b), 1, m('thunder_spark'));
    expect(show(b).slice(0, 2)).toEqual([`ember_shot:${MAX}`, 'thunder_spark:1']);
  });

  it('a card dropped ON the same module upgrades it one tier', () => {
    const b = barrel(['ember_shot:2', 'twin_shot:4']);
    expect(place(data, b, plain(b), 0, m('ember_shot'))[0]).toMatchObject({
      kind: 'upgrade',
      at: 0,
      before: m('ember_shot', 2),
      result: m('ember_shot', 3),
    });
    place(data, b, plain(b), 1, m('twin_shot'));
    expect(show(b).slice(0, 3)).toEqual(['ember_shot:3', 'twin_shot:5', null]);
  });

  it('elements stop at the max tier; grey modules have no cap; fittings never upgrade', () => {
    expect(maxTier(data, 'frost_shot')).toBe(MAX);
    expect(maxTier(data, 'twin_shot')).toBe(Infinity);
    expect(maxTier(data, 'brace')).toBe(1);
    const b = barrel([`ember_shot:${MAX}`, 'brace']);
    const ev = place(data, b, plain(b), 0, m('ember_shot')); // maxed: inserted as a new one
    expect(ev[0]!.kind).toBe('insert');
    expect(show(b).slice(0, 3)).toEqual(['ember_shot:1', `ember_shot:${MAX}`, 'brace:1']);
  });

  it('on a different module it is inserted and the others slide towards the nearest gap', () => {
    const b = barrel(['ember_shot', 'twin_shot']);
    const ev = place(data, b, plain(b), 1, m('ricochet'));
    expect(ev[0]).toMatchObject({ kind: 'insert', at: 1, gap: 2 });
    expect(show(b).slice(0, 4)).toEqual(['ember_shot:1', 'ricochet:1', 'twin_shot:1', null]);
  });

  it('never slides into or across locked slots; a full chain replaces', () => {
    const open4 = [true, true, true, true, false, false, false, false];
    const b = barrel([null, 'ember_shot', 'twin_shot', 'ricochet']);
    place(data, b, plain(b), 2, m('heavy_slug'), open4); // no open gap to the right
    expect(show(b).slice(0, 5)).toEqual(['ember_shot:1', 'twin_shot:1', 'heavy_slug:1', 'ricochet:1', null]);
    const full = barrel([
      'twin_shot',
      'heavy_slug',
      'ricochet',
      'split_shot',
      'long_rifling',
      'piercing_bore',
      'brace',
      'siphon',
    ]);
    const ev = place(data, full, plain(full), 1, m('ricochet'));
    expect(ev[0]).toMatchObject({ kind: 'replace', at: 1, old: m('heavy_slug'), by: m('ricochet') });
  });

  it('a slide stops at a locked slot even if an open gap lies beyond it (SMG crit chamber)', () => {
    const open = [true, true, true, false, false, false, true];
    const b = barrel(['ember_shot', 'twin_shot', 'ricochet', null, null, null, null], 7);
    const ev = place(data, b, plain(b), 1, m('heavy_slug'), open);
    expect(ev[0]!.kind).toBe('replace'); // the only gaps are behind a locked slot: no room, it replaces
    expect(show(b).slice(3, 6)).toEqual([null, null, null]); // nothing moved into the locked slots
  });

  it('previewPlace shows the result without changing the build', () => {
    const b = barrel(['ember_shot']);
    const before = JSON.stringify(b);
    const pv = previewPlace(data, b, plain(b), 0, m('ember_shot'));
    expect(JSON.stringify(b)).toBe(before);
    expect(show(pv.build)[0]).toBe('ember_shot:2');
  });

  it('upgradesOwned: a card that could upgrade a module in the barrel', () => {
    const b = barrel(['twin_shot', `ember_shot:${MAX}`]);
    expect(upgradesOwned(data, b, 'twin_shot')).toBe(true);
    expect(upgradesOwned(data, b, 'ember_shot')).toBe(false); // already maxed
    expect(upgradesOwned(data, b, 'venom_shot')).toBe(false);
  });
});

describe('Mutation: two maxed elements become their hybrid', () => {
  it('every pair of different elements has a hybrid; same elements and non-elements do not', () => {
    expect(hybridOf(data, 'ember_shot', 'thunder_spark')).toBe('plasma');
    expect(hybridOf(data, 'frost_shot', 'venom_shot')).toBe('frostbite');
    expect(hybridOf(data, 'ember_shot', 'ember_shot')).toBeNull();
    expect(hybridOf(data, 'ember_shot', 'twin_shot')).toBeNull();
  });

  it('both must be at the max tier', () => {
    expect(canMutate(data, m('ember_shot', MAX), m('thunder_spark', MAX))).toBe(true);
    expect(canMutate(data, m('ember_shot', MAX), m('thunder_spark', MAX - 1))).toBe(false);
    expect(canMutate(data, m('plasma', MAX), m('venom_shot', MAX))).toBe(false); // hybrids are final
  });

  it('dropped on one of the pair: the hybrid takes that slot, the other empties', () => {
    const b = barrel([`ember_shot:${MAX}`, `thunder_spark:${MAX}`, 'twin_shot']);
    const ev = mutate(data, b, plain(b), 0);
    expect(ev[0]).toMatchObject({ kind: 'mutate', at: 0, from: 1, result: m('plasma', MAX) });
    expect(show(b).slice(0, 3)).toEqual([`plasma:${MAX}`, null, 'twin_shot:1']);
  });

  it('with valid pairs on both sides it takes the preferred side', () => {
    const b = barrel([`venom_shot:${MAX}`, `ember_shot:${MAX}`, `frost_shot:${MAX}`]);
    expect(previewMutate(data, b, plain(b), 1, 'left')[0]).toMatchObject({ result: { id: 'brimstone' } });
    expect(previewMutate(data, b, plain(b), 1, 'right')[0]).toMatchObject({ result: { id: 'steam' } });
    expect(show(b)[1]).toBe(`ember_shot:${MAX}`); // previews change nothing
  });

  it('nothing to mutate: no events, nothing changes', () => {
    const b = barrel([`ember_shot:${MAX}`, `thunder_spark:${MAX - 1}`]);
    expect(mutate(data, b, plain(b), 0)).toEqual([]);
    expect(mutationPairs(data, b, plain(b))).toEqual([]);
  });

  it('never across the Double Barrel gap', () => {
    const gun = getById(data.guns, 'double_barrel', 'gun');
    const b = createBuild(gun.barrel.slots);
    const half = gun.barrel.slots / gun.barrel.chains;
    b.barrel[half - 1] = m('ember_shot', MAX);
    b.barrel[half] = m('thunder_spark', MAX);
    expect(mutationPairs(data, b, layoutOf(gun, b.barrel.length))).toEqual([]);
  });
});

describe('moving', () => {
  it('into an empty slot it moves; onto a module they swap; nothing merges', () => {
    const b = barrel(['ember_shot', 'twin_shot', 'ember_shot']);
    moveModule(b, 0, 5);
    expect(show(b)[5]).toBe('ember_shot:1');
    moveModule(b, 5, 1); // swap with Twin, now next to the other Ember
    expect(show(b).slice(0, 3)).toEqual([null, 'ember_shot:1', 'ember_shot:1']);
    expect(show(b)[5]).toBe('twin_shot:1');
  });
});
