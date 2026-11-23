import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { GameData } from '../data/types';
import { itemName, rarityOf, slotName, type ChestChoice, type Equipment } from '../systems/items';
import { describeChoice, rarityCss, RARITY_COLORS } from '../ui/itemText';
import { sfxFor, type Sfx } from './audio/Sfx';
import { getGameData } from './gameData';

/** What GameScene gives the chest screen. The screen draws; the controller owns the rules. */
export interface ChestController {
  title(): string;
  /** How many more chests are queued after this one. */
  queuedAfter(): number;
  equipment(): Readonly<Equipment>;
  choices(): readonly ChestChoice[];
  /** Take choice `index` (equip or upgrade; a replaced item is salvaged into scrap). */
  pick(index: number): void;
  /** True while another chest waits to be opened. */
  hasMore(): boolean;
  close(): void;
}

const FONT = 'system-ui, sans-serif';
const CARD_W = 360;
const CARD_H = 400;
const CARD_Y = 330;
const CARD_GAP = 30;
const DOLL_Y = 612;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

/**
 * Chest (GDD: Opening a chest): the run is paused and 3 gear choices are shown, each a new item
 * (with a compare view against what is worn in that slot) or an upgrade of a worn item. Keys 1–3
 * or click. Below: what the Svan wears now.
 */
export class ChestScene extends Phaser.Scene {
  private ctl!: ChestController;
  private gd!: GameData;
  private root!: Phaser.GameObjects.Container;
  private sfx!: Sfx;

  constructor() {
    super(SceneKeys.Chest);
  }

  init(data: { controller: ChestController }): void {
    this.ctl = data.controller;
  }

  create(): void {
    this.gd = getGameData(this);
    this.sfx = sfxFor(this.game);
    this.input.setDefaultCursor('default');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('none'));
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75);
    this.root = this.add.container(0, 0);
    this.render();
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= this.ctl.choices().length) this.choose(n - 1);
    });
  }

  private render(): void {
    this.root.removeAll(true);
    const queued = this.ctl.queuedAfter();
    this.root.add(
      this.text(GAME_WIDTH / 2, 38, this.ctl.title(), 34, UiColors.accent, 'bold').setOrigin(0.5),
    );
    this.root.add(
      this.text(
        GAME_WIDTH / 2,
        80,
        'Pick one: a new item, or an upgrade for one you wear' +
          (queued > 0 ? `   ·   ${queued} more after this` : ''),
        16,
        UiColors.textDim,
      ).setOrigin(0.5),
    );

    const choices = this.ctl.choices();
    const total = choices.length * CARD_W + (choices.length - 1) * CARD_GAP;
    choices.forEach((c, i) =>
      this.drawCard(c, (GAME_WIDTH - total) / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP), i),
    );

    this.drawDoll();
    this.root.add(
      this.text(GAME_WIDTH / 2, GAME_HEIGHT - 22, '1–3 or click to choose', 15, UiColors.textDim).setOrigin(
        0.5,
      ),
    );
  }

  private drawCard(choice: ChestChoice, x: number, index: number): void {
    const t = describeChoice(this.gd, this.ctl.equipment(), choice);
    const color = RARITY_COLORS[t.rarity];
    const top = CARD_Y - CARD_H / 2;
    const bg = this.add
      .rectangle(x, CARD_Y, CARD_W, CARD_H, 0x1a1d23, 1)
      .setStrokeStyle(3, color)
      .setInteractive({ useHandCursor: true });
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => bg.setFillStyle(0x232832, 1));
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => bg.setFillStyle(0x1a1d23, 1));
    bg.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.choose(index));
    this.root.add(bg);
    this.root.add(this.text(x - CARD_W / 2 + 14, top + 12, `${index + 1}`, 16, UiColors.textDim, 'bold'));
    this.root.add(this.text(x, top + 22, t.label, 13, css(color), 'bold').setOrigin(0.5));
    this.root.add(
      this.text(x, top + 56, t.name, 22, UiColors.text, 'bold')
        .setOrigin(0.5)
        .setWordWrapWidth(CARD_W - 24)
        .setAlign('center'),
    );
    let y = top + 92;
    for (const l of t.lines) {
      const line = this.text(x, y, l.text, 15, l.color ?? UiColors.text)
        .setOrigin(0.5, 0)
        .setWordWrapWidth(CARD_W - 28)
        .setAlign('center');
      this.root.add(line);
      y += line.height + 6;
    }

    // Compare view: what this replaces (it is salvaged into scrap).
    const cmpTop = top + CARD_H - 120;
    this.root.add(
      this.add.rectangle(x, cmpTop + 56, CARD_W - 20, 108, 0x111317, 1).setStrokeStyle(1, 0x3a404b),
    );
    if (choice.kind === 'upgrade') {
      this.root.add(
        this.text(x, cmpTop + 56, 'Upgrades an item you wear', 13, UiColors.textDim).setOrigin(0.5),
      );
    } else if (t.replaces) {
      this.root.add(
        this.text(x, cmpTop + 10, `REPLACES  ${t.replaces.name}`, 12, '#ff9a8b', 'bold').setOrigin(0.5, 0),
      );
      this.root.add(
        this.text(
          x,
          cmpTop + 30,
          t.replaces.lines.join('\n') + '\n(salvaged into scrap)',
          13,
          UiColors.textDim,
        )
          .setOrigin(0.5, 0)
          .setAlign('center')
          .setWordWrapWidth(CARD_W - 32),
      );
    } else {
      this.root.add(this.text(x, cmpTop + 56, 'Empty slot', 14, '#7be08a', 'bold').setOrigin(0.5));
    }
  }

  /** What the Svan wears now, one box per paper-doll position. */
  private drawDoll(): void {
    const eq = this.ctl.equipment();
    const w = 186;
    const gap = 10;
    const total = eq.length * w + (eq.length - 1) * gap;
    eq.forEach((item, i) => {
      const x = (GAME_WIDTH - total) / 2 + w / 2 + i * (w + gap);
      const color = item ? RARITY_COLORS[rarityOf(this.gd, item)] : 0x3a404b;
      this.root.add(this.add.rectangle(x, DOLL_Y, w, 52, 0x16191e, 1).setStrokeStyle(2, color));
      this.root.add(
        this.text(x, DOLL_Y - 15, slotName(this.gd, i).toUpperCase(), 10, UiColors.textDim, 'bold').setOrigin(
          0.5,
        ),
      );
      this.root.add(
        this.text(
          x,
          DOLL_Y + 6,
          item ? `${itemName(this.gd, item.id)}  Lv ${item.level}` : 'empty',
          12,
          item ? rarityCss(rarityOf(this.gd, item)) : '#5b6270',
          item ? 'bold' : 'normal',
        )
          .setOrigin(0.5)
          .setWordWrapWidth(w - 8)
          .setAlign('center'),
      );
    });
  }

  private choose(index: number): void {
    this.sfx.play('select');
    this.ctl.pick(index);
    if (this.ctl.hasMore()) this.render();
    else {
      this.ctl.close();
      this.scene.stop();
    }
  }

  private text(
    x: number,
    y: number,
    s: string,
    size: number,
    color: string,
    style = 'normal',
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: style });
  }
}
