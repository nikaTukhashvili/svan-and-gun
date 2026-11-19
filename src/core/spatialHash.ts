/**
 * Uniform grid over a finite world, storing small integer ids (pool indices).
 * Rebuilt once per frame: clear() then insert() every live object. No allocation after
 * construction: cells are linked lists in typed arrays (TDD: Performance, 2-unit cells).
 */
export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  private readonly head: Int32Array;
  private readonly next: Int32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    capacity: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(capacity).fill(-1);
  }

  clear(): void {
    this.head.fill(-1);
  }

  private col(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private row(y: number): number {
    const r = Math.floor(y / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  insert(id: number, x: number, y: number): void {
    const cell = this.row(y) * this.cols + this.col(x);
    this.next[id] = this.head[cell]!;
    this.head[cell] = id;
  }

  /** Append the ids in every cell overlapping the box to `out` (cleared first). Returns `out`. */
  query(minX: number, minY: number, maxX: number, maxY: number, out: number[]): number[] {
    out.length = 0;
    const c0 = this.col(minX);
    const c1 = this.col(maxX);
    const r0 = this.row(minY);
    const r1 = this.row(maxY);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let id = this.head[r * this.cols + c]!; id !== -1; id = this.next[id]!) out.push(id);
      }
    }
    return out;
  }
}
