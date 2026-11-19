import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { formatTime } from '../core/math';
import { RNG } from '../core/rng';
import { getById } from '../data/registry';
import type { RunBuild } from '../systems/build';
import { computeScore, computeSilver, type RunSummary } from '../systems/score';
import { roman, slotLabel } from '../ui/cardText';
import { createButton } from '../ui/button';
import { getGameData } from './gameData';

export interface ResultsData {
  summary: RunSummary;
  gunId: string;
  level: number;
  build: RunBuild;
}

/** Hook for the save system (T29): called once with the run's score and silver. */
export type RunRecorder = (r: { data: ResultsData; score: number; silver: number }) => { newBest: boolean };

let recorder: RunRecorder | null = null;
export function setRunRecorder(fn: RunRecorder | null): void {
  recorder = fn;
}

const FONT = 'system-ui, sans-serif';

/** Victory or defeat, score, stats, the final gun build and silver earned (T28). */
export class ResultsScene extends Phaser.Scene {
  private results!: ResultsData;

  constructor() {
    super(SceneKeys.Results);
  }

  init(data: ResultsData): void {
    this.results = data;
  }

  create(): void {
    const gd = getGameData(this);
    const { summary, gunId, level, build } = this.results;
    const score = computeScore(gd.config.score, summary);
    const silver = computeSilver(gd.config.silver, gd.drops, summary);
    const { newBest } = recorder?.({ data: this.results, score, silver: silver.total }) ?? { newBest: false };
    const victory = summary.result === 'victory';
    const cx = GAME_WIDTH / 2;
    const t = (x: number, y: number, s: string, size: number, color: string = UiColors.text, bold = false) =>
      this.add.text(x, y, s, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: bold ? 'bold' : 'normal',
      });

    t(
      cx,
      70,
      victory ? 'TOWER RETAKEN' : 'THE SVAN HAS FALLEN',
      52,
      victory ? UiColors.accent : UiColors.danger,
      true,
    ).setOrigin(0.5);
    t(cx, 140, `Score ${score.toLocaleString('en-US')}`, 34, UiColors.text, true).setOrigin(0.5);
    if (newBest) t(cx, 182, 'NEW BEST!', 22, UiColors.accent, true).setOrigin(0.5);

    const gun = getById(gd.guns, gunId, 'gun');
    const left = 200;
    const stats = [
      `Time survived   ${formatTime(summary.timeSec)}`,
      `Kills           ${summary.kills}`,
      `Elites          ${summary.eliteKills}`,
      `Boss            ${summary.bossKilled ? 'slain' : '—'}`,
      `Level reached   ${level}`,
    ];
    t(left, 230, 'RUN', 16, UiColors.textDim, true);
    t(left, 256, stats.join('\n'), 20).setLineSpacing(8);

    const silverLines = [
      `Picked up       ${silver.picked}`,
      `Kills / ${gd.config.silver.perKills}       ${silver.fromKills}`,
      `Victory bonus   ${silver.victory}`,
      `Boss drop       ${silver.boss}`,
      `Total           ${silver.total}`,
    ];
    t(left, 470, 'SILVER EARNED', 16, UiColors.textDim, true);
    t(left, 496, silverLines.join('\n'), 18).setLineSpacing(6);

    const right = 700;
    t(right, 230, 'FINAL GUN', 16, UiColors.textDim, true);
    t(right, 256, `${gun.name} · Core Tier ${roman(build.coreTier)}`, 22, UiColors.text, true);
    const barrel = build.barrel.map((s, i) => `Barrel ${i + 1}: ${slotLabel(gd, 'barrel', s)}`);
    const mag = build.magazine.map((s, i) => `Magazine ${i + 1}: ${slotLabel(gd, 'magazine', s)}`);
    t(right, 296, [...barrel, ...mag].join('\n'), 18).setLineSpacing(8);

    createButton(
      this,
      right + 90,
      560,
      'Retry',
      () => this.scene.start(SceneKeys.Game, { gunId, seed: RNG.randomSeed() }),
      {
        width: 220,
      },
    );
    createButton(this, right + 90, 630, 'Main menu', () => this.scene.start(SceneKeys.Menu), { width: 220 });
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start(SceneKeys.Menu));
  }
}
