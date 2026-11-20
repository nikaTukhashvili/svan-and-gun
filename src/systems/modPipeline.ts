/**
 * ModPipeline: turns the barrel into behaviour (GDD: Barrel fusion).
 *
 * - Slot order does not change effects: every module (except fittings) applies to every bullet
 *   of its chain. Its numbers come from its tier (systems/fusion.ts > tierParams).
 * - A FITTING multiplies the strength `k` of its neighbours in the same chain (Booster ▶: the
 *   right neighbour ×1.4; Overcharger: left ×2, right ×0.5). Fittings next to fittings or empty
 *   slots do nothing.
 * - onFire modules (Twin Shot, Long Rifling, Piercing Bore, Heavy Slug) shape the shots; on-hit
 *   modules run when a bullet hits; Ricochet runs when a bullet would stop.
 * - Loop guard: child bullets (split shards) carry element and hybrid effects but never split or
 *   bounce again. The caps (generation, children per hit, live bullets) still apply.
 *
 * Gun twists (guns.json > barrel):
 *  - chains: the barrel is split into separate chains; trigger pulls alternate between them
 *    (Double Barrel). Fusion and fittings never cross into the other chain.
 *  - critChamberMult: the last slot works only on crit bullets, that many times as strong (SMG).
 *
 * The muzzle (systems/muzzle.ts) is separate from the barrel: its stacked stats become weapon
 * multipliers (WeaponMods.muzzle), applied in computeWeaponStats.
 *
 * The pellet rule still holds: on-hit modules trigger once per enemy per volley (firstOfVolley).
 */
import { degToRad, u } from '../core/math';
import type { GameData, GunDef, TieredModDef } from '../data/types';
import type { Bullet, BulletSystem } from './bullets';
import type { RunBuild, SupportLevels } from './build';
import type { Enemy, EnemySystem, HitHandler } from './enemies';
import { modDef, neighbours, tierParams } from './fusion';
import { muzzleWeaponMods, totalMuzzle, type MuzzleTotals, type MuzzleWeaponMods } from './muzzle';
import type { ChillSpec, LightningArc, StatusEffectSystem } from './status';
import type { ShotSpec } from './weapon';

/** Multipliers the build applies to the Core's numbers. */
export interface WeaponMods {
  fireRateMult: number;
  magMult: number;
  reloadMult: number;
  lastRoundMult: number;
  /** The muzzle's stacked effect (floors applied). */
  muzzle: MuzzleWeaponMods;
}

export const NO_MUZZLE_MODS: MuzzleWeaponMods = {
  extraBullets: 0,
  spreadAddDeg: 0,
  spreadMult: 1,
  damageMult: 1,
  fireRateMult: 1,
  rangeMult: 1,
  speedMult: 1,
  critChance: 0,
  minFanDeg: 0,
};

export const NO_WEAPON_MODS: WeaponMods = {
  fireRateMult: 1,
  magMult: 1,
  reloadMult: 1,
  lastRoundMult: 1,
  muzzle: NO_MUZZLE_MODS,
};

/** Support perks with event hooks (were magazine mods). */
export interface SupportEffects {
  grenade: { damage: number; radius: number; throwRange: number; fuseSec: number } | null;
  shockReload: { radius: number; knockback: number } | null;
  scavengerChance: number;
}

/** A tiered module at its slot, with its numbers at its tier and what fittings/twists do to it. */
export type SlotMod<D extends TieredModDef = TieredModDef> = D extends TieredModDef
  ? {
      slot: number;
      chain: number;
      id: D['id'];
      tier: number;
      p: D['base'];
      /** Strength multiplier from fittings or the crit chamber. */
      k: number;
      /** Crit chamber: only crit bullets use this slot. */
      critOnly: boolean;
    }
  : never;

/** A fitting at its slot, and the neighbours it changes (null = nothing there to change). */
export interface FittingInfo {
  slot: number;
  id: string;
  left: number | null;
  right: number | null;
}

export interface BarrelLayout {
  slots: number;
  chains: number;
  slotsPerChain: number;
  critChamberMult: number;
}

export interface Pipeline {
  layout: BarrelLayout;
  barrel: SlotMod[];
  fittings: FittingInfo[];
  /** Strength multiplier per slot (1 for empty slots and fittings), for the UI. */
  strength: number[];
  weaponMods: WeaponMods;
  support: SupportEffects;
  /** The muzzle's stats added up (for the UI). */
  muzzle: MuzzleTotals;
  /** Strongest Brimstone burst in the barrel (px radius), or null. */
  deathBlast: { damage: number; radius: number } | null;
}

const ON_FIRE = new Set(['twin_shot', 'long_rifling', 'piercing_bore', 'heavy_slug']);
const STEAM_COLOR = 0xf2e6e0;

