import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { GameData, GunDef } from '../data/types';
import type { Card, RunBuild, SupportLevels } from '../systems/build';
import { modDef, type FusionEvent } from '../systems/fusion';
import type { Pipeline } from '../systems/modPipeline';
import { barrelSlotTag, describeCard, describeEvents, modColor, modDescription, roman } from '../ui/cardText';
import { createButton } from '../ui/button';
import { getGameData } from './gameData';

/** What GameScene gives the level-up screen. The screen draws; the controller owns the rules. */
export interface LevelUpController {
  title(): string;
  /** How many more choices are queued after this one. */
  queuedAfter(): number;
  build(): Readonly<RunBuild>;
  /** Open barrel slots at the current level. */
  unlocked(): number;
  unlockLevel(slot: number): number;
  /** Barrel layout, fittings and per-slot strength for the slot view. */
  pipeline(): Pipeline;
  gun(): GunDef;
  support(): Readonly<SupportLevels>;
  cards(): Card[];
  rerollsLeft(): number;
  reroll(): void;
  /** Apply a card. A module card must come with the slot to put it in. */
  pick(card: Card, slot?: number): void;
  swap(a: number, b: number): void;
  /** What placing a fresh module in `slot` would do (place / fuse cascade / replace). */
  previewPlace(slot: number, modId: string): FusionEvent[];
  previewSwap(a: number, b: number): FusionEvent[];
  /** True while there is another choice to make. */
  hasMore(): boolean;
  close(): void;
}

const FONT = 'system-ui, sans-serif';
const CARD_W = 340;
const CARD_H = 290;
const SLOT_H = 76;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

/**
 * Level-up workbench: game paused, 3 cards, reroll, and the gun's barrel.
 * - Picking a module card enters placement: hover a slot to preview what happens (place, fuse
 *   and cascade, or replace), click to do it. Replacing asks for a second click. Esc goes back.
 * - Otherwise click a module, then another slot, to swap them (matches brought together fuse).
 */
