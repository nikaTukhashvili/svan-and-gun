import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { createButton } from '../ui/button';
import { applySettings, getSave } from './meta';

/**
 * Settings (T33): volume, auto-fire, screen shake, fullscreen. Saved immediately.
 * Opened from the menu (replaces it) or over the pause menu (overlay: true).
 */
export class SettingsScene extends Phaser.Scene {
  private overlay = false;
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super(SceneKeys.Settings);
  }

  init(data: { overlay?: boolean }): void {
    this.overlay = data.overlay ?? false;
  }

  create(): void {
    if (this.overlay) {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x111317, 0.96);
      this.input.setDefaultCursor('default');
    }
    this.root = this.add.container(0, 0);
    this.render();
    this.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  private render(): void {
    this.root.removeAll(true);
    const save = getSave(this);
    const s = save.state.settings;
    const cx = GAME_WIDTH / 2;
    const changed = () => {
      save.save();
      applySettings(this.game, s);
      this.render();
    };
    const onOff = (v: boolean) => (v ? 'ON' : 'OFF');

    this.root.add(
      this.add
        .text(cx, 110, 'SETTINGS', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '40px',
          fontStyle: 'bold',
          color: UiColors.accent,
        })
        .setOrigin(0.5),
    );
    const vol = Math.round(s.volume * 100);
    this.root.add([
      createButton(
        this,
        cx - 230,
        230,
        '−',
        () => ((s.volume = Math.max(0, Math.round((s.volume - 0.1) * 10) / 10)), changed()),
        { width: 70 },
      ),
      this.add
        .text(cx, 230, `Volume ${vol}%`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '26px',
          color: UiColors.text,
        })
        .setOrigin(0.5),
      createButton(
        this,
        cx + 230,
        230,
        '+',
        () => ((s.volume = Math.min(1, Math.round((s.volume + 0.1) * 10) / 10)), changed()),
        { width: 70 },
      ),
      createButton(
        this,
        cx,
        320,
        `Auto-fire: ${onOff(s.autoFire)}`,
        () => ((s.autoFire = !s.autoFire), changed()),
        { width: 380 },
      ),
      createButton(
        this,
        cx,
        400,
        `Screen shake: ${onOff(s.screenShake)}`,
        () => ((s.screenShake = !s.screenShake), changed()),
        {
          width: 380,
        },
      ),
      createButton(
        this,
        cx,
        480,
        `Fullscreen: ${onOff(this.scale.isFullscreen)}`,
        () => {
          // Must run inside the click: browsers only allow fullscreen from a user gesture.
          if (this.scale.isFullscreen) this.scale.stopFullscreen();
          else this.scale.startFullscreen();
          s.fullscreen = !this.scale.isFullscreen;
          save.save();
          this.time.delayedCall(150, () => this.render());
        },
        { width: 380 },
      ),
      createButton(this, cx, 600, 'Back', () => this.close(), { width: 220 }),
    ]);
  }

  private close(): void {
    if (this.overlay) {
      this.input.setDefaultCursor('default'); // the pause menu below still needs a pointer
      this.scene.stop();
    } else {
      this.scene.start(SceneKeys.Menu);
    }
  }
}
