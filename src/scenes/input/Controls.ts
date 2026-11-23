import type Phaser from 'phaser';
import type { GameConfig } from '../../data/types';
import type { InputSource, InputState } from '../../systems/input';
import { controlMode, type ControlSetting, type Device } from '../../systems/inputMode';
import { lastDevice } from './deviceTracker';
import { KeyboardMouseInput } from './KeyboardMouseInput';
import { TouchInput } from './TouchInput';

/**
 * The run's InputSource: keyboard and mouse or twin-stick touch, picked every frame from the
 * Controls setting (Auto follows the last device used), so the player can switch mid-run.
 */
export class Controls implements InputSource {
  private readonly kbm: KeyboardMouseInput;
  private readonly touch: TouchInput;
  private setting: ControlSetting;
  private current: Device;

  constructor(
    scene: Phaser.Scene,
    touchCfg: GameConfig['touch'],
    settings: { controls: ControlSetting; autoFire: boolean },
  ) {
    this.kbm = new KeyboardMouseInput(scene, settings.autoFire);
    this.touch = new TouchInput(scene, touchCfg, settings.autoFire);
    this.setting = settings.controls;
    this.current = controlMode(this.setting, lastDevice());
    this.touch.setEnabled(this.current === 'touch');
  }

  /** The device driving the game right now. */
  get mode(): Device {
    return this.current;
  }

  get aimWorld(): Readonly<Phaser.Math.Vector2> {
    return this.current === 'touch' ? this.touch.aimWorld : this.kbm.aimWorld;
  }

  /** Re-read the settings (they may change in the Settings screen during a pause). */
  applySettings(settings: { controls: ControlSetting; autoFire: boolean }): void {
    this.setting = settings.controls;
    this.kbm.autoFire = settings.autoFire;
    this.touch.autoFire = settings.autoFire;
  }

  read(originX: number, originY: number): InputState {
    this.current = controlMode(this.setting, lastDevice());
    this.touch.setEnabled(this.current === 'touch');
    return this.current === 'touch' ? this.touch.read(originX, originY) : this.kbm.read(originX, originY);
  }
}