export class LevelUpScene extends Phaser.Scene {
  private ctl!: LevelUpController;
  private gd!: GameData;
  private root!: Phaser.GameObjects.Container;
  private placing: Extract<Card, { type: 'module' }> | null = null;
  private confirmReplace: number | null = null;
  private swapFrom: number | null = null;
  private tip: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SceneKeys.LevelUp);
  }

  init(data: { controller: LevelUpController }): void {
    this.ctl = data.controller;
    this.placing = null;
    this.confirmReplace = null;
    this.swapFrom = null;
  }

  create(): void {
    this.gd = getGameData(this);
    // The run hides the OS cursor behind its crosshair; cards need a visible pointer.
    this.input.setDefaultCursor('default');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('none'));
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72);
    this.root = this.add.container(0, 0);
    this.render();

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.placing) {
        // Number keys pick a slot (1 = leftmost); a replace needs the key twice.
        const slot = Number(e.key) - 1;
        if (e.key === 'Escape') this.cancelPlacing();
        else if (slot >= 0 && slot < this.ctl.unlocked()) {
          this.clickSlot(slot);
          if (this.placing) this.hoverSlot(slot);
        }
        return;
      }
      if (e.key === 'Escape' && this.swapFrom !== null) {
        this.swapFrom = null;
        this.render();
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

    if (this.placing) {
      const t = describeCard(this.gd, this.placing);
      this.root.add(this.text(cx, 70, `Place ${t.name}`, 36, css(t.color), 'bold').setOrigin(0.5));
      this.root.add(
        this.text(cx, 190, t.body, 18, UiColors.text).setOrigin(0.5).setWordWrapWidth(900).setAlign('center'),
      );
      this.root.add(
        this.text(
          cx,
          290,
          'Hover a slot to see what happens, then click it (or press its number).  Next to a match it fuses.',
          16,
          UiColors.textDim,
        ).setOrigin(0.5),
      );
      this.root.add(
        createButton(this, cx, 360, 'Back  [Esc]', () => this.cancelPlacing(), { width: 220, fontSize: 22 }),
      );
    } else {
      this.root.add(this.text(cx, 60, this.ctl.title(), 36, UiColors.accent, 'bold').setOrigin(0.5));
      if (more > 0)
        this.root.add(this.text(cx, 98, `${more} more after this`, 16, UiColors.textDim).setOrigin(0.5));
      const cards = this.ctl.cards();
      cards.forEach((card, i) =>
        this.drawCard(card, cx + (i - (cards.length - 1) / 2) * (CARD_W + 30), 270, i),
      );
      const left = this.ctl.rerollsLeft();
      this.root.add(
        createButton(this, cx, 450, `Reroll (${left})  [R]`, () => this.doReroll(), {
          width: 260,
          fontSize: 22,
          enabled: left > 0,
        }),
      );
    }
    this.drawBarrel(585);
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
      this.text(x, top + 20, `[${index + 1}]  ${t.label}`, 13, css(t.color), 'bold').setOrigin(0.5),
      this.text(x, top + 60, t.name, 26, UiColors.text, 'bold').setOrigin(0.5),
      this.text(x, top + 98, t.body, 15, UiColors.text)
        .setOrigin(0.5, 0)
        .setWordWrapWidth(CARD_W - 36)
        .setAlign('center'),
    ]);
  }

  /**
   * The barrel: modules drawn in their colour with their tier, fittings with arrows, and each
   * slot's strength from fittings / muzzle / crit chamber (×1.4 green, ×0.5 red). Tags show the
   * gun's twist; a gap separates Double Barrel halves.
   */
  private drawBarrel(y: number): void {
    const build = this.ctl.build();
    const pipeline = this.ctl.pipeline();
    const layout = pipeline.layout;
    const open = this.ctl.unlocked();
    const n = build.barrel.length;
    const gap = 8;
    const chainGap = 34;
    const coreW = 120;
    const boxW = Math.min(
      124,
      Math.floor((GAME_WIDTH - 80 - coreW - (n - 1) * gap - (layout.chains - 1) * chainGap) / n),
    );
    const rowW = n * boxW + (n - 1) * gap + (layout.chains - 1) * chainGap;
    let x = (GAME_WIDTH - coreW - rowW) / 2;

    const hint = this.placing
      ? 'BARREL  ·  choose a slot'
      : this.swapFrom !== null
        ? 'BARREL  ·  click another slot to swap (Esc cancels)'
        : 'BARREL  ·  click a module, then another slot, to swap';
    this.root.add(this.text(x, y - 72, hint, 13, UiColors.textDim));

    build.barrel.forEach((slot, i) => {
      const cx = x + boxW / 2;
      const locked = i >= open;
      const def = slot ? modDef(this.gd, slot.id) : null;
      const color = slot ? modColor(this.gd, slot.id) : 0x3a404b;
      const selected = this.swapFrom === i || this.confirmReplace === i;
      const rect = this.add
        .rectangle(cx, y, boxW, SLOT_H, locked ? 0x15181d : slot ? color : 0x1f232b, slot ? 0.28 : 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? 0xf2b632 : locked ? 0x2a2f38 : color);
      const lines: string[] = [];
      if (locked) lines.push(`Lv ${this.ctl.unlockLevel(i)}`);
      else if (!slot || !def) lines.push('empty');
      else if (def.family === 'fitting') lines.push(def.name);
      else lines.push(def.name, roman(slot.tier));
      const label = this.text(
        cx,
        y - 6,
        lines.join('\n'),
        boxW < 110 ? 12 : 13,
        locked ? '#5b6270' : slot ? UiColors.text : UiColors.textDim,
        slot ? 'bold' : 'normal',
      )
        .setOrigin(0.5)
        .setWordWrapWidth(boxW - 8)
        .setAlign('center');
      this.root.add([rect, label]);

      const k = pipeline.strength[i] ?? 1;
      if (slot && def?.family !== 'fitting' && Math.abs(k - 1) > 1e-6) {
        this.root.add(
          this.text(
            cx,
            y + SLOT_H / 2 - 12,
            `×${Math.round(k * 100) / 100}`,
            12,
            k > 1 ? '#7be08a' : '#ff7a6b',
            'bold',
          ).setOrigin(0.5),
        );
      }
      const tag = barrelSlotTag(layout, i);
      if (tag)
        this.root.add(this.text(cx, y - SLOT_H / 2 - 12, tag, 11, UiColors.accent, 'bold').setOrigin(0.5));

      if (!locked) {
        rect.setInteractive({ useHandCursor: true });
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.hoverSlot(i));
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.showTip('', UiColors.textDim));
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.clickSlot(i));
      }
      x += boxW + gap;
      const endOfChain = (i + 1) % layout.slotsPerChain === 0 && i + 1 < layout.slots;
      if (endOfChain) x += chainGap - gap;
    });

    x += 24 - gap;
    this.root.add(this.text(x, y - 72, 'CORE', 13, UiColors.textDim));
    this.root.add(this.text(x, y - 14, `Tier ${roman(build.coreTier)}`, 20, UiColors.text, 'bold'));

    const support = this.ctl.support();
    const perks = this.gd.supportPerks.filter((p) => (support[p.id] ?? 0) > 0);
    if (perks.length > 0)
      this.root.add(
        this.text(
          GAME_WIDTH / 2,
          GAME_HEIGHT - 22,
          'Support: ' + perks.map((p) => `${p.name} ${roman(support[p.id]!)}`).join('  ·  '),
          14,
          UiColors.textDim,
        ).setOrigin(0.5),
      );
    this.tip = this.text(GAME_WIDTH / 2, y + SLOT_H / 2 + 24, '', 15, UiColors.textDim).setOrigin(0.5);
    this.root.add(this.tip);
  }

  private showTip(s: string, color: string): void {
    this.tip?.setText(s).setColor(color);
  }

  /** Placement and swap previews; otherwise the module's description. */
  private hoverSlot(i: number): void {
    const slot = this.ctl.build().barrel[i] ?? null;
    if (this.placing) {
      const events = this.ctl.previewPlace(i, this.placing.modId);
      const replace = events.some((e) => e.kind === 'replace');
      const fuse = events.some((e) => e.kind === 'fuse');
      let text = describeEvents(this.gd, events);
      if (replace) text += this.confirmReplace === i ? '   (click again to replace)' : '';
      this.showTip(text, replace ? UiColors.danger : fuse ? UiColors.accent : UiColors.text);
      return;
    }
    if (this.swapFrom !== null && this.swapFrom !== i) {
      const events = this.ctl.previewSwap(this.swapFrom, i);
      this.showTip(
        events.length ? describeEvents(this.gd, events) : 'Swap',
        events.length ? UiColors.accent : UiColors.text,
      );
      return;
    }
    if (slot) this.showTip(modDescription(this.gd, slot.id, slot.tier), UiColors.textDim);
  }

  private clickSlot(i: number): void {
    const slot = this.ctl.build().barrel[i] ?? null;
    if (this.placing) {
      const events = this.ctl.previewPlace(i, this.placing.modId);
      if (events.some((e) => e.kind === 'replace') && this.confirmReplace !== i) {
        this.confirmReplace = i; // a replace throws a module away: ask for a second click
        this.render();
        this.hoverSlot(i);
        return;
      }
      const card = this.placing;
      this.placing = null;
      this.confirmReplace = null;
      this.ctl.pick(card, i);
      this.afterPick();
      return;
    }
    if (this.swapFrom === null) {
      if (slot) this.swapFrom = i;
    } else {
      if (this.swapFrom !== i) this.ctl.swap(this.swapFrom, i);
      this.swapFrom = null;
    }
    this.render();
  }

  private choose(card: Card): void {
    if (card.type === 'module') {
      this.placing = card;
      this.confirmReplace = null;
      this.swapFrom = null;
      this.render();
      return;
    }
    this.ctl.pick(card);
    this.afterPick();
  }

  private cancelPlacing(): void {
    this.placing = null;
    this.confirmReplace = null;
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
