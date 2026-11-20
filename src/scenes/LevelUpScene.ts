import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { GameData, GunDef } from '../data/types';
import type { Card, ModSlot, RunBuild, SupportLevels } from '../systems/build';
import { modDef, type FusionEvent } from '../systems/fusion';
import type { Pipeline } from '../systems/modPipeline';
import { isMuzzleId, muzzleDef, type MuzzleEvent } from '../systems/muzzle';
import {
  barrelSlotTag,
  describeCard,
  describeEvents,
  describeMuzzleEvent,
  modColor,
  modDescription,
  muzzleColor,
  muzzleDescription,
  muzzleEffects,
  roman,
} from '../ui/cardText';
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
  /**
   * Apply a card. A module card must come with the barrel slot it was dropped on, a muzzle card
   * with the muzzle slot. Returns the barrel steps (empty for everything but module cards).
   */
  pick(card: Card, slot?: number): FusionEvent[];
  /** Drag a module to another slot (move, or swap with the module there). Returns the steps. */
  move(from: number, to: number): FusionEvent[];
  /** What dropping a fresh module on `slot` would do (place / insert / merges / replace). */
  previewPlace(slot: number, modId: string): FusionEvent[];
  previewMove(from: number, to: number): FusionEvent[];
  /** What dropping a muzzle card on muzzle slot `slot` would do (fit / upgrade / replace). */
  previewMuzzle(slot: number, muzzleId: string): MuzzleEvent;
  /** Drag a muzzle piece to another muzzle slot (move or swap). */
  moveMuzzle(from: number, to: number): void;
  /** True while there is another choice to make. */
  hasMore(): boolean;
  close(): void;
  /**
   * Workbench mode (Training Ground): instead of 3 cards, every module and muzzle id here can be
   * dragged onto the gun as often as wanted, and the screen stays open until closed (Esc / Done).
   */
  palette?(): readonly string[];
  /** Workbench mode: a module dragged off the gun is removed. */
  remove?(slot: number): void;
  /** Workbench mode: a muzzle piece dragged off the gun is removed. */
  removeMuzzle?(slot: number): void;
}

/** Where a slot is: in the barrel or the muzzle. */
export type SlotKind = 'barrel' | 'muzzle';
interface SlotRef {
  kind: SlotKind;
  i: number;
}

type PlaceCard = Extract<Card, { type: 'module' | 'muzzle' }>;

const FONT = 'system-ui, sans-serif';
const CARD_W = 340;
const CARD_H = 290;
const CARD_Y = 270;
const BARREL_Y = 585;
const SLOT_H = 76;
const CORE_W = 92;
const MUZZLE_W = 84;
const MUZZLE_GAP = 6;
/** Space between the core, the barrel and the muzzle. */
const PART_GAP = 22;
/** Pointer travel (px) before a press becomes a drag. */
const DRAG_START = 8;
/** Workbench palette chips. */
const CHIP_W = 150;
const CHIP_H = 46;
/** Pause between merge steps, so each fusion can be seen. */
const STEP_MS = 320;
const EMPTY_STROKE = 0x3a404b;
const MUZZLE_FILL = 0x262a31;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');
const same = (a: SlotRef | null, b: SlotRef | null) => !!a && !!b && a.kind === b.kind && a.i === b.i;

interface DragBase {
  x0: number;
  y0: number;
  moved: boolean;
  ghost: Phaser.GameObjects.Container | null;
}
type Drag =
  | (DragBase & { kind: 'card'; card: Card })
  | (DragBase & { kind: 'module'; from: number })
  | (DragBase & { kind: 'piece'; from: number });

interface SlotView extends SlotRef {
  x: number;
  w: number;
  rect: Phaser.GameObjects.Rectangle;
  open: boolean;
}

/**
 * Level-up workbench (Colossatron-style): game paused, 3 cards, reroll, and the gun: core, barrel
 * and muzzle.
 * - DRAG a module card onto a barrel slot. An empty slot takes it; on a filled slot it is inserted
 *   and the others slide over. Matches that end up side by side merge at once, step by step.
 *   While dragging, the slot under the pointer shows what will happen.
 * - DRAG a muzzle card onto a muzzle slot: empty = fit, the same piece = upgrade, another piece =
 *   replace (asks for confirmation).
 * - Drag a module (or muzzle piece) to another slot of its row to move it (or swap).
 * - Clicking a module or muzzle card (or pressing its number) also works: then click a slot or
 *   press the slot's number. Other cards apply on click. A replace asks for confirmation.
 * - Workbench mode (Training Ground, `controller.palette`): a palette of every module and muzzle
 *   piece instead of cards, no limit, drag something off the gun to remove it, Esc / Done closes.
 */
