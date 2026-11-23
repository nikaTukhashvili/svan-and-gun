/**
 * SaveSystem (T29): MetaState (silver, buff levels, high scores, settings) as one JSON object in
 * localStorage. Written after every run and every market purchase or refund; a run in progress
 * is never saved (TDD: Save, score and persistence).
 *
 * - `version` is checked at load; `migrations[from]` upgrades old saves step by step.
 * - A save that fails validation is backed up under the broken key and replaced, with a notice.
 * - If storage is blocked (private windows, strict iframes), the game keeps MetaState in memory
 *   and shows "progress will not be saved".
 */
import { z } from 'zod';
import { CONTROL_SETTINGS } from './inputMode';

export const SAVE_VERSION = 1;

const HighScoreSchema = z.strictObject({
  score: z.number().int().min(0),
  gun: z.string(),
  timeSec: z.number().min(0),
  result: z.enum(['victory', 'defeat']),
  date: z.string(),
});

const SettingsSchema = z.strictObject({
  volume: z.number().min(0).max(1),
  /** Background music, under the master volume. Defaults keep older saves valid. */
  musicVolume: z.number().min(0).max(1).default(0.6),
  musicMuted: z.boolean().default(false),
  autoFire: z.boolean(),
  /** Auto follows the last device used (touch or keyboard and mouse). */
  controls: z.enum(CONTROL_SETTINGS).default('auto'),
  screenShake: z.boolean(),
  fullscreen: z.boolean(),
});

export const SaveSchema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  silver: z.number().int().min(0),
  buffLevels: z.record(z.string(), z.number().int().min(0)),
  highScores: z.array(HighScoreSchema),
  settings: SettingsSchema,
});

export type SaveV1 = z.infer<typeof SaveSchema>;
export type HighScoreEntry = z.infer<typeof HighScoreSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

/** The subset of the Web Storage API the save system uses. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function freshSave(): SaveV1 {
  return {
    version: SAVE_VERSION,
    silver: 0,
    buffLevels: {},
    highScores: [],
    settings: {
      volume: 0.7,
      musicVolume: 0.6,
      musicMuted: false,
      autoFire: false,
      controls: 'auto',
      screenShake: true,
      fullscreen: false,
    },
  };
}

/** migrations[n] turns a version-n save into version n+1. Empty until a v2 exists. */
export const migrations: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {};

export type SaveNotice = 'broken' | 'unavailable' | null;

export class SaveSystem {
  state: SaveV1 = freshSave();
  notice: SaveNotice = null;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly key: string,
    private readonly brokenKey: string,
  ) {}

  /** Load (or create) the save. Never throws. */
  load(): SaveV1 {
    if (!this.store) {
      this.notice = 'unavailable';
      return (this.state = freshSave());
    }
    let raw: string | null;
    try {
      raw = this.store.getItem(this.key);
    } catch {
      this.notice = 'unavailable';
      return (this.state = freshSave());
    }
    if (raw === null) return (this.state = freshSave());

    try {
      let data = JSON.parse(raw) as Record<string, unknown>;
      let v = typeof data.version === 'number' ? data.version : 0;
      while (v < SAVE_VERSION && migrations[v]) {
        data = migrations[v]!(data);
        v++;
      }
      this.state = SaveSchema.parse(data);
    } catch {
      this.notice = 'broken';
      this.write(this.brokenKey, raw);
      this.state = freshSave();
      this.save();
    }
    return this.state;
  }

  /** Write the current state. Returns false if storage is unavailable. */
  save(): boolean {
    return this.write(this.key, JSON.stringify(this.state));
  }

  private write(key: string, value: string): boolean {
    if (!this.store) return false;
    try {
      this.store.setItem(key, value);
      return true;
    } catch {
      this.notice = 'unavailable';
      return false;
    }
  }
}

/** Insert a score, keep the top `max` sorted by score (best first). */
export function addHighScore(
  list: HighScoreEntry[],
  entry: HighScoreEntry,
  max: number,
): { list: HighScoreEntry[]; rank: number | null; newBest: boolean } {
  const best = list[0]?.score ?? -1;
  const next = [...list, entry].sort((a, b) => b.score - a.score).slice(0, max);
  const idx = next.indexOf(entry);
  return { list: next, rank: idx === -1 ? null : idx + 1, newBest: entry.score > best };
}
