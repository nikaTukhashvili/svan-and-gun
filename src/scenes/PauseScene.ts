import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { createButton } from '../ui/button';

export interface PauseController {
  resume(): void;
  /** Quit the run: counts as a defeat, silver is kept (GDD: UI and menus). */
  quit(): void;
  /** Open settings on top of the pause menu (T33); optional until then. */
  settings?(): void;
}

/** Pause menu over the paused GameScene: Esc, or automatically when the window loses focus. */
export class PauseScene extends Phaser.Scene {
  private ctl!: PauseController;

  constructor() {
    super(SceneKeys.Pause);
  }

  init(data: { controller: PauseController }): void {
    this.ctl = data.controller;
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    this.input.setDefaultCursor('default');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('none'));
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65);
    this.add
      .text(cx, 200, 'PAUSED', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '56px',
        fontStyle: 'bold',
        color: UiColors.text,
      })
      .setOrigin(0.5);
    let y = 330;
    createButton(this, cx, y, 'Resume  [Esc]', () => this.resume());
    if (this.ctl.settings) createButton(this, cx, (y += 70), 'Settings', () => this.ctl.settings?.());
    createButton(this, cx, (y += 70), 'Quit run', () => {
      this.scene.stop();
      this.ctl.quit();
    });
    this.add
      .text(cx, y + 60, 'Quitting counts as a defeat. You keep the silver.', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: UiColors.textDim,
      })
      .setOrigin(0.5);
    this.input.keyboard?.on('keydown-ESC', () => {
      // Esc in the settings overlay closes settings, not the pause menu.
      if (!this.scene.isActive(SceneKeys.Settings)) this.resume();
    });
  }

  private resume(): void {
    this.scene.stop();
    this.ctl.resume();
  }
}
