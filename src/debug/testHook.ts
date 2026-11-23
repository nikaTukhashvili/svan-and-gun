/**
 * window.__svan: a test hook for Playwright and console debugging.
 * Installed only in dev and test builds (never in a production build).
 * Later tasks extend it: skip time, grant scrap, kill boss (TDD: Testing).
 */
import Phaser from 'phaser';
import { SceneKeys } from '../config';
import type { RunResult } from '../core/events';
import type { Card, RunBuild } from '../systems/build';
import type { DpsStats } from '../systems/dpsMeter';
import type { ChestChoice, ChestKind, Equipment } from '../systems/items';
import type { PlayerStats } from '../systems/stats';
import type { LevelUpScene } from '../scenes/LevelUpScene';
import { freshSave, type SaveSystem, type SaveV1 } from '../systems/save';

/** Snapshot of the current run for tests. Positions in units. */
export interface RunDebugState {
  gunId: string;
  seed: number;
  timeSec: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invulnerable: boolean;
  ammo: number;
  magSize: number;
  reloading: boolean;
  slowed: boolean;
  bulletsActive: number;
  enemiesAlive: number;
  maxAlive: number;
  kills: number;
  eliteKills: number;
  ended: boolean;
  result: RunResult | null;
  level: number;
  levelUpOpen: boolean;
  chestOpen: boolean;
  /** Cards picked on level-up screens this run. */
  cardsPicked: number;
  /** Chest choices taken this run. */
  itemsTaken: number;
  silver: number;
  /** The device driving the player: twin-stick touch or keyboard and mouse. */
  controlMode: 'touch' | 'keyboard';
  /** The aim angle the controls gave last frame (radians). */
  aimAngle: number;
}

export interface EnemyDebugState {
  type: string;
  elite: boolean;
  x: number;
  y: number;
  hp: number;
  state: string;
}

/** Present while GameScene is running. */
export interface RunDebugApi {
  state(): RunDebugState;
  enemies(): EnemyDebugState[];
  /** Apply an enemy hit (defence and invulnerability apply). Returns damage taken. */
  damagePlayer(amount: number): number;
  setGodMode(on: boolean): void;
  /** Spawn a ring of enemies around the player (radius in units, default 10). Returns how many spawned. */
  spawnEnemies(
    enemy: string,
    count: number,
    opts?: { elite?: boolean; trait?: 'fast' | 'deathBurst'; radius?: number },
  ): number;
  /** Jump the run timer forward; timeline events in between fire on the next frame. */
  skipTime(seconds: number): void;
  killAll(): void;
  /** Jump to the boss time; the boss spawns on the next frame. */
  spawnBoss(): void;
  boss(): { phase: number; hp: number; maxHp: number; enraged: boolean } | null;
  damageBoss(amount: number): void;
  grantScrap(amount: number): void;
  build(): RunBuild;
  setBuild(build: RunBuild): void;
  /** The next level-up screen shows exactly these cards (then normal draws resume). */
  queueHand(cards: Card[]): void;
  /** Support perk levels taken. */
  support(): Record<string, number>;
  /** Items worn, one entry per paper-doll position. */
  equipment(): Equipment;
  /** Put an item (theme or legendary id, or null) in a paper-doll position; extras are rolled. */
  setItem(slot: number, id: string | null, level?: number): void;
  /** Queue a chest as if one was picked up; it opens on the next frame. */
  queueChest(kind?: ChestKind): void;
  /** The open chest's choices (empty when no chest is open). */
  chestChoices(): ChestChoice[];
  /** Current player stats (base, market, items and passives). */
  stats(): PlayerStats;
  pickups(): { kind: string; value: number; x: number; y: number }[];
  /** Present in the Training Ground only. */
  playground?: PlaygroundDebugApi;
}

/** Training Ground (dev tool) hooks. */
export interface PlaygroundDebugApi {
  /** All targets together, or one target by Enemy uid. */
  dps(uid?: number): DpsStats;
  dummies(): { id: string; uid: number; alive: boolean; hp: number; maxHp: number; stats: DpsStats }[];
  resetMeters(): void;
  panelVisible(): boolean;
}

export interface SvanTestHook {
  game: Phaser.Game;
  /** True once boot finished and the menu is up. */
  ready: boolean;
  /** Set when data validation fails at boot. */
  bootError: string | null;
  renderer(): 'webgl' | 'canvas';
  activeScenes(): string[];
  textureExists(key: string): boolean;
  fps(): number;
  /** Stop every scene and start a run with this gun and seed. */
  startRun(gunId: string, seed?: number): void;
  /** Stop every scene and open the Training Ground with this gun. */
  startPlayground(gunId: string): void;
  run?: RunDebugApi;
  /** Slot centres on the open level-up screen (game coordinates), or null when it is closed. */
  levelUpSlots(): { y: number; barrel: number[]; muzzle: number[] } | null;
  /** The save (MetaState): read it, give silver, wipe it. */
  meta?: { state(): SaveV1; setSilver(n: number): void; reset(): void };
}

declare global {
  interface Window {
    __svan?: SvanTestHook;
  }
}

export const testHookEnabled = import.meta.env.DEV || import.meta.env.MODE === 'test';

export function installTestHook(game: Phaser.Game): void {
  if (!testHookEnabled) return;
  window.__svan = {
    game,
    ready: false,
    bootError: null,
    renderer: () => (game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas'),
    activeScenes: () => game.scene.getScenes(true).map((s) => s.sys.settings.key),
    textureExists: (key) => game.textures.exists(key),
    fps: () => game.loop.actualFps,
    levelUpSlots: () => {
      if (!game.scene.isActive(SceneKeys.LevelUp)) return null;
      return (game.scene.getScene(SceneKeys.LevelUp) as LevelUpScene).slotCenters();
    },
    startRun: (gunId, seed = 1) => {
      for (const s of game.scene.getScenes(true)) game.scene.stop(s.sys.settings.key);
      game.scene.start(SceneKeys.Game, { gunId, seed });
    },
    startPlayground: (gunId) => {
      for (const s of game.scene.getScenes(true)) game.scene.stop(s.sys.settings.key);
      game.scene.start(SceneKeys.Game, { gunId, seed: 1, mode: 'playground' });
    },
  };
}

export function installMetaHook(save: SaveSystem): void {
  if (!window.__svan) return;
  window.__svan.meta = {
    state: () => JSON.parse(JSON.stringify(save.state)) as SaveV1,
    setSilver: (n) => {
      save.state.silver = n;
      save.save();
    },
    reset: () => {
      save.state = freshSave();
      save.save();
    },
  };
}

export function markReady(): void {
  if (window.__svan) window.__svan.ready = true;
}

export function markBootError(message: string): void {
  if (window.__svan) window.__svan.bootError = message;
}
