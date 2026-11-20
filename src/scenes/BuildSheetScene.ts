import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import type { RunBuild } from '../systems/build';
import { modDef } from '../systems/fusion';
import type { BarrelLayout } from '../systems/modPipeline';
import { muzzleDef } from '../systems/muzzle';
import { barrelSlotTag, modColor, muzzleColor, roman } from '../ui/cardText';
import { getGameData } from './gameData';

/** One line on the sheet. `color` is a CSS colour; defaults to the normal text colour. */
export interface SheetLine {
  text: string;
  color?: string;
}

/** One equipment slot on the paper doll. `item` stays null until the item system exists. */
export interface EquipmentView {
  slot: string;
  item: { name: string; color: string } | null;
}

export interface BuildSheetData {
  /** Blessings and Tinker picks. */
  perks: SheetLine[];
  /** Support perks (magazine work). */
  support: SheetLine[];
  stats: SheetLine[];
  equipment: EquipmentView[];
  gun: { name: string; build: RunBuild; layout: BarrelLayout; strength: number[] };
  close: () => void;
}

/**
 * The equipment slots, in paper-doll order (GDD: Gear). Shown empty until items are built; the item
 * system will fill `BuildSheetData.equipment`.
 */
export const EQUIPMENT_SLOTS = ['Svan Hat', 'Cloak', 'Chokha', 'Ring', 'Ring', 'Boots'] as const;

const FONT = 'system-ui, sans-serif';
const GUN_Y = 610;
const GUN_H = 64;

