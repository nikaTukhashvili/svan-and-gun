import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { createButton } from '../ui/button';
import { applyMusicVolume } from './audio/Music';
import { applySettings, getSave } from './meta';
import { nextControlSetting, type ControlSetting } from '../systems/inputMode';
import { lastDevice } from './input/deviceTracker';

const controlsLabel = (c: ControlSetting): string =>
  c === 'touch'
    ? 'TOUCH'
    : c === 'keyboard'
      ? 'KEYBOARD & MOUSE'
      : `AUTO (${lastDevice() === 'touch' ? 'touch' : 'keyboard'})`;

/**
 * Settings (T33): volume, music volume, auto-fire, controls, screen shake, fullscreen. Saved immediately.
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
      applyMusicVolume(this.game, s);
      this.render();
    };
    const onOff = (v: boolean) => (v ? 'ON' : 'OFF');

    this.root.add(
      this.add
        .text(cx, 95, 'SETTINGS', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '40px',
          fontStyle: 'bold',
          color: UiColors.accent,
        })
        .setOrigin(0.5),
    );
    /** A "−  label  +" row for a 0..1 setting in steps of 10%. */
    const slider = (y: number, label: string, get: () => number, set: (v: number) => void) => [
      createButton(
        this,
        cx - 230,
        y,
        '−',
        () => (set(Math.max(0, Math.round((get() - 0.1) * 10) / 10)), changed()),
        {
          width: 70,
        },
      ),
      this.add
        .text(cx, y, `${label} ${Math.round(get() * 100)}%`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '26px',
          color: UiColors.text,
        })
        .setOrigin(0.5),
      createButton(
        this,
        cx + 230,
        y,
        '+',
        () => (set(Math.min(1, Math.round((get() + 0.1) * 10) / 10)), changed()),
        {
          width: 70,
        },
      ),
    ];
    this.root.add([
      ...slider(
        180,
        'Volume',
        () => s.volume,
        (v) => (s.volume = v),
      ),
      ...slider(
        245,
        'Music',
        () => s.musicVolume,
        (v) => (s.musicVolume = v),
      ),
      createButton(
        this,
        cx,
        310,
        `Music: ${s.musicMuted ? 'MUTED' : 'ON'}  [M]`,
        () => ((s.musicMuted = !s.musicMuted), changed()),
        { width: 380 },
      ),
      createButton(
        this,
        cx,
        375,
        `Auto-fire: ${onOff(s.autoFire)}`,
        () => ((s.autoFire = !s.autoFire), changed()),
        { width: 380 },
      ),
      createButton(
        this,
        cx,
        440,
        `Controls: ${controlsLabel(s.controls)}`,
        () => ((s.controls = nextControlSetting(s.controls)), changed()),
        { width: 460 },
      ),
      createButton(
        this,
        cx,
        505,
        `Screen shake: ${onOff(s.screenShake)}`,
        () => ((s.screenShake = !s.screenShake), changed()),
        {
          width: 380,
        },
      ),
      createButton(
        this,
        cx,
        570,
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
      createButton(this, cx, 650, 'Back', () => this.close(), { width: 220 }),
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
