import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATA_FILES, MAP_FILES, type DataFileKey } from '../../src/config';
import { parseGameData } from '../../src/data/registry';
import type { GameData } from '../../src/data/types';

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

const readJson = (rel: string): unknown => JSON.parse(readFileSync(publicDir + rel, 'utf8'));

/** Raw (unvalidated) JSON, the same files BootScene loads. Fresh copies on every call. */
export function loadRawData(): { files: Record<DataFileKey, unknown>; maps: Record<string, unknown> } {
  const files = Object.fromEntries(DATA_FILES.map((k) => [k, readJson(`data/${k}.json`)])) as Record<
    DataFileKey,
    unknown
  >;
  const maps = Object.fromEntries(MAP_FILES.map((k) => [k, readJson(`maps/${k}.json`)]));
  return { files, maps };
}

/** Validated game data for system tests. */
export function loadGameData(): GameData {
  const { files, maps } = loadRawData();
  return parseGameData(files, maps);
}
