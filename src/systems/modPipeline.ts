/**
 * ModPipeline: turns the build's slots into behaviour.
 *
 * Barrel rules (GDD: Barrel):
 *  1. the Core makes the base ShotSpecs (WeaponSystem);
 *  2. onFire mods transform them in slot order (Twin Shot, Long Rifling, Piercing Bore, Heavy Slug);
 *  3. on hit, effects from slot >= the bullet's `fromSlot` run left to right;
 *  4. a bullet made by a mod (Split Shot shard, Ricochet bounce) only carries LATER slots;
 *  5. an OPERATOR (Amplifier, Hammer Spring, Death Trigger, Echo Chamber) changes only the slot
 *     directly to its right. Next to an empty slot or another operator it does nothing, so
 *     operators never stack.
 *
 * Gun twists (guns.json > barrel):
 *  - chains: the barrel is split into separate chains; trigger pulls alternate between them
 *    (Double Barrel: two chains of 3). An operator never reaches across into the other chain.
 *  - muzzleBoost: the last barrel slot works that many times as strong (Long Gun).
 *  - critChamberMult: the last barrel slot is a crit chamber: it works only on crit bullets, that
 *    many times as strong (Scrap SMG).
 *
 * The pellet rule still holds: on-hit mods trigger once per enemy per volley (firstOfVolley).
 */
import { degToRad, u } from '../core/math';
import type { BarrelModDef, GameData, GunDef } from '../data/types';
import type { Bullet, BulletSystem } from './bullets';
import type { RunBuild } from './build';
import type { Enemy, EnemySystem, HitHandler } from './enemies';
import type { LightningArc, StatusEffectSystem } from './status';
import type { ShotSpec } from './weapon';

/** Multipliers the build applies to the Core's numbers. */
export interface WeaponMods {
  fireRateMult: number;
  magMult: number;
  reloadMult: number;
  lastRoundMult: number;
}

export const NO_WEAPON_MODS: WeaponMods = { fireRateMult: 1, magMult: 1, reloadMult: 1, lastRoundMult: 1 };

export interface MagazineEffects {
  grenade: { damage: number; radius: number; throwRange: number; fuseSec: number } | null;
  shockReload: { radius: number; knockback: number } | null;
  scavengerChance: number;
}

export type Condition = { kind: 'always' } | { kind: 'everyNth'; n: number } | { kind: 'onKill' };

/** A non-operator barrel mod at its slot, with what operators and the gun's twist do to it. */
export type SlotMod<D extends BarrelModDef = BarrelModDef> = D extends BarrelModDef
  ? {
      slot: number;
      chain: number;
      id: D['id'];
      p: D['levels'][number];
      /** Strength multiplier from Amplifier, Hammer Spring, Death Trigger, muzzle or crit chamber. */
      k: number;
      cond: Condition;
      /** Crit chamber: only crit bullets use this slot. */
      critOnly: boolean;
      echo: { delaySec: number; strength: number } | null;
    }
  : never;

/** An operator at its slot, and the slot it changes (null = no valid target). */
export interface OperatorInfo {
  slot: number;
  id: string;
  target: number | null;
}

export interface BarrelLayout {
  slots: number;
  chains: number;
  slotsPerChain: number;
  muzzleBoost: number;
  critChamberMult: number;
}

export interface Pipeline {
  layout: BarrelLayout;
  barrel: SlotMod[];
  operators: OperatorInfo[];
  weaponMods: WeaponMods;
  magazine: MagazineEffects;
}

const OPERATORS = new Set(['amplifier', 'every_nth', 'on_kill', 'echo']);
const ON_FIRE = new Set(['twin_shot', 'long_rifling', 'piercing_bore', 'heavy_slug']);

export const isOperator = (id: string): boolean => OPERATORS.has(id);

export function layoutOf(gun: GunDef | null, barrelSlots: number): BarrelLayout {
  const b = gun?.barrel ?? { slots: barrelSlots, chains: 1, muzzleBoost: 1, critChamberMult: 0 };
  const slots = barrelSlots;
  const chains = Math.max(1, Math.min(b.chains, slots));
  return {
    slots,
    chains,
    slotsPerChain: Math.ceil(slots / chains),
    muzzleBoost: b.muzzleBoost,
    critChamberMult: b.critChamberMult,
  };
}

