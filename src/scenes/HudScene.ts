import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { formatTime } from '../core/math';

/** Numbers the HUD shows, read from GameScene every frame. */
export interface HudModel {
  hp: number;
  maxHp: number;
  level: number;
  scrap: number;
  toNext: number;
  timeSec: number;
  kills: number;
  silver: number;
  /** Boss bar; null while no boss is alive. */
  boss: { name: string; hpFraction: number; phaseMarkers: number[]; enraged: boolean } | null;
  /** Centre banner (tutorial prompts, bell warning); null when nothing to say. */
  message: string | null;
  /** The gun build, as text (bottom left). */
  slots: string;
}

const FONT = 'system-ui, sans-serif';

/**
 * In-run HUD, running in parallel on top of GameScene. M3 version: scrap bar and level, HP
 * bar, timer, kills, silver. T34 adds owned mod slots, tutorial prompts and the boss bar.
 */
export class HudScene extends Phaser.Scene {
  private model!: () => HudModel;
  private bars!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private slotsText!: Phaser.GameObjects.Text;
  private last = '';

  constructor() {
    super(SceneKeys.Hud);
  }

  init(data: { model: () => HudModel }): void {
    this.model = data.model;
    this.last = '';
  }

  create(): void {
    this.bars = this.add.graphics();
    const style = (size: number, color: string = UiColors.text) => ({
      fontFamily: FONT,
      fontSize: `${size}px`,
      color,
      fontStyle: 'bold',
    });
    this.levelText = this.add.text(16, 18, '', style(18, UiColors.accent));
    this.hpText = this.add.text(16, 52, '', style(14));
    this.timeText = this.add.text(GAME_WIDTH / 2, 18, '', style(24)).setOrigin(0.5, 0);
    this.statsText = this.add.text(GAME_WIDTH - 16, 18, '', style(16)).setOrigin(1, 0);
    this.bossText = this.add.text(GAME_WIDTH / 2, 56, '', style(16, UiColors.danger)).setOrigin(0.5, 0);
    this.slotsText = this.add
      .text(16, GAME_HEIGHT - 14, '', {
        fontFamily: FONT,
        fontSize: '14px',
        color: UiColors.text,
        backgroundColor: '#00000088',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0, 1);
    this.messageText = this.add
      .text(GAME_WIDTH / 2, 150, '', { ...style(26), backgroundColor: '#00000099', padding: { x: 16, y: 8 } })
      .setOrigin(0.5)
      .setVisible(false);
  }

  override update(): void {
    const m = this.model();
    const g = this.bars;
    g.clear();
    // Scrap bar across the top.
    g.fillStyle(0x000000, 0.5).fillRect(0, 0, GAME_WIDTH, 8);
    g.fillStyle(0x5fc46a, 1).fillRect(0, 0, GAME_WIDTH * Math.min(1, m.scrap / m.toNext), 8);
    // HP bar.
    g.fillStyle(0x000000, 0.5).fillRect(16, 72, 240, 12);
    g.fillStyle(m.hp / m.maxHp > 0.3 ? 0xd9534f : 0xff2d2d, 1).fillRect(
      16,
      72,
      240 * Math.max(0, m.hp / m.maxHp),
      12,
    );
    g.lineStyle(1, 0xffffff, 0.3).strokeRect(16, 72, 240, 12);

    // Boss bar with phase markers across the top.
    if (m.boss) {
      const w = 600;
      const x = (GAME_WIDTH - w) / 2;
      g.fillStyle(0x000000, 0.6).fillRect(x, 80, w, 14);
      g.fillStyle(m.boss.enraged ? 0xff2d2d : 0xb83b2e, 1).fillRect(x, 80, w * m.boss.hpFraction, 14);
      g.lineStyle(2, 0xffffff, 0.8);
      for (const f of m.boss.phaseMarkers) g.lineBetween(x + w * f, 76, x + w * f, 98);
      g.lineStyle(1, 0xffffff, 0.4).strokeRect(x, 80, w, 14);
    }
    this.bossText.setVisible(m.boss !== null);
    this.messageText.setVisible(m.message !== null);
    if (m.message !== null && this.messageText.text !== m.message) this.messageText.setText(m.message);
    const slots = m.slots + '      [C] build';
    if (this.slotsText.text !== slots) this.slotsText.setText(slots);
    const bossLabel = m.boss ? `${m.boss.name.toUpperCase()}${m.boss.enraged ? '  ·  ENRAGED' : ''}` : '';
    if (this.bossText.text !== bossLabel) this.bossText.setText(bossLabel);

    // Text only when it changes (TDD: throttled UI).
    const key = `${m.level}|${Math.ceil(m.hp)}|${m.maxHp}|${Math.floor(m.timeSec)}|${m.kills}|${m.silver}`;
    if (key === this.last) return;
    this.last = key;
    this.levelText.setText(`LEVEL ${m.level}`);
    this.hpText.setText(`HP ${Math.ceil(m.hp)} / ${Math.round(m.maxHp)}`);
    this.timeText.setText(formatTime(m.timeSec));
    this.statsText.setText(`${m.kills} kills   ${m.silver} silver`);
  }
}
