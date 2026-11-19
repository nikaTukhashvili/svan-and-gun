/**
 * The map's static obstacles in world pixels, for bullet hit tests and spawn checks.
 * Movement collision is done by Arcade static bodies; this is the pure mirror used by systems.
 */
import { u } from '../core/math';
import { segmentCircle, segmentRect } from '../core/geometry';
import type { MapDef } from '../data/types';

export type ObstacleShape =
  | { shape: 'circle'; x: number; y: number; r: number }
  | { shape: 'rect'; left: number; top: number; right: number; bottom: number };

export interface PushResult {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export class ObstacleField {
  readonly shapes: ObstacleShape[] = [];

  /** Width and height of the world in pixels. */
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  static fromMap(map: MapDef): ObstacleField {
    const field = new ObstacleField(u(map.width), u(map.height));
    for (const o of map.obstacles) {
      if (o.shape === 'circle') field.addCircle(u(o.x), u(o.y), u(o.r));
      else field.addRect(u(o.x), u(o.y), u(o.w), u(o.h));
    }
    return field;
  }

  addCircle(x: number, y: number, r: number): ObstacleShape {
    const s: ObstacleShape = { shape: 'circle', x, y, r };
    this.shapes.push(s);
    return s;
  }

  /** (x, y) is the centre. */
  addRect(x: number, y: number, w: number, h: number): ObstacleShape {
    const s: ObstacleShape = {
      shape: 'rect',
      left: x - w / 2,
      top: y - h / 2,
      right: x + w / 2,
      bottom: y + h / 2,
    };
    this.shapes.push(s);
    return s;
  }

  /** Remove a shape added earlier (boss rubble expires). */
  remove(shape: ObstacleShape): void {
    const i = this.shapes.indexOf(shape);
    if (i >= 0) this.shapes.splice(i, 1);
  }

  /**
   * Earliest t in [0, 1] where a circle of radius `pad` moving (x0,y0)->(x1,y1) touches an
   * obstacle, or null. Shapes are inflated by `pad` (rect corners are slightly generous).
   */
  firstHit(x0: number, y0: number, x1: number, y1: number, pad: number): number | null {
    let best: number | null = null;
    for (const s of this.shapes) {
      const t =
        s.shape === 'circle'
          ? segmentCircle(x0, y0, x1, y1, s.x, s.y, s.r + pad)
          : segmentRect(x0, y0, x1, y1, s.left - pad, s.top - pad, s.right + pad, s.bottom + pad);
      if (t !== null && (best === null || t < best)) {
        best = t;
        if (t === 0) break;
      }
    }
    return best;
  }

  /**
   * Push a circle out of every obstacle it overlaps and back inside the world, writing the
   * result to `out`. Moving into an obstacle then slides along its edge. Returns true if the
   * circle touched an obstacle, with the last contact normal in out.nx/out.ny.
   */
  pushOut(x: number, y: number, r: number, out: PushResult): boolean {
    let hit = false;
    out.nx = 0;
    out.ny = 0;
    for (const s of this.shapes) {
      if (s.shape === 'circle') {
        const dx = x - s.x;
        const dy = y - s.y;
        const min = s.r + r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const nx = d > 0 ? dx / d : 1;
        const ny = d > 0 ? dy / d : 0;
        x = s.x + nx * min;
        y = s.y + ny * min;
        out.nx = nx;
        out.ny = ny;
        hit = true;
      } else {
        const cx = x < s.left ? s.left : x > s.right ? s.right : x;
        const cy = y < s.top ? s.top : y > s.bottom ? s.bottom : y;
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 0) {
          const d = Math.sqrt(d2);
          out.nx = dx / d;
          out.ny = dy / d;
          x = cx + out.nx * r;
          y = cy + out.ny * r;
        } else {
          // Centre inside the rectangle: leave by the nearest side.
          const exits: [number, number, number][] = [
            [x - s.left, -1, 0],
            [s.right - x, 1, 0],
            [y - s.top, 0, -1],
            [s.bottom - y, 0, 1],
          ];
          let best = exits[0]!;
          for (const e of exits) if (e[0] < best[0]) best = e;
          out.nx = best[1];
          out.ny = best[2];
          if (best[1] !== 0) x = best[1] < 0 ? s.left - r : s.right + r;
          else y = best[2] < 0 ? s.top - r : s.bottom + r;
        }
        hit = true;
      }
    }
    out.x = x < r ? r : x > this.width - r ? this.width - r : x;
    out.y = y < r ? r : y > this.height - r ? this.height - r : y;
    return hit;
  }

  /** True if a circle of radius `pad` at (x, y) overlaps an obstacle or leaves the world. */
  blocked(x: number, y: number, pad: number): boolean {
    if (x - pad < 0 || y - pad < 0 || x + pad > this.width || y + pad > this.height) return true;
    return this.firstHit(x, y, x, y, pad) === 0;
  }
}
