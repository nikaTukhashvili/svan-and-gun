import type Phaser from 'phaser';
import type { EnemyProjectileSystem } from '../../systems/enemyProjectiles';
import { Depth } from '../depth';
import { TextureKeys } from '../placeholderTextures';

/** Sprites for enemy projectiles (Rokapi curses), one per pool slot. */
export class ProjectileView {
  private readonly images: Phaser.GameObjects.Image[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly system: EnemyProjectileSystem,
  ) {
    for (let i = 0; i < system.capacity; i++) {
      this.images.push(
        scene.add.image(0, 0, TextureKeys.enemyProjectile).setVisible(false).setDepth(Depth.bullets),
      );
    }
  }

  sync(timeMs: number): void {
    for (const p of this.system.projectiles) {
      const img = this.images[p.index]!;
      if (p.active)
        img
          .setVisible(true)
          .setPosition(p.x, p.y)
          .setRotation(timeMs / 120);
      else if (img.visible) img.setVisible(false);
    }
  }
}
