/**
 * ModPipeline (T19, T20, T22): turns the build's slots into behaviour.
 *
 * Barrel (TDD: ModPipeline):
 *  1. the Core makes the base ShotSpecs (WeaponSystem);
 *  2. onFire mods transform them in slot order (Twin Shot, Long Rifling, Piercing Bore, Heavy Slug);
 *  3. each bullet carries `fromSlot`; on hit, on-hit mods from slot >= fromSlot run in slot order;
 *  4. a bullet made by a mod (Split Shot shard, Ricochet bounce) only carries mods from LATER slots.
 * The pellet rule: on-hit mods trigger once per enemy per volley (firstOfVolley).
 *
 * Magazine: stat mods (Extended Mag, Quick Hands, Last Round) feed WeaponStats; event mods
 * (Grenade Mag, Shock Reload, Scavenger) are returned for the scene to trigger.
 */
import { degToRad, u } from '../core/math';
import type { BarrelModDef, GameData } from '../data/types';
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

/** One barrel mod at its slot, with the numbers for its current level. */
type SlotMod<D extends BarrelModDef = BarrelModDef> = D extends BarrelModDef
  ? { slot: number; id: D['id']; p: D['levels'][number] }
  : never;

export interface Pipeline {
  barrel: SlotMod[];
  weaponMods: WeaponMods;
  magazine: MagazineEffects;
}

export function buildPipeline(data: GameData, build: RunBuild): Pipeline {
  const barrel: SlotMod[] = [];
  build.barrel.forEach((slot, i) => {
    if (!slot) return;
    const def = data.barrelMods.find((m) => m.id === slot.id);
    if (!def) throw new Error(`Unknown barrel mod ${slot.id}`);
    barrel.push({ slot: i, id: def.id, p: def.levels[slot.level - 1] } as SlotMod);
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
  return { barrel, weaponMods, magazine };
}

/** Step 2: onFire mods in slot order. Mutates `shots` in place. */
export function applyOnFire(pipeline: Pipeline, shots: ShotSpec[]): void {
  for (const m of pipeline.barrel) {
    switch (m.id) {
      case 'twin_shot': {
        const out: ShotSpec[] = [];
        const n = m.p.bullets;
        const spread = degToRad(m.p.spreadDeg);
        for (const s of shots) {
          for (let k = 0; k < n; k++) {
            const offset = n === 1 ? 0 : -spread / 2 + (spread * k) / (n - 1);
            out.push({ ...s, angle: s.angle + offset, damage: s.damage * m.p.damageFactor });
          }
        }
        shots.splice(0, shots.length, ...out);
        break;
      }
      case 'long_rifling':
        for (const s of shots) {
          s.speed *= 1 + m.p.speedBonus;
          s.range *= 1 + m.p.rangeBonus;
        }
        break;
      case 'piercing_bore':
        for (const s of shots) s.pierce += m.p.pierce;
        break;
      case 'heavy_slug':
        for (const s of shots) {
          s.damage *= 1 + m.p.damageBonus;
          s.knockback += m.p.knockbackBonus;
        }
        break;
      default:
        break; // on-hit mods
    }
  }
}

/**
 * Steps 3-4: on-hit mods. Plugged into EnemySystem.hitSegment as its HitHandler.
 * `pipeline()` is read on every hit so a card picked mid-run applies to the next hit.
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
      if (m.slot < b.fromSlot) continue;
      switch (m.id) {
        case 'ember_shot':
          if (e.active) this.status.applyBurn(e, m.p.dps, m.p.durationSec, m.p.maxStacks);
          break;
        case 'venom_shot':
          if (e.active)
            this.status.applyPoison(e, m.p.dps, m.p.durationSec, m.p.spreadTargets, u(m.p.spreadRadius));
          break;
        case 'thunder_spark':
          this.status.chainLightning(e, m.p.chains, u(m.p.radius), b.damage * m.p.damageFactor, this.arcs);
          break;
        case 'split_shot':
          this.split(b, m.slot, m.p, x, y);
          break;
        default:
          break; // onFire mods; ricochet is handled in onStop
      }
    }
  }

  onStop(b: Bullet, _e: Enemy, x: number, y: number): boolean {
    const ric = this.pipeline().barrel.find((m) => m.id === 'ricochet');
    if (!ric || ric.id !== 'ricochet') return false;
    if (b.bouncesLeft === -1) {
      if (ric.slot < b.fromSlot) return false;
      b.bouncesLeft = ric.p.bounces;
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

  private split(
    b: Bullet,
    slot: number,
    p: { shards: number; damageFactor: number; arcDeg: number; range: number },
    x: number,
    y: number,
  ): void {
    if (b.generation >= this.caps.maxBulletGeneration) return;
    const n = Math.min(p.shards, this.caps.maxChildrenPerHit);
    const heading = Math.atan2(b.vy, b.vx);
    const arc = degToRad(p.arcDeg);
    const speed = Math.hypot(b.vx, b.vy) * 0.8;
    for (let k = 0; k < n; k++) {
      const angle = heading + (n === 1 ? 0 : -arc / 2 + (arc * k) / (n - 1));
      const shard = this.bullets.spawn(
        {
          angle,
          speed,
          range: u(p.range),
          damage: b.damage * p.damageFactor,
          pierce: 0,
          knockback: 0,
          spreadDeg: 0,
          crit: false,
          volleyId: b.volleyId,
        },
        x,
        y,
        b.generation + 1,
        slot + 1, // shards only carry mods from later slots
      );
      if (!shard) return;
      for (const id of b.hitIds) shard.hitIds.add(id); // never re-hit the enemy that split it
    }
  }
}
