import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { GameData, GunDef } from '../data/types';
import type { Card, RunBuild, SlotKind } from '../systems/build';
import { isOperator, type Pipeline } from '../systems/modPipeline';
import { describeCard, modDescription, roman, slotLabel } from '../ui/cardText';
import { createButton } from '../ui/button';
import { getGameData } from './gameData';

/** What GameScene gives the level-up screen. The screen draws; the controller owns the rules. */
export interface LevelUpController {
  title(): string;
  /** How many more choices are queued after this one. */
  queuedAfter(): number;
  build(): Readonly<RunBuild>;
  unlocked(kind: SlotKind): number;
  unlockLevel(kind: SlotKind, slot: number): number;
  /** Barrel layout and operator targets for the slot view. */
  pipeline(): Pipeline;
  gun(): GunDef;
  cards(): Card[];
  rerollsLeft(): number;
  reroll(): void;
  /** Apply a card. A replace card must come with the slot to replace. */
  pick(card: Card, replaceSlot?: number): void;
  swap(a: number, b: number): void;
  /** True while there is another choice to make. */
  hasMore(): boolean;
  close(): void;
}

const FONT = 'system-ui, sans-serif';
const CARD_W = 340;
const CARD_H = 280;

/**
 * Level-up workbench (T17): game paused, 3 cards, reroll, and the gun's slots. Click two filled
 * barrel slots to swap them (slot order matters). A "replace" card asks which slot to replace.
 */
export class LevelUpScene extends Phaser.Scene {
  private ctl!: LevelUpController;
  private gd!: GameData;
  private root!: Phaser.GameObjects.Container;
  private pendingReplace: Card | null = null;
  private swapFrom: number | null = null;

  constructor() {
    super(SceneKeys.LevelUp);
  }

  init(data: { controller: LevelUpController }): void {
    this.ctl = data.controller;
    this.pendingReplace = null;
    this.swapFrom = null;
  }

  create(): void {
    this.gd = getGameData(this);
    // The run hides the OS cursor behind its crosshair; cards need a visible pointer.
    this.input.setDefaultCursor('default');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('none'));
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    this.root = this.add.container(0, 0);
    this.render();