/**
 * Build sheet (C during a run): what the Svan wears (equipment paper doll), stats against base
 * values, blessings and magazine work, and the gun drawn as core → barrel → muzzle. The run is
 * paused while it is open; C or Esc closes it.
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

    this.text(GAME_WIDTH / 2, 40, 'BUILD', 34, UiColors.accent, 'bold').setOrigin(0.5);

    this.drawEquipment(230, 100);

    this.title(470, 90, 'STATS (base → now)');
    this.column(470, 118, this.sheet.stats, '', 26);

    this.title(850, 90, 'BLESSINGS AND TINKER');
    const perksEnd = this.column(850, 118, this.sheet.perks, 'None yet.', 22);
    this.title(850, perksEnd + 18, 'MAGAZINE WORK');
    this.column(850, perksEnd + 46, this.sheet.support, 'None yet.', 22);

    this.drawGun();

    this.text(GAME_WIDTH / 2, GAME_HEIGHT - 24, 'C or Esc to close', 15, UiColors.textDim).setOrigin(0.5);

    const close = () => {
      this.scene.stop();
      this.sheet.close();
    };
    this.input.keyboard?.once('keydown-C', close);
    this.input.keyboard?.once('keydown-ESC', close);
  }

  /** Paper doll: a figure with the six equipment slots around it. */
  private drawEquipment(cx: number, top: number): void {
    this.title(cx - 190, top - 10, 'EQUIPMENT');
    // The figure, faint, behind the slots.
    const g = this.add.graphics();
    g.fillStyle(0x2a2f38, 1);
    g.fillCircle(cx, top + 92, 24); // head
    g.fillRoundedRect(cx - 34, top + 122, 68, 110, 10); // body
    g.fillRect(cx - 30, top + 232, 22, 92); // legs
    g.fillRect(cx + 8, top + 232, 22, 92);

    const w = 120;
    const h = 58;
    const at: [number, number][] = [
      [cx, top + 40], // Svan Hat
      [cx - 125, top + 150], // Cloak
      [cx + 125, top + 150], // Chokha
      [cx - 125, top + 240], // Ring
      [cx + 125, top + 240], // Ring
      [cx, top + 350], // Boots
    ];
    const items = this.sheet.equipment;
    at.forEach(([x, y], i) => {
      const e = items[i] ?? { slot: EQUIPMENT_SLOTS[i] ?? '', item: null };
      const color = e.item ? parseInt(e.item.color.slice(1), 16) : 0x3a404b;
      this.add.rectangle(x, y, w, h, e.item ? color : 0x16191e, e.item ? 0.3 : 1).setStrokeStyle(2, color);
      this.text(x, y - 13, e.slot.toUpperCase(), 11, UiColors.textDim, 'bold').setOrigin(0.5);
      this.text(
        x,
        y + 8,
        e.item ? e.item.name : 'empty',
        13,
        e.item ? UiColors.text : '#5b6270',
        e.item ? 'bold' : 'normal',
      )
        .setOrigin(0.5)
        .setWordWrapWidth(w - 8)
        .setAlign('center');
    });
  }

  /** The gun as on the level-up screen, without interaction: core → barrel → muzzle. */
  private drawGun(): void {
    const gd = getGameData(this);
    const { name, build, layout, strength } = this.sheet.gun;
    const n = build.barrel.length;
    const m = build.muzzle.length;
    const coreW = 84;
    const muzzleW = 80;
    const gap = 6;
    const partGap = 18;
    const chainGap = 26;
    const muzzleRowW = m * muzzleW + Math.max(0, m - 1) * gap;
    const boxW = Math.min(
      110,
      Math.floor(
        (GAME_WIDTH -
          80 -
          coreW -
          2 * partGap -
          muzzleRowW -
          (n - 1) * gap -
          (layout.chains - 1) * chainGap) /
          n,
      ),
    );
    const rowW = n * boxW + (n - 1) * gap + (layout.chains - 1) * chainGap;
    let x = (GAME_WIDTH - (coreW + partGap + rowW + partGap + muzzleRowW)) / 2;
    const y = GUN_Y;

    this.title(x, y - GUN_H / 2 - 44, `GUN  ·  ${name}`);
    const box = (
      cx: number,
      w: number,
      fill: number,
      alpha: number,
      stroke: number,
      label: string,
      dim = false,
    ) => {
      this.add.rectangle(cx, y, w, GUN_H, fill, alpha).setStrokeStyle(2, stroke);
      return this.text(cx, y, label, 12, dim ? '#5b6270' : UiColors.text, dim ? 'normal' : 'bold')
        .setOrigin(0.5)
        .setWordWrapWidth(w - 6)
        .setAlign('center');
    };

    box(x + coreW / 2, coreW, 0x1a1d23, 1, 0x5b6270, `CORE\nTier ${roman(build.coreTier)}`);
    x += coreW + partGap;

    this.text(x, y - GUN_H / 2 - 18, 'BARREL', 11, UiColors.textDim, 'bold');
    build.barrel.forEach((slot, i) => {
      const cx = x + boxW / 2;
      if (slot) {
        const def = modDef(gd, slot.id);
        const c = modColor(gd, slot.id);
        box(cx, boxW, c, 0.28, c, def.family === 'fitting' ? def.name : `${def.name}\n${roman(slot.tier)}`);
        const k = strength[i] ?? 1;
        if (def.family !== 'fitting' && Math.abs(k - 1) > 1e-6)
          this.text(
            cx,
            y + GUN_H / 2 + 10,
            `×${Math.round(k * 100) / 100}`,
            11,
            k > 1 ? '#7be08a' : '#ff7a6b',
            'bold',
          ).setOrigin(0.5);
      } else box(cx, boxW, 0x16191e, 1, 0x2a2f38, 'empty', true);
      const tag = barrelSlotTag(layout, i);
      if (tag) this.text(cx, y - GUN_H / 2 - 8, tag, 10, UiColors.accent, 'bold').setOrigin(0.5);
      x += boxW + gap;
      if ((i + 1) % layout.slotsPerChain === 0 && i + 1 < layout.slots) x += chainGap - gap;
    });
    x += partGap - gap;

    this.text(x, y - GUN_H / 2 - 18, 'MUZZLE', 11, UiColors.textDim, 'bold');
    build.muzzle.forEach((piece) => {
      const cx = x + muzzleW / 2;
      if (piece) {
        const c = muzzleColor(gd, piece.id);
        box(cx, muzzleW, c, 0.28, c, `${muzzleDef(gd, piece.id).name}\n${roman(piece.level)}`);
      } else box(cx, muzzleW, 0x262a31, 1, 0x3a404b, 'empty', true);
      x += muzzleW + gap;
    });
  }

  private title(x: number, y: number, s: string): Phaser.GameObjects.Text {
    return this.text(x, y, s, 14, UiColors.textDim, 'bold');
  }

  /** Lines one under another; returns the y below the last line. */
  private column(x: number, y: number, lines: SheetLine[], empty: string, step: number): number {
    if (lines.length === 0) {
      if (empty) this.text(x, y, empty, 15, UiColors.textDim);
      return y + step;
    }
    lines.forEach((l, i) => this.text(x, y + i * step, l.text, 15, l.color ?? UiColors.text));
    return y + lines.length * step;
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
