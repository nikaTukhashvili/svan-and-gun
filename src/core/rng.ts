/**
 * Seeded random number generator (mulberry32). All gameplay randomness goes through this,
 * so a run can be replayed from its seed (bug reports, tests). Math.random() is only for
 * cosmetic effects.
 */
export class RNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A seed from wall time, for starting a new run. Store it in RunState. */
  static randomSeed(): number {
    // Allowed here only: the seed itself is saved in RunState, so the run stays replayable.
    // eslint-disable-next-line no-restricted-properties
    return (Math.random() * 0x100000000) >>> 0;
  }

  /** Current internal state; pass to setState() to resume the same sequence. */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('RNG.pick: empty array');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /**
   * Weighted pick. Entries with weight <= 0 are never chosen.
   * Throws if no entry has a positive weight.
   */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of entries) if (w > 0) total += w;
    if (total <= 0) throw new Error('RNG.weighted: no positive weights');
    let roll = this.next() * total;
    for (const [item, w] of entries) {
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return item;
    }
    // Floating-point edge: return the last positive entry.
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i]!;
      if (e[1] > 0) return e[0];
    }
    throw new Error('unreachable');
  }

  /** Weighted pick from a { key: weight } record. */
  weightedKey<K extends string>(weights: Readonly<Record<K, number>>): K {
    return this.weighted(Object.entries(weights) as [K, number][]);
  }

  /** Fisher-Yates shuffle in place; returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  }
}
