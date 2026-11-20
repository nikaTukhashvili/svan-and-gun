/**
 * Training Ground (dev tool): spawns the immortal dummies from playground.json, feeds the
 * DpsMeter from `enemy:damaged`, and draws a DPS label over each dummy.
 */
import Phaser from 'phaser';
import { u } from '../../core/math';
import type { EventBus } from '../../core/eventBus';
import type { GameEvents } from '../../core/events';
import type { GameData, PlaygroundDummyDef } from '../../data/types';
import { DpsMeter, type DpsStats } from '../../systems/dpsMeter';
import type { Enemy, EnemySystem } from '../../systems/enemies';
import { dummyEnemyDef } from '../../systems/playground';
import { Depth } from '../depth';

interface DummySlot {
  def: PlaygroundDummyDef;
  enemy: Enemy;
  uid: number;
}

/** One label per dummy kind; the pack's numbers are its members added up. */
interface DummyGroup {
  key: string;
  def: PlaygroundDummyDef;
  members: DummySlot[];
  label: Phaser.GameObjects.Text;
}

const groupKey = (id: string) => 'dummy:' + id;

/** 1234 → "1234", 12345 → "12.3k", 1234567 → "1.23M". */
export function compact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString();
}

export class Playground {
  readonly meter: DpsMeter;
  private dummies: DummySlot[] = [];
  private groups: DummyGroup[] = [];
  private readonly groupOf = new Map<number, string>();
  private refresh = 0;
  /** Called on every label refresh (the panel readout hangs off this). */
  onRefresh: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly gd: GameData,
    private readonly enemies: EnemySystem,
    bus: EventBus<GameEvents>,
    private readonly now: () => number,
  ) {
    const pg = gd.playground;
    this.meter = new DpsMeter({
      windowSec: pg.dpsWindowSec,
      idleResetSec: pg.idleResetSec,
      minSessionSec: pg.minSessionSec,
    });
    for (const d of pg.dummies) enemies.registerDef(dummyEnemyDef(d));
    // Dummies count per kind (the whole pack together); other enemies per enemy. All feed 'all'.
    bus.on('enemy:damaged', ({ uid, amount, crit, byStatus }) =>
      this.meter.record(this.groupOf.get(uid) ?? uid, amount, this.now(), crit, byStatus),
    );
    this.spawnDummies();
  }

  /** Put every dummy back at its spot and clear the meters. */
  respawn(): void {
    for (const d of this.dummies) if (d.enemy.uid === d.uid) this.enemies.release(d.enemy);
    for (const g of this.groups) g.label.destroy();
    this.dummies = [];
    this.groups = [];
    this.groupOf.clear();
    this.meter.reset();
    this.spawnDummies();
  }

  stats(key: number | string): DpsStats {
    return this.meter.stats(key, this.now());
  }

  /** For the test hook: each dummy with the numbers of its kind. */
  dummyStates(): { id: string; uid: number; alive: boolean; hp: number; maxHp: number; stats: DpsStats }[] {
    return this.dummies.map((d) => ({
      id: d.def.id,
      uid: d.uid,
      alive: d.enemy.active && d.enemy.uid === d.uid,
      hp: d.enemy.hp,
      maxHp: d.enemy.maxHp,
      stats: this.stats(groupKey(d.def.id)),
    }));
  }

  update(dt: number): void {
    for (const g of this.groups) {
      // Centred over the group, above its highest member.
      let x = 0;
      let top = Infinity;
      let n = 0;
      for (const m of g.members) {
        if (m.enemy.uid !== m.uid || !m.enemy.active) continue;
        x += m.enemy.x;
        top = Math.min(top, m.enemy.y - m.enemy.radius);
        n++;
      }
      if (n > 0) g.label.setPosition(x / n, top - 6);
    }
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = this.gd.playground.labelRefreshSec;
    for (const g of this.groups) {
      const s = this.stats(g.key);
      const name = g.members.length > 1 ? `${g.def.name} ×${g.members.length}` : g.def.name;
      g.label.setText(
        s.total > 0
          ? [name, `DPS ${compact(s.dps)} · avg ${compact(s.sessionDps)}`, `total ${compact(s.total)}`]
          : name,
      );
    }
    this.onRefresh?.();
  }

  private spawnDummies(): void {
    for (const l of this.gd.playground.layout) {
      const def = this.gd.playground.dummies.find((d) => d.id === l.dummy)!;
      const enemy = this.enemies.spawn(def.id, u(l.x), u(l.y), { minutes: 0, immortal: true });
      if (!enemy) continue;
      const slot: DummySlot = { def, enemy, uid: enemy.uid };
      this.dummies.push(slot);
      const key = groupKey(def.id);
      this.groupOf.set(enemy.uid, key);
      const group = this.groups.find((g) => g.key === key);
      if (group) {
        group.members.push(slot);
        continue;
      }
      const label = this.scene.add
        .text(enemy.x, enemy.y - enemy.radius - 6, def.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#f2e6c9',
          align: 'center',
          backgroundColor: '#00000080',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(Depth.overlay - 2);
      this.groups.push({ key, def, members: [slot], label });
    }
  }
}
