import Phaser from 'phaser';
import { UiColors } from '../config';

export interface ButtonOptions {
  width?: number;
  fontSize?: number;
  enabled?: boolean;
}

/** Plain text button for Phase 1 menus: a box with a label, hover highlight, click callback. */
export function createButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): Phaser.GameObjects.Text {
  const enabled = opts.enabled ?? true;
  const text = scene.add
    .text(x, y, label, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${opts.fontSize ?? 28}px`,
      color: enabled ? UiColors.text : UiColors.textDim,
      backgroundColor: '#1f232b',
      padding: { x: 24, y: 10 },
      fixedWidth: opts.width ?? 280,
      align: 'center',
    })
    .setOrigin(0.5);

  if (enabled) {
    text.setInteractive({ useHandCursor: true });
    text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () =>
      text.setBackgroundColor('#2c323d').setColor(UiColors.accent),
    );
    text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () =>
      text.setBackgroundColor('#1f232b').setColor(UiColors.text),
    );
    text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onClick);
  }
  return text;
}
