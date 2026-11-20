import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SceneKeys, UiColors } from '../config';
import { EventBus } from '../core/eventBus';
import type { GameEvents, RunResult } from '../core/events';
import { formatTime, toUnits, u } from '../core/math';
import { RNG } from '../core/rng';
import { getById } from '../data/registry';
import type { GameData, GunDef, Rarity, TimelineEvent } from '../data/types';
import { testHookEnabled } from '../debug/testHook';
import { PlaygroundPanel, type PlaygroundController } from '../debug/playgroundPanel';
import { Player } from '../entities/Player';
import { BossController, type Rubble, type SummonRequest } from '../systems/boss';
import {
  applyCard,
  buildForGun,
  drawCards,
  setSlot,
  startingSupport,
  swapSlots,
  unlockedSlots,
  type Card,
} from '../systems/build';
import { BulletSystem, REDIRECTED, type Bullet } from '../systems/bullets';
import { Destructibles, type Destructible } from '../systems/destructibles';
import { applyOnFire, buildPipeline, HitResolver, layoutOf, type Pipeline } from '../systems/modPipeline';
import { previewMove, previewPlace } from '../systems/fusion';
import { moveMuzzle, previewMuzzle } from '../systems/muzzle';
import { PickupSystem, rollCrateDrop, rollEnemyDrops, type Drop, type Pickup } from '../systems/pickups';
import { Progression } from '../systems/progression';
import { StatusEffectSystem } from '../systems/status';
import { EnemySystem, type EliteTrait } from '../systems/enemies';
import { EnemyProjectileSystem, type ProjectileRequest } from '../systems/enemyProjectiles';
import { PlayerHealth } from '../systems/playerHealth';
import { createRunState, type RunState } from '../systems/runState';
import { SlowEffect } from '../systems/slow';
import { pickSpawnPoint, SpawnDirector, type SpawnRequest } from '../systems/spawnDirector';
import { baseStats, computeStats, emptyBonuses, type PlayerStats } from '../systems/stats';
import { computeWeaponStats, WeaponSystem, type ShotSpec } from '../systems/weapon';
import { Depth } from './depth';
import { buildArena, type Arena } from './game/Arena';
import { BulletView } from './game/BulletView';
import { CursorOverlay } from './game/CursorOverlay';
import { DebugOverlay, debugMode } from './game/DebugOverlay';
import { EffectsLayer } from './game/EffectsLayer';
import { EnemyView } from './game/EnemyView';
import { PickupView } from './game/PickupView';
import { Playground } from './game/Playground';
import { ProjectileView } from './game/ProjectileView';
import type { HudModel } from './HudScene';
import type { LevelUpController } from './LevelUpScene';
import type { PauseController } from './PauseScene';
import type { BuildSheetData, SheetLine } from './BuildSheetScene';
import type { ResultsData } from './ResultsScene';
import { getGameData } from './gameData';
import { getSave } from './meta';
import { Sfx } from './audio/Sfx';
import { DamageNumbers } from './game/DamageNumbers';
import { metaBonuses } from '../systems/market';
import { modName, muzzleLabel, slotLabel, STAT_LABELS } from '../ui/cardText';
import { KeyboardMouseInput } from './input/KeyboardMouseInput';

export interface GameSceneData {
  gunId: string;
  seed: number;
  /** 'playground' = Training Ground (dev tool): no timeline, immortal dummies, the build panel. */
  mode?: 'run' | 'playground';
  /** Training Ground options kept when switching guns. */
  playground?: PlaygroundOptions;
}

export interface PlaygroundOptions {
  godMode: boolean;
  marketBuffs: boolean;
}

const BULLET_RADIUS = 4;

/** A tier-1 module card for a module id (Training Ground "fuse on place"). */
function moduleCard(d: GameData, modId: string): Card {
  const def = d.barrelMods.find((m) => m.id === modId)!;
  return { type: 'module', modId, family: def.family, fuses: false };
}
const ENEMY_PROJECTILE_RADIUS = 6;
const MAP_KEY = 'level1';

/**
 * The run. Rules live in systems/; this scene wires them to Phaser and draws them.
 * M1: arena, player, gun, bullets. M2: enemies, spawn director, elites, projectiles.
 * Pickups and levelling (M3), the boss and run end (M4) and the HUD (M5) come next.
 */
export class GameScene extends Phaser.Scene {
  // All run state is (re)created in init()/create(): scene instances are reused on restart.
  private gd!: GameData;
  private run!: RunState;
  private gun!: GunDef;
  private stats!: PlayerStats;
  private bus!: EventBus<GameEvents>;
  private rng!: RNG;
  private arena!: Arena;
  private player!: Player;
  private playerRadius = 0;
  private controls!: KeyboardMouseInput;
  private weapon!: WeaponSystem;
  private health!: PlayerHealth;
  private slow!: SlowEffect;
  private bullets!: BulletSystem;
  private enemies!: EnemySystem;
  private projectiles!: EnemyProjectileSystem;
  private director!: SpawnDirector;
  private bulletView!: BulletView;
  private enemyView!: EnemyView;
  private projectileView!: ProjectileView;
  private effects!: EffectsLayer;
  private cursor!: CursorOverlay;
  private debug!: DebugOverlay;
  private readonly shots: ShotSpec[] = [];
  private readonly spawnRequests: SpawnRequest[] = [];
  private readonly firedEvents: TimelineEvent[] = [];
  private readonly projectileRequests: ProjectileRequest[] = [];
  private ended = false;
  private pipeline!: Pipeline;
  private resolver!: HitResolver;
  private status!: StatusEffectSystem;
  private progression!: Progression;
  private pickups!: PickupSystem;
  private destructibles!: Destructibles;
  private pickupView!: PickupView;
  private chestsPending = 0;
  private levelUpOpen = false;
  private hand: Card[] = [];
  /** Test hook: the next hand, instead of a draw. */
  private forcedHand: Card[] | null = null;
  private cardsPicked = 0;
  private grenades: { x: number; y: number; timeLeft: number; damage: number; radius: number }[] = [];
  private boss!: BossController;
  private rubbleGroup!: Phaser.Physics.Arcade.StaticGroup;
  private rubbleBodies = new Map<Rubble, Phaser.GameObjects.Arc>();
  private readonly summons: SummonRequest[] = [];
  private message: { text: string; timeLeft: number } | null = null;
  private victoryTimer = 0;
  private pauseOpen = false;
  /** Market buffs, read once when the run starts (TDD: Applying stats). */
  private meta = emptyBonuses();
  private sfx!: Sfx;
  private numbers!: DamageNumbers;
  private ringsSeen = 0;
  private mapKey: string = MAP_KEY;
  /** Training Ground state; null in a normal run. */
  private pg: { helper: Playground; panel: PlaygroundPanel | null; opts: PlaygroundOptions } | null = null;
  private pgOptions: PlaygroundOptions | null = null;

