import Phaser from 'phaser';
import type { InputSource, InputState } from '../../systems/input';

type KeyName = 'W' | 'A' | 'S' | 'D' | 'R' | 'C' | 'ESC';

/** WASD to move, mouse to aim, hold left button to shoot, R to reload, C build sheet, Esc to pause. */
export class KeyboardMouseInput implements InputSource {
  private readonly keys: Record<KeyName, Phaser.Input.Keyboard.Key>;
  private readonly world = new Phaser.Math.Vector2();
  private readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    fire: false,
    reload: false,
    pause: false,
    buildSheet: false,
  };

  constructor(
    private readonly scene: Phaser.Scene,
    public autoFire = false,
  ) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is disabled in the game config');
    this.keys = keyboard.addKeys('W,A,S,D,R,C,ESC') as Record<KeyName, Phaser.Input.Keyboard.Key>;
    scene.input.mouse?.disableContextMenu();
  }

  /** World position of the mouse, recomputed every frame because the camera moves under it. */
  get aimWorld(): Readonly<Phaser.Math.Vector2> {
    return this.world;
  }

  read(originX: number, originY: number): InputState {
    const k = this.keys;
    const pointer = this.scene.input.activePointer;
    this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y, this.world);

    let mx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0);
    let my = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
    if (mx !== 0 && my !== 0) {
      mx *= Math.SQRT1_2;
      my *= Math.SQRT1_2;
    }

    const s = this.state;
    s.moveX = mx;
    s.moveY = my;
    s.aimAngle = Math.atan2(this.world.y - originY, this.world.x - originX);
    s.fire = this.autoFire || pointer.leftButtonDown();
    s.reload = Phaser.Input.Keyboard.JustDown(k.R);
    s.pause = Phaser.Input.Keyboard.JustDown(k.ESC);
    s.buildSheet = Phaser.Input.Keyboard.JustDown(k.C);
    return s;
  }
}
