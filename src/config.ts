/**
 * Technical constants: screen size, unit scale, scene keys, storage keys.
 * Gameplay tuning numbers do NOT belong here; they live in public/data/*.json.
 */

/** Logical resolution; the canvas is scaled to fit the window. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** 1 design unit = 32 px. Data files are in units; convert with u() from core/math. */
export const UNIT_PX = 32;

export const SceneKeys = {
  Boot: 'boot',
  Menu: 'menu',
  GunSelect: 'gunSelect',
  Game: 'game',
  Hud: 'hud',
  LevelUp: 'levelUp',
  Chest: 'chest',
  Pause: 'pause',
  Results: 'results',
  Market: 'market',
  HighScores: 'highScores',
  Settings: 'settings',
  BuildSheet: 'buildSheet',
} as const;
export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];

export const SAVE_KEY = 'svan-and-gun:save';
export const BROKEN_SAVE_KEY = 'svan-and-gun:save:broken';

/** Data files loaded at boot from public/data (key = file name without .json). */
export const DATA_FILES = [
  'config',
  'guns',
  'barrelMods',
  'supportPerks',
  'muzzles',
  'enemies',
  'boss',
  'timeline',
  'cards',
  'items',
  'buffs',
  'drops',
  'playground',
] as const;
export type DataFileKey = (typeof DATA_FILES)[number];

export const MAP_FILES = ['level1', 'playground'] as const;
export type MapKey = (typeof MAP_FILES)[number];

/** Shared colours for placeholder UI (not gameplay tuning). */
export const UiColors = {
  background: 0x111317,
  panel: 0x1f232b,
  text: '#e8e6e3',
  textDim: '#9aa0a6',
  accent: '#f2b632',
  danger: '#e0533d',
} as const;
