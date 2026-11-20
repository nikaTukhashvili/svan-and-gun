import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { devToolsEnabled } from '../debug/devFlags';
import { markReady } from '../debug/testHook';
import { createButton } from '../ui/button';
import type { GameSceneData } from './GameScene';
import { getGameData } from './gameData';
import { getSave, saveNoticeText } from './meta';

/** Main menu (T33): Start, Market, High Scores, Settings, with the silver balance. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Menu);
  }

  create(): void {
    const data = getGameData(this);
    const save = getSave(this);
    const cx = GAME_WIDTH / 2;
    const font = 'system-ui, sans-serif';

    this.add
      .text(cx, 160, 'SVAN AND GUN', {
        fontFamily: font,
        fontSize: '72px',
        fontStyle: 'bold',
        color: UiColors.text,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 230, 'One stubborn Svan. One homemade gun.', {
        fontFamily: font,
        fontSize: '22px',
        color: UiColors.textDim,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH - 24, 24, `${save.state.silver} silver`, {
        fontFamily: font,
        fontSize: '22px',
        fontStyle: 'bold',
        color: UiColors.accent,
      })
      .setOrigin(1, 0);

    createButton(this, cx, 340, 'Start', () => this.scene.start(SceneKeys.GunSelect));
    createButton(this, cx, 410, 'Market', () => this.scene.start(SceneKeys.Market));
    createButton(this, cx, 480, 'High Scores', () => this.scene.start(SceneKeys.HighScores));
    createButton(this, cx, 550, 'Settings', () => this.scene.start(SceneKeys.Settings, { overlay: false }));

    if (devToolsEnabled) {
      // Dev tool: always in `npm run dev`; on the hosted build only with ?dev.
      createButton(this, cx, 620, 'Training Ground', () => this.startTrainingGround(data.guns[0]!.id), {
        fontSize: 22,
      });
    }

    const notice = saveNoticeText(save);
    if (notice) {
      this.add
        .text(cx, devToolsEnabled ? 675 : 630, notice, {
          fontFamily: font,
          fontSize: '16px',
          color: UiColors.danger,
        })
        .setOrigin(0.5);
    }
    this.add
      .text(
        GAME_WIDTH - 16,
        GAME_HEIGHT - 12,
        `Phase 1 prototype · ${data.guns.length} guns · ${data.enemies.length} enemies`,
        {
          fontFamily: font,
          fontSize: '14px',
          color: UiColors.textDim,
        },
      )
      .setOrigin(1, 1);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start(SceneKeys.GunSelect));
    markReady();
  }

  private startTrainingGround(gunId: string): void {
    const data: GameSceneData = { gunId, seed: 1, mode: 'playground' };
    this.scene.start(SceneKeys.Game, data);
  }
}
