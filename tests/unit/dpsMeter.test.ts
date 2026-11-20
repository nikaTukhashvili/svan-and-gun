import { describe, expect, it } from 'vitest';
import { DpsMeter } from '../../src/systems/dpsMeter';

const meter = () => new DpsMeter({ windowSec: 2, idleResetSec: 3, minSessionSec: 1 });

describe('DpsMeter', () => {
  it('rolling DPS is the damage in the window divided by the window, and falls to 0 when you stop', () => {
    const m = meter();
    for (let t = 0; t < 4; t += 0.5) m.record(1, 10, t, false, false); // 20 per second
    expect(m.stats(1, 3.5).dps).toBeCloseTo(20);
    expect(m.stats(1, 6).dps).toBe(0);
  });

  it('session DPS, total, hits and peak stay readable after you stop shooting', () => {
    const m = meter();
    for (let t = 0; t <= 4; t += 0.5) m.record(1, 10, t, false, false);
    const s = m.stats(1, 10);
    expect(s.total).toBe(90);
    expect(s.hits).toBe(9);
    expect(s.sessionSec).toBeCloseTo(4); // to the last hit, not to now
    expect(s.sessionDps).toBeCloseTo(22.5);
    expect(s.peakDps).toBeCloseTo(20);
  });

  it('a hit after idleResetSec of quiet starts a new session', () => {
    const m = meter();
    m.record(1, 50, 0, false, false);
    m.record(1, 7, 10, false, false);
    const s = m.stats(1, 10);
    expect(s.total).toBe(7);
    expect(s.hits).toBe(1);
  });

  it('one early hit is divided by at least minSessionSec', () => {
    const m = meter();
    m.record(1, 100, 5, false, false);
    expect(m.stats(1, 5).sessionDps).toBe(100);
  });

  it('counts crits and status damage, and status ticks are not hits', () => {
    const m = meter();
    m.record(1, 10, 0, true, false);
    m.record(1, 4, 0.5, false, true);
    m.record(1, 4, 1, false, true);
    const s = m.stats(1, 1);
    expect(s.hits).toBe(1);
    expect(s.crits).toBe(1);
    expect(s.statusDamage).toBe(8);
    expect(s.total).toBe(18);
  });

  it('keeps targets apart, sums them in "all", and resets one or every target', () => {
    const m = meter();
    m.record(1, 10, 0, false, false);
    m.record(2, 30, 0, false, false);
    expect(m.stats(1, 0).total).toBe(10);
    expect(m.stats(2, 0).total).toBe(30);
    expect(m.stats('all', 0).total).toBe(40);
    m.reset(1);
    expect(m.stats(1, 0).total).toBe(0);
    expect(m.stats('all', 0).total).toBe(40);
    m.reset();
    expect(m.stats('all', 0).total).toBe(0);
    expect(m.stats(99, 0).dps).toBe(0);
  });
});
