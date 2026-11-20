/**
 * Training Ground panel (dev tool): a plain HTML panel docked to the left of the game
 * (the dummies stand to the right of the player).
 * Set the gun, every slot (mod + level + order), Core Tier and perks; reset things; spawn enemies;
 * read the DPS meter. It only talks to a PlaygroundController, never to Phaser.
 *
 * Only dropdowns, buttons and checkboxes, and each control gives focus back after a change,
 * so WASD and other keys keep going to the game.
 */
import type { GameData, Rarity } from '../data/types';
import type { ModSlot, RunBuild, SlotKind } from '../systems/build';
import type { DpsStats } from '../systems/dpsMeter';
import type { BarrelLayout, OperatorInfo } from '../systems/modPipeline';
import { barrelSlotTag, modDescription, modName } from '../ui/cardText';

export interface PlaygroundController {
  readonly data: GameData;
  gunId(): string;
  build(): Readonly<RunBuild>;
  layout(): BarrelLayout;
  operators(): readonly OperatorInfo[];
  /** Times each perk was taken. */
  perkCounts(): Readonly<Record<string, number>>;
  setGun(id: string): void;
  setSlot(kind: SlotKind, index: number, slot: ModSlot | null): void;
  swap(kind: SlotKind, a: number, b: number): void;
  setCoreTier(tier: number): void;
  addPerk(cardId: string, rarity: Rarity): void;
  resetBuild(): void;
  resetPerks(): void;
  resetMeters(): void;
  respawnDummies(): void;
  clearEnemies(): void;
  spawnEnemies(id: string, count: number, elite: boolean): void;
  godMode(): boolean;
  setGodMode(on: boolean): void;
  marketBuffs(): boolean;
  setMarketBuffs(on: boolean): void;
  /** All targets together. */
  readout(): DpsStats;
}

const STYLE_ID = 'svan-playground-style';
const CSS = `
#svan-playground {
  position: fixed; top: 8px; left: 8px; bottom: 8px; width: 330px; overflow-y: auto;
  background: rgba(17, 19, 23, 0.94); color: #e8e6e3; border: 1px solid #3a404b; border-radius: 6px;
  font: 12px/1.35 system-ui, sans-serif; padding: 8px 10px; z-index: 10; cursor: default;
  box-sizing: border-box;
}
#svan-playground.hidden { display: none; }
#svan-playground h2 { font-size: 14px; margin: 0 0 6px; color: #f2b632; }
#svan-playground h3 { font-size: 11px; margin: 10px 0 4px; color: #9aa0a6; text-transform: uppercase; letter-spacing: .04em; }
#svan-playground .row { display: flex; gap: 4px; align-items: center; margin: 2px 0; }
#svan-playground .tag { font-size: 10px; color: #f2b632; font-weight: bold; margin: 4px 0 0; }
#svan-playground .dim { color: #9aa0a6; }
#svan-playground select, #svan-playground button {
  background: #1f232b; color: #e8e6e3; border: 1px solid #3a404b; border-radius: 3px;
  font: inherit; padding: 2px 4px; cursor: pointer;
}
#svan-playground select.mod { flex: 1; min-width: 0; }
#svan-playground button:hover, #svan-playground select:hover { border-color: #f2b632; }
#svan-playground button:disabled { opacity: .35; cursor: default; }
#svan-playground .grid { display: grid; grid-template-columns: 1fr auto auto auto auto; gap: 2px 4px; align-items: center; }
#svan-playground .readout { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; font-family: monospace; }
#svan-playground .readout b { color: #f2b632; font-weight: normal; }
#svan-playground .buttons { display: flex; flex-wrap: wrap; gap: 4px; }
`;

type Attrs = Record<string, string>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString());

