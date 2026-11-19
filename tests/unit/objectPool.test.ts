import { describe, expect, it, vi } from 'vitest';
import { ObjectPool } from '../../src/core/objectPool';

const makePool = (maxSize = 3) => {
  let created = 0;
  const onRelease = vi.fn((item: { id: number; used: boolean }) => {
    item.used = false;
  });
  const pool = new ObjectPool({
    create: () => ({ id: created++, used: false }),
    onAcquire: (item) => {
      item.used = true;
    },
    onRelease,
    maxSize,
  });
  return { pool, onRelease, createdCount: () => created };
};

describe('ObjectPool', () => {
  it('prewarm creates objects up front, capped at maxSize', () => {
    const { pool, createdCount } = makePool(3);
    pool.prewarm(10);
    expect(createdCount()).toBe(3);
    expect(pool.freeCount).toBe(3);
  });

  it('recycles released objects instead of creating new ones', () => {
    const { pool, createdCount } = makePool(3);
    const a = pool.acquire()!;
    pool.release(a);
    const b = pool.acquire()!;
    expect(b).toBe(a);
    expect(createdCount()).toBe(1);
  });

  it('returns null when every object is in use', () => {
    const { pool } = makePool(2);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    expect(pool.activeCount).toBe(2);
  });

  it('runs onAcquire and onRelease hooks', () => {
    const { pool, onRelease } = makePool();
    const item = pool.acquire()!;
    expect(item.used).toBe(true);
    pool.release(item);
    expect(item.used).toBe(false);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('ignores a double release', () => {
    const { pool, onRelease } = makePool();
    const item = pool.acquire()!;
    pool.release(item);
    pool.release(item);
    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(pool.freeCount).toBe(1);
  });

  it('allows releasing during forEachActive', () => {
    const { pool } = makePool(3);
    pool.acquire();
    pool.acquire();
    pool.forEachActive((item) => pool.release(item));
    expect(pool.activeCount).toBe(0);
  });
});
