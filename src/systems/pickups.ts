/**
 * Map pickups (T16, T24): scrap, silver, Kubdari, Hunting Horn, chests (value = chest kind, systems/items).
 * Inside the pickup radius they fly to the player, then are collected on touch.
 * Above `mergeThreshold` scrap pieces, new scrap merges into the nearest piece (TDD: Performance).
 */
import type { RNG } from '../core/rng';
import type { DropsDef } from '../data/types';
import { chestValue } from './items';

export type PickupKind = 'scrap' | 'silver' | 'kubdari' | 'horn' | 'chest';

export interface Pickup {
  readonly index: number;
  active: boolean;
  kind: PickupKind;
  value: number;
  x: number;
  y: number;
  magnet: boolean;
}

export interface Drop {
  kind: PickupKind;
  value: number;
}

export class PickupSystem {
  readonly pickups: readonly Pickup[];
  private readonly free: number[] = [];
  private active = 0;
  private scrapCount = 0;

  constructor(
    readonly capacity: number,
    private readonly mergeThreshold: number,
  ) {
    const list: Pickup[] = [];
    for (let i = 0; i < capacity; i++) {
      list.push({ index: i, active: false, kind: 'scrap', value: 0, x: 0, y: 0, magnet: false });
      this.free.push(capacity - 1 - i);
    }
    this.pickups = list;
  }

  get activeCount(): number {
    return this.active;
  }

  spawn(kind: PickupKind, value: number, x: number, y: number): Pickup | null {
    if (kind === 'scrap' && (this.scrapCount >= this.mergeThreshold || this.free.length === 0)) {
      const target = this.nearestScrap(x, y);
      if (target) {
        target.value += value;
        return target;
      }
    }
    const i = this.free.pop();
    if (i === undefined) return null;
    const p = this.pickups[i]!;
    p.active = true;
    p.kind = kind;
    p.value = value;
    p.x = x;
    p.y = y;
    p.magnet = false;
    this.active++;
    if (kind === 'scrap') this.scrapCount++;
    return p;
  }

  release(p: Pickup): void {
    if (!p.active) return;
    p.active = false;
    this.free.push(p.index);
    this.active--;
    if (p.kind === 'scrap') this.scrapCount--;
  }

  /** Hunting Horn: every scrap piece on the map flies to the player. */
  magnetAllScrap(): void {
    for (const p of this.pickups) if (p.active && p.kind === 'scrap') p.magnet = true;
  }

  update(
    dt: number,
    px: number,
    py: number,
    pickupRadius: number,
    playerRadius: number,
    magnetSpeed: number,
    onCollect: (p: Pickup) => void,
  ): void {
    const r2 = pickupRadius * pickupRadius;
    for (const p of this.pickups) {
      if (!p.active) continue;
      const dx = px - p.x;
      const dy = py - p.y;
      const d2 = dx * dx + dy * dy;
      if (!p.magnet && d2 <= r2) p.magnet = true;
      if (p.magnet) {
        const d = Math.sqrt(d2) || 1;
        const step = Math.min(d, magnetSpeed * dt);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
      if ((px - p.x) ** 2 + (py - p.y) ** 2 <= (playerRadius + 6) ** 2) {
        onCollect(p);
        this.release(p);
      }
    }
  }

  private nearestScrap(x: number, y: number): Pickup | null {
    let best: Pickup | null = null;
    let bestD = Infinity;
    for (const p of this.pickups) {
      if (!p.active || p.kind !== 'scrap') continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
}

/** What an enemy drops when killed (GDD: Drops on the map). */
export function rollEnemyDrops(drops: DropsDef, rng: RNG, enemyId: string, elite: boolean): Drop[] {
  const out: Drop[] = [];
  const scrap = (drops.scrapByEnemy[enemyId] ?? 1) * (elite ? drops.eliteScrapMult : 1);
  out.push({ kind: 'scrap', value: scrap });
  if (elite) {
    out.push({ kind: 'chest', value: chestValue('elite') });
    if (drops.silver.elite > 0) out.push({ kind: 'silver', value: drops.silver.elite });
  } else if (rng.chance(drops.silver.killChance)) {
    out.push({ kind: 'silver', value: drops.silver.perPickup });
  }
  if (rng.chance(drops.kubdari.killChance)) out.push({ kind: 'kubdari', value: drops.kubdari.heal });
  if (rng.chance(drops.huntingHorn.killChance)) out.push({ kind: 'horn', value: 1 });
  return out;
}

/** What a broken crate gives. */
export function rollCrateDrop(drops: DropsDef, rng: RNG): Drop {
  const kind = rng.weightedKey(drops.crate.contents);
  if (kind === 'kubdari') return { kind, value: drops.kubdari.heal };
  if (kind === 'silver') return { kind, value: drops.silver.perPickup * 3 };
  return { kind: 'scrap', value: drops.crate.scrapValue };
}

/** Piece size for drawing a scrap pickup of this value. */
export function scrapSize(drops: DropsDef, value: number): 'small' | 'medium' | 'large' {
  if (value >= drops.scrapPieces.large) return 'large';
  if (value >= drops.scrapPieces.medium) return 'medium';
  return 'small';
}
