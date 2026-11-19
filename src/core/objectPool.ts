/**
 * Generic object pool. Objects are created up front (prewarm) and recycled; nothing is
 * allocated with `new` during a run once the pool is warm (TDD: Performance).
 */
export interface PoolOptions<T> {
  create: () => T;
  /** Called when an object is handed out. */
  onAcquire?: (item: T) => void;
  /** Called when an object is returned; reset its state here. */
  onRelease?: (item: T) => void;
  /** Hard cap on total objects. acquire() returns null when every object is in use. */
  maxSize: number;
}

export class ObjectPool<T> {
  private readonly free: T[] = [];
  private readonly active = new Set<T>();
  private total = 0;

  constructor(private readonly opts: PoolOptions<T>) {}

  prewarm(count: number): void {
    const n = Math.min(count, this.opts.maxSize) - this.total;
    for (let i = 0; i < n; i++) {
      this.free.push(this.opts.create());
      this.total++;
    }
  }

  acquire(): T | null {
    let item = this.free.pop();
    if (item === undefined) {
      if (this.total >= this.opts.maxSize) return null;
      item = this.opts.create();
      this.total++;
    }
    this.active.add(item);
    this.opts.onAcquire?.(item);
    return item;
  }

  release(item: T): void {
    if (!this.active.delete(item)) return; // already free, or not ours
    this.opts.onRelease?.(item);
    this.free.push(item);
  }

  releaseAll(): void {
    for (const item of [...this.active]) this.release(item);
  }

  /** Iterate over objects currently in use. Safe to release during iteration. */
  forEachActive(fn: (item: T) => void): void {
    for (const item of [...this.active]) fn(item);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get freeCount(): number {
    return this.free.length;
  }

  get size(): number {
    return this.total;
  }
}
