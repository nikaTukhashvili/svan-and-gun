/**
 * StatusEffectSystem (T21): Fire, Poison, Lightning, Frost (chill → freeze). Effects tick every statusTickSec (0.5 s),
 * not every frame. Elements never read each other; an enemy can carry all three at once.
 * Status damage ignores defence and counts as kills for scrap, score and Scavenger.
 */
import type { Enemy, EnemySystem } from './enemies';

export interface LightningArc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A burst (Brimstone, Steam) or a freeze: where it went off, for the effects layer. */
export interface Blast {
  x: number;
  y: number;
  radius: number;
  color: number;
  /** For the sound: an area burst, or an enemy freezing. */
  kind: 'burst' | 'freeze';
}

/** Chill numbers at the module's tier (Frost Shot and its hybrids). */
export interface ChillSpec {
  /** Slow per stack, 0..1. */
  slow: number;
  sec: number;
  stacks: number;
  freezeSec: number;
  /** Extra hit damage while frozen, 0.3 = +30%. */
  shatter: number;
}

const BRIMSTONE_COLOR = 0xc98a2e;
const FREEZE_COLOR = 0x9fd8ff;

export class StatusEffectSystem {
  private tickTimer = 0;
  private readonly scratch: Enemy[] = [];
  /** Bursts and freezes since the scene last drained this list. */
  readonly blasts: Blast[] = [];
  private readonly pendingBursts: {
    x: number;
    y: number;
    radius: number;
    damage: number;
    color: number;
    except?: Enemy;
  }[] = [];
  private draining = false;

  constructor(
    private readonly enemies: EnemySystem,
    private readonly tickSec: number,
    /** After a freeze, no new freeze for this long (config.combat.freezeImmunitySec). */
    private readonly freezeImmunitySec = 0,
  ) {
    enemies.onKill = (e) => {
      this.blast(e);
      this.spreadPoison(e);
    };
  }

  /**
   * +1 burn stack, timer refreshed. Burns from several modules MERGE: the highest damage per
   * stack and the highest stack cap win, so the order of modules in the barrel never matters.
   */
  applyBurn(e: Enemy, dps: number, durationSec: number, maxStacks: number): void {
    const burning = e.burnStacks > 0;
    e.burnMax = burning ? Math.max(e.burnMax, maxStacks) : maxStacks;
    e.burnDps = burning ? Math.max(e.burnDps, dps) : dps;
    e.burnStacks = Math.min(e.burnStacks + 1, e.burnMax);
    e.burnTime = burning ? Math.max(e.burnTime, durationSec) : durationSec;
  }

  /**
   * Poison does not stack. A new poison on a poisoned enemy MERGES: the timer refreshes and the
   * stronger numbers win (damage, duration, spreading, Frostbite's multiplier), so the order of
   * modules never matters. `frostbiteMult`: Frostbite's bonus while chilled; it ends with the poison.
   */
  applyPoison(
    e: Enemy,
    dps: number,
    durationSec: number,
    spreadTargets: number,
    spreadRadius: number,
    canSpread = true,
    frostbiteMult = 1,
  ): void {
    if (e.poisonTime > 0) {
      e.poisonTime = Math.max(e.poisonTime, durationSec);
      e.poisonDps = Math.max(e.poisonDps, dps);
      e.poisonDuration = Math.max(e.poisonDuration, durationSec);
      e.frostbiteMult = Math.max(e.frostbiteMult, frostbiteMult);
      if (canSpread && spreadTargets > (e.poisonCanSpread ? e.poisonSpreadTargets : 0)) {
        e.poisonCanSpread = true;
        e.poisonSpreadTargets = spreadTargets;
        e.poisonSpreadRadius = spreadRadius;
      }
      return;
    }
    e.frostbiteMult = frostbiteMult;
    e.poisonTime = durationSec;
    e.poisonDps = dps;
    e.poisonDuration = durationSec;
    e.poisonSpreadTargets = spreadTargets;
    e.poisonSpreadRadius = spreadRadius;
    e.poisonCanSpread = canSpread;
  }

  /**
   * Frost: +1 chill stack (timer refreshed). At full stacks the enemy freezes for `freezeSec` and
   * the stacks reset; then it cannot freeze again for freezeSec + freezeImmunitySec. The boss is
   * never frozen (only slowed). Returns true when this hit froze it.
   */
  applyChill(e: Enemy, c: ChillSpec): boolean {
    if (e.frozenTime > 0) return false;
    e.chillStacks = Math.min(e.chillStacks + 1, c.stacks);
    e.chillTime = c.sec;
    e.chillSlow = Math.max(e.chillSlow * (e.chillStacks > 1 ? 1 : 0), c.slow);
    if (e.chillStacks < c.stacks || c.freezeSec <= 0 || e.isBoss || e.freezeImmune > 0) return false;
    e.frozenTime = c.freezeSec;
    e.freezeImmune = c.freezeSec + this.freezeImmunitySec;
    e.shatter = c.shatter;
    e.chillStacks = 0;
    e.chillTime = 0;
    this.blasts.push({ x: e.x, y: e.y, radius: e.radius * 1.4, color: FREEZE_COLOR, kind: 'freeze' });
    return true;
  }

