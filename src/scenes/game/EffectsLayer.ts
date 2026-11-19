import type Phaser from 'phaser';
import type { DeathBurst } from '../../systems/enemies';
import type { Boulder, ShockRing } from '../../systems/boss';
import type { LightningArc } from '../../systems/status';

export interface BossHazards {
  rings: readonly ShockRing[];
  boulders: readonly Boulder[];
  ringThickness: number;
  impactRadius: number;
  telegraphSec: number;
}
import { Depth } from '../depth';

interface Flash {
  x: number;
  y: number;
  radius: number;
  timeLeft: number;
  duration: number;
  color: number;
}

/**
 * Short-lived world effects drawn with one Graphics object: death-burst telegraphs and
 * explosion flashes. More effects (lightning lines, slam rings) join it in later milestones.
 */
export class EffectsLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly flashes: Flash[] = [];
  private readonly arcs: (LightningArc & { timeLeft: number })[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(Depth.effects);
  }

  flash(x: number, y: number, radius: number, color = 0xff8a3d, duration = 0.25): void {
    this.flashes.push({ x, y, radius, timeLeft: duration, duration, color });
  }

  /** Thunder Spark arcs; drawn as jagged lines for a moment. Drains `arcs`. */
  lightning(arcs: LightningArc[]): void {
    for (const a of arcs) this.arcs.push({ ...a, timeLeft: 0.12 });
    arcs.length = 0;
  }

  draw(dt: number, timeMs: number, bursts: readonly DeathBurst[], boss?: BossHazards): void {
    const g = this.g;
    g.clear();

    if (boss) {
      // Boulder landing marks: fill grows as impact nears, so the timing is readable.
      for (const b of boss.boulders) {
        const k = 1 - b.timeLeft / boss.telegraphSec;
        g.fillStyle(0xe0533d, 0.15 + 0.25 * k).fillCircle(b.x, b.y, boss.impactRadius * Math.max(0.2, k));
        g.lineStyle(2, 0xe0533d, 0.9).strokeCircle(b.x, b.y, boss.impactRadius);
      }
      for (const r of boss.rings) {
        g.lineStyle(boss.ringThickness, 0xffd27a, 0.8).strokeCircle(r.x, r.y, r.radius);
      }
    }

    // Pending death bursts: a pulsing danger circle so the player can step out.
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 60);
    for (const b of bursts) {
      g.fillStyle(0xe0533d, 0.12 + 0.12 * pulse).fillCircle(b.x, b.y, b.radius);
      g.lineStyle(2, 0xe0533d, 0.9).strokeCircle(b.x, b.y, b.radius);
    }

    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i]!;
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) {
        this.arcs.splice(i, 1);
        continue;
      }
      const mx = (a.x0 + a.x1) / 2 + Math.sin(timeMs + i) * 8;
      const my = (a.y0 + a.y1) / 2 + Math.cos(timeMs + i) * 8;
      g.lineStyle(3, 0xbfe3ff, 0.95).lineBetween(a.x0, a.y0, mx, my).lineBetween(mx, my, a.x1, a.y1);
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i]!;
      f.timeLeft -= dt;
      if (f.timeLeft <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.timeLeft / f.duration;
      g.fillStyle(f.color, 0.6 * k).fillCircle(f.x, f.y, f.radius * (1.1 - 0.3 * k));
    }
  }
}
