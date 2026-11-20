import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { RNG } from '../core/rng';
import type { GunDef } from '../data/types';
import { createButton } from '../ui/button';
import { gunTwistText } from '../ui/cardText';
import { getGameData } from './gameData';

const FONT = 'system-ui, sans-serif';
const CARD_W = 360;
const CARD_H = 380;

/** The opening text card (GDD: Story) and the choice of 1 of 3 Cores (T33). */
export class GunSelectScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.GunSelect);
  }

  create(): void {
    const guns = getGameData(this).guns;
    const cx = GAME_WIDTH / 2;
    this.add
      .text(
        cx,
        70,
        'Coming down from the hunt, the Svan hears the village bell. The tower is taken,\nthe square is full of creatures from the crack. At the workbench, he picks a gun.',
        { fontFamily: FONT, fontSize: '19px', color: UiColors.textDim, align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5);
    this.add
      .text(cx, 150, 'Choose your gun', {
        fontFamily: FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: UiColors.accent,
      })
      .setOrigin(0.5);

    guns.forEach((gun, i) => this.drawGun(gun, cx + (i - (guns.length - 1) / 2) * (CARD_W + 30), 380, i));
    createButton(this, cx, 640, 'Back', () => this.scene.start(SceneKeys.Menu), { width: 200, fontSize: 22 });

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= guns.length) this.start(guns[n - 1]!.id);
      else if (e.key === 'Escape') this.scene.start(SceneKeys.Menu);
    });
  }

  private drawGun(gun: GunDef, x: number, y: number, index: number): void {
    const box = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1f232b).setStrokeStyle(3, 0x3a404b);
    box.setInteractive({ useHandCursor: true });
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => box.setStrokeStyle(3, 0xf2b632));
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => box.setStrokeStyle(3, 0x3a404b));
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.start(gun.id));

    const top = y - CARD_H / 2;
    const dmg = gun.pellets > 1 ? `${gun.damage} × ${gun.pellets} pellets` : `${gun.damage}`;
    const stats = [
      `Damage       ${dmg}`,
      `Shots/s      ${gun.shotsPerSecond}`,
      `Magazine     ${gun.magSize}`,
      `Reload       ${gun.reloadSec} s`,
      `Range        ${gun.range} units`,
      `Spread       ${gun.spreadDeg}°`,
      `Barrel       ${gun.barrel.slots} slots`,
    ];
    this.add
      .text(x, top + 24, `[${index + 1}]`, { fontFamily: FONT, fontSize: '14px', color: UiColors.textDim })
      .setOrigin(0.5);
    this.add
      .text(x, top + 56, gun.name, {
        fontFamily: FONT,
        fontSize: '28px',
        fontStyle: 'bold',
        color: UiColors.text,
      })
      .setOrigin(0.5);
    this.add
      .text(x, top + 92, gun.role, { fontFamily: FONT, fontSize: '16px', color: UiColors.textDim })
      .setOrigin(0.5);
    this.add
      .text(x - CARD_W / 2 + 36, top + 126, stats.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: UiColors.text,
      })
      .setLineSpacing(6);
    this.add
      .text(x, top + CARD_H - 56, gun.traitText, {
        fontFamily: FONT,
        fontSize: '17px',
        fontStyle: 'bold',
        color: UiColors.accent,
      })
      .setOrigin(0.5);
    this.add
      .text(x, top + CARD_H - 28, gunTwistText(gun), {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#5bc0be',
        align: 'center',
      })
      .setOrigin(0.5)
      .setWordWrapWidth(CARD_W - 30);
  }

  private start(gunId: string): void {
    this.scene.start(SceneKeys.Game, { gunId, seed: RNG.randomSeed() });
  }
}
