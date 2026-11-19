import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';

/** One line on the sheet. `color` is a CSS colour; defaults to the normal text colour. */
export interface SheetLine {
  text: string;
  color?: string;
}

export interface BuildSheetData {
  perks: SheetLine[];
  stats: SheetLine[];
  gun: SheetLine[];
  close: () => void;
}

const FONT = 'system-ui, sans-serif';

/**
 * Build sheet (C during a run): the perks picked so far, current stats against base values,
 * and the gun's slots. The run is paused while it is open; C or Esc closes it.
 */
export class BuildSheetScene extends Phaser.Scene {
  private sheet!: BuildSheetData;

  constructor() {
    super(SceneKeys.BuildSheet);
  }

  init(data: BuildSheetData): void {
    this.sheet = data;
  }

  create(): void {
    this.input.setDefaultCursor('default');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('none'));
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0b0d10, 0.96);

    const title = (x: number, y: number, s: string) =>
      this.add.text(x, y, s, {
        fontFamily: FONT,
        fontSize: '15px',
        fontStyle: 'bold',
        color: UiColors.textDim,
      });
    const column = (x: number, y: number, lines: SheetLine[], empty: string) => {
      if (lines.length === 0) {
        this.add.text(x, y, empty, { fontFamily: FONT, fontSize: '17px', color: UiColors.textDim });
        return;
      }
      lines.forEach((l, i) =>
        this.add.text(x, y + i * 28, l.text, {
          fontFamily: FONT,
          fontSize: '17px',
          color: l.color ?? UiColors.text,
        }),
      );
    };

    this.add
      .text(GAME_WIDTH / 2, 50, 'BUILD', {
        fontFamily: FONT,
        fontSize: '36px',
        fontStyle: 'bold',
        color: UiColors.accent,
      })
      .setOrigin(0.5);

    title(70, 110, 'PERKS PICKED THIS RUN');
    column(70, 140, this.sheet.perks, 'No perks yet.');

    title(520, 110, 'STATS (base → now)');
    column(520, 140, this.sheet.stats, '');

    title(900, 110, 'GUN');
    column(900, 140, this.sheet.gun, '');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'C or Esc to close', {
        fontFamily: FONT,
        fontSize: '16px',
        color: UiColors.textDim,
      })
      .setOrigin(0.5);

    const close = () => {
      this.scene.stop();
      this.sheet.close();
    };
    this.input.keyboard?.once('keydown-C', close);
    this.input.keyboard?.once('keydown-ESC', close);
  }
}
