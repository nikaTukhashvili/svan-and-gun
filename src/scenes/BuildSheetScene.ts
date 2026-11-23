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

/** One equipment slot on the paper doll; `item` is null while the slot is empty. */
export interface EquipmentView {
  slot: string;
  /** `color`: rarity colour (CSS); `detail`: "Lv 4 · Magic". */
  item: { name: string; color: string; detail: string } | null;
}

export interface BuildSheetData {
  /** Items worn, one line each with their stats (GDD: Gear). */
  gear: SheetLine[];
  /** Tinker picks. */
  tinker: SheetLine[];
  /** Support perks (magazine work). */
  support: SheetLine[];
  stats: SheetLine[];
  equipment: EquipmentView[];
  gun: { name: string; build: RunBuild; layout: BarrelLayout; strength: number[] };
  close: () => void;
}

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

    this.title(450, 90, 'STATS (base → now)');
    this.column(450, 118, this.sheet.stats, '', 10);

    this.title(800, 90, 'GEAR');
    const gearEnd = this.column(800, 114, this.sheet.gear, 'Nothing yet: open chests.', 4, 13, 450);
    this.title(800, gearEnd + 12, 'TINKER');
    const tinkerEnd = this.column(800, gearEnd + 36, this.sheet.tinker, 'None yet.', 4, 13, 450);
    this.title(800, tinkerEnd + 12, 'MAGAZINE WORK');
    this.column(800, tinkerEnd + 36, this.sheet.support, 'None yet.', 4, 13, 450);

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

    const w = 130;
    const h = 70;
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
      const e = items[i];
      if (!e) return;
      const color = e.item ? parseInt(e.item.color.slice(1), 16) : 0x3a404b;
      this.add.rectangle(x, y, w, h, 0x16191e, 1).setStrokeStyle(2, color);
      this.text(x, y - h / 2 + 8, e.slot.toUpperCase(), 10, UiColors.textDim, 'bold').setOrigin(0.5);
      this.text(
        x,
        y + 2,
        e.item ? e.item.name : 'empty',
        12,
        e.item ? UiColors.text : '#5b6270',
        e.item ? 'bold' : 'normal',
      )
        .setOrigin(0.5)
        .setWordWrapWidth(w - 8)
        .setAlign('center');
      if (e.item) this.text(x, y + h / 2 - 9, e.item.detail, 10, e.item.color).setOrigin(0.5);
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

  /** Lines one under another (`gap` px between them, wrapped at `wrap`); returns the y below the last. */
  private column(
    x: number,
    y: number,
    lines: SheetLine[],
    empty: string,
    gap: number,
    size = 15,
    wrap = 0,
  ): number {
    const all = lines.length === 0 ? (empty ? [{ text: empty, color: UiColors.textDim }] : []) : lines;
    for (const l of all) {
      const t = this.text(x, y, l.text, size, l.color ?? UiColors.text);
      if (wrap > 0) t.setWordWrapWidth(wrap);
      y += t.height + gap;
    }
    return y;
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