  constructor() {
    super(SceneKeys.Game);
  }

  init(data: GameSceneData): void {
    this.gd = getGameData(this);
    this.gun = getById(this.gd.guns, data.gunId, 'gun');
    this.run = createRunState(data.gunId, data.seed);
    this.run.build = buildForGun(this.gun); // each gun has its own barrel length, twist and muzzle
    this.run.support = startingSupport(this.gun); // Double Barrel: Grenade Mag from the start
    this.ended = false;
    this.chestsPending = 0;
    this.levelUpOpen = false;
    this.hand = [];
    this.forcedHand = null;
    this.cardsPicked = 0;
    this.grenades = [];
    this.rubbleBodies = new Map();
    this.summons.length = 0;
    this.message = null;
    this.victoryTimer = 0;
    this.pauseOpen = false;
    this.shots.length = 0;
    this.spawnRequests.length = 0;
    this.firedEvents.length = 0;
    this.projectileRequests.length = 0;
    const playground = data.mode === 'playground';
    this.mapKey = playground ? this.gd.playground.map : MAP_KEY;
    this.pgOptions = playground ? { ...(data.playground ?? { godMode: true, marketBuffs: false }) } : null;
    this.pg = null;
  }

  create(): void {
    const d = this.gd;
    const map = d.maps[this.mapKey];
    if (!map) throw new Error(`Map "${this.mapKey}" not loaded`);

    this.bus = new EventBus<GameEvents>();
    this.rng = new RNG(this.run.seed);
    this.meta =
      this.pgOptions && !this.pgOptions.marketBuffs
        ? emptyBonuses()
        : metaBonuses(getSave(this).state, d.buffs);
    this.stats = computeStats(baseStats(d.config, d.cards), this.meta, this.run.runBonuses);

    this.arena = buildArena(this, map);
    this.playerRadius = u(d.config.player.radius);
    this.player = new Player(this, u(map.playerStart.x), u(map.playerStart.y), this.playerRadius);
    this.physics.add.collider(this.player, this.arena.walls);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.arena.width, this.arena.height);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.centerOn(this.player.x, this.player.y);

