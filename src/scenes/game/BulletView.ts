import type Phaser from 'phaser';
import type { BulletSystem } from '../../systems/bullets';
import { Depth } from '../depth';
import { TextureKeys } from '../placeholderTextures';

const CRIT_TINT = 0xff7a45;

/** One pre-made image per bullet slot; each frame mirrors the BulletSystem state. */
export class BulletView {
  private readonly images: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly system: BulletSystem,
  ) {
    for (let i = 0; i < system.capacity; i++) {
      this.images.push(scene.add.image(0, 0, TextureKeys.bullet).setVisible(false).setDepth(Depth.bullets));
    }
  }

  sync(): void {
    for (const b of this.system.bullets) {
      const img = this.images[b.index]!;
      if (b.active) {
        if (!img.visible) {
          img.setVisible(true);
          if (b.crit) img.setTint(CRIT_TINT).setScale(1.5);
          else img.clearTint().setScale(1);
        }
        img.setPosition(b.x, b.y);
      } else if (img.visible) {
        img.setVisible(false);
      }
    }
  }
}
