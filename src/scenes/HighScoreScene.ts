import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { formatTime } from '../core/math';
import { createButton } from '../ui/button';
import { getGameData } from './gameData';
import { getSave } from './meta';

/** Local top-10 table (T32). */
export class HighScoreScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.HighScores);
  }

  create(): void {
    const data = getGameData(this);
    const scores = getSave(this).state.highScores;
    const font = 'system-ui, sans-serif';
    const cols = [160, 250, 420, 640, 780, 960];
    const row = (y: number, cells: string[], color: string = UiColors.text, size = 20) =>
      cells.forEach((c, i) =>
        this.add.text(cols[i]!, y, c, { fontFamily: font, fontSize: `${size}px`, color }),
      );

    this.add
      .text(GAME_WIDTH / 2, 60, 'HIGH SCORES', {
        fontFamily: font,
        fontSize: '40px',
        fontStyle: 'bold',
        color: UiColors.accent,
      })
      .setOrigin(0.5);
    row(130, ['#', 'Score', 'Gun', 'Time', 'Result', 'Date'], UiColors.textDim, 16);
    if (scores.length === 0) {
      this.add
        .text(GAME_WIDTH / 2, 300, 'No runs yet. Go take the tower back.', {
          fontFamily: font,
          fontSize: '22px',
          color: UiColors.textDim,
        })
        .setOrigin(0.5);
    }
    scores.forEach((s, i) => {
      const gun = data.guns.find((g) => g.id === s.gun)?.name ?? s.gun;
      row(
        165 + i * 40,
        [
          `${i + 1}`,
          s.score.toLocaleString('en-US'),
          gun,
          formatTime(s.timeSec),
          s.result === 'victory' ? 'Victory' : 'Defeat',
          s.date,
        ],
        i === 0 ? UiColors.accent : UiColors.text,
      );
    });
    createButton(this, GAME_WIDTH / 2, 640, 'Back', () => this.scene.start(SceneKeys.Menu), {
      width: 200,
      fontSize: 22,
    });
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SceneKeys.Menu));
  }
}