export class PlaygroundPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly readoutBox: HTMLDivElement;

  constructor(private readonly ctl: PlaygroundController) {
    if (!document.getElementById(STYLE_ID)) {
      document.head.append(el('style', { id: STYLE_ID }, CSS));
    }
    this.root = el('div', { id: 'svan-playground', 'data-testid': 'playground-panel' });
    this.readoutBox = el('div', { class: 'readout', 'data-testid': 'playground-readout' });
    this.body = el('div');
    this.root.append(
      el('h2', {}, 'Training Ground'),
      el('div', { class: 'dim' }, 'F2 hides this panel · Esc pauses'),
      el('h3', {}, 'Damage (all targets)'),
      this.readoutBox,
      this.body,
    );
    // Keep game keys working: never leave focus inside the panel.
    this.root.addEventListener('change', (e) => (e.target as HTMLElement).blur());
    this.root.addEventListener('click', (e) => {
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    });
    document.body.append(this.root);
    this.render();
    this.refreshReadout();
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  toggle(): void {
    this.root.classList.toggle('hidden');
  }

  destroy(): void {
    this.root.remove();
  }

  refreshReadout(): void {
    if (!this.visible) return;
    const s = this.ctl.readout();
    const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0) + '%';
    const rows: [string, string][] = [
      ['DPS now', fmt(s.dps)],
      ['Session avg', fmt(s.sessionDps)],
      ['Peak', fmt(s.peakDps)],
      ['Total', fmt(s.total)],
      ['Session', s.sessionSec.toFixed(1) + ' s'],
      ['Hits', String(s.hits)],
      ['Crits', `${s.crits} (${pct(s.crits, s.hits)})`],
      ['Status dmg', `${fmt(s.statusDamage)} (${pct(s.statusDamage, s.total)})`],
    ];
    this.readoutBox.replaceChildren(
      ...rows.flatMap(([k, v]) => [el('span', {}, k), el('b', { 'data-stat': k }, v)]),
    );
  }

  /** Rebuild everything below the readout (after any build change). */
  render(): void {
    const d = this.ctl.data;
    const build = this.ctl.build();
    const sections: Node[] = [];

    // Gun
    const gunSel = this.select(
      d.guns.map((g) => [g.id, g.name]),
      this.ctl.gunId(),
      (v) => this.ctl.setGun(v),
    );
    gunSel.dataset.testid = 'playground-gun';
    sections.push(el('h3', {}, 'Gun'), el('div', { class: 'row' }, gunSel));

    // Slots
    sections.push(el('h3', {}, 'Barrel (left → right)'), ...this.slotRows('barrel', build.barrel));
    sections.push(el('h3', {}, 'Magazine'), ...this.slotRows('magazine', build.magazine));

    // Core Tier
    const tiers = Array.from({ length: d.config.slots.maxCoreTier }, (_, i) => String(i + 1));
    const tierSel = this.select(
      tiers.map((t) => [t, `Core Tier ${t}`]),
      String(build.coreTier),
      (v) => this.ctl.setCoreTier(Number(v)),
    );
    sections.push(el('div', { class: 'row' }, tierSel));

    // Perks
    const counts = this.ctl.perkCounts();
    const grid = el('div', { class: 'grid' });
    for (const rs of d.cards.runStats) {
      const n = counts[rs.id] ?? 0;
      grid.append(el('span', { title: rs.stat }, rs.name), el('span', { class: 'dim' }, n ? `×${n}` : ''));
      for (const rarity of ['common', 'rare', 'epic'] as const) {
        const b = this.button(`+${rarity[0]!.toUpperCase()}`, () => this.ctl.addPerk(rs.id, rarity));
        b.title = `${rarity}: ${rs.mode === 'mult' ? '+' + Math.round(rs.values[rarity] * 100) + '%' : '+' + rs.values[rarity]} ${rs.stat}`;
        grid.append(b);
      }
    }
    sections.push(el('h3', {}, 'Perks'), grid);

    // Reset and world
    sections.push(
      el('h3', {}, 'Reset'),
      el(
        'div',
        { class: 'buttons' },
        this.button('Reset build', () => this.ctl.resetBuild(), 'playground-reset-build'),
        this.button('Reset perks', () => this.ctl.resetPerks()),
        this.button('Reset meters', () => this.ctl.resetMeters(), 'playground-reset-meters'),
        this.button('Respawn dummies', () => this.ctl.respawnDummies()),
        this.button('Clear enemies', () => this.ctl.clearEnemies()),
      ),
    );

    const enemySel = this.select(
      d.enemies.map((e) => [e.id, e.name]),
      d.enemies[0]!.id,
      () => {},
    );
    const countSel = this.select(
      ['1', '5', '10', '25'].map((c) => [c, `× ${c}`]),
      '5',
      () => {},
    );
    const elite = el('input', { type: 'checkbox' });
    sections.push(
      el('h3', {}, 'Enemies'),
      el(
        'div',
        { class: 'row' },
        enemySel,
        countSel,
        el('label', {}, elite, ' elite'),
        this.button('Spawn', () =>
          this.ctl.spawnEnemies(enemySel.value, Number(countSel.value), elite.checked),
        ),
      ),
    );

    sections.push(
      el('h3', {}, 'Options'),
      this.checkbox('God mode', this.ctl.godMode(), (on) => this.ctl.setGodMode(on)),
      this.checkbox('Market buffs (from the save)', this.ctl.marketBuffs(), (on) =>
        this.ctl.setMarketBuffs(on),
      ),
    );

    this.body.replaceChildren(...sections);
  }

  private slotRows(kind: SlotKind, slots: readonly (ModSlot | null)[]): Node[] {
    const d = this.ctl.data;
    const mods = kind === 'barrel' ? d.barrelMods : d.magazineMods;
    const layout = this.ctl.layout();
    const ops = this.ctl.operators();
    const levels = Array.from({ length: d.config.slots.maxModLevel }, (_, i) => String(i + 1));
    const out: Node[] = [];

    slots.forEach((slot, i) => {
      if (kind === 'barrel') {
        const tag = barrelSlotTag(layout, i);
        if (tag) out.push(el('div', { class: 'tag' }, tag));
      }
      const modSel = this.select(
        [['', '— empty —'], ...mods.map((m): [string, string] => [m.id, m.name])],
        slot?.id ?? '',
        (v) => this.ctl.setSlot(kind, i, v ? { id: v, level: slot?.level ?? 1 } : null),
      );
      modSel.classList.add('mod');
      modSel.dataset.testid = `playground-${kind}-${i}`;
      if (slot) modSel.title = modDescription(d, kind, slot.id, slot.level);

      const lvlSel = this.select(
        levels.map((l) => [l, 'Lv ' + l]),
        String(slot?.level ?? 1),
        (v) => slot && this.ctl.setSlot(kind, i, { id: slot.id, level: Number(v) }),
      );
      lvlSel.disabled = !slot;

      const up = this.button('↑', () => this.ctl.swap(kind, i, i - 1));
      up.disabled = i === 0;
      const down = this.button('↓', () => this.ctl.swap(kind, i, i + 1));
      down.disabled = i === slots.length - 1;

      const row = el('div', { class: 'row' }, modSel, lvlSel, up, down);
      const op = kind === 'barrel' ? ops.find((o) => o.slot === i) : undefined;
      if (op) {
        const target = op.target === null ? null : slots[op.target];
        const note = target ? `→ ${modName(d, 'barrel', target.id)}` : 'no target';
        row.append(el('span', { class: 'dim', title: 'operator' }, note));
      }
      out.push(row);
    });
    return out;
  }

  private select(
    options: [string, string][],
    value: string,
    onChange: (v: string) => void,
  ): HTMLSelectElement {
    const s = el('select');
    for (const [v, label] of options) s.append(el('option', { value: v }, label));
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  private button(label: string, onClick: () => void, testId?: string): HTMLButtonElement {
    const b = el('button', { type: 'button' }, label);
    if (testId) b.dataset.testid = testId;
    b.addEventListener('click', onClick);
    return b;
  }

  private checkbox(label: string, checked: boolean, onChange: (on: boolean) => void): HTMLElement {
    const box = el('input', { type: 'checkbox' });
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked));
    return el('label', { class: 'row' }, box, label);
  }
}
