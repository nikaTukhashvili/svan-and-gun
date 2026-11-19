import Phaser from 'phaser';
import {
  DATA_FILES,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAP_FILES,
  SceneKeys,
  UiColors,
  type DataFileKey,
} from '../config';
import { DataValidationError, parseGameData } from '../data/registry';
import { markBootError } from '../debug/testHook';
import { setGameData } from './gameData';
import { initSave } from './meta';
import { installMetaHook } from '../debug/testHook';
import { generatePlaceholderTextures } from './placeholderTextures';

const mapCacheKey = (key: string) => `map:${key}`;

/** Loads and validates every data file, builds placeholder textures, then opens the menu. */
export class BootScene extends Phaser.Scene {
  private loadErrors: string[] = [];

  constructor() {
    super(SceneKeys.Boot);
  }

  init(): void {
    this.loadErrors = [];
  }

  preload(): void {
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Loading...', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: UiColors.textDim,
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.loadErrors.push(`Could not load ${file.src}`);
    });
    for (const key of DATA_FILES) this.load.json(key, `data/${key}.json`);
    for (const key of MAP_FILES) this.load.json(mapCacheKey(key), `maps/${key}.json`);
  }

  create(): void {
    if (this.loadErrors.length > 0) {
      this.showError(this.loadErrors);
      return;
    }

    const files = Object.fromEntries(DATA_FILES.map((k) => [k, this.cache.json.get(k) as unknown])) as Record<
      DataFileKey,
      unknown
    >;
    const maps = Object.fromEntries(
      MAP_FILES.map((k) => [k, this.cache.json.get(mapCacheKey(k)) as unknown]),
    );

    try {
      const data = parseGameData(files, maps);
      setGameData(this.game, data);
      installMetaHook(initSave(this.game, data));
      generatePlaceholderTextures(this, data);
    } catch (err) {
      const problems = err instanceof DataValidationError ? [...err.problems] : [String(err)];
      this.showError(problems);
      return;
    }

    this.scene.start(SceneKeys.Menu);
  }

  /** Bad tuning data stops the game with a readable list instead of a black screen. */
  private showError(problems: string[]): void {
    const message = problems.join('\n');
    console.error(`[boot] Game data is invalid:\n${message}`);
    markBootError(message);
    this.children.removeAll(true);
    this.add.text(40, 40, 'Game data is invalid', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: UiColors.danger,
    });
    this.add.text(
      40,
      90,
      problems.slice(0, 25).join('\n') +
        (problems.length > 25 ? `\n...and ${problems.length - 25} more (see console)` : ''),
      {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: UiColors.text,
        wordWrap: { width: GAME_WIDTH - 80 },
      },
    );
  }
}
