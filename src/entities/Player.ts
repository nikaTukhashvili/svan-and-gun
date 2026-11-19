import Phaser from 'phaser';
import { Depth } from '../scenes/depth';
import { TextureKeys } from '../scenes/placeholderTextures';

/** The Svan: an Arcade circle body that collides with obstacles, plus a barrel showing his aim. */
export class Player extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  private readonly barrel: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, radiusPx: number) {
    super(scene, x, y, TextureKeys.player);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Texture is a little larger than the body (outline); centre the circle in it.
    const offset = this.width / 2 - radiusPx;
    this.body.setCircle(radiusPx, offset, offset);
    this.setCollideWorldBounds(true);
    this.setDepth(Depth.player);

    this.barrel = scene.add
      .rectangle(x, y, radiusPx * 2.3, 8, 0x2b3038)
      .setStrokeStyle(2, 0xd8dce2)
      .setOrigin(0, 0.5)
      .setDepth(Depth.player - 1);
  }

  /** dx, dy: normalised direction; speed in px/s. */
  move(dx: number, dy: number, speed: number): void {
    this.body.setVelocity(dx * speed, dy * speed);
  }

  stop(): void {
    this.body.setVelocity(0, 0);
  }

  aim(angle: number): void {
    this.barrel.setPosition(this.x, this.y).setRotation(angle);
  }

  /** Blink while invulnerable after a hit. */
  setBlinking(on: boolean, timeMs: number): void {
    const alpha = on ? (Math.floor(timeMs / 80) % 2 === 0 ? 0.35 : 1) : 1;
    this.setAlpha(alpha);
    this.barrel.setAlpha(alpha);
  }

  /** Purple while slowed by a Rokapi curse. */
  setSlowed(on: boolean): void {
    if (on) this.setTint(0xb48cff);
    else this.clearTint();
  }

  override destroy(fromScene?: boolean): void {
    this.barrel.destroy(fromScene);
    super.destroy(fromScene);
  }
}
