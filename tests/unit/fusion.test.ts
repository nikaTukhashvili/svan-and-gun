import { describe, expect, it } from 'vitest';
import { getById } from '../../src/data/registry';
import type { TieredModDef } from '../../src/data/types';
import { createBuild, type RunBuild } from '../../src/systems/build';
import {
  fuseResult,
  fusesWithOwned,
  modDef,
  place,
  previewPlace,
  swapAndFuse,
  tierParams,
} from '../../src/systems/fusion';
import { layoutOf } from '../../src/systems/modPipeline';
import { loadGameData } from '../helpers/loadData';

const data = loadGameData();
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

describe('fuseResult: tiers add, with no cap', () => {
  it('same module + same module adds tiers', () => {
    expect(fuseResult(data, m('ember_shot', 2), m('ember_shot', 1))).toEqual(m('ember_shot', 3));
    expect(fuseResult(data, m('twin_shot', 7), m('twin_shot', 5))).toEqual(m('twin_shot', 12));
  });

  it('two different elements make their hybrid, keeping every copy', () => {
    expect(fuseResult(data, m('ember_shot', 3), m('thunder_spark', 2))).toEqual(m('plasma', 5));
    expect(fuseResult(data, m('venom_shot'), m('ember_shot'))).toEqual(m('brimstone', 2));
    expect(fuseResult(data, m('thunder_spark'), m('venom_shot'))).toEqual(m('blight_arc', 2));
  });

  it('a hybrid grows from either parent or the same hybrid, but not the third element', () => {
    expect(fuseResult(data, m('plasma', 5), m('ember_shot'))).toEqual(m('plasma', 6));
    expect(fuseResult(data, m('thunder_spark'), m('plasma', 5))).toEqual(m('plasma', 6));
    expect(fuseResult(data, m('plasma', 2), m('plasma', 2))).toEqual(m('plasma', 4));
    expect(fuseResult(data, m('plasma'), m('venom_shot'))).toBeNull();
    expect(fuseResult(data, m('plasma'), m('brimstone'))).toBeNull();
  });

  it('grey modules only fuse with themselves; fittings never fuse', () => {
    expect(fuseResult(data, m('twin_shot'), m('ricochet'))).toBeNull();
    expect(fuseResult(data, m('twin_shot'), m('ember_shot'))).toBeNull();
    expect(fuseResult(data, m('booster_right'), m('booster_right'))).toBeNull();
    expect(fuseResult(data, m('ember_shot'), m('brace'))).toBeNull();
  });
});

describe('tierParams: base + perTier × (tier − 1)', () => {
  const def = (id: string) => modDef(data, id) as TieredModDef;

  it('tier 1 is the base; numbers keep growing past tier 3', () => {
    const d = def('ember_shot');
    expect(tierParams(d, 1)).toEqual(d.base);
    const t10 = tierParams(d, 10) as Record<string, number>;
    const base = d.base as Record<string, number>;
    const per = d.perTier as Record<string, number>;
    expect(t10.maxStacks).toBe(base.maxStacks! + per.maxStacks! * 9);
  });

  it('count params are whole numbers and never drop below tier 1', () => {
    for (const tier of [1, 2, 3, 4, 7]) {
      const p = tierParams(def('twin_shot'), tier) as Record<string, number>;
      expect(Number.isInteger(p.bullets)).toBe(true);
      expect(p.bullets).toBeGreaterThanOrEqual(2);
    }
    expect((tierParams(def('twin_shot'), 3) as Record<string, number>).bullets).toBe(3);
  });
});

