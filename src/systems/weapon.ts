/**
 * WeaponSystem (T07-T09): fire rate, ammo, magazine, reload, and the Core's base shot.
 * Pure: produces ShotSpecs; the scene spawns bullets from them. Barrel mods (T19) will
 * transform the ShotSpec list between build and spawn.
 */
import type { EventBus } from '../core/eventBus';
import type { GameEvents } from '../core/events';
import { degToRad, u } from '../core/math';
import type { RNG } from '../core/rng';
import type { GunDef } from '../data/types';
import { NO_WEAPON_MODS, type WeaponMods } from './modPipeline';
import type { PlayerStats } from './stats';

/** One bullet to spawn. Speeds and distances are in world pixels. */
export interface ShotSpec {
  angle: number;
  speed: number;
  range: number;
  damage: number;
  pierce: number;
  knockback: number;
  spreadDeg: number;
  /** x critMultiplier damage (Scrap SMG's every 10th bullet). */
  crit: boolean;
  /** Same for every pellet of one trigger pull (the pellet rule, TDD: ModPipeline). */
  volleyId: number;
  /** Barrel chain this shot uses (Double Barrel alternates); set by applyOnFire. */
  chain?: number;
}

/** Effective gun numbers after player stats and Core Tier. Distances in pixels. */
export interface WeaponStats {
  damage: number;
  pellets: number;
  shotsPerSecond: number;
  magSize: number;
  reloadSec: number;
  spreadDeg: number;
  range: number;
  bulletSpeed: number;
  pierce: number;
  knockback: number;
  critEveryN: number;
  /** Damage multiplier for the last round in the magazine (Last Round mod); 1 = none. */
  lastRoundMult: number;
}

/**
 * Gun + player stats + Core Tier -> effective numbers.
 * Tier I is the base; each tier above adds tierBonus (Tier V = +40% damage, +20% fire rate).
 * Bullet speed stat scales both projectile speed and range (GDD: Player character).
 */
export function computeWeaponStats(
  gun: GunDef,
  stats: PlayerStats,
  coreTier: number,
  mods: WeaponMods = NO_WEAPON_MODS,
): WeaponStats {
  const tiers = Math.max(0, coreTier - 1);
  return {
    damage: gun.damage * stats.damage * (1 + gun.tierBonus.damage * tiers),
    pellets: gun.pellets,
    shotsPerSecond:
      gun.shotsPerSecond * stats.fireRate * (1 + gun.tierBonus.fireRate * tiers) * mods.fireRateMult,
    magSize: Math.max(1, Math.round(gun.magSize * mods.magMult)),
    reloadSec: (gun.reloadSec / stats.reloadSpeed) * mods.reloadMult,
    spreadDeg: gun.spreadDeg,
    range: u(gun.range * stats.bulletSpeed),
    bulletSpeed: u(gun.bulletSpeed * stats.bulletSpeed),
    pierce: gun.pierce,
    knockback: gun.knockback,
    critEveryN: gun.critEveryN,
    lastRoundMult: mods.lastRoundMult,
  };
}

export interface TriggerInput {
  fire: boolean;
  reload: boolean;
  aimAngle: number;
}

export class WeaponSystem {
  ammo: number;
  /** Seconds left on the current reload; 0 when not reloading. */
  reloadLeft = 0;
  private cooldown = 0;
  private shotCount = 0;
  private volleyCount = 0;

  constructor(
    private stats: WeaponStats,
    private readonly rng: RNG,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.ammo = stats.magSize;
  }

  get magSize(): number {
    return this.stats.magSize;
  }

  get reloading(): boolean {
    return this.reloadLeft > 0;
  }

  /** 0..1 while reloading, for the reload ring. */
  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadLeft / this.stats.reloadSec : 0;
  }

  get current(): Readonly<WeaponStats> {
    return this.stats;
  }

  /** New stats (card picked). A bigger magazine is not filled until the next reload. */
  setStats(stats: WeaponStats): void {
    this.stats = stats;
    this.ammo = Math.min(this.ammo, stats.magSize);
  }

  /** Advance timers and fire. Shots fired this frame are appended to `out`. */
  update(dt: number, input: TriggerInput, out: ShotSpec[]): void {
    if (this.cooldown > 0) this.cooldown -= dt;

    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        this.reloadLeft = 0;
        this.ammo = this.stats.magSize;
        this.bus.emit('weapon:reloaded', { ammo: this.ammo, magSize: this.stats.magSize });
      }
    }

    if (input.reload) this.startReload();

    while (input.fire && !this.reloading && this.ammo > 0 && this.cooldown <= 0) {
      this.fire(input.aimAngle, out);
      this.cooldown += 1 / this.stats.shotsPerSecond;
      if (this.ammo === 0) this.startReload();
    }
    // No banked shots: holding the trigger through a reload must not release a burst after it.
    if (this.cooldown < 0) this.cooldown = 0;
  }

  /** Scavenger: put one round back (not while reloading; the reload fills the magazine anyway). */
  addRound(): void {
    if (!this.reloading && this.ammo < this.stats.magSize) this.ammo++;
  }

  /** Starts a reload unless one is running or the magazine is full. Returns true if started. */
  startReload(): boolean {
    if (this.reloading || this.ammo >= this.stats.magSize) return false;
    this.reloadLeft = this.stats.reloadSec;
    this.bus.emit('weapon:reload', { ammo: this.ammo, magSize: this.stats.magSize });
    return true;
  }

  /** One trigger pull: one round, `pellets` bullets. */
  private fire(aimAngle: number, out: ShotSpec[]): void {
    const s = this.stats;
    this.ammo--;
    this.shotCount++;
    this.volleyCount++;
    const crit = s.critEveryN > 0 && this.shotCount % s.critEveryN === 0;
    const damage = this.ammo === 0 ? s.damage * s.lastRoundMult : s.damage;
    const spread = degToRad(s.spreadDeg);

    for (let i = 0; i < s.pellets; i++) {
      let angle: number;
      if (s.pellets === 1) {
        angle = aimAngle + (spread > 0 ? this.rng.range(-spread / 2, spread / 2) : 0);
      } else {
        // Pellets fan evenly across the cone with a little jitter, so the pattern reads clearly.
        const slot = spread / s.pellets;
        angle = aimAngle - spread / 2 + slot * (i + 0.5) + this.rng.range(-0.3, 0.3) * slot;
      }
      out.push({
        angle,
        speed: s.bulletSpeed,
        range: s.range,
        damage,
        pierce: s.pierce,
        knockback: s.knockback,
        spreadDeg: s.spreadDeg,
        crit,
        volleyId: this.volleyCount,
      });
    }
    this.bus.emit('weapon:fired', { ammo: this.ammo, magSize: s.magSize });
  }
}
