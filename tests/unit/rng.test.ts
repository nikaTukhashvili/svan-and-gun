import { describe, expect, it } from 'vitest';
import { RNG } from '../../src/core/rng';

const sample = (rng: RNG, n: number) => Array.from({ length: n }, () => rng.next());

describe('RNG', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sample(new RNG(42), 20)).toEqual(sample(new RNG(42), 20));
  });

  it('produces different sequences for different seeds', () => {
    expect(sample(new RNG(1), 5)).not.toEqual(sample(new RNG(2), 5));
  });

  it('can save and restore its state to replay a sequence', () => {
    const rng = new RNG(7);
    sample(rng, 10);
    const state = rng.getState();
    const a = sample(rng, 10);
    rng.setState(state);
    expect(sample(rng, 10)).toEqual(a);
  });

  it('keeps next() in [0, 1) and int() inside its inclusive bounds', () => {
    const rng = new RNG(123);
    for (let i = 0; i < 10_000; i++) {
      const f = rng.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('weighted() follows the weights and never picks zero weights', () => {
    const rng = new RNG(99);
    const counts = { a: 0, b: 0, never: 0 };
    for (let i = 0; i < 20_000; i++) counts[rng.weightedKey({ a: 3, b: 1, never: 0 })]++;
    expect(counts.never).toBe(0);
    expect(counts.a / counts.b).toBeGreaterThan(2.7);
    expect(counts.a / counts.b).toBeLessThan(3.3);
  });

  it('weighted() throws when nothing has a positive weight', () => {
    expect(() => new RNG(1).weighted([['x', 0]])).toThrow();
  });

  it('shuffle() keeps every element', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(new RNG(5).shuffle([...arr]).sort()).toEqual(arr);
  });
});