/** Chill numbers from a module's params; strength `k` scales the slow (never past 1). */
function chillOf(
  p: { slowPct: number; chillSec: number; chillStacks: number; freezeSec: number; shatterPct: number },
  k: number,
): ChillSpec {
  return {
    slow: Math.min(1, (p.slowPct / 100) * k),
    sec: p.chillSec,
    stacks: p.chillStacks,
    freezeSec: p.freezeSec,
    shatter: (p.shatterPct / 100) * k,
  };
}

export function layoutOf(gun: GunDef | null, barrelSlots: number): BarrelLayout {
  const b = gun?.barrel ?? { slots: barrelSlots, chains: 1, critChamberMult: 0 };
  const slots = barrelSlots;
  const chains = Math.max(1, Math.min(b.chains, slots));
  return {
    slots,
    chains,
    slotsPerChain: Math.ceil(slots / chains),
    critChamberMult: b.critChamberMult,
  };
}

export const chainOfSlot = (layout: BarrelLayout, slot: number): number =>
  Math.floor(slot / layout.slotsPerChain);

export function buildPipeline(
  data: GameData,
  build: RunBuild,
  gun: GunDef | null = null,
  support: SupportLevels = {},
): Pipeline {
  const layout = layoutOf(gun, build.barrel.length);
  const strength = build.barrel.map(() => 1);
  const isTiered = (i: number | null): i is number => {
    if (i === null) return false;
    const s = build.barrel[i];
    return !!s && modDef(data, s.id).family !== 'fitting';
  };

  // Fittings first: each scales its neighbours in the same chain.
  const fittings: FittingInfo[] = [];
  build.barrel.forEach((slot, i) => {
    if (!slot) return;
    const def = modDef(data, slot.id);
    if (def.family !== 'fitting') return;
    const [l, r] = neighbours(layout, i);
    const left = isTiered(l) && def.left !== 0 ? l : null;
    const right = isTiered(r) && def.right !== 0 ? r : null;
    if (left !== null) strength[left]! *= 1 + def.left;
    if (right !== null) strength[right]! *= 1 + def.right;
    fittings.push({ slot: i, id: def.id, left, right });
  });

  const barrel: SlotMod[] = [];
  build.barrel.forEach((slot, i) => {
    if (!slot) return;
    const def = modDef(data, slot.id);
    if (def.family === 'fitting') return;
    const last = i === layout.slots - 1;
    const critOnly = last && layout.critChamberMult > 0;
    if (critOnly) strength[i]! *= layout.critChamberMult;
    barrel.push({
      slot: i,
      chain: chainOfSlot(layout, i),
      id: def.id,
      tier: slot.tier,
      p: tierParams(def, slot.tier),
      k: Math.max(0, strength[i]!),
      critOnly,
    } as SlotMod);
  });

  const muzzle = totalMuzzle(data, build.muzzle);
  const weaponMods: WeaponMods = { ...NO_WEAPON_MODS, muzzle: muzzleWeaponMods(data, muzzle) };
  for (const m of barrel) if (m.id === 'heavy_slug') weaponMods.fireRateMult *= 1 - m.p.fireRatePenalty;

  let deathBlast: Pipeline['deathBlast'] = null;
  for (const m of barrel) {
    if (m.id !== 'brimstone') continue;
    const damage = m.p.blastDamage * m.k;
    if (!deathBlast || damage > deathBlast.damage) deathBlast = { damage, radius: u(m.p.blastRadius) };
  }

  const effects: SupportEffects = { grenade: null, shockReload: null, scavengerChance: 0 };
  for (const def of data.supportPerks) {
    const level = support[def.id] ?? 0;
    if (level <= 0) continue;
    const lv = Math.min(level, def.levels.length) - 1;
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
        effects.grenade = { ...def.levels[lv]! };
        break;
      case 'shock_reload':
        effects.shockReload = { ...def.levels[lv]! };
        break;
      case 'scavenger':
        effects.scavengerChance = def.levels[lv]!.chance;
        break;
    }
  }
  return { layout, barrel, fittings, strength, weaponMods, support: effects, muzzle, deathBlast };
}

/** Which chain a trigger pull uses: chains alternate shot by shot (Double Barrel). */
export const chainForVolley = (layout: BarrelLayout, volleyId: number): number =>
  layout.chains > 1 ? (volleyId - 1) % layout.chains : 0;

