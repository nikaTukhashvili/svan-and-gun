/**
 * Scrap and levelling (T16). Scrap needed to go from level L to L+1 is
 * xp.base + xp.step * (L - 1): 5, 15, 25, ... (GDD: In-run progression).
 * Several level-ups from one big pickup are queued and shown one after another.
 */
import type { EventBus } from '../core/eventBus';
import type { GameEvents } from '../core/events';
import type { GameConfig } from '../data/types';

export function scrapToNext(xp: GameConfig['xp'], level: number): number {
  return xp.base + xp.step * (level - 1);
}

/** Total scrap needed to reach `level` from level 1. */
export function totalScrapFor(xp: GameConfig['xp'], level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += scrapToNext(xp, l);
  return total;
}

export class Progression {
  level = 1;
  /** Scrap collected towards the next level. */
  scrap = 0;
  /** Level-ups earned but not yet chosen. */
  pending = 0;

  constructor(
    private readonly xp: GameConfig['xp'],
    private readonly bus: EventBus<GameEvents>,
  ) {}

  get toNext(): number {
    return scrapToNext(this.xp, this.level);
  }

  /** Add scrap (already multiplied by scrap gain). Returns the number of levels gained. */
  add(amount: number): number {
    this.scrap += amount;
    let gained = 0;
    while (this.scrap >= this.toNext) {
      this.scrap -= this.toNext;
      this.level++;
      this.pending++;
      gained++;
      this.bus.emit('player:levelUp', { level: this.level });
    }
    this.bus.emit('player:scrap', { scrap: this.scrap, toNext: this.toNext });
    return gained;
  }

  /** One queued level-up was chosen. */
  consume(): void {
    if (this.pending > 0) this.pending--;
  }
}