describe('place: put, fuse, cascade, replace', () => {
  it('into an empty slot with no match it is just placed', () => {
    const b = barrel(['ember_shot']);
    const ev = place(data, b, plain(b), 2, m('twin_shot'));
    expect(ev).toEqual([{ kind: 'place', at: 2, mod: m('twin_shot') }]);
    expect(show(b).slice(0, 3)).toEqual(['ember_shot:1', null, 'twin_shot:1']);
  });

  it('next to a match it fuses into the placed slot and frees the other', () => {
    const b = barrel(['ember_shot:2']);
    place(data, b, plain(b), 1, m('ember_shot'));
    expect(show(b).slice(0, 2)).toEqual([null, 'ember_shot:3']);
  });

  it('dropped onto a compatible module it fuses in place (no spare slot needed)', () => {
    const b = barrel([
      'ember_shot:4',
      'twin_shot',
      'heavy_slug',
      'ricochet',
      'split_shot',
      'long_rifling',
      'piercing_bore',
      'brace',
    ]);
    place(data, b, plain(b), 0, m('ember_shot'));
    expect(b.barrel[0]).toEqual(m('ember_shot', 5));
  });

  it('cascades: Fire next to Fire next to Thunder becomes Plasma', () => {
    // [Fire 1][   ][Thunder 2]  + Fire into slot 1 → Fire 2 (fuses left first: same module)…
    const b = barrel(['ember_shot', null, 'thunder_spark:2']);
    const ev = place(data, b, plain(b), 1, m('ember_shot'));
    expect(show(b).slice(0, 3)).toEqual([null, 'plasma:4', null]);
    expect(ev.filter((e) => e.kind === 'fuse')).toHaveLength(2);
  });

  it('a same-module neighbour wins over a hybrid; otherwise left before right', () => {
    const b = barrel(['thunder_spark', null, 'ember_shot']);
    place(data, b, plain(b), 1, m('ember_shot'));
    // Fire + right Fire first (same module) → Fire 2, then Fire 2 + left Thunder → Plasma 3.
    expect(show(b).slice(0, 3)).toEqual([null, 'plasma:3', null]);

    const c = barrel(['venom_shot', null, 'thunder_spark']);
    place(data, c, plain(c), 1, m('ember_shot'));
    // No same-module neighbour: left (Venom) first → Brimstone 2; it cannot take Thunder.
    expect(show(c).slice(0, 3)).toEqual([null, 'brimstone:2', 'thunder_spark:1']);
  });

  it('dropped onto an incompatible module it replaces it', () => {
    const b = barrel(['twin_shot:3']);
    const ev = place(data, b, plain(b), 0, m('ricochet'));
    expect(ev[0]).toEqual({ kind: 'replace', at: 0, old: m('twin_shot', 3), by: m('ricochet') });
    expect(b.barrel[0]).toEqual(m('ricochet'));
  });

  it('fittings are placed and never fuse', () => {
    const b = barrel(['booster_right']);
    place(data, b, plain(b), 1, m('booster_right'));
    expect(show(b).slice(0, 2)).toEqual(['booster_right:1', 'booster_right:1']);
  });

  it('nothing fuses across the Double Barrel gap', () => {
    const gun = getById(data.guns, 'double_barrel', 'gun');
    const b = createBuild(gun.barrel.slots);
    const half = gun.barrel.slots / gun.barrel.chains;
    b.barrel[half - 1] = m('ember_shot');
    place(data, b, layoutOf(gun, b.barrel.length), half, m('ember_shot'));
    expect(b.barrel[half - 1]).toEqual(m('ember_shot'));
    expect(b.barrel[half]).toEqual(m('ember_shot'));
  });

  it('previewPlace shows the same result without changing the build', () => {
    const b = barrel(['ember_shot', null, 'thunder_spark']);
    const before = JSON.stringify(b);
    const pv = previewPlace(data, b, plain(b), 1, m('ember_shot'));
    expect(JSON.stringify(b)).toBe(before);
    expect(show(pv.build).slice(0, 3)).toEqual([null, 'plasma:3', null]);
  });
});

describe('swapAndFuse and helpers', () => {
  it('swapping two matches together fuses them', () => {
    const b = barrel(['ember_shot', 'twin_shot', 'ember_shot:2']);
    swapAndFuse(data, b, plain(b), 1, 2); // Fire 2 moves next to Fire 1 and absorbs it
    expect(show(b).slice(0, 3)).toEqual([null, 'ember_shot:3', 'twin_shot:1']);
  });

  it('fusesWithOwned: a card that would fuse with something in the barrel', () => {
    const b = barrel(['plasma:3', 'twin_shot']);
    expect(fusesWithOwned(data, b, 'ember_shot')).toBe(true);
    expect(fusesWithOwned(data, b, 'twin_shot')).toBe(true);
    expect(fusesWithOwned(data, b, 'venom_shot')).toBe(false);
    expect(fusesWithOwned(data, b, 'brace')).toBe(false);
  });

  it('a 6-slot barrel can max every slot: feeding never needs a spare slot', () => {
    const b = barrel([], 6);
    const ids = ['ember_shot', 'twin_shot', 'heavy_slug', 'ricochet', 'split_shot', 'piercing_bore'];
    ids.forEach((id, i) => (b.barrel[i] = m(id)));
    for (let round = 0; round < 9; round++) ids.forEach((id, i) => place(data, b, plain(b), i, m(id)));
    for (const s of b.barrel) expect(s!.tier).toBe(10);
  });
});
