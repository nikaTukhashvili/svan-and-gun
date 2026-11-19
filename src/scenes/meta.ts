/**
 * Shared access to the SaveSystem (MetaState) from any scene, plus the hooks that write to it.
 */
import type Phaser from 'phaser';
import { BROKEN_SAVE_KEY, SAVE_KEY } from '../config';
import type { GameData } from '../data/types';
import { addHighScore, SaveSystem, type KeyValueStore, type Settings } from '../systems/save';
import { setRunRecorder } from './ResultsScene';

const KEY = 'svan:save';

function browserStorage(): KeyValueStore | null {
  try {
    return window.localStorage; // can throw in sandboxed iframes / blocked storage
  } catch {
    return null;
  }
}

/** Load the save at boot, apply settings, and record every finished run into it. */
export function initSave(game: Phaser.Game, data: GameData): SaveSystem {
  const save = new SaveSystem(browserStorage(), SAVE_KEY, BROKEN_SAVE_KEY);
  save.load();
  game.registry.set(KEY, save);
  applySettings(game, save.state.settings);

  setRunRecorder(({ data: run, score, silver }) => {
    const s = save.state;
    s.silver += silver;
    const r = addHighScore(
      s.highScores,
      {
        score,
        gun: run.gunId,
        timeSec: Math.floor(run.summary.timeSec),
        result: run.summary.result,
        date: new Date().toISOString().slice(0, 10),
      },
      data.config.highScoreCount,
    );
    s.highScores = r.list;
    save.save();
    return { newBest: r.newBest };
  });
  return save;
}

export function getSave(scene: Phaser.Scene): SaveSystem {
  const s = scene.registry.get(KEY) as SaveSystem | undefined;
  if (!s) throw new Error('Save not loaded: scenes must start after BootScene.');
  return s;
}

/** Settings that act on the whole game. Fullscreen is applied only from a click (browser rule). */
export function applySettings(game: Phaser.Game, settings: Settings): void {
  game.sound.volume = settings.volume;
}

export function saveNoticeText(save: SaveSystem): string | null {
  if (save.notice === 'broken') return 'Your save file was damaged and has been reset (a backup was kept).';
  if (save.notice === 'unavailable') return 'Browser storage is blocked: progress will not be saved.';
  return null;
}
