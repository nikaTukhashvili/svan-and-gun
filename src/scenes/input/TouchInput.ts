import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, UiColors } from '../../config';
import { u } from '../../core/math';
import type { GameConfig } from '../../data/types';
import type { InputSource, InputState } from '../../systems/input';
import { stickVector, type StickVector } from '../../systems/inputMode';
import { Depth } from '../depth';

/** Where the sticks rest when no thumb is down (a hint of where to put them). Cosmetic. */
const MOVE_HOME = { x: 170, y: GAME_HEIGHT - 170 };
const AIM_HOME = { x: GAME_WIDTH - 170, y: GAME_HEIGHT - 170 };
const BUTTON_RADIUS = 38;
/** Distance of the aim point in front of the player, for the grenade (it clamps to its range). */
const AIM_REACH = GAME_WIDTH;

type ButtonKey = 'reload' | 'buildSheet' | 'pause';

interface Stick {
  pointer: Phaser.Input.Pointer | null;
  originX: number;
  originY: number;
  readonly out: StickVector;
}

/**
 * Twin-stick touch controls (GDD: Controls > Mobile). A thumb on the left half of the screen
 * becomes the move stick, one on the right half the aim stick, each centred where it lands.
 * Pushing the aim stick past `fireThreshold` fires; with no aim stick the gun faces the way the
 * player walks. Reload, build sheet and pause are buttons on the right edge.
 *
 * Pointers are polled every frame rather than followed by events, so a thumb lifted while a
 * level-up screen had the game paused never leaves a stick stuck down.
 */
export class TouchInput implements InputSource {
  autoFire: boolean;
  private readonly radius: number;
  private readonly move: Stick = { pointer: null, originX: 0, originY: 0, out: { x: 0, y: 0, strength: 0 } };
  private readonly aimStick: Stick = {
    pointer: null,
    originX: 0,
    originY: 0,
    out: { x: 0, y: 0, strength: 0 },
  };
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly buttons: Phaser.GameObjects.Arc[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly pressed: Record<ButtonKey, boolean> = { reload: false, buildSheet: false, pause: false };
  private readonly world = new Phaser.Math.Vector2();
  private aimAngle = 0;
  private enabled = true;
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
    private readonly cfg: GameConfig['touch'],
    autoFire = false,
  ) {
    this.autoFire = autoFire;
    this.radius = u(cfg.stickRadius);
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(Depth.overlay);

    const x = GAME_WIDTH - 60;
    this.addButton(x, 130, 'II', 'pause');
    this.addButton(x, 220, 'BUILD', 'buildSheet');
    this.addButton(x, 340, 'RELOAD', 'reload');

    scene.input.on('pointerdown', this.onDown, this);
    scene.events.once('shutdown', () => scene.input.off('pointerdown', this.onDown, this));
  }

  /** World point the gun aims at (the grenade is thrown towards it). */
  get aimWorld(): Readonly<Phaser.Math.Vector2> {
    return this.world;
  }

  /** Show or hide the controls (Auto mode switches when the player changes device). */
  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    this.move.pointer = null;
    this.aimStick.pointer = null;
    this.g.clear().setVisible(on);
    for (const b of this.buttons) {
      b.setVisible(on);
      if (on) b.setInteractive();
      else b.disableInteractive();
    }
    for (const t of this.labels) t.setVisible(on);
  }

  read(originX: number, originY: number): InputState {
    const s = this.state;
    const m = this.readStick(this.move);
    const a = this.readStick(this.aimStick);

    s.moveX = m.x;
    s.moveY = m.y;
    if (a.strength > 0) this.aimAngle = Math.atan2(a.y, a.x);
    else if (m.strength > 0) this.aimAngle = Math.atan2(m.y, m.x);
    s.aimAngle = this.aimAngle;
    s.fire = this.autoFire || a.strength >= this.cfg.fireThreshold;
    s.reload = this.take('reload');
    s.pause = this.take('pause');
    s.buildSheet = this.take('buildSheet');

    this.world.set(
      originX + Math.cos(this.aimAngle) * AIM_REACH,
      originY + Math.sin(this.aimAngle) * AIM_REACH,
    );
    this.draw();
    return s;
  }

  private onDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    if (!this.enabled || over.length > 0) return; // a button took this touch
    const stick = pointer.x < GAME_WIDTH / 2 ? this.move : this.aimStick;
    if (stick.pointer?.isDown) return; // that thumb is already down
    stick.pointer = pointer;
    stick.originX = pointer.x;
    stick.originY = pointer.y;
  }

  private readStick(stick: Stick): StickVector {
    const p = stick.pointer;
    if (p && !p.isDown) stick.pointer = null;
    if (!stick.pointer) return stickVector(0, 0, this.radius, this.cfg.deadZone, stick.out);
    return stickVector(p!.x - stick.originX, p!.y - stick.originY, this.radius, this.cfg.deadZone, stick.out);
  }

  private take(key: ButtonKey): boolean {
    const v = this.pressed[key];
    this.pressed[key] = false;
    return v;
  }

  private addButton(x: number, y: number, label: string, key: ButtonKey): void {
    const b = this.scene.add
      .circle(x, y, BUTTON_RADIUS, 0x000000, 0.35)
      .setStrokeStyle(2, 0xe8e6e3, 0.6)
      .setScrollFactor(0)
      .setDepth(Depth.overlay)
      .setInteractive();
    b.on('pointerdown', () => (this.pressed[key] = true));
    const t = this.scene.add
      .text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: label.length > 2 ? '13px' : '20px',
        fontStyle: 'bold',
        color: UiColors.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(Depth.overlay);
    this.buttons.push(b);
    this.labels.push(t);
  }

  private draw(): void {
    const g = this.g.clear();
    for (const [stick, home] of [
      [this.move, MOVE_HOME],
      [this.aimStick, AIM_HOME],
    ] as const) {
      const down = stick.pointer !== null;
      const cx = down ? stick.originX : home.x;
      const cy = down ? stick.originY : home.y;
      g.lineStyle(3, 0xe8e6e3, down ? 0.5 : 0.18).strokeCircle(cx, cy, this.radius);
      const kx = cx + stick.out.x * this.radius;
      const ky = cy + stick.out.y * this.radius;
      const firing = stick === this.aimStick && stick.out.strength >= this.cfg.fireThreshold;
      g.fillStyle(firing ? 0xe0533d : 0xe8e6e3, down ? 0.55 : 0.15).fillCircle(kx, ky, this.radius * 0.42);
    }
  }
}
