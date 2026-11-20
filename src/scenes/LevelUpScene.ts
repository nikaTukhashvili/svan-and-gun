import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { GameData, GunDef } from '../data/types';
import type { Card, ModSlot, RunBuild, SupportLevels } from '../systems/build';
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
  /** Apply a card. A module card must come with the slot it was dropped on. Returns the steps. */
  pick(card: Card, slot?: number): FusionEvent[];
  /** Drag a module to another slot (move, or swap with the module there). Returns the steps. */
  move(from: number, to: number): FusionEvent[];
  /** What dropping a fresh module on `slot` would do (place / insert / merges / replace). */
  previewPlace(slot: number, modId: string): FusionEvent[];
  previewMove(from: number, to: number): FusionEvent[];
  /** True while there is another choice to make. */
  hasMore(): boolean;
  close(): void;
}

const FONT = 'system-ui, sans-serif';
const CARD_W = 340;
const CARD_H = 290;
const CARD_Y = 270;
const BARREL_Y = 585;
const SLOT_H = 76;
/** Pointer travel (px) before a press becomes a drag. */
const DRAG_START = 8;
/** Pause between merge steps, so each fusion can be seen. */
const STEP_MS = 320;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface DragBase {
  x0: number;
  y0: number;
  moved: boolean;
  ghost: Phaser.GameObjects.Container | null;
}
type Drag = (DragBase & { kind: 'card'; card: Card }) | (DragBase & { kind: 'module'; from: number });

interface SlotView {
  i: number;
  x: number;
  rect: Phaser.GameObjects.Rectangle;
  open: boolean;
}

/**
 * Level-up workbench (Colossatron-style): game paused, 3 cards, reroll, and the gun's barrel.
 * - DRAG a module card onto a barrel slot. An empty slot takes it; on a filled slot it is inserted
 *   and the others slide over. Matches that end up side by side merge at once, step by step.
 *   While dragging, the slot under the pointer shows what will happen.
 * - Drag a module in the barrel to another slot to move it (or swap with what is there).
 * - Clicking a module card (or pressing its number) also works: then click a slot or press the
 *   slot's number. Other cards apply on click. A replace (full barrel half) asks for confirmation.
 */