export class LevelUpScene extends Phaser.Scene {
  private ctl!: LevelUpController;
  private gd!: GameData;
  private root!: Phaser.GameObjects.Container;
  private placing: PlaceCard | null = null;
  private confirmReplace: SlotRef | null = null;
  private drag: Drag | null = null;
  private slots: SlotView[] = [];
  private hoverSlot: SlotRef | null = null;
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

  /** Slot centres in game coordinates (e2e tests drag onto them). */
  slotCenters(): { y: number; barrel: number[]; muzzle: number[] } {
    const xs = (kind: SlotKind) => this.slots.filter((s) => s.kind === kind).map((s) => s.x);
    return { y: BARREL_Y, barrel: xs('barrel'), muzzle: xs('muzzle') };
  }

  // ---------- drawing ----------

  /**
   * Redraw everything. `barrel` overrides the build's barrel (merge animation steps); `flash`
   * flashes one slot (a merge or a muzzle upgrade).
   */
  private render(barrel?: readonly (ModSlot | null)[], flash: SlotRef | null = null): void {
    this.root.removeAll(true);
    const cx = GAME_WIDTH / 2;

    if (this.animating) {
      this.root.add(this.text(cx, 200, 'FUSING', 44, UiColors.accent, 'bold').setOrigin(0.5));
    } else if (this.placing) {
      const t = describeCard(this.gd, this.placing);
      const where = this.placing.type === 'muzzle' ? 'a muzzle slot' : 'a slot';
      const how =
        this.placing.type === 'muzzle'
          ? 'On the same piece it upgrades it; on another piece it replaces it.'
          : 'On a filled slot it is inserted and the others slide over.';
      this.root.add(this.text(cx, 70, `Place ${t.name}`, 36, css(t.color), 'bold').setOrigin(0.5));
      this.root.add(
        this.text(cx, 190, t.body, 18, UiColors.text).setOrigin(0.5).setWordWrapWidth(900).setAlign('center'),
      );
      this.root.add(
        this.text(cx, 300, `Click ${where} (or press its number). ${how}`, 16, UiColors.textDim).setOrigin(
          0.5,
        ),
      );
      this.root.add(
        createButton(this, cx, 370, 'Back  [Esc]', () => this.cancelPlacing(), { width: 220, fontSize: 22 }),
      );
    } else if (this.ctl.palette) {
      this.drawPalette(this.ctl.palette());
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
    this.drawGun(barrel ?? this.ctl.build().barrel, flash);
  }

  /** Workbench: every module and muzzle piece as a draggable chip, grouped, plus Done. */
  private drawPalette(ids: readonly string[]): void {
    const cx = GAME_WIDTH / 2;
    this.root.add(this.text(cx, 40, 'Workbench', 32, UiColors.accent, 'bold').setOrigin(0.5));
    this.root.add(
      this.text(
        cx,
        76,
        'Drag modules onto the barrel and pieces onto the muzzle (as many as you like)  ·  drag one off the gun to remove it',
        15,
        UiColors.textDim,
      ).setOrigin(0.5),
    );
    const group = (id: string) => (isMuzzleId(this.gd, id) ? 'muzzle' : modDef(this.gd, id).family);
    let y = 110;
    for (const g of ['element', 'hybrid', 'grey', 'fitting', 'muzzle'] as const) {
      const row = ids.filter((id) => group(id) === g);
      if (row.length === 0) continue;
      const gap = 10;
      const w = row.length * CHIP_W + (row.length - 1) * gap;
      row.forEach((id, i) => this.drawChip(id, cx - w / 2 + CHIP_W / 2 + i * (CHIP_W + gap), y + CHIP_H / 2));
      y += CHIP_H + 12;
    }
    this.root.add(
      createButton(this, cx, 425, 'Done  [Esc]', () => this.closeScreen(), { width: 220, fontSize: 22 }),
    );
  }

  private drawChip(id: string, x: number, y: number): void {
    const muzzle = isMuzzleId(this.gd, id);
    const color = muzzle ? muzzleColor(this.gd, id) : modColor(this.gd, id);
    const name = muzzle ? muzzleDef(this.gd, id).name : modDef(this.gd, id).name;
    const chip = this.add.rectangle(x, y, CHIP_W, CHIP_H, color, 0.3).setStrokeStyle(2, color);
    chip.setInteractive({ useHandCursor: true });
    chip.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.drag)
        this.showTip(
          muzzle ? muzzleDescription(this.gd, id) : modDescription(this.gd, id, 1),
          UiColors.textDim,
        );
    });
    chip.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.animating) return;
      const card: Card = muzzle
        ? { type: 'muzzle', muzzleId: id, owned: false }
        : { type: 'module', modId: id, family: modDef(this.gd, id).family, fuses: false };
      this.drag = { kind: 'card', card, x0: p.x, y0: p.y, moved: false, ghost: null };
    });
    this.root.add([chip, this.text(x, y, name, 14, UiColors.text, 'bold').setOrigin(0.5)]);
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
    const hint =
      card.type === 'module'
        ? 'drag onto the barrel'
        : card.type === 'muzzle'
          ? 'drag onto the muzzle'
          : 'click to take';
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
   * The gun, left to right: the Core (tier), the barrel (modules in their colour with their tier,
   * fittings by name, each slot's strength from fittings / crit chamber, the gun's twist tags, a
   * gap between Double Barrel halves) and the muzzle slots.
   */
  private drawGun(barrel: readonly (ModSlot | null)[], flash: SlotRef | null): void {
    const build = this.ctl.build();
    const pipeline = this.ctl.pipeline();
    const layout = pipeline.layout;
    const open = this.ctl.unlocked();
    const n = barrel.length;
    const m = build.muzzle.length;
    const gap = 8;
    const chainGap = 34;
    const muzzleRowW = m * MUZZLE_W + Math.max(0, m - 1) * MUZZLE_GAP;
    const boxW = Math.min(
      124,
      Math.floor(
        (GAME_WIDTH -
          60 -
          CORE_W -
          2 * PART_GAP -
          muzzleRowW -
          (n - 1) * gap -
          (layout.chains - 1) * chainGap) /
          n,
      ),
    );
    const rowW = n * boxW + (n - 1) * gap + (layout.chains - 1) * chainGap;
    const total = CORE_W + PART_GAP + rowW + PART_GAP + muzzleRowW;
    const y = BARREL_Y;
    let x = (GAME_WIDTH - total) / 2;
    this.slots = [];

    // Core
    this.root.add([
      this.add.rectangle(x + CORE_W / 2, y, CORE_W, SLOT_H, 0x1a1d23).setStrokeStyle(2, 0x5b6270),
      this.text(x + CORE_W / 2, y - 12, 'CORE', 12, UiColors.textDim, 'bold').setOrigin(0.5),
      this.text(x + CORE_W / 2, y + 12, `Tier ${roman(build.coreTier)}`, 18, UiColors.text, 'bold').setOrigin(
        0.5,
      ),
    ]);
    x += CORE_W + PART_GAP;

    // Barrel
    this.root.add(
      this.text(x, y - 72, 'BARREL  ·  drag modules here, or between slots', 13, UiColors.textDim),
    );
    barrel.forEach((slot, i) => {
      const cx = x + boxW / 2;
      const locked = i >= open;
      const def = slot ? modDef(this.gd, slot.id) : null;
      const color = slot ? modColor(this.gd, slot.id) : EMPTY_STROKE;
      const selected = same(this.confirmReplace, { kind: 'barrel', i });
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

      if (same(flash, { kind: 'barrel', i })) this.flash(cx, y, boxW, label);
      if (!locked) this.makeSlotInteractive(rect, { kind: 'barrel', i }, !!slot);
      this.slots.push({ kind: 'barrel', i, x: cx, w: boxW, rect, open: !locked });
      x += boxW + gap;
      const endOfChain = (i + 1) % layout.slotsPerChain === 0 && i + 1 < layout.slots;
      if (endOfChain) x += chainGap - gap;
    });
    x += PART_GAP - gap;

    // Muzzle
    this.root.add(this.text(x, y - 72, 'MUZZLE', 13, UiColors.textDim));
    build.muzzle.forEach((piece, i) => {
      const cx = x + MUZZLE_W / 2;
      const color = piece ? muzzleColor(this.gd, piece.id) : EMPTY_STROKE;
      const selected = same(this.confirmReplace, { kind: 'muzzle', i });
      const rect = this.add
        .rectangle(cx, y, MUZZLE_W, SLOT_H, piece ? color : MUZZLE_FILL, piece ? 0.28 : 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? 0xe0533d : color);
      const label = this.text(
        cx,
        y,
        piece ? `${muzzleDef(this.gd, piece.id).name}\n${roman(piece.level)}` : 'empty',
        12,
        piece ? UiColors.text : UiColors.textDim,
        piece ? 'bold' : 'normal',
      )
        .setOrigin(0.5)
        .setWordWrapWidth(MUZZLE_W - 8)
        .setAlign('center');
      this.root.add([rect, label]);
      if (same(flash, { kind: 'muzzle', i })) this.flash(cx, y, MUZZLE_W, label);
      this.makeSlotInteractive(rect, { kind: 'muzzle', i }, !!piece);
      this.slots.push({ kind: 'muzzle', i, x: cx, w: MUZZLE_W, rect, open: true });
      x += MUZZLE_W + MUZZLE_GAP;
    });

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

  private makeSlotInteractive(rect: Phaser.GameObjects.Rectangle, ref: SlotRef, filled: boolean): void {
    rect.setInteractive({ useHandCursor: true });
    rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.drag) this.showSlotInfo(ref);
    });
    rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (!this.drag && this.confirmReplace === null) this.showTip('', UiColors.textDim);
    });
    rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      if (this.animating) return;
      if (filled && !this.placing) {
        const base = { from: ref.i, x0: p.x, y0: p.y, moved: false, ghost: null };
        this.drag = ref.kind === 'barrel' ? { kind: 'module', ...base } : { kind: 'piece', ...base };
      } else this.clickSlot(ref); // placement mode, or an empty slot
    });
  }

  /** A merge or an upgrade: white flash over the slot and the label pops. */
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

  private showSlotInfo(ref: SlotRef): void {
    const build = this.ctl.build();
    if (this.placing) {
      if (this.placing.type === 'muzzle' && ref.kind === 'muzzle')
        this.showMuzzlePreview(this.ctl.previewMuzzle(ref.i, this.placing.muzzleId), ref.i);
      else if (this.placing.type === 'module' && ref.kind === 'barrel')
        this.showPreview(this.ctl.previewPlace(ref.i, this.placing.modId), ref.i);
      else this.showWrongRow(this.placing.type);
      return;
    }
    if (ref.kind === 'barrel') {
      const slot = build.barrel[ref.i] ?? null;
      this.showTip(slot ? modDescription(this.gd, slot.id, slot.tier) : '', UiColors.textDim);
      return;
    }
    const piece = build.muzzle[ref.i] ?? null;
    const total = muzzleEffects(this.ctl.pipeline().muzzle);
    const sum = [...total.up, ...total.down].join(', ');
    const own = piece ? muzzleDescription(this.gd, piece.id, piece.level) : 'Empty muzzle slot';
    this.showTip(sum ? `${own}      Muzzle total: ${sum}` : own, UiColors.textDim);
  }

  private showWrongRow(type: PlaceCard['type']): void {
    this.showTip(
      type === 'muzzle' ? 'Muzzle pieces go in the muzzle slots' : 'Barrel modules go in the barrel',
      UiColors.danger,
    );
  }

  private showPreview(events: FusionEvent[], slot: number): void {
    const replace = events.some((e) => e.kind === 'replace');
    const fuse = events.some((e) => e.kind === 'fuse');
    let text = describeEvents(this.gd, events);
    if (replace)
      text += same(this.confirmReplace, { kind: 'barrel', i: slot })
        ? '   (click again to replace)'
        : '   (replaces it)';
    this.showTip(text, replace ? UiColors.danger : fuse ? UiColors.accent : UiColors.text);
  }

  private showMuzzlePreview(ev: MuzzleEvent, slot: number): void {
    let text = describeMuzzleEvent(this.gd, ev);
    if (ev.kind === 'replace')
      text += same(this.confirmReplace, { kind: 'muzzle', i: slot }) ? '   (click again to replace)' : '';
    this.showTip(
      text,
      ev.kind === 'replace' ? UiColors.danger : ev.kind === 'upgrade' ? UiColors.accent : UiColors.text,
    );
  }

  // ---------- input ----------

  private slotAt(x: number, y: number): SlotRef | null {
    if (Math.abs(y - BARREL_Y) > SLOT_H / 2 + 10) return null;
    for (const s of this.slots)
      if (s.open && Math.abs(x - s.x) <= s.w / 2 + 4) return { kind: s.kind, i: s.i };
    return null;
  }

  /** What is being dragged, for the ghost: name and colour. Null = not draggable (other cards). */
  private dragLook(d: Drag): { name: string; color: number } | null {
    const build = this.ctl.build();
    if (d.kind === 'card') {
      if (d.card.type === 'module')
        return { name: modDef(this.gd, d.card.modId).name, color: modColor(this.gd, d.card.modId) };
      if (d.card.type === 'muzzle')
        return {
          name: muzzleDef(this.gd, d.card.muzzleId).name,
          color: muzzleColor(this.gd, d.card.muzzleId),
        };
      return null;
    }
    if (d.kind === 'module') {
      const s = build.barrel[d.from];
      return s ? { name: modDef(this.gd, s.id).name, color: modColor(this.gd, s.id) } : null;
    }
    const s = build.muzzle[d.from];
    return s ? { name: muzzleDef(this.gd, s.id).name, color: muzzleColor(this.gd, s.id) } : null;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved) {
      if (Math.hypot(p.x - d.x0, p.y - d.y0) < DRAG_START) return;
      const look = this.dragLook(d);
      if (!look) return; // only module / muzzle cards and fitted pieces can be dragged
      d.moved = true;
      d.ghost = this.makeGhost(look.name, look.color);
    }
    d.ghost?.setPosition(p.x, p.y - 56); // above the pointer, so the slot under it stays readable
    const over = this.slotAt(p.x, p.y);
    if (same(over, this.hoverSlot) || (!over && !this.hoverSlot)) return;
    if (this.hoverSlot) this.highlight(this.hoverSlot, false);
    this.hoverSlot = over;
    if (!over) {
      this.showTip('', UiColors.textDim);
      return;
    }
    this.highlight(over, true);
    if (d.kind === 'card' && (d.card.type === 'module' || d.card.type === 'muzzle')) {
      const card = d.card;
      if (card.type === 'module' && over.kind === 'barrel')
        this.showPreview(this.ctl.previewPlace(over.i, card.modId), over.i);
      else if (card.type === 'muzzle' && over.kind === 'muzzle')
        this.showMuzzlePreview(this.ctl.previewMuzzle(over.i, card.muzzleId), over.i);
      else this.showWrongRow(card.type);
    } else if (d.kind === 'module') {
      if (over.kind !== 'barrel') return this.showWrongRow('module');
      const merges = this.ctl.previewMove(d.from, over.i).filter((e) => e.kind !== 'move');
      const text = merges.length ? describeEvents(this.gd, merges) : over.i === d.from ? '' : 'Move here';
      this.showTip(text, merges.length ? UiColors.accent : UiColors.text);
    } else if (d.kind === 'piece') {
      if (over.kind !== 'muzzle') return this.showWrongRow('muzzle');
      this.showTip(over.i === d.from ? '' : 'Move here', UiColors.text);
    }
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost?.destroy();
    if (this.hoverSlot) this.highlight(this.hoverSlot, false);
    this.hoverSlot = null;
    if (this.animating) return;

    if (!d.moved) {
      // A plain click.
      if (d.kind === 'card') this.choose(d.card);
      else this.showSlotInfo({ kind: d.kind === 'module' ? 'barrel' : 'muzzle', i: d.from });
      return;
    }
    const over = this.slotAt(p.x, p.y);
    if (!over) {
      // Workbench: something dragged off the gun (up, away from it) is removed.
      if (p.y < BARREL_Y - SLOT_H) {
        if (d.kind === 'module' && this.ctl.remove) {
          this.ctl.remove(d.from);
          this.render();
          return;
        }
        if (d.kind === 'piece' && this.ctl.removeMuzzle) {
          this.ctl.removeMuzzle(d.from);
          this.render();
          return;
        }
      }
      this.showTip('', UiColors.textDim);
      return;
    }
    if (d.kind === 'card' && (d.card.type === 'module' || d.card.type === 'muzzle'))
      this.dropCard(d.card, over);
    else if (d.kind === 'module' && over.kind === 'barrel' && over.i !== d.from)
      this.play(this.ctl.move(d.from, over.i), () => this.render());
    else if (d.kind === 'piece' && over.kind === 'muzzle' && over.i !== d.from) {
      this.ctl.moveMuzzle(d.from, over.i);
      this.render();
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (this.animating) return;
    if (this.placing) {
      // Number keys pick a slot of the card's row (1 = leftmost); a replace needs the key twice.
      const i = Number(e.key) - 1;
      const muzzle = this.placing.type === 'muzzle';
      const count = muzzle ? this.ctl.build().muzzle.length : this.ctl.unlocked();
      if (e.key === 'Escape') this.cancelPlacing();
      else if (i >= 0 && i < count) this.clickSlot({ kind: muzzle ? 'muzzle' : 'barrel', i });
      return;
    }
    if (this.ctl.palette) {
      if (e.key === 'Escape') this.closeScreen();
      return;
    }
    const n = Number(e.key);
    const cards = this.ctl.cards();
    if (n >= 1 && n <= cards.length) this.choose(cards[n - 1]!);
    else if (e.key === 'r' || e.key === 'R') this.doReroll();
  }

  private makeGhost(name: string, color: number): Phaser.GameObjects.Container {
    const g = this.add.container(0, 0, [
      this.add.rectangle(0, 0, 118, 58, color, 0.85).setStrokeStyle(2, 0xffffff),
      this.text(0, 0, name, 13, '#ffffff', 'bold').setOrigin(0.5),
    ]);
    return g.setDepth(10).setAlpha(0.9);
  }

  private highlight(ref: SlotRef, on: boolean): void {
    const s = this.slots.find((v) => same(v, ref));
    if (!s) return;
    const build = this.ctl.build();
    let base = EMPTY_STROKE;
    if (ref.kind === 'barrel') {
      const slot = build.barrel[ref.i];
      if (slot) base = modColor(this.gd, slot.id);
    } else {
      const piece = build.muzzle[ref.i];
      if (piece) base = muzzleColor(this.gd, piece.id);
    }
    s.rect.setStrokeStyle(on ? 4 : 2, on ? 0xf2b632 : base);
  }

  // ---------- actions ----------

  /** A module or muzzle card dropped (or clicked into place) on a slot. A replace asks for a second go. */
  private dropCard(card: PlaceCard, ref: SlotRef): void {
    if ((card.type === 'muzzle') !== (ref.kind === 'muzzle')) {
      this.showWrongRow(card.type);
      return;
    }
    if (card.type === 'muzzle') {
      const ev = this.ctl.previewMuzzle(ref.i, card.muzzleId);
      if (ev.kind === 'replace' && !same(this.confirmReplace, ref)) {
        this.askConfirm(card, ref);
        this.showMuzzlePreview(ev, ref.i);
        return;
      }
      this.placing = null;
      this.confirmReplace = null;
      this.ctl.pick(card, ref.i);
      if (ev.kind === 'upgrade') this.playFlash(ref, () => this.afterPick());
      else this.afterPick();
      return;
    }
    const preview = this.ctl.previewPlace(ref.i, card.modId);
    if (preview.some((e) => e.kind === 'replace') && !same(this.confirmReplace, ref)) {
      this.askConfirm(card, ref);
      this.showPreview(preview, ref.i);
      return;
    }
    this.placing = null;
    this.confirmReplace = null;
    this.play(this.ctl.pick(card, ref.i), () => this.afterPick());
  }

  /** Continue in click mode: click (or press) the same slot again to confirm the replace. */
  private askConfirm(card: PlaceCard, ref: SlotRef): void {
    this.placing = card;
    this.confirmReplace = ref;
    this.render();
  }

  private clickSlot(ref: SlotRef): void {
    if (this.placing) this.dropCard(this.placing, ref);
    else this.showSlotInfo(ref);
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
        if (ev.kind === 'fuse') this.render(ev.after, { kind: 'barrel', i: ev.at });
      });
    });
    this.time.delayedCall(STEP_MS * (merges.length + 1) + 120, () => {
      this.animating = false;
      done();
    });
  }

  /** A muzzle upgrade: flash the slot once, then `done`. */
  private playFlash(ref: SlotRef, done: () => void): void {
    this.render(undefined, ref);
    this.animating = true; // after the render: no FUSING banner for an upgrade
    this.time.delayedCall(STEP_MS + 80, () => {
      this.animating = false;
      done();
    });
  }

  private choose(card: Card): void {
    if (card.type === 'module' || card.type === 'muzzle') {
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
    else this.closeScreen();
  }

  private closeScreen(): void {
    this.ctl.close();
    this.scene.stop();
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