    const settings = getSave(this).state.settings;
    this.controls = new KeyboardMouseInput(this, settings.autoFire);
    this.weapon = new WeaponSystem(
      computeWeaponStats(this.gun, this.stats, this.run.build.coreTier),
      this.rng,
      this.bus,
    );
    this.health = new PlayerHealth(
      this.stats,
      {
        invulnerableSec: d.config.player.invulnerableSec,
        minDamage: d.config.combat.minDamage,
        reviveHpFraction: d.config.player.reviveHpFraction,
        reviveInvulnerableSec: d.config.player.reviveInvulnerableSec,
      },
      this.bus,
    );
    this.slow = new SlowEffect();
    this.bullets = new BulletSystem(d.config.caps.maxBullets, BULLET_RADIUS);
    this.enemies = new EnemySystem({
      capacity: d.config.caps.maxEnemies,
      config: d.config,
      defs: d.enemies,
      field: this.arena.field,
      rng: this.rng,
      bus: this.bus,
      cullDistance: d.config.world.cullDistanceScreens * GAME_WIDTH,
    });
    this.projectiles = new EnemyProjectileSystem(d.config.caps.maxEnemyProjectiles, ENEMY_PROJECTILE_RADIUS);
    this.director = new SpawnDirector(d.timeline, this.rng);
    this.pipeline = buildPipeline(d, this.run.build, this.gun, this.run.support);
    this.status = new StatusEffectSystem(this.enemies, d.config.combat.statusTickSec);
    this.resolver = new HitResolver(
      () => this.pipeline,
      this.bullets,
      this.enemies,
      this.status,
      d.config.caps,
    );
    this.progression = new Progression(d.config.xp, this.bus);
    this.pickups = new PickupSystem(d.config.caps.maxPickups, d.config.pickups.mergeThreshold);
    this.destructibles = Destructibles.fromMap(map, d.drops);
    this.boss = new BossController(d.boss, this.enemies, this.arena.field, this.rng, this.bus);
    this.rubbleGroup = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.rubbleGroup);

    this.pickupView = new PickupView(this, this.pickups, this.destructibles, d.drops);
    this.enemyView = new EnemyView(this, this.enemies);
    this.bulletView = new BulletView(this, this.bullets);
    this.projectileView = new ProjectileView(this, this.projectiles);
    this.effects = new EffectsLayer(this);
    this.cursor = new CursorOverlay(this);
    this.debug = new DebugOverlay(this, () => this.debugLines());

    this.bus.on('run:ended', ({ result }) => this.endRun(result));
    // Feedback: sounds and damage numbers (T35).
    this.sfx = new Sfx(this.game);
    this.numbers = new DamageNumbers(this);
    this.ringsSeen = 0;
    const heavy = this.gun.shotsPerSecond < 3;
    this.bus.on('weapon:fired', () => this.sfx.play(heavy ? 'shootHeavy' : 'shoot'));
    this.bus.on('weapon:reload', () => this.sfx.play('reload'));
    this.bus.on('weapon:reloaded', () => this.sfx.play('reloaded'));
    this.bus.on('enemy:damaged', ({ x, y, amount, crit, byStatus }) => {
      this.numbers.spawn(x, y, amount, crit, byStatus);
      if (!byStatus) this.sfx.play('hit');
    });
    this.bus.on('enemy:killed', () => this.sfx.play('kill'));
    this.bus.on('player:damaged', () => this.sfx.play('hurt'));
    this.bus.on('player:levelUp', () => this.sfx.play('levelUp'));
    this.bus.on('pickup:collected', () => this.sfx.play('pickup'));
    this.bus.on('boss:dead', () => this.sfx.play('bossDeath'));
    this.bus.on('player:damaged', ({ amount }) => {
      if (getSave(this).state.settings.screenShake)
        this.cameras.main.shake(120, Math.min(0.012, 0.002 + amount * 0.0003));
    });
    this.bus.on('player:revived', () => {
      this.showMessage('Second wind!', 2);
      this.cameras.main.flash(300, 255, 255, 255);
    });
    this.bus.on('enemy:killed', ({ type, elite, x, y }) => {
      this.run.kills++;
      if (type === d.boss.id) {
        this.onBossKilled();
        return;
      }
      if (elite) this.run.eliteKills++;
      if (!this.pgOptions) this.dropAt(rollEnemyDrops(d.drops, this.rng, type, elite), x, y);
      const scavenge = this.pipeline.support.scavengerChance;
      if (scavenge > 0 && this.rng.chance(scavenge)) this.weapon.addRound();
    });
    this.bus.on('weapon:reload', ({ ammo }) => this.onReloadStart(ammo));
    this.scene.launch(SceneKeys.Hud, { model: () => this.hudModel() });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.clear();
      this.scene.stop(SceneKeys.Hud);
      this.scene.stop(SceneKeys.Pause);
      this.scene.stop(SceneKeys.BuildSheet);
      this.game.events.off(Phaser.Core.Events.BLUR, this.openPause, this);
      this.scene.stop(SceneKeys.LevelUp);
      this.pg?.panel?.destroy();
      if (window.__svan) delete window.__svan.run;
    });
    // Losing focus pauses the run, so a huge frame delta cannot kill the player on return.
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    if (debugMode) this.installDebugKeys();
    if (this.pgOptions) this.startPlayground(this.pgOptions);
    this.installTestApi();
  }

  override update(time: number, deltaMs: number): void {
    const d = this.gd;
    const dt = Math.min(deltaMs, d.config.combat.maxFrameDeltaMs) / 1000;
    const px = this.player.x;
    const py = this.player.y;
    const input = this.controls.read(px, py);

    if (this.ended) {
      this.cursor.draw(this.weapon);
      return;
    }
    if (input.buildSheet) {
      this.openBuildSheet();
      return;
    }
    if (input.pause) {
      this.openPause();
      return;
    }

    this.run.timeSec += dt;

    // Player
    this.slow.update(dt);
    this.player.move(input.moveX, input.moveY, u(this.stats.moveSpeed) * this.slow.multiplier);
    this.player.aim(input.aimAngle);
    this.player.setSlowed(this.slow.multiplier < 1);

    // Spawns
    this.spawnRequests.length = 0;
    this.firedEvents.length = 0;
    if (!this.pg)
      this.director.update(
        dt,
        this.run.timeSec,
        this.enemies.activeCount,
        this.spawnRequests,
        this.firedEvents,
      );
    for (const r of this.spawnRequests) this.handleSpawn(r, px, py);
    for (const ev of this.firedEvents) {
      this.bus.emit('timeline:event', { type: ev.type, at: ev.at });
      this.handleTimelineEvent(ev);
    }

    // Enemies and their projectiles
    this.projectileRequests.length = 0;
    this.enemies.update(dt, px, py, this.projectileRequests, this.playerRadius);
    for (const r of this.projectileRequests) this.projectiles.spawn(r);

    // Gun and bullets
    this.shots.length = 0;
    this.weapon.update(dt, input, this.shots);
    applyOnFire(this.pipeline, this.shots);
    for (const shot of this.shots) this.bullets.spawn(shot, px, py);
    this.bullets.update(dt, this.arena.field, (b, x0, y0, x1, y1) => this.hitBullet(b, x0, y0, x1, y1));

    // Damage to the player
    const player = { x: px, y: py, radius: this.playerRadius };
    this.projectiles.update(dt, this.arena.field, player, (p) => {
      if (this.health.takeHit(p.damage) > 0) this.slow.apply(p.slowFactor, p.slowSec);
    });
    const contact = this.enemies.contactDamageAt(px, py, this.playerRadius);
    if (contact > 0) this.health.takeHit(contact);
    this.enemies.updateBursts(dt, (b) => {
      this.effects.flash(b.x, b.y, b.radius);
      if (Math.hypot(b.x - px, b.y - py) <= b.radius + this.playerRadius) this.health.takeHit(b.damage, true);
    });
    // The boss and its hazards
    this.summons.length = 0;
    const wasEnraged = this.boss.enraged;
    this.boss.update(
      dt,
      this.run.timeSec,
      px,
      py,
      this.playerRadius,
      (dmg, ignoreDef) => this.health.takeHit(dmg, ignoreDef),
      this.summons,
    );
    if (!wasEnraged && this.boss.enraged) this.showMessage('The Chieftain is enraged!', 3);
    for (const s of this.summons) this.spawnRing(s.enemy, s.count, s.radius, s.x, s.y, 0);
    this.syncRubble();
    if (this.boss.rings.length > this.ringsSeen) this.sfx.play('slam');
    this.ringsSeen = this.boss.rings.length;
    if (this.victoryTimer > 0) {
      this.victoryTimer -= dt;
      if (this.victoryTimer <= 0) this.bus.emit('run:ended', { result: 'victory' });
    }
    if (this.message) {
      this.message.timeLeft -= dt;
      if (this.message.timeLeft <= 0) this.message = null;
    }
    this.health.update(dt);

    // Statuses, explosions, pickups
    this.status.update(dt);
    for (const bl of this.status.blasts) this.effects.flash(bl.x, bl.y, bl.radius, 0xc98a2e, 0.25);
    this.status.blasts.length = 0;
    this.resolver.update(dt);
    this.updateGrenades(dt);
    this.effects.lightning(this.resolver.arcs);
    this.pickups.update(
      dt,
      this.player.x,
      this.player.y,
      u(this.stats.pickupRadius),
      this.playerRadius,
      u(d.config.pickups.magnetSpeed),
      (p) => this.collect(p),
    );

    // Draw
    this.pickupView.sync(time);
    this.enemyView.sync(time);
    this.bulletView.sync();
    this.projectileView.sync(time);
    const atk = d.boss.attacks;
    this.effects.draw(dt, time, this.enemies.bursts, {
      rings: this.boss.rings,
      boulders: this.boss.boulders,
      ringThickness: u(atk.slam.ringThickness),
      impactRadius: u(atk.boulder.impactRadius),
      telegraphSec: atk.boulder.telegraphSec,
    });
    this.player.setBlinking(this.health.invulnerable, time);
    this.cursor.draw(this.weapon);
    this.numbers.update(dt);
    this.debug.update(dt);
    this.pg?.helper.update(dt);

    if (
      !this.pg &&
      !this.levelUpOpen &&
      !this.ended &&
      (this.progression.pending > 0 || this.chestsPending > 0)
    ) {
      this.openLevelUp();
    }
  }

  // ---------- hits, drops and upgrades (M3) ----------

  /** A bullet's frame segment: props stop bullets, so enemies are only tested before the first prop. */
  private hitBullet(b: Bullet, x0: number, y0: number, x1: number, y1: number): number | null {
    const prop = this.destructibles.firstHit(x0, y0, x1, y1, BULLET_RADIUS);
    const cx = prop ? x0 + (x1 - x0) * prop.t : x1;
    const cy = prop ? y0 + (y1 - y0) * prop.t : y1;
    const t = this.enemies.hitSegment(b, x0, y0, cx, cy, BULLET_RADIUS, this.resolver);
    if (t === REDIRECTED) return REDIRECTED;
    if (t !== null) return prop ? t * prop.t : t;
    if (prop) {
      this.damageProp(prop.item, b.damage);
      return prop.t;
    }
    return null;
  }

  private damageProp(item: Destructible, amount: number): void {
    if (!this.destructibles.damage(item, amount)) return;
    if (item.kind === 'crate') {
      this.dropAt([rollCrateDrop(this.gd.drops, this.rng)], item.x, item.y);
      return;
    }
    const pb = this.gd.drops.powderBarrel;
    this.explode(item.x, item.y, u(pb.radius), pb.damage, 0xff8a3d);
  }

  /** Area damage to enemies (explosions ignore defence) and to props; powder barrels chain. */
  private explode(x: number, y: number, radius: number, damage: number, color: number): void {
    this.effects.flash(x, y, radius, color, 0.3);
    this.sfx.play('explosion');
    for (const e of this.enemies.inRadius(x, y, radius, [])) this.enemies.damage(e, damage, true);
    for (const item of this.destructibles.inRadius(x, y, radius)) this.damageProp(item, damage);
  }

  private dropAt(drops: Drop[], x: number, y: number): void {
    for (const drop of drops) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = drops.length > 1 ? this.rng.range(4, 18) : 0;
      this.pickups.spawn(drop.kind, drop.value, x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
  }

  private collect(p: Pickup): void {
    switch (p.kind) {
      case 'scrap':
        this.progression.add(p.value * this.stats.scrapGain);
        break;
      case 'silver':
        this.run.silver += p.value;
        break;
      case 'kubdari':
        this.health.heal(p.value);
        break;
      case 'horn':
        this.pickups.magnetAllScrap();
        break;
      case 'chest':
        this.chestsPending++;
        break;
    }
    this.bus.emit('pickup:collected', { kind: p.kind, value: p.value });
  }

  /** Support perks with events: Shock Reload on any reload, Grenade Mag when the magazine ran empty. */
  private onReloadStart(ammo: number): void {
    const mag = this.pipeline.support;
    const px = this.player.x;
    const py = this.player.y;
    if (mag.shockReload) {
      const r = u(mag.shockReload.radius);
      this.enemies.knockFrom(px, py, r, mag.shockReload.knockback);
      this.effects.flash(px, py, r, 0x9fd8ff, 0.2);
    }
    if (mag.grenade && ammo === 0) {
      const aim = this.controls.aimWorld;
      const dx = aim.x - px;
      const dy = aim.y - py;
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(d, u(mag.grenade.throwRange));
      this.grenades.push({
        x: px + (dx / d) * reach,
        y: py + (dy / d) * reach,
        timeLeft: mag.grenade.fuseSec,
        damage: mag.grenade.damage,
        radius: u(mag.grenade.radius),
      });
    }
  }

  private updateGrenades(dt: number): void {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]!;
      g.timeLeft -= dt;
      if (g.timeLeft > 0) continue;
      this.grenades.splice(i, 1);
      this.explode(g.x, g.y, g.radius, g.damage, 0xffc23d);
    }
  }

  /** Stats or build changed (card picked, slots swapped): recompute player and gun numbers. */
  private refreshStats(): void {
    const d = this.gd;
    this.stats = computeStats(baseStats(d.config, d.cards), this.meta, this.run.runBonuses);
    this.pipeline = buildPipeline(d, this.run.build, this.gun, this.run.support);
    this.weapon.setStats(
      computeWeaponStats(this.gun, this.stats, this.run.build.coreTier, this.pipeline.weaponMods),
    );
    this.health.setStats(this.stats);
  }

  private openLevelUp(): void {
    this.levelUpOpen = true;
    this.hand = this.drawHand();
    this.scene.pause();
    this.scene.launch(SceneKeys.LevelUp, { controller: this.levelUpController() });
  }

  private drawHand(): Card[] {
    if (this.forcedHand) {
      const hand = this.forcedHand;
      this.forcedHand = null;
      return hand;
    }
    return drawCards(this.gd, this.run.build, this.progression.level, this.rng, this.run.support);
  }

  private levelUpController(): LevelUpController {
    const d = this.gd;
    const queued = () => this.progression.pending + this.chestsPending;
    return {
      title: () =>
        this.progression.pending > 0
          ? `Level ${this.progression.level - this.progression.pending + 1}`
          : "Gunsmith's Chest",
      queuedAfter: () => queued() - 1,
      build: () => this.run.build,
      unlocked: () => unlockedSlots(d, this.progression.level, this.run.build.barrel.length),
      pipeline: () => this.pipeline,
      gun: () => this.gun,
      support: () => this.run.support,
      unlockLevel: (i) => {
        const levels = d.config.slots.barrelUnlockLevels;
        return levels[i] ?? levels[levels.length - 1] ?? 1;
      },
      previewPlace: (slot, modId) =>
        previewPlace(d, this.run.build, this.layout(), slot, { id: modId, tier: 1 }, this.openSlots()).events,
      previewMove: (a, b) => previewMove(d, this.run.build, this.layout(), a, b).events,
      previewMuzzle: (slot, id) => previewMuzzle(this.run.build.muzzle, slot, id),
      moveMuzzle: (a, b) => {
        moveMuzzle(this.run.build.muzzle, a, b);
        this.refreshStats();
      },
      cards: () => this.hand,
      rerollsLeft: () => Math.max(0, Math.round(this.stats.rerolls) - this.run.rerollsUsed),
      reroll: () => {
        this.run.rerollsUsed++;
        this.hand = this.drawHand();
      },
      pick: (card, slot) => {
        const events = applyCard(d, this.gun, this.run, card, slot, this.openSlots());
        this.cardsPicked++;
        if (card.type === 'runStat') {
          this.run.picks.push({
            kind: 'perk',
            cardId: card.cardId,
            rarity: card.rarity,
            stat: card.stat,
            mode: card.mode,
            value: card.value,
          });
        } else if (card.type === 'randomUpgrade') {
          this.run.picks.push({ kind: 'tinker', upgrades: card.upgrades });
        }
        if (card.type === 'module' && slot !== undefined) {
          const result = this.run.build.barrel[slot];
          this.bus.emit('mod:applied', {
            modId: result?.id ?? card.modId,
            slot,
            tier: result?.tier ?? 1,
            fused: events.some((e) => e.kind === 'fuse'),
          });
        }
        if (this.progression.pending > 0) this.progression.consume();
        else this.chestsPending--;
        this.refreshStats();
        if (queued() > 0) this.hand = this.drawHand();
        return events;
      },
      move: (a, b) => {
        const events = swapSlots(d, this.gun, this.run.build, a, b);
        this.refreshStats();
        return events;
      },
      hasMore: () => queued() > 0,
      close: () => {
        this.levelUpOpen = false;
        this.scene.resume();
      },
    };
  }

  private hudModel(): HudModel {
    return {
      hp: this.health.hp,
      maxHp: this.health.maxHp,
      level: this.progression.level,
      scrap: this.progression.scrap,
      toNext: this.progression.toNext,
      timeSec: this.run.timeSec,
      kills: this.run.kills,
      silver: this.run.silver,
      boss: this.boss.alive
        ? {
            name: this.boss.def.name,
            hpFraction: this.boss.hpFraction,
            phaseMarkers: this.boss.def.phases.slice(1).map((p) => p.fromHp),
            enraged: this.boss.enraged,
          }
        : null,
      message: this.message?.text ?? null,
      slots:
        'Barrel  ' +
        this.run.build.barrel.map((sl) => (sl ? slotLabel(this.gd, sl) : '—')).join('  |  ') +
        '      Muzzle  ' +
        this.run.build.muzzle.map((m) => (m ? muzzleLabel(this.gd, m) : '—')).join('  |  ') +
        '      Core Tier ' +
        this.run.build.coreTier,
    };
  }

  // ---------- spawning ----------

  private handleSpawn(r: SpawnRequest, px: number, py: number): void {
    const minutes = this.run.timeSec / 60;
    if (r.kind === 'ring') {
      this.spawnRing(r.enemy, r.count, u(r.radius), px, py, minutes);
      return;
    }
    const def = this.enemies.def(r.enemy);
    const margin = u(def.radius * 2);
    const field = this.arena.field;
    const p = pickSpawnPoint(
      this.rng,
      px,
      py,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      margin,
      (x, y) => field.blocked(x, y, margin),
      field.width,
      field.height,
    );
    if (r.kind === 'elite') this.enemies.spawn(r.enemy, p.x, p.y, { minutes, elite: true, trait: r.trait });
    else this.enemies.spawn(r.enemy, p.x, p.y, { minutes });
  }

  /** A full circle of enemies around the player; points inside obstacles are skipped. */
  private spawnRing(
    enemy: string,
    count: number,
    radius: number,
    px: number,
    py: number,
    minutes: number,
    opts: { elite?: boolean; trait?: EliteTrait } = {},
  ): number {
    const field = this.arena.field;
    const r = u(this.enemies.def(enemy).radius);
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x = px + Math.cos(a) * radius;
      const y = py + Math.sin(a) * radius;
      if (field.blocked(x, y, r)) continue;
      if (this.enemies.spawn(enemy, x, y, { minutes, ...opts })) spawned++;
    }
    return spawned;
  }

  // ---------- timeline, boss and run end (M4) ----------

  private handleTimelineEvent(ev: TimelineEvent): void {
    switch (ev.type) {
      case 'tutorial':
        this.showMessage(ev.prompt, ev.durationSec);
        break;
      case 'bossWarning':
        this.showMessage('The tower bell rings. Something is coming out.', 5);
        break;
      case 'boss': {
        const map = this.gd.maps[this.mapKey]!;
        if (this.boss.spawn(u(map.tower.x), u(map.tower.y), this.run.timeSec)) {
          this.director.bossActive = true;
          this.showMessage(this.boss.def.name, 3);
        }
        break;
      }
      default:
        break;
    }
  }

  private showMessage(text: string, seconds: number): void {
    this.message = { text, timeLeft: seconds };
  }

  private onBossKilled(): void {
    this.boss.onDeath();
    this.run.bossKilled = true;
    this.director.bossActive = false;
    // The horde breaks and flees: clear the field for the "tower retaken" moment.
    for (const e of this.enemies.enemies) if (e.active) this.enemies.release(e);
    this.projectiles.releaseAll();
    this.victoryTimer = this.boss.def.retakeMomentSec;
    this.showMessage('TOWER RETAKEN', this.boss.def.retakeMomentSec + 1);
    this.cameras.main.flash(400, 255, 230, 160);
  }

  /** Rubble left by boulders blocks the player too: mirror it as Arcade static bodies. */
  private syncRubble(): void {
    for (const r of this.boss.rubble) {
      if (this.rubbleBodies.has(r)) continue;
      const rock = this.add
        .circle(r.x, r.y, r.radius, 0x6b6157)
        .setStrokeStyle(2, 0x3f3933)
        .setDepth(Depth.obstacles);
      this.rubbleGroup.add(rock);
      (rock.body as Phaser.Physics.Arcade.StaticBody).setCircle(r.radius);
      this.rubbleBodies.set(r, rock);
    }
    for (const [r, rock] of this.rubbleBodies) {
      if (this.boss.rubble.includes(r)) continue;
      rock.destroy();
      this.rubbleBodies.delete(r);
    }
  }

  private openPause(): void {
    if (this.pauseOpen || this.levelUpOpen || this.ended || !this.scene.isActive()) return;
    this.pauseOpen = true;
    this.scene.pause();
    const controller: PauseController = {
      resume: () => {
        this.pauseOpen = false;
        this.controls.autoFire = getSave(this).state.settings.autoFire; // may have changed in settings
        this.scene.resume();
      },
      settings: () => this.scene.launch(SceneKeys.Settings, { overlay: true }),
      quit: () => {
        this.pauseOpen = false;
        this.scene.resume();
        if (this.pg) this.scene.start(SceneKeys.Menu);
        else this.endRun('defeat', 0);
      },
    };
    this.scene.launch(SceneKeys.Pause, { controller });
  }

  /** C: pause and show the build sheet (perks picked, stats, gun). */
  private openBuildSheet(): void {
    if (this.pauseOpen || this.levelUpOpen || this.ended) return;
    this.pauseOpen = true;
    this.scene.pause();
    this.scene.launch(SceneKeys.BuildSheet, this.buildSheetData());
  }

  private buildSheetData(): BuildSheetData {
    const d = this.gd;
    const rarityColor = { common: '#c9ccd1', rare: '#6aa8ff', epic: '#c98bff' } as const;
    const fmt = (stat: string, mode: 'add' | 'mult', v: number) =>
      (mode === 'mult' ? `+${Math.round(v * 100)}%` : `+${Math.round(v * 10) / 10}`) +
      ' ' +
      (STAT_LABELS[stat] ?? stat);

    // Perks stacked by card: "Light Boots ×2  +25% move speed".
    const perks = new Map<
      string,
      {
        name: string;
        count: number;
        total: number;
        stat: string;
        mode: 'add' | 'mult';
        best: 'common' | 'rare' | 'epic';
      }
    >();
    const rank = { common: 0, rare: 1, epic: 2 } as const;
    const lines: SheetLine[] = [];
    for (const p of this.run.picks) {
      if (p.kind === 'tinker') {
        const names = p.upgrades.map((u) => modName(d, u.modId) + ' +1').join(', ');
        lines.push({ text: `Gunsmith's Whim: ${names}`, color: '#5bc0be' });
        continue;
      }
      const def = d.cards.runStats.find((r) => r.id === p.cardId);
      const e = perks.get(p.cardId) ?? {
        name: def?.name ?? p.cardId,
        count: 0,
        total: 0,
        stat: p.stat,
        mode: p.mode,
        best: p.rarity,
      };
      e.count++;
      e.total += p.value;
      if (rank[p.rarity] > rank[e.best]) e.best = p.rarity;
      perks.set(p.cardId, e);
    }
    const perkLines: SheetLine[] = [...perks.values()].map((e) => ({
      text: `${e.name}${e.count > 1 ? ` ×${e.count}` : ''}   ${fmt(e.stat, e.mode, e.total)}`,
      color: rarityColor[e.best],
    }));

    // Stats: base (no market, no cards) against now.
    const base = baseStats(d.config, d.cards);
    const now = this.stats;
    const row = (label: string, b: number, n: number, unit = '', digits = 1): SheetLine => {
      const f = (v: number) => (Math.round(v * 10 ** digits) / 10 ** digits).toString();
      return {
        text: `${label}   ${f(b)}${unit} → ${f(n)}${unit}`,
        color: Math.abs(n - b) > 1e-6 ? UiColors.accent : undefined,
      };
    };
    const pct = (v: number) => v * 100;
    const stats: SheetLine[] = [
      row('Max HP', base.maxHp, now.maxHp, '', 0),
      row('Armour', base.defence, now.defence, '', 0),
      row('Move speed', base.moveSpeed, now.moveSpeed, ' u/s'),
      row('Damage', pct(base.damage), pct(now.damage), '%', 0),
      row('Fire rate', pct(base.fireRate), pct(now.fireRate), '%', 0),
      row('Reload speed', pct(base.reloadSpeed), pct(now.reloadSpeed), '%', 0),
      row('Bullet speed', pct(base.bulletSpeed), pct(now.bulletSpeed), '%', 0),
      row('Pickup radius', base.pickupRadius, now.pickupRadius, ' u'),
      row('HP regen', base.hpRegen, now.hpRegen, '/s'),
      row('Scrap gain', pct(base.scrapGain), pct(now.scrapGain), '%', 0),
    ];

    const gun: SheetLine[] = [
      { text: `${this.gun.name} · Core Tier ${this.run.build.coreTier}` },
      ...this.run.build.barrel.map((s, i) => ({
        text: `Barrel ${i + 1}: ${s ? slotLabel(d, s) : '—'}`,
      })),
      ...this.run.build.muzzle.map((m, i) => ({
        text: `Muzzle ${i + 1}: ${m ? muzzleLabel(d, m) : '—'}`,
      })),
      ...d.supportPerks
        .filter((p) => (this.run.support[p.id] ?? 0) > 0)
        .map((p) => ({ text: `Support: ${p.name} ${this.run.support[p.id]}/${p.levels.length}` })),
    ];

    return {
      perks: [...perkLines, ...lines],
      stats,
      gun,
      close: () => {
        this.pauseOpen = false;
        this.scene.resume();
      },
    };
  }

  /** Show the outcome for a moment, then the results screen. */
  private endRun(result: RunResult, delayMs = 1500): void {
    if (this.ended) return;
    if (this.pg) {
      // Training Ground: no results, score or silver. Dying (god mode off) restarts it.
      this.ended = true;
      this.player.stop();
      this.time.delayedCall(delayMs, () => this.restartPlayground(this.gun.id));
      return;
    }
    this.ended = true;
    this.run.result = result;
    this.player.stop();
    this.player.setBlinking(false, 0);
    if (result === 'defeat') {
      this.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55)
        .setScrollFactor(0)
        .setDepth(Depth.overlay - 1);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'THE SVAN HAS FALLEN', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '48px',
          fontStyle: 'bold',
          color: UiColors.danger,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(Depth.overlay);
    }
    const data: ResultsData = {
      summary: {
        result,
        timeSec: this.run.timeSec,
        kills: this.run.kills,
        eliteKills: this.run.eliteKills,
        bossKilled: this.run.bossKilled,
        silverPicked: this.run.silver,
      },
      gunId: this.gun.id,
      level: this.progression.level,
      build: JSON.parse(JSON.stringify(this.run.build)),
    };
    this.time.delayedCall(delayMs, () => this.scene.start(SceneKeys.Results, data));
  }

  // ---------- debug and test hooks ----------

  private debugLines(): string[] {
    const t = this.run.timeSec;
    const seg = this.director.segmentAt(t);
    return [
      `FPS ${this.game.loop.actualFps.toFixed(0)}`,
      `time ${formatTime(t)}  segment ${seg.name}`,
      `enemies ${this.enemies.activeCount}/${this.enemies.capacity}  max alive ${this.director.maxAliveAt(t)}`,
      `bullets ${this.bullets.activeCount}/${this.bullets.capacity}  enemy shots ${this.projectiles.activeCount}/${this.projectiles.capacity}`,
      `hp ${this.health.hp.toFixed(0)}/${this.health.maxHp}  kills ${this.run.kills}  seed ${this.run.seed}`,
      ...(debugMode
        ? [
            '',
            '1-5 spawn 10 of each enemy · E elite',
            'T +30 s · K kill all · L level up · B boss · G god mode ' + (this.health.godMode ? 'ON' : 'off'),
          ]
        : []),
    ];
  }

  /** ?debug=1 playtest controls (TDD: Tooling). */
  private installDebugKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const ids = this.gd.enemies.map((e) => e.id);
    kb.on('keydown', (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= ids.length) this.debugSpawn(ids[n - 1]!, 10);
      else if (e.key === 'e')
        this.debugSpawn(this.rng.pick(ids), 1, {
          elite: true,
          trait: this.rng.pick(['fast', 'deathBurst'] as const),
        });
      else if (e.key === 't') this.run.timeSec += 30;
      else if (e.key === 'k') this.killAll();
      else if (e.key === 'l') this.progression.add(this.progression.toNext);
      else if (e.key === 'b') this.run.timeSec = Math.max(this.run.timeSec, 330);
      else if (e.key === 'g') this.health.godMode = !this.health.godMode;
    });
  }

  private debugSpawn(
    enemy: string,
    count: number,
    opts: { elite?: boolean; trait?: EliteTrait } = {},
    radiusUnits = 10,
  ): number {
    return this.spawnRing(
      enemy,
      count,
      u(radiusUnits),
      this.player.x,
      this.player.y,
      this.run.timeSec / 60,
      opts,
    );
  }

  /** Kill every enemy except Training Ground dummies. */
  private killAll(): void {
    for (const e of this.enemies.enemies) if (e.active && !e.immortal) this.enemies.kill(e);
  }

  // ---------- Training Ground (dev tool) ----------

  /** Training Ground: the level-up screen in Workbench mode (every module, drag and drop). */
  private openWorkbench(): void {
    if (this.levelUpOpen || this.pauseOpen || this.ended) return;
    const d = this.gd;
    const all = () => this.run.build.barrel.length;
    const changed = <T>(value: T): T => {
      this.refreshStats();
      this.pg?.panel?.render();
      return value;
    };
    const controller: LevelUpController = {
      title: () => 'Workbench',
      queuedAfter: () => 0,
      build: () => this.run.build,
      unlocked: all,
      unlockLevel: () => 1,
      pipeline: () => this.pipeline,
      gun: () => this.gun,
      support: () => this.run.support,
      cards: () => [],
      rerollsLeft: () => 0,
      reroll: () => {},
      pick: (card, slot) => changed(applyCard(d, this.gun, this.run, card, slot, all())),
      move: (a, b) => changed(swapSlots(d, this.gun, this.run.build, a, b)),
      previewPlace: (slot, modId) =>
        previewPlace(d, this.run.build, this.layout(), slot, { id: modId, tier: 1 }, all()).events,
      previewMove: (a, b) => previewMove(d, this.run.build, this.layout(), a, b).events,
      previewMuzzle: (slot, id) => previewMuzzle(this.run.build.muzzle, slot, id),
      moveMuzzle: (a, b) => changed(moveMuzzle(this.run.build.muzzle, a, b)),
      hasMore: () => true,
      close: () => {
        this.levelUpOpen = false;
        if (panelWasOpen) this.pg?.panel?.toggle();
        this.scene.resume();
      },
      palette: () => [...d.barrelMods.map((m) => m.id), ...d.muzzles.pieces.map((m) => m.id)],
      remove: (slot) => {
        this.run.build.barrel[slot] = null;
        changed(null);
      },
      removeMuzzle: (slot) => {
        this.run.build.muzzle[slot] = null;
        changed(null);
      },
    };
    // The HTML panel sits over the left of the screen: hide it while the workbench is up.
    const panelWasOpen = this.pg?.panel?.visible ?? false;
    if (panelWasOpen) this.pg?.panel?.toggle();
    this.levelUpOpen = true;
    this.scene.pause();
    this.scene.launch(SceneKeys.LevelUp, { controller });
  }

  private startPlayground(opts: PlaygroundOptions): void {
    const helper = new Playground(this, this.gd, this.enemies, this.bus, () => this.run.timeSec);
    this.pg = { helper, panel: null, opts };
    this.health.godMode = opts.godMode;
    const panel = new PlaygroundPanel(this.playgroundController());
    this.pg.panel = panel;
    helper.onRefresh = () => panel.refreshReadout();
    this.input.keyboard?.on('keydown-F2', (e: KeyboardEvent) => {
      e.preventDefault();
      panel.toggle();
    });
    this.input.keyboard?.on('keydown-B', () => this.openWorkbench());
    this.showMessage('Training Ground · F2 dev panel · B workbench (drag and drop)', 5);
  }

  private restartPlayground(gunId: string): void {
    const data: GameSceneData = {
      gunId,
      seed: this.run.seed,
      mode: 'playground',
      playground: { ...(this.pg?.opts ?? { godMode: true, marketBuffs: false }) },
    };
    this.scene.restart(data);
  }

  private applyPerk(cardId: string, rarity: Rarity): void {
    const def = getById(this.gd.cards.runStats, cardId, 'run stat card');
    const value = def.values[rarity];
    applyCard(this.gd, this.gun, this.run, {
      type: 'runStat',
      cardId,
      rarity,
      stat: def.stat,
      mode: def.mode,
      value,
    });
    this.run.picks.push({ kind: 'perk', cardId, rarity, stat: def.stat, mode: def.mode, value });
  }

  private openSlots(): number {
    return unlockedSlots(this.gd, this.progression.level, this.run.build.barrel.length);
  }

  private layout() {
    return layoutOf(this.gun, this.run.build.barrel.length);
  }

  private playgroundController(): PlaygroundController {
    const pg = () => this.pg!;
    /** Run a build change, then recompute the gun and redraw the panel. */
    const change = (fn: () => void) => {
      fn();
      this.refreshStats();
      this.pg?.panel?.render();
    };
    return {
      data: this.gd,
      gunId: () => this.gun.id,
      build: () => this.run.build,
      layout: () => this.pipeline.layout,
      pipeline: () => this.pipeline,
      support: () => this.run.support,
      perkCounts: () => {
        const counts: Record<string, number> = {};
        for (const p of this.run.picks) if (p.kind === 'perk') counts[p.cardId] = (counts[p.cardId] ?? 0) + 1;
        return counts;
      },
      setGun: (id) => this.restartPlayground(id),
      setSlot: (i, slot, fuse) =>
        change(() => {
          if (fuse && slot) applyCard(this.gd, this.gun, this.run, moduleCard(this.gd, slot.id), i);
          else setSlot(this.run.build, i, slot);
        }),
      swap: (a, b, fuse) =>
        change(() => {
          if (fuse) swapSlots(this.gd, this.gun, this.run.build, a, b);
          else {
            const t = this.run.build.barrel[a] ?? null;
            this.run.build.barrel[a] = this.run.build.barrel[b] ?? null;
            this.run.build.barrel[b] = t;
          }
        }),
      setMuzzle: (i, slot) =>
        change(() => {
          this.run.build.muzzle[i] = slot ? { ...slot } : null;
        }),
      setSupport: (id, level) =>
        change(() => {
          if (level > 0) this.run.support[id] = level;
          else delete this.run.support[id];
        }),
      setCoreTier: (tier) =>
        change(() => {
          this.run.build.coreTier = tier;
        }),
      addPerk: (cardId, rarity) => change(() => this.applyPerk(cardId, rarity)),
      resetBuild: () =>
        change(() => {
          this.run.build = buildForGun(this.gun);
        }),
      resetPerks: () =>
        change(() => {
          this.run.runBonuses = emptyBonuses();
          this.run.support = startingSupport(this.gun);
          this.run.picks = [];
        }),
      resetMeters: () => {
        pg().helper.meter.reset();
        pg().panel?.refreshReadout();
      },
      respawnDummies: () => pg().helper.respawn(),
      openWorkbench: () => this.openWorkbench(),
      clearEnemies: () => {
        for (const e of this.enemies.enemies) if (e.active && !e.immortal) this.enemies.release(e);
        this.projectiles.releaseAll();
      },
      spawnEnemies: (id, count, elite) => {
        this.debugSpawn(id, count, elite ? { elite: true, trait: 'fast' } : {});
      },
      godMode: () => this.health.godMode,
      setGodMode: (on) => {
        this.health.godMode = on;
        pg().opts.godMode = on;
      },
      marketBuffs: () => pg().opts.marketBuffs,
      setMarketBuffs: (on) =>
        change(() => {
          pg().opts.marketBuffs = on;
          this.meta = on ? metaBonuses(getSave(this).state, this.gd.buffs) : emptyBonuses();
        }),
      readout: () => pg().helper.stats('all'),
    };
  }

  private installTestApi(): void {
    if (!testHookEnabled || !window.__svan) return;
    window.__svan.run = {
      state: () => ({
        gunId: this.gun.id,
        seed: this.run.seed,
        timeSec: this.run.timeSec,
        x: toUnits(this.player.x),
        y: toUnits(this.player.y),
        hp: this.health.hp,
        maxHp: this.health.maxHp,
        invulnerable: this.health.invulnerable,
        slowed: this.slow.multiplier < 1,
        ammo: this.weapon.ammo,
        magSize: this.weapon.magSize,
        reloading: this.weapon.reloading,
        bulletsActive: this.bullets.activeCount,
        enemiesAlive: this.enemies.activeCount,
        maxAlive: this.director.maxAliveAt(this.run.timeSec),
        kills: this.run.kills,
        eliteKills: this.run.eliteKills,
        ended: this.ended,
        level: this.progression.level,
        levelUpOpen: this.levelUpOpen,
        cardsPicked: this.cardsPicked,
        silver: this.run.silver,
        result: this.run.result,
      }),
      enemies: () =>
        this.enemies.enemies
          .filter((e) => e.active)
          .map((e) => ({
            type: e.def.id,
            elite: e.elite,
            x: toUnits(e.x),
            y: toUnits(e.y),
            hp: e.hp,
            state: e.state,
          })),
      damagePlayer: (amount) => this.health.takeHit(amount),
      setGodMode: (on) => {
        this.health.godMode = on;
      },
      spawnEnemies: (enemy, count, opts = {}) =>
        this.debugSpawn(
          enemy,
          count,
          { elite: opts.elite ?? false, ...(opts.trait ? { trait: opts.trait } : {}) },
          opts.radius ?? 10,
        ),
      skipTime: (seconds) => {
        this.run.timeSec += seconds;
      },
      killAll: () => this.killAll(),
      spawnBoss: () => {
        const at = this.gd.timeline.events.find((e) => e.type === 'boss')!.at;
        if (this.run.timeSec < at) this.run.timeSec = at;
      },
      boss: () =>
        this.boss.alive
          ? {
              phase: this.boss.phase + 1,
              hp: this.boss.enemy!.hp,
              maxHp: this.boss.enemy!.maxHp,
              enraged: this.boss.enraged,
            }
          : null,
      damageBoss: (amount) => {
        if (this.boss.alive) this.enemies.damage(this.boss.enemy!, amount, true);
      },
      grantScrap: (amount) => {
        this.progression.add(amount);
      },
      build: () => JSON.parse(JSON.stringify(this.run.build)),
      setBuild: (build) => {
        this.run.build = JSON.parse(JSON.stringify(build));
        this.refreshStats();
      },
      queueHand: (cards) => {
        this.forcedHand = JSON.parse(JSON.stringify(cards));
      },
      support: () => ({ ...this.run.support }),
      pickups: () =>
        this.pickups.pickups
          .filter((p) => p.active)
          .map((p) => ({ kind: p.kind, value: p.value, x: toUnits(p.x), y: toUnits(p.y) })),
    };
    const pg = this.pg;
    if (pg) {
      window.__svan.run.playground = {
        dps: (uid) => pg.helper.stats(uid ?? 'all'),
        dummies: () => pg.helper.dummyStates(),
        resetMeters: () => pg.helper.meter.reset(),
        panelVisible: () => pg.panel?.visible ?? false,
      };
    }
  }
}