export class LevelUpScene extends Phaser.Scene {
  private ctl!: LevelUpController;
  private gd!: GameData;
  private root!: Phaser.GameObjects.Container;
  private placing: Extract<Card, { type: 'module' }> | null = null;
  private confirmReplace: number | null = null;
  private drag: Drag | null = null;
  private slots: SlotView[] = [];
  private hoverSlot: number | null = null;
  private animating = false;
  private tip: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(SceneKeys.LevelUp);
  }

  init(data: { controller: LevelUpController }): void {
    this.ctl = data.controller;
    this.placing = null;
    this.confirmReplace = null;
    this.drag = null;
    this.slots = [];
    this.hoverSlot = null;
    this.animating = false;
  }

  create(): void {
    this.gd = getGameData(this);
    // The run hides the OS cursor behind its crosshair; cards need a visible pointer.
    this.input.setDefaultCursor('default');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.setDefaultCursor('none'));
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72);
    this.root = this.add.container(0, 0);
    this.render();

    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e));
  }

  // ---------- drawing ----------

  /** Redraw everything. `barrel` overrides the build's barrel (merge animation steps). */
  private render(barrel?: readonly (ModSlot | null)[], flashAt: number | null = null): void {
    this.root.removeAll(true);
    const cx = GAME_WIDTH / 2;

    if (this.animating) {
      this.root.add(this.text(cx, 200, 'FUSING', 44, UiColors.accent, 'bold').setOrigin(0.5));
    } else if (this.placing) {
      const t = describeCard(this.gd, this.placing);
      this.root.add(this.text(cx, 70, `Place ${t.name}`, 36, css(t.color), 'bold').setOrigin(0.5));
      this.root.add(
        this.text(cx, 190, t.body, 18, UiColors.text).setOrigin(0.5).setWordWrapWidth(900).setAlign('center'),
      );
      this.root.add(
        this.text(
          cx,
          290,
          'Click a slot (or press its number). On a filled slot it is inserted and the others slide over.',
          16,
          UiColors.textDim,
        ).setOrigin(0.5),
      );
      this.root.add(
        createButton(this, cx, 360, 'Back  [Esc]', () => this.cancelPlacing(), { width: 220, fontSize: 22 }),
      );
    } else {
      const more = this.ctl.queuedAfter();
      this.root.add(this.text(cx, 60, this.ctl.title(), 36, UiColors.accent, 'bold').setOrigin(0.5));
      if (more > 0)
        this.root.add(this.text(cx, 98, `${more} more after this`, 16, UiColors.textDim).setOrigin(0.5));
      const cards = this.ctl.cards();
      cards.forEach((card, i) =>
        this.drawCard(card, cx + (i - (cards.length - 1) / 2) * (CARD_W + 30), CARD_Y, i),
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
    this.drawBarrel(barrel ?? this.ctl.build().barrel, flashAt);
  }

  private drawCard(card: Card, x: number, y: number, index: number): void {
    const t = describeCard(this.gd, card);
    const box = this.add.rectangle(x, y, CARD_W, CARD_H, 0x1f232b).setStrokeStyle(3, t.color);
    box.setInteractive({ useHandCursor: true });
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => box.setFillStyle(0x2c323d));
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => box.setFillStyle(0x1f232b));
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.animating) return;
      this.drag = { kind: 'card', card, x0: p.x, y0: p.y, moved: false, ghost: null };
    });
    const top = y - CARD_H / 2;
    const hint = card.type === 'module' ? 'drag onto the barrel' : 'click to take';
    this.root.add([
      box,
      this.text(x, top + 20, `[${index + 1}]  ${t.label}`, 13, css(t.color), 'bold').setOrigin(0.5),
      this.text(x, top + 60, t.name, 26, UiColors.text, 'bold').setOrigin(0.5),
      this.text(x, top + 98, t.body, 15, UiColors.text)
        .setOrigin(0.5, 0)
        .setWordWrapWidth(CARD_W - 36)
        .setAlign('center'),
      this.text(x, y + CARD_H / 2 - 18, hint, 12, UiColors.textDim).setOrigin(0.5),
    ]);
  }

  /**
   * The barrel: modules in their colour with their tier, fittings by name, each slot's strength
   * from fittings / muzzle / crit chamber (×1.4 green, ×0.5 red), the gun's twist tags, and a gap
   * between Double Barrel halves.
   */
  private drawBarrel(barrel: readonly (ModSlot | null)[], flashAt: number | null): void {
    const build = this.ctl.build();
    const pipeline = this.ctl.pipeline();
    const layout = pipeline.layout;
    const open = this.ctl.unlocked();
    const n = barrel.length;
    const gap = 8;
    const chainGap = 34;
    const coreW = 120;
    const boxW = Math.min(
      124,
      Math.floor((GAME_WIDTH - 80 - coreW - (n - 1) * gap - (layout.chains - 1) * chainGap) / n),
    );
    const rowW = n * boxW + (n - 1) * gap + (layout.chains - 1) * chainGap;
    let x = (GAME_WIDTH - coreW - rowW) / 2;
    const y = BARREL_Y;
    this.slots = [];

    this.root.add(
      this.text(x, y - 72, 'BARREL  ·  drag modules here, or between slots', 13, UiColors.textDim),
    );
    barrel.forEach((slot, i) => {
      const cx = x + boxW / 2;
      const locked = i >= open;
      const def = slot ? modDef(this.gd, slot.id) : null;
      const color = slot ? modColor(this.gd, slot.id) : 0x3a404b;
      const selected = this.confirmReplace === i;
      const rect = this.add
        .rectangle(cx, y, boxW, SLOT_H, locked ? 0x15181d : slot ? color : 0x1f232b, slot ? 0.28 : 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? 0xe0533d : locked ? 0x2a2f38 : color);
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

      const k = barrel === build.barrel ? (pipeline.strength[i] ?? 1) : 1;
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

      if (flashAt === i) this.flash(cx, y, boxW, label);
      if (!locked) {
        rect.setInteractive({ useHandCursor: true });
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
          if (!this.drag) this.showSlotInfo(i);
        });
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
          if (!this.drag && this.confirmReplace === null) this.showTip('', UiColors.textDim);
        });
        rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
          if (this.animating) return;
          if (slot && !this.placing)
            this.drag = { kind: 'module', from: i, x0: p.x, y0: p.y, moved: false, ghost: null };
          else this.clickSlot(i); // placement mode, or an empty slot
        });
      }
      this.slots.push({ i, x: cx, rect, open: !locked });
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
    this.tip = this.text(GAME_WIDTH / 2, y + SLOT_H / 2 + 24, '', 16, UiColors.textDim, 'bold').setOrigin(
      0.5,
    );
    this.root.add(this.tip);
  }

  /** A merge: white flash over the slot and the label pops. */
  private flash(x: number, y: number, w: number, label: Phaser.GameObjects.Text): void {
    const glow = this.add.rectangle(x, y, w, SLOT_H, 0xffffff, 0.85);
    this.root.add(glow);
    this.tweens.add({ targets: glow, alpha: 0, duration: STEP_MS, ease: 'Quad.easeOut' });
    label.setScale(1.5);
    this.tweens.add({ targets: label, scale: 1, duration: STEP_MS, ease: 'Back.easeOut' });
  }

  private showTip(s: string, color: string): void {
    this.tip?.setText(s).setColor(color);
  }

  private showSlotInfo(i: number): void {
    if (this.placing) {
      this.showPreview(this.ctl.previewPlace(i, this.placing.modId), i);
      return;
    }
    const slot = this.ctl.build().barrel[i] ?? null;
    this.showTip(slot ? modDescription(this.gd, slot.id, slot.tier) : '', UiColors.textDim);
  }

  private showPreview(events: FusionEvent[], slot: number): void {
    const replace = events.some((e) => e.kind === 'replace');
    const fuse = events.some((e) => e.kind === 'fuse');
    let text = describeEvents(this.gd, events);
    if (replace) text += this.confirmReplace === slot ? '   (click again to replace)' : '   (replaces it)';
    this.showTip(text, replace ? UiColors.danger : fuse ? UiColors.accent : UiColors.text);
  }

  // ---------- input ----------

  private slotAt(x: number, y: number): number | null {
    if (Math.abs(y - BARREL_Y) > SLOT_H / 2 + 10 || this.slots.length < 2) return null;
    const half = Math.abs(this.slots[1]!.x - this.slots[0]!.x) / 2;
    for (const s of this.slots) if (s.open && Math.abs(x - s.x) <= half) return s.i;
    return null;
  }

  private dragModId(d: Drag): string | null {
    if (d.kind === 'card') return d.card.type === 'module' ? d.card.modId : null;
    return this.ctl.build().barrel[d.from]?.id ?? null;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(p.x - d.x0, p.y - d.y0) < DRAG_START) return;
      const modId = this.dragModId(d);
      if (!modId) return; // only module cards and barrel modules can be dragged
      d.moved = true;
      d.ghost = this.makeGhost(modId);
    }
    d.ghost?.setPosition(p.x, p.y - 56); // above the pointer, so the slot under it stays readable
    const over = this.slotAt(p.x, p.y);
    if (over === this.hoverSlot) return;
    if (this.hoverSlot !== null) this.highlight(this.hoverSlot, false);
    this.hoverSlot = over;
    if (over === null) {
      this.showTip('', UiColors.textDim);
      return;
    }
    this.highlight(over, true);
    if (d.kind === 'card' && d.card.type === 'module')
      this.showPreview(this.ctl.previewPlace(over, d.card.modId), over);
    else if (d.kind === 'module') {
      const merges = this.ctl.previewMove(d.from, over).filter((e) => e.kind !== 'move');
      const text = merges.length ? describeEvents(this.gd, merges) : over === d.from ? '' : 'Move here';
      this.showTip(text, merges.length ? UiColors.accent : UiColors.text);
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost?.destroy();
    if (this.hoverSlot !== null) this.highlight(this.hoverSlot, false);
    this.hoverSlot = null;
    if (this.animating) return;

    if (!d.moved) {
      // A plain click.
      if (d.kind === 'card') this.choose(d.card);
      else this.showSlotInfo(d.from);
      return;
    }
    const slot = this.slotAt(p.x, p.y);
    if (slot === null) {
      this.showTip('', UiColors.textDim);
      return;
    }
    if (d.kind === 'card' && d.card.type === 'module') this.dropCard(d.card, slot);
    else if (d.kind === 'module' && slot !== d.from)
      this.play(this.ctl.move(d.from, slot), () => this.render());
  }

  private onKey(e: KeyboardEvent): void {
    if (this.animating) return;
    if (this.placing) {
      // Number keys pick a slot (1 = leftmost); a replace needs the key twice.
      const slot = Number(e.key) - 1;
      if (e.key === 'Escape') this.cancelPlacing();
      else if (slot >= 0 && slot < this.ctl.unlocked()) this.clickSlot(slot);
      return;
    }
    const n = Number(e.key);
    const cards = this.ctl.cards();
    if (n >= 1 && n <= cards.length) this.choose(cards[n - 1]!);
    else if (e.key === 'r' || e.key === 'R') this.doReroll();
  }

  private makeGhost(modId: string): Phaser.GameObjects.Container {
    const def = modDef(this.gd, modId);
    const g = this.add.container(0, 0, [
      this.add.rectangle(0, 0, 118, 58, modColor(this.gd, modId), 0.85).setStrokeStyle(2, 0xffffff),
      this.text(0, 0, def.name, 13, '#ffffff', 'bold').setOrigin(0.5),
    ]);
    return g.setDepth(10).setAlpha(0.9);
  }

  private highlight(i: number, on: boolean): void {
    const s = this.slots.find((v) => v.i === i);
    if (!s) return;
    const slot = this.ctl.build().barrel[i];
    s.rect.setStrokeStyle(on ? 4 : 2, on ? 0xf2b632 : slot ? modColor(this.gd, slot.id) : 0x3a404b);
  }

  // ---------- actions ----------

  /** A module card dropped (or clicked into place) on a slot. A replace asks for a second go. */
  private dropCard(card: Extract<Card, { type: 'module' }>, slot: number): void {
    const preview = this.ctl.previewPlace(slot, card.modId);
    if (preview.some((e) => e.kind === 'replace') && this.confirmReplace !== slot) {
      this.placing = card; // continue in click mode: click (or press) the same slot again
      this.confirmReplace = slot;
      this.render();
      this.showPreview(preview, slot);
      return;
    }
    this.placing = null;
    this.confirmReplace = null;
    this.play(this.ctl.pick(card, slot), () => this.afterPick());
  }

  private clickSlot(i: number): void {
    if (this.placing) this.dropCard(this.placing, i);
    else this.showSlotInfo(i);
  }

  /** Show each step (the module landing, then one merge at a time with a flash), then `done`. */
  private play(steps: FusionEvent[], done: () => void): void {
    const merges = steps.filter((e) => e.kind === 'fuse');
    if (merges.length === 0) {
      done();
      return;
    }
    this.animating = true;
    const landing = steps.find((e) => e.kind !== 'fuse');
    this.render(landing ? landing.after : undefined, null);
    merges.forEach((ev, n) => {
      this.time.delayedCall(STEP_MS * (n + 1), () => {
        if (ev.kind === 'fuse') this.render(ev.after, ev.at);
      });
    });
    this.time.delayedCall(STEP_MS * (merges.length + 1) + 120, () => {
      this.animating = false;
      done();
    });
  }

  private choose(card: Card): void {
    if (card.type === 'module') {
      this.placing = card;
      this.confirmReplace = null;
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