export const chainOfSlot = (layout: BarrelLayout, slot: number): number =>
  Math.floor(slot / layout.slotsPerChain);

export function buildPipeline(data: GameData, build: RunBuild, gun: GunDef | null = null): Pipeline {
  const layout = layoutOf(gun, build.barrel.length);
  const defOf = (id: string) => {
    const def = data.barrelMods.find((m) => m.id === id);
    if (!def) throw new Error(`Unknown barrel mod ${id}`);
    return def;
  };

  // Operators first: each points at the slot to its right, if that is a real mod in the same chain.
  const operators: OperatorInfo[] = [];
  const opAt = new Map<number, BarrelModDef & { lv: number }>();
  build.barrel.forEach((slot, i) => {
    if (!slot || !isOperator(slot.id)) return;
    const next = build.barrel[i + 1];
    const sameChain = i + 1 < layout.slots && chainOfSlot(layout, i + 1) === chainOfSlot(layout, i);
    const target = sameChain && next && !isOperator(next.id) ? i + 1 : null;
    operators.push({ slot: i, id: slot.id, target });
    if (target !== null) opAt.set(target, { ...defOf(slot.id), lv: slot.level });
  });

  const barrel: SlotMod[] = [];
  build.barrel.forEach((slot, i) => {
    if (!slot || isOperator(slot.id)) return;
    const def = defOf(slot.id);
    let k = 1;
    let cond: Condition = { kind: 'always' };
    let echo: SlotMod['echo'] = null;
    const op = opAt.get(i);
    if (op) {
      const p = op.levels[op.lv - 1] as Record<string, number>;
      if (op.id === 'amplifier') k *= p.mult!;
      else if (op.id === 'every_nth') {
        cond = { kind: 'everyNth', n: p.n! };
        k *= p.mult!;
      } else if (op.id === 'on_kill') {
        cond = { kind: 'onKill' };
        k *= p.mult!;
      } else if (op.id === 'echo') echo = { delaySec: p.delaySec!, strength: p.strength! };
    }
    const last = i === layout.slots - 1;
    if (last && layout.muzzleBoost > 1) k *= layout.muzzleBoost;
    const critOnly = last && layout.critChamberMult > 0;
    if (critOnly) k *= layout.critChamberMult;
    barrel.push({
      slot: i,
      chain: chainOfSlot(layout, i),
      id: def.id,
      p: def.levels[slot.level - 1],
      k,
      cond,
      critOnly,
      echo,
    } as SlotMod);
  });

  const weaponMods: WeaponMods = { ...NO_WEAPON_MODS };
  for (const m of barrel) if (m.id === 'heavy_slug') weaponMods.fireRateMult *= 1 - m.p.fireRatePenalty;

  const magazine: MagazineEffects = { grenade: null, shockReload: null, scavengerChance: 0 };
  for (const slot of build.magazine) {
    if (!slot) continue;
    const def = data.magazineMods.find((m) => m.id === slot.id);
    if (!def) throw new Error(`Unknown magazine mod ${slot.id}`);
    const lv = slot.level - 1;
    switch (def.id) {
      case 'extended_mag':
        weaponMods.magMult *= 1 + def.levels[lv]!.magBonus;
        break;
      case 'quick_hands':
        weaponMods.reloadMult *= 1 - def.levels[lv]!.reloadReduction;
        break;
      case 'last_round':
        weaponMods.lastRoundMult = def.levels[lv]!.damageMult;
        break;
      case 'grenade_mag':
        magazine.grenade = { ...def.levels[lv]! };
        break;
      case 'shock_reload':
        magazine.shockReload = { ...def.levels[lv]! };
        break;
      case 'scavenger':
        magazine.scavengerChance = def.levels[lv]!.chance;
        break;
    }
  }
  return { layout, barrel, operators, weaponMods, magazine };
}

/**
 * Does this slot work for a shot/hit? `killed` is null for onFire (Death Trigger never fires
 * there), else whether the hit killed the enemy.
 */
