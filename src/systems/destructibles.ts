/**
 * Things on the map that bullets can break (T24): powder barrels explode, crates drop loot.
 * They stop bullets but do not block movement (small placeholder props).
 */
import { segmentCircle } from '../core/geometry';
import { u } from '../core/math';
import type { DropsDef, MapDef } from '../data/types';

export interface Destructible {
  readonly kind: 'powderBarrel' | 'crate';
  x: number;
  y: number;
  radius: number;
  hp: number;
  active: boolean;
}

export const DESTRUCTIBLE_RADIUS = { powderBarrel: 13, crate: 14 } as const;

export class Destructibles {
  readonly items: Destructible[] = [];

  static fromMap(map: MapDef, drops: DropsDef): Destructibles {
    const d = new Destructibles();
    for (const b of map.powderBarrels)
      d.items.push({
        kind: 'powderBarrel',
        x: u(b.x),
        y: u(b.y),
        radius: DESTRUCTIBLE_RADIUS.powderBarrel,
        hp: drops.powderBarrel.hp,
        active: true,
      });
    for (const c of map.crates)
      d.items.push({
        kind: 'crate',
        x: u(c.x),
        y: u(c.y),
        radius: DESTRUCTIBLE_RADIUS.crate,
        hp: drops.crate.hp,
        active: true,
      });
    return d;
  }

  /** Earliest item a bullet segment hits, with t in 0..1. */
  firstHit(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    pad: number,
  ): { item: Destructible; t: number } | null {
    let best: { item: Destructible; t: number } | null = null;
    for (const item of this.items) {
      if (!item.active) continue;
      const t = segmentCircle(x0, y0, x1, y1, item.x, item.y, item.radius + pad);
      if (t !== null && (best === null || t < best.t)) best = { item, t };
    }
    return best;
  }

  /** Damage an item. Returns true if this destroyed it. */
  damage(item: Destructible, amount: number): boolean {
    if (!item.active) return false;
    item.hp -= amount;
    if (item.hp > 0) return false;
    item.active = false;
    return true;
  }

  /** Active items within `radius` of a point (powder barrel chain reactions). */
  inRadius(x: number, y: number, radius: number): Destructible[] {
    return this.items.filter((i) => i.active && (i.x - x) ** 2 + (i.y - y) ** 2 <= (radius + i.radius) ** 2);
  }
}
