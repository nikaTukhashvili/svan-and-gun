import Phaser from 'phaser';
import { GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { BuffDef } from '../data/types';
import { buffCost, buffLevel, buyBuff, canBuy, refundAll, spentSilver } from '../systems/market';
import { STAT_LABELS } from '../ui/cardText';
import { createButton } from '../ui/button';
import { getGameData } from './gameData';
import { getSave } from './meta';

const FONT = 'system-ui, sans-serif';

function effectText(b: BuffDef): string {
  if (b.stat === 'revives') return 'Revive once per run at 50% HP';
  if (b.stat === 'rerolls') return `+${b.perLevel} level-up reroll per run`;
  const label = STAT_LABELS[b.stat] ?? b.stat;
  return b.mode === 'mult' ? `+${Math.round(b.perLevel * 100)}% ${label}` : `+${b.perLevel} ${label}`;
}

/** Village market (T31): permanent buffs for silver; refund all to try other builds. */
export class MarketScene extends Phaser.Scene {
  private root!: Phaser.GameObjects.Container;

  constructor() {
    super(SceneKeys.Market);
  }

  create(): void {
    this.root = this.add.container(0, 0);
    this.render();
    this.input.keyboard?.once('keydown-ESC', () => this.scene.start(SceneKeys.Menu));
  }

  private render(): void {
    this.root.removeAll(true);
    const data = getGameData(this);
    const save = getSave(this);
    const t = (x: number, y: number, s: string, size = 18, color: string = UiColors.text, bold = false) =>
      this.add.text(x, y, s, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: bold ? 'bold' : 'normal',
      });

    this.root.add([
      t(80, 30, 'VILLAGE MARKET', 34, UiColors.accent, true),
      t(GAME_WIDTH - 80, 38, `${save.state.silver} silver`, 24, UiColors.accent, true).setOrigin(1, 0),
      t(80, 86, 'Buff', 14, UiColors.textDim),
      t(330, 86, 'Level', 14, UiColors.textDim),
      t(450, 86, 'Next level', 14, UiColors.textDim),
      t(820, 86, 'Cost', 14, UiColors.textDim),
    ]);

    data.buffs.forEach((b, i) => {
      const y = 112 + i * 40;
      const level = buffLevel(save.state, b);
      const maxed = level >= b.maxLevel;
      this.root.add([
        t(80, y, b.name, 18, UiColors.text, true),
        t(330, y, `${level} / ${b.maxLevel}`),
        t(450, y, maxed ? 'maxed' : effectText(b), 17, maxed ? UiColors.textDim : UiColors.text),
        t(
          820,
          y,
          maxed ? '—' : `${buffCost(b, level)}`,
          18,
          canBuy(save.state, b) ? UiColors.accent : UiColors.textDim,
        ),
        createButton(
          this,
          1020,
          y + 11,
          'Buy',
          () => {
            if (buyBuff(save.state, b)) {
              save.save();
              this.render();
            }
          },
          { width: 110, fontSize: 16, enabled: !maxed && canBuy(save.state, b) },
        ),
      ]);
    });

    const spent = spentSilver(save.state, data.buffs);
    this.root.add([
      createButton(
        this,
        GAME_WIDTH / 2 - 160,
        650,
        `Refund all (${spent})`,
        () => {
          refundAll(save.state, data.buffs);
          save.save();
          this.render();
        },
        { width: 280, fontSize: 20, enabled: spent > 0 },
      ),
      createButton(this, GAME_WIDTH / 2 + 160, 650, 'Back', () => this.scene.start(SceneKeys.Menu), {
        width: 280,
        fontSize: 20,
      }),
    ]);
  }
}
