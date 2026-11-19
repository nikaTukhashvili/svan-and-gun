import type Phaser from 'phaser';
import { UiColors } from '../../config';
import type { WeaponSystem } from '../../systems/weapon';
import { Depth } from '../depth';

const ACCENT = 0xf2b632;
const LIGHT = 0xe8e6e3;

/**
 * Crosshair at the mouse with the ammo count and a reload ring around it (T08), so the
 * player never has to look away from the aim point to know when to reload.
 */
export class CursorOverlay {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly ammoText: Phaser.GameObjects.Text;
  private lastLabel = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(Depth.overlay);
    this.ammoText = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: UiColors.text,
      })
      .setScrollFactor(0)
      .setDepth(Depth.overlay);
    scene.input.setDefaultCursor('none');
    scene.events.once('shutdown', () => scene.input.setDefaultCursor('default'));
  }

  draw(weapon: WeaponSystem): void {
    const p = this.scene.input.activePointer;
    const g = this.g;
    g.clear();

    const color = weapon.ammo === 0 && !weapon.reloading ? 0xe0533d : LIGHT;
    g.lineStyle(2, color, 0.9);
    g.strokeCircle(p.x, p.y, 8);
    g.lineBetween(p.x - 14, p.y, p.x - 10, p.y);
    g.lineBetween(p.x + 10, p.y, p.x + 14, p.y);
    g.lineBetween(p.x, p.y - 14, p.x, p.y - 10);
    g.lineBetween(p.x, p.y + 10, p.x, p.y + 14);

    if (weapon.reloading) {
      const start = -Math.PI / 2;
      g.lineStyle(4, 0x000000, 0.35).strokeCircle(p.x, p.y, 20);
      g.lineStyle(4, ACCENT, 1);
      g.beginPath();
      g.arc(p.x, p.y, 20, start, start + Math.PI * 2 * weapon.reloadProgress, false);
      g.strokePath();
    }

    const label = weapon.reloading ? 'reload' : `${weapon.ammo}/${weapon.magSize}`;
    if (label !== this.lastLabel) {
      this.ammoText
        .setText(label)
        .setColor(weapon.ammo === 0 && !weapon.reloading ? UiColors.danger : UiColors.text);
      this.lastLabel = label;
    }
    this.ammoText.setPosition(p.x + 18, p.y + 12);
  }
}