  /** Brimstone hit it: if it dies burning and poisoned, it bursts (the strongest Brimstone wins). */
  markBlast(e: Enemy, damage: number, radius: number): void {
    if (damage > e.blastDamage) {
      e.blastDamage = damage;
      e.blastRadius = radius;
    }
  }

  /**
   * Area burst around a point (ignores defence): Brimstone on death, Steam on freeze. Bursts that
   * set off more bursts (a chain of Brimstone deaths) are queued and run one after another, never
   * nested, so a long chain cannot overflow the stack.
   */
  burst(x: number, y: number, radius: number, damage: number, color: number, except?: Enemy): void {
    this.pendingBursts.push({ x, y, radius, damage, color, except });
    if (this.draining) return;
    this.draining = true;
    try {
      for (let b = this.pendingBursts.shift(); b; b = this.pendingBursts.shift()) {
        this.blasts.push({ x: b.x, y: b.y, radius: b.radius, color: b.color, kind: 'burst' });
        for (const e of this.enemies.inRadius(b.x, b.y, b.radius, [])) {
          if (e !== b.except) this.enemies.damage(e, b.damage, true, true);
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Thunder Spark: hit up to `chains` more enemies near `from` for `damage` each (defence
   * applies). Never hits the same enemy twice in one chain. Arcs are appended to `arcs`.
   */
  chainLightning(
    from: Enemy,
    chains: number,
    radius: number,
    damage: number,
    arcs: LightningArc[],
    /** Hybrids: called for each enemy the chain reaches, before its damage. */
    onReach?: (e: Enemy) => void,
  ): void {
    const hit = new Set<number>([from.uid]);
    let x = from.x;
    let y = from.y;
    for (let i = 0; i < chains; i++) {
      const [next] = this.enemies.nearest(x, y, radius, 1, (e) => hit.has(e.uid), this.scratch);
      if (!next) break;
      hit.add(next.uid);
      arcs.push({ x0: x, y0: y, x1: next.x, y1: next.y });
      x = next.x;
      y = next.y;
      onReach?.(next);
      this.enemies.damage(next, damage, false);
    }
  }

  update(dt: number): void {
    this.tickTimer += dt;
    while (this.tickTimer >= this.tickSec) {
      this.tickTimer -= this.tickSec;
      this.tick(this.tickSec);
    }
  }

  private tick(t: number): void {
    for (const e of this.enemies.enemies) {
      if (!e.active) continue;
      let damage = 0;
      if (e.burnStacks > 0) {
        damage += e.burnStacks * e.burnDps * t;
        e.burnTime -= t;
        if (e.burnTime <= 0) e.burnStacks = 0;
      }
      if (e.poisonTime > 0) {
        const chilled = e.chillStacks > 0 || e.frozenTime > 0;
        damage += e.poisonDps * Math.min(t, e.poisonTime) * (chilled ? e.frostbiteMult : 1);
        e.poisonTime -= t;
        if (e.poisonTime <= 0) e.frostbiteMult = 1; // Frostbite's bonus ends with its poison
      }
      if (damage > 0) this.enemies.damage(e, damage, true, true);
    }
  }

  /** Brimstone: an enemy it hit that dies burning and poisoned bursts (damage ignores defence). */
  private blast(dead: Enemy): void {
    if (dead.blastDamage <= 0 || dead.burnStacks <= 0 || dead.poisonTime <= 0) return;
    const damage = dead.blastDamage;
    dead.blastDamage = 0; // one burst per death, whatever happens next
    this.burst(dead.x, dead.y, dead.blastRadius, damage, BRIMSTONE_COLOR, dead);
  }

  /** A poisoned enemy dies: the poison jumps once to the nearest enemies, and stops there. */
  private spreadPoison(dead: Enemy): void {
    if (dead.poisonTime <= 0 || !dead.poisonCanSpread || dead.poisonSpreadTargets <= 0) return;
    const targets = this.enemies.nearest(
      dead.x,
      dead.y,
      dead.poisonSpreadRadius,
      dead.poisonSpreadTargets,
      (e) => e === dead,
      [],
    );
    for (const e of targets) this.applyPoison(e, dead.poisonDps, dead.poisonDuration, 0, 0, false);
  }
}
