import Phaser from 'phaser';
import { u } from '../../core/math';
import type { EnemySystem } from '../../systems/enemies';
import { Depth } from '../depth';
import { ELITE_RING_RADIUS, FACING_SHAPES, TextureKeys } from '../placeholderTextures';

/** Hit / wind-up flash (white), frozen (ice fill), chilled (blue tint) or plain. */
type Look = 'flash' | 'frozen' | 'chilled' | 'plain';

/** Shapes whose rotation shows direction (Ali's triangle, Ochopintre's diamond). */

/**
 * One sprite (+ elite ring) per enemy pool slot, mirrored from EnemySystem every frame.
 * Wind-ups flash white (Phaser 4: setTint + TintModes.FILL; setTintFill no longer exists).
 */
export class EnemyView {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private readonly uids: number[] = [];
  private readonly looks: Look[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly system: EnemySystem,
  ) {
    for (let i = 0; i < system.capacity; i++) {
      this.rings.push(
        scene.add
          .image(0, 0, TextureKeys.eliteRing)
          .setVisible(false)
          .setDepth(Depth.enemies - 1),
      );
      this.images.push(scene.add.image(0, 0, TextureKeys.player).setVisible(false).setDepth(Depth.enemies));
      this.uids.push(0);
      this.looks.push('plain');
    }
  }

  sync(timeMs: number): void {
    const blinkOn = Math.floor(timeMs / 70) % 2 === 0;
    for (const e of this.system.enemies) {
      const img = this.images[e.index]!;
      const ring = this.rings[e.index]!;
      if (!e.active) {
        if (img.visible) {
          img.setVisible(false);
          ring.setVisible(false);
        }
        continue;
      }

      if (this.uids[e.index] !== e.uid) {
        // A new enemy in this slot.
        this.uids[e.index] = e.uid;
        img
          .setTexture(e.isBoss ? TextureKeys.boss : TextureKeys.enemy(e.def.id))
          .setScale(e.radius / u(e.def.radius)) // elites are drawn larger (config.enemies.elite.scale)
          .setRotation(0)
          .setAlpha(1)
          .setVisible(true);
        ring.setVisible(e.elite).setScale((e.radius + 6) / ELITE_RING_RADIUS);
        this.setLook(e.index, 'plain');
      }

      img.setPosition(e.x, e.y);
      if (e.elite) ring.setPosition(e.x, e.y);
      if (FACING_SHAPES.has(e.def.visual.shape)) {
        const fx = e.state === 'windup' ? e.dirX : e.vx;
        const fy = e.state === 'windup' ? e.dirY : e.vy;
        if (fx * fx + fy * fy > 1) img.setRotation(Math.atan2(fy, fx));
      }
      const flash = e.hitFlash > 0 || (e.state === 'windup' && blinkOn);
      this.setLook(
        e.index,
        flash ? 'flash' : e.frozenTime > 0 ? 'frozen' : e.chillStacks > 0 ? 'chilled' : 'plain',
      );
      img.setAlpha(e.state === 'stunned' ? 0.55 : 1);
    }
  }

  private setLook(i: number, look: Look): void {
    if (this.looks[i] === look) return;
    this.looks[i] = look;
    const img = this.images[i]!;
    if (look === 'flash') img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else if (look === 'frozen') img.setTint(0xbfe8ff).setTintMode(Phaser.TintModes.FILL);
    else if (look === 'chilled') img.setTint(0x8fd0ff).setTintMode(Phaser.TintModes.MULTIPLY);
    else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
  }
}
