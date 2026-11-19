import type Phaser from 'phaser';
import type { GameData } from '../data/types';

const KEY = 'svan:gameData';

/** Stored once by BootScene after validation; read-only afterwards. */
export function setGameData(game: Phaser.Game, data: GameData): void {
  game.registry.set(KEY, data);
}

export function getGameData(scene: Phaser.Scene): GameData {
  const data = scene.registry.get(KEY) as GameData | undefined;
  if (!data) throw new Error('Game data not loaded: scenes must start after BootScene.');
  return data;
}