export function slotActive(m: SlotMod, volleyId: number, crit: boolean, killed: boolean | null): boolean {
  if (m.critOnly && !crit) return false;
  if (m.cond.kind === 'everyNth' && volleyId % m.cond.n !== 0) return false;
  if (m.cond.kind === 'onKill' && killed !== true) return false;
  return true;
}

/** Which chain a trigger pull uses: chains alternate shot by shot (Double Barrel). */
export const chainForVolley = (layout: BarrelLayout, volleyId: number): number =>
  layout.chains > 1 ? (volleyId - 1) % layout.chains : 0;

/** Step 2: onFire mods in slot order. Mutates `shots` in place. */
export function applyOnFire(pipeline: Pipeline, shots: ShotSpec[]): void {
  for (const s of shots) s.chain = chainForVolley(pipeline.layout, s.volleyId);
  for (const m of pipeline.barrel) {
    if (!ON_FIRE.has(m.id)) continue;
    const out: ShotSpec[] = [];
    for (const s of shots) {
      if (m.chain !== (s.chain ?? 0) || !slotActive(m, s.volleyId, s.crit, null)) {
        out.push(s);
        continue;
      }
      const k = m.k;
      switch (m.id) {
        case 'twin_shot': {
          const n = 1 + Math.round((m.p.bullets - 1) * k);
          const spread = degToRad(m.p.spreadDeg * Math.min(k, 2));
          for (let j = 0; j < n; j++) {
            const offset = n === 1 ? 0 : -spread / 2 + (spread * j) / (n - 1);
            out.push({ ...s, angle: s.angle + offset, damage: s.damage * m.p.damageFactor });
          }
          break;
        }
        case 'long_rifling':
          s.speed *= 1 + m.p.speedBonus * k;
          s.range *= 1 + m.p.rangeBonus * k;
          out.push(s);
          break;
        case 'piercing_bore':
          s.pierce += Math.round(m.p.pierce * k);
          out.push(s);
          break;
        case 'heavy_slug':
          s.damage *= 1 + m.p.damageBonus * k;
          s.knockback += m.p.knockbackBonus * k;
          out.push(s);
          break;
        default:
          out.push(s);
      }
    }
    shots.splice(0, shots.length, ...out);
  }
}

/** What an on-hit effect needs from the bullet that triggered it (also kept for echoes). */
interface HitSource {
  damage: number;
  vx: number;
  vy: number;
  volleyId: number;
  generation: number;
  chain: number;
  hitIds: Iterable<number>;
}

interface PendingEcho {
  timeLeft: number;
  m: SlotMod;
  k: number;
  x: number;
  y: number;
  uid: number;
  src: HitSource;
}

/**
 * Steps 3-5: on-hit mods. Plugged into EnemySystem.hitSegment as its HitHandler.
 * `pipeline()` is read on every hit so a card picked mid-run applies to the next hit.
 * Call update(dt) every frame so Echo Chamber repeats fire.
 */
export class HitResolver implements HitHandler {
  readonly arcs: LightningArc[] = [];
  private readonly scratch: Enemy[] = [];
  private readonly echoes: PendingEcho[] = [];

  constructor(
    private readonly pipeline: () => Pipeline,
    private readonly bullets: BulletSystem,
    private readonly enemies: EnemySystem,
    private readonly status: StatusEffectSystem,
    private readonly caps: { maxBulletGeneration: number; maxChildrenPerHit: number },
  ) {}

  onHit(b: Bullet, e: Enemy, firstOfVolley: boolean, x: number, y: number): void {
    if (!firstOfVolley) return;
    const killed = !e.active;
    for (const m of this.pipeline().barrel) {
      if (ON_FIRE.has(m.id) || m.id === 'ricochet') continue;
      if (m.chain !== b.chain || m.slot < b.fromSlot || !slotActive(m, b.volleyId, b.crit, killed)) continue;
      this.effect(m, m.k, b, e, x, y);
      if (m.echo) {
        const src: HitSource = {
          damage: b.damage,
          vx: b.vx,
          vy: b.vy,
          volleyId: b.volleyId,
          generation: b.generation,
          chain: b.chain,
          hitIds: [...b.hitIds],
        };
        this.echoes.push({ timeLeft: m.echo.delaySec, m, k: m.k * m.echo.strength, x, y, uid: e.uid, src });
      }
    }
  }