    const kb = this.input.keyboard;
    kb?.on('keydown', (e: KeyboardEvent) => {
      if (this.pendingReplace) {
        if (e.key === 'Escape') this.cancelReplace();
        return;
      }
      const n = Number(e.key);
      const cards = this.ctl.cards();
      if (n >= 1 && n <= cards.length) this.choose(cards[n - 1]!);
      else if (e.key === 'r' || e.key === 'R') this.doReroll();
    });
  }

  private render(): void {
    this.root.removeAll(true);
    const cx = GAME_WIDTH / 2;
    const more = this.ctl.queuedAfter();
    const title = this.pendingReplace ? 'Choose the slot to replace' : this.ctl.title();
    this.root.add(this.text(cx, 70, title, 36, UiColors.accent, 'bold').setOrigin(0.5));
    if (more > 0 && !this.pendingReplace)
      this.root.add(this.text(cx, 110, `${more} more after this`, 16, UiColors.textDim).setOrigin(0.5));

    if (this.pendingReplace) {
      const t = describeCard(this.gd, this.pendingReplace);
      this.root.add(this.text(cx, 200, `${t.name}: ${t.body}`, 20, UiColors.text).setOrigin(0.5));
      this.root.add(
        createButton(this, cx, 280, 'Back', () => this.cancelReplace(), { width: 200, fontSize: 22 }),
      );
    } else {
      const cards = this.ctl.cards();
      cards.forEach((card, i) =>
        this.drawCard(card, cx + (i - (cards.length - 1) / 2) * (CARD_W + 30), 300, i),
      );
      const left = this.ctl.rerollsLeft();
      this.root.add(
        createButton(this, cx, 490, `Reroll (${left})  [R]`, () => this.doReroll(), {
          width: 260,
          fontSize: 22,
          enabled: left > 0,
        }),
      );
    }
    this.drawSlots(600);
  }

  private drawCard(card: Card, x: number, y: number, index: number): void {
    const t = describeCard(this.gd, card);
    const box = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1f232b).setStrokeStyle(3, t.color);
    box.setInteractive({ useHandCursor: true });
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => box.setFillStyle(0x2c323d));
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => box.setFillStyle(0x1f232b));
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.choose(card));
    const top = y - CARD_H / 2;
    this.root.add([
      box,
      this.text(
        x,
        top + 22,
        `[${index + 1}]  ${t.label}`,
        13,
        '#' + t.color.toString(16).padStart(6, '0'),
        'bold',
      ).setOrigin(0.5),
      this.text(x, top + 70, t.name, 26, UiColors.text, 'bold').setOrigin(0.5),
      this.text(x, top + 120, t.body, 17, UiColors.text)
        .setOrigin(0.5, 0)
        .setWordWrapWidth(CARD_W - 40)
        .setAlign('center'),
    ]);
  }

  /**
   * The gun's slots: barrel (length and chains depend on the gun), magazine and Core Tier.
   * Barrel slots swap on click; replace mode picks a slot. Tags show the gun's twist (muzzle,
   * crit chamber, left/right barrel) and arrows show what each operator changes.
   */
  private drawSlots(y: number): void {
    const build = this.ctl.build();
    const pipeline = this.ctl.pipeline();
    const layout = pipeline.layout;
    const replacing = this.pendingReplace?.type === 'newMod' ? this.pendingReplace.kind : null;
    const gap = 8;
    const groupGap = 26;
    const groups = layout.chains + 1; // barrel chains + magazine
    const total = build.barrel.length + build.magazine.length;
    const boxW = Math.min(
      140,
      Math.floor((GAME_WIDTH - 200 - (total - groups) * gap - (groups - 1) * groupGap) / total),
    );
    let x = 40;

    this.root.add(
      this.text(40, y - 62, 'BARREL (left → right)  ·  click two slots to swap', 13, UiColors.textDim),
    );

    const box = (kind: SlotKind, i: number, tag: string | null) => {
      const slots = kind === 'barrel' ? build.barrel : build.magazine;
      const slot = slots[i] ?? null;
      const open = this.ctl.unlocked(kind);
      const locked = i >= open;
      const cx = x + boxW / 2;
      const selectable =
        replacing === kind ? !locked && slot !== null : kind === 'barrel' && !locked && slot !== null;
      const selected = kind === 'barrel' && this.swapFrom === i;
      const rect = this.add
        .rectangle(cx, y, boxW, 64, locked ? 0x15181d : 0x1f232b)
        .setStrokeStyle(2, selected ? 0xf2b632 : replacing === kind && selectable ? 0xe0533d : 0x3a404b);
      let label = locked ? `Lv ${this.ctl.unlockLevel(kind, i)}` : slotLabel(this.gd, kind, slot);
      if (kind === 'barrel' && slot && isOperator(slot.id)) {
        const op = pipeline.operators.find((o) => o.slot === i);
        label += op?.target !== null && op?.target !== undefined ? '  →' : '\n(no target)';
      }
      const txt = this.text(
        cx,
        y,
        label,
        boxW < 120 ? 12 : 13,
        locked ? '#5b6270' : slot ? UiColors.text : UiColors.textDim,
      )
        .setOrigin(0.5)
        .setWordWrapWidth(boxW - 10)
        .setAlign('center');
      this.root.add([rect, txt]);
      if (tag) this.root.add(this.text(cx, y - 44, tag, 11, UiColors.accent, 'bold').setOrigin(0.5));
      if (selectable) {
        rect.setInteractive({ useHandCursor: true });
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.clickSlot(kind, i));
        if (slot) {
          const tip = modDescription(this.gd, kind, slot.id, slot.level);
          rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.showTip(tip));
          rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.showTip(''));
        }
      }
      x += boxW + gap;
    };

    build.barrel.forEach((_, i) => {
      const last = i === layout.slots - 1;
      let tag: string | null = null;
      if (layout.chains > 1 && i % layout.slotsPerChain === 0) tag = i === 0 ? 'LEFT BARREL' : 'RIGHT BARREL';
      if (last && layout.muzzleBoost > 1) tag = `MUZZLE ×${layout.muzzleBoost}`;
      if (last && layout.critChamberMult > 0) tag = `CRIT CHAMBER ×${layout.critChamberMult}`;
      box('barrel', i, tag);
      const endOfChain = (i + 1) % layout.slotsPerChain === 0 && i + 1 < layout.slots;
      if (endOfChain) x += groupGap - gap;
    });
    x += groupGap - gap;
    this.root.add(this.text(x, y - 62, 'MAGAZINE', 13, UiColors.textDim));
    build.magazine.forEach((_, i) => box('magazine', i, null));
    x += groupGap - gap;
    this.root.add(this.text(x, y - 62, 'CORE', 13, UiColors.textDim));
    this.root.add(this.text(x, y - 10, `Tier ${roman(build.coreTier)}`, 18, UiColors.text, 'bold'));
    this.tip = this.text(GAME_WIDTH / 2, y + 56, '', 15, UiColors.textDim).setOrigin(0.5);
    this.root.add(this.tip);
  }

  private tip: Phaser.GameObjects.Text | null = null;

  private showTip(s: string): void {
    this.tip?.setText(s);
  }

  private clickSlot(kind: SlotKind, i: number): void {
    if (this.pendingReplace) {
      const card = this.pendingReplace;
      this.pendingReplace = null;
      this.ctl.pick(card, i);
      this.afterPick();
      return;
    }
    if (kind !== 'barrel') return;
    if (this.swapFrom === null) this.swapFrom = i;
    else {
      if (this.swapFrom !== i) this.ctl.swap(this.swapFrom, i);
      this.swapFrom = null;
    }
    this.render();
  }

  private choose(card: Card): void {
    if (card.type === 'newMod' && card.replace) {
      this.pendingReplace = card;
      this.swapFrom = null;
      this.render();
      return;
    }
    this.ctl.pick(card);
    this.afterPick();
  }

  private cancelReplace(): void {
    this.pendingReplace = null;
    this.render();
  }

  private doReroll(): void {
    if (this.ctl.rerollsLeft() <= 0) return;
    this.ctl.reroll();
    this.render();
  }

  private afterPick(): void {
    if (this.ctl.hasMore()) {
      this.swapFrom = null;
      this.render();
    } else {
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
