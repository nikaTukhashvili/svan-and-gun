import type Phaser from 'phaser';
import { Depth } from '../depth';

const POOL = 48;
const LIFE = 0.6;

interface Num {
  text: Phaser.GameObjects.Text;
  life: number;
  vx: number;
}

/**
 * Floating damage numbers (T35): a fixed pool of texts, reused oldest-first when full.
 * Crits are big and orange; status damage (burn, poison) is small and green.
 */
export class DamageNumbers {
  private readonly nums: Num[] = [];
  private next = 0;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < POOL; i++) {
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(Depth.effects + 1)
        .setVisible(false);
      this.nums.push({ text, life: 0, vx: 0 });
    }
  }

  spawn(x: number, y: number, amount: number, crit: boolean, status: boolean): void {
    const n = this.nums[this.next]!;
    this.next = (this.next + 1) % POOL;
    n.life = LIFE;
    // Spread stacked numbers sideways a little (cosmetic: index-based, not random).
    n.vx = ((this.next % 5) - 2) * 12;
    n.text
      .setText(String(Math.max(1, Math.round(amount))))
      .setPosition(x, y - 10)
      .setFontSize(crit ? 22 : status ? 12 : 15)
      .setColor(crit ? '#ff7a45' : status ? '#9fe07a' : '#ffffff')
      .setAlpha(1)
      .setVisible(true);
  }

  update(dt: number): void {
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) {
        n.text.setVisible(false);
        continue;
      }
      n.text.x += n.vx * dt;
      n.text.y -= 40 * dt;
      n.text.setAlpha(Math.min(1, n.life / (LIFE * 0.5)));
    }
  }
}