  onStop(b: Bullet, e: Enemy, x: number, y: number): boolean {
    const ric = this.pipeline().barrel.find(
      (m) => m.id === 'ricochet' && m.chain === b.chain && (b.bouncesLeft !== -1 || m.slot >= b.fromSlot),
    );
    if (!ric || ric.id !== 'ricochet') return false;
    if (b.bouncesLeft === -1) {
      if (!slotActive(ric, b.volleyId, b.crit, !e.active)) return false;
      b.bouncesLeft = Math.round(ric.p.bounces * ric.k);
      b.fromSlot = ric.slot + 1; // the bounce only carries mods from later slots
    }
    if (b.bouncesLeft <= 0) return false;

    const [target] = this.enemies.nearest(x, y, u(ric.p.radius), 1, (o) => b.hitIds.has(o.uid), this.scratch);
    if (!target) return false;

    const speed = Math.hypot(b.vx, b.vy);
    const dx = target.x - x;
    const dy = target.y - y;
    const d = Math.hypot(dx, dy) || 1;
    b.x = x;
    b.y = y;
    b.vx = (dx / d) * speed;
    b.vy = (dy / d) * speed;
    b.distLeft = d + target.radius + u(1);
    b.damage *= ric.p.damageFactor;
    b.pierceLeft = 0;
    b.bouncesLeft--;
    return true;
  }

  /** Fire due Echo Chamber repeats. */
  update(dt: number): void {
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const echo = this.echoes[i]!;
      echo.timeLeft -= dt;
      if (echo.timeLeft > 0) continue;
      this.echoes.splice(i, 1);
      const e = this.enemies.enemies.find((o) => o.active && o.uid === echo.uid) ?? null;
      this.effect(echo.m, echo.k, echo.src, e, e ? e.x : echo.x, e ? e.y : echo.y);
    }
  }

  get pendingEchoes(): number {
    return this.echoes.length;
  }

  /** One on-hit effect at strength k. `e` may be dead (lightning and shards still go off). */
  private effect(m: SlotMod, k: number, src: HitSource, e: Enemy | null, x: number, y: number): void {
    switch (m.id) {
      case 'ember_shot':
        if (e?.active) this.status.applyBurn(e, m.p.dps * k, m.p.durationSec, m.p.maxStacks);
        break;
      case 'venom_shot':
        if (e?.active)
          this.status.applyPoison(e, m.p.dps * k, m.p.durationSec, m.p.spreadTargets, u(m.p.spreadRadius));
        break;
      case 'thunder_spark':
        if (e)
          this.status.chainLightning(
            e,
            Math.round(m.p.chains * k),
            u(m.p.radius),
            src.damage * m.p.damageFactor,
            this.arcs,
          );
        break;
      case 'split_shot':
        this.split(src, m.slot, m.p, Math.round(m.p.shards * k), x, y);
        break;
      default:
        break;
    }
  }

  private split(
    src: HitSource,
    slot: number,
    p: { damageFactor: number; arcDeg: number; range: number },
    shards: number,
    x: number,
    y: number,
  ): void {
    if (src.generation >= this.caps.maxBulletGeneration) return;
    const n = Math.min(shards, this.caps.maxChildrenPerHit);
    const heading = Math.atan2(src.vy, src.vx);
    const arc = degToRad(p.arcDeg);
    const speed = Math.hypot(src.vx, src.vy) * 0.8;
    for (let j = 0; j < n; j++) {
      const angle = heading + (n === 1 ? 0 : -arc / 2 + (arc * j) / (n - 1));
      const shard = this.bullets.spawn(
        {
          angle,
          speed,
          range: u(p.range),
          damage: src.damage * p.damageFactor,
          pierce: 0,
          knockback: 0,
          spreadDeg: 0,
          crit: false,
          volleyId: src.volleyId,
          chain: src.chain,
        },
        x,
        y,
        src.generation + 1,
        slot + 1, // shards only carry mods from later slots
      );
      if (!shard) return;
      for (const id of src.hitIds) shard.hitIds.add(id); // never re-hit the enemy that split it
    }
  }
}