/** onFire modules shape the shots. Mutates `shots` in place. */
export function applyOnFire(pipeline: Pipeline, shots: ShotSpec[]): void {
  for (const s of shots) s.chain = chainForVolley(pipeline.layout, s.volleyId);
  for (const m of pipeline.barrel) {
    if (!ON_FIRE.has(m.id)) continue;
    const out: ShotSpec[] = [];
    for (const s of shots) {
      if (m.chain !== (s.chain ?? 0) || (m.critOnly && !s.crit)) {
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

/**
 * On-hit modules. Plugged into EnemySystem.hitSegment as its HitHandler.
 * `pipeline()` is read on every hit so a card picked mid-run applies to the next hit.
 * Call update(dt) every frame (it keeps the Brimstone burst in sync with the barrel).
 */
export class HitResolver implements HitHandler {
  readonly arcs: LightningArc[] = [];
  private readonly scratch: Enemy[] = [];

  constructor(
    private readonly pipeline: () => Pipeline,
    private readonly bullets: BulletSystem,
    private readonly enemies: EnemySystem,
    private readonly status: StatusEffectSystem,
    private readonly caps: { maxBulletGeneration: number; maxChildrenPerHit: number },
  ) {}

  onHit(b: Bullet, e: Enemy, firstOfVolley: boolean, x: number, y: number): void {
    if (!firstOfVolley) return;
    for (const m of this.pipeline().barrel) {
      if (ON_FIRE.has(m.id) || m.id === 'ricochet') continue;
      if (m.chain !== b.chain || (m.critOnly && !b.crit)) continue;
      if (m.id === 'split_shot' && b.generation > 0) continue; // children never split again
      this.effect(m, b, e, x, y);
    }
  }

  onStop(b: Bullet, _e: Enemy, x: number, y: number): boolean {
    if (b.generation > 0) return false; // children never bounce
    const ric = this.pipeline().barrel.find(
      (m) => m.id === 'ricochet' && m.chain === b.chain && (!m.critOnly || b.crit),
    );
    if (!ric || ric.id !== 'ricochet') return false;
    if (b.bouncesLeft === -1) b.bouncesLeft = Math.round(ric.p.bounces * ric.k);
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

  update(_dt: number): void {
    this.status.deathBlast = this.pipeline().deathBlast;
  }

  /** One on-hit effect. `e` may be dead (lightning and shards still go off). */
  private effect(m: SlotMod, b: Bullet, e: Enemy, x: number, y: number): void {
    const k = m.k;
    switch (m.id) {
      case 'ember_shot':
        if (e.active) this.status.applyBurn(e, m.p.dps * k, m.p.durationSec, m.p.maxStacks);
        break;
      case 'venom_shot':
        if (e.active)
          this.status.applyPoison(e, m.p.dps * k, m.p.durationSec, m.p.spreadTargets, u(m.p.spreadRadius));
        break;
      case 'thunder_spark':
        this.status.chainLightning(
          e,
          Math.round(m.p.chains * k),
          u(m.p.radius),
          b.damage * m.p.damageFactor,
          this.arcs,
        );
        break;
      case 'plasma': {
        const burn = (t: Enemy) => this.status.applyBurn(t, m.p.burnDps * k, m.p.burnSec, m.p.maxStacks);
        if (e.active) burn(e);
        this.status.chainLightning(
          e,
          Math.round(m.p.chains * k),
          u(m.p.radius),
          b.damage * m.p.damageFactor,
          this.arcs,
          burn,
        );
        break;
      }
      case 'blight_arc': {
        const poison = (t: Enemy) =>
          this.status.applyPoison(t, m.p.poisonDps * k, m.p.poisonSec, 0, 0, false);
        if (e.active) poison(e);
        this.status.chainLightning(
          e,
          Math.round(m.p.chains * k),
          u(m.p.radius),
          b.damage * m.p.damageFactor,
          this.arcs,
          poison,
        );
        break;
      }
      case 'brimstone':
        if (e.active) {
          this.status.applyBurn(e, m.p.burnDps * k, m.p.burnSec, m.p.maxStacks);
          this.status.applyPoison(e, m.p.poisonDps * k, m.p.poisonSec, 0, 0, false);
        }
        break;
      case 'frost_shot':
        if (e.active) this.status.applyChill(e, chillOf(m.p, k));
        break;
      case 'steam':
        if (e.active) {
          this.status.applyBurn(e, m.p.burnDps * k, m.p.burnSec, m.p.maxStacks);
          if (this.status.applyChill(e, chillOf(m.p, k)))
            this.status.burst(e.x, e.y, u(m.p.blastRadius), m.p.blastDamage * k, STEAM_COLOR, e);
        }
        break;
      case 'frostbite':
        if (e.active) {
          this.status.applyFrostbite(e, m.p.chilledPoisonMult);
          this.status.applyPoison(e, m.p.poisonDps * k, m.p.poisonSec, 0, 0, false);
          this.status.applyChill(e, chillOf(m.p, k));
        }
        break;
      case 'hailstorm': {
        const chillIt = (t: Enemy) => this.status.applyChill(t, chillOf(m.p, k));
        if (e.active) chillIt(e);
        this.status.chainLightning(
          e,
          Math.round(m.p.chains * k),
          u(m.p.radius),
          b.damage * m.p.damageFactor,
          this.arcs,
          chillIt,
        );
        break;
      }
      case 'split_shot':
        this.split(b, m.p, Math.round(m.p.shards * k), x, y);
        break;
      default:
        break;
    }
  }

  private split(
    src: Bullet,
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
    const hitIds = [...src.hitIds];
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
      );
      if (!shard) return;
      for (const id of hitIds) shard.hitIds.add(id); // never re-hit the enemy that split it
    }
  }
}
