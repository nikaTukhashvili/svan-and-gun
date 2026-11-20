/**
 * DataRegistry: validates raw JSON (already fetched or read from disk) and returns typed,
 * read-only GameData. Pure: no Phaser, no fetch. BootScene feeds it from the Phaser loader;
 * unit tests feed it from the file system.
 *
 * Two passes:
 *  1. each file against its zod schema;
 *  2. cross-file checks (ids that point at other files, level counts, timeline gaps).
 * All problems are collected and thrown together, so one boot shows every mistake.
 */
import type { z } from 'zod';
import type { DataFileKey } from '../config';
import {
  BarrelModsSchema,
  BossSchema,
  BuffsSchema,
  CardsSchema,
  ConfigSchema,
  DropsSchema,
  EnemiesSchema,
  GunsSchema,
  SupportPerksSchema,
  MapSchema,
  MuzzlesSchema,
  PlaygroundSchema,
  TimelineSchema,
} from './schemas';
import type { GameData, MapDef } from './types';

export class DataValidationError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(
      `Game data is invalid (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n- ${problems.join('\n- ')}`,
    );
    this.name = 'DataValidationError';
  }
}

const fileSchemas = {
  config: ConfigSchema,
  guns: GunsSchema,
  barrelMods: BarrelModsSchema,
  supportPerks: SupportPerksSchema,
  muzzles: MuzzlesSchema,
  enemies: EnemiesSchema,
  boss: BossSchema,
  timeline: TimelineSchema,
  cards: CardsSchema,
  buffs: BuffsSchema,
  drops: DropsSchema,
  playground: PlaygroundSchema,
} satisfies Record<DataFileKey, z.ZodType>;

type Parsed = { [K in DataFileKey]: z.infer<(typeof fileSchemas)[K]> };

function formatIssues(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${file}${i.path.length ? ' > ' + i.path.join('.') : ''}: ${i.message}`);
}

/** Validate everything. Throws DataValidationError listing every problem found. */
export function parseGameData(
  files: Readonly<Record<DataFileKey, unknown>>,
  maps: Readonly<Record<string, unknown>>,
): GameData {
  const problems: string[] = [];
  const parsed: Partial<Parsed> = {};

  for (const key of Object.keys(fileSchemas) as DataFileKey[]) {
    const raw = files[key];
    if (raw === undefined) {
      problems.push(`${key}.json: file missing`);
      continue;
    }
    const result = fileSchemas[key].safeParse(raw);
    if (result.success) (parsed as Record<string, unknown>)[key] = result.data;
    else problems.push(...formatIssues(`${key}.json`, result.error));
  }

  const parsedMaps: Record<string, MapDef> = {};
  for (const [key, raw] of Object.entries(maps)) {
    const result = MapSchema.safeParse(raw);
    if (result.success) parsedMaps[key] = result.data;
    else problems.push(...formatIssues(`maps/${key}.json`, result.error));
  }

  // Cross-file checks only make sense once every file parsed.
  if (problems.length === 0) {
    const data = { ...(parsed as Parsed), maps: parsedMaps };
    problems.push(...crossCheck(data));
    if (problems.length === 0) return deepFreeze(data);
  }
  throw new DataValidationError(problems);
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

function crossCheck(d: Parsed & { maps: Record<string, MapDef> }): string[] {
  const p: string[] = [];
  const enemyIds = new Set(d.enemies.map((e) => e.id));
  const { barrelUnlockLevels } = d.config.slots;

  // Unique ids per file.
  for (const [file, ids] of [
    ['guns', d.guns.map((g) => g.id)],
    ['barrelMods', d.barrelMods.map((m) => m.id)],
    ['supportPerks', d.supportPerks.map((m) => m.id)],
    // Barrel modules and muzzle pieces share the workbench palette: ids must not clash.
    ['barrelMods + muzzles', [...d.barrelMods.map((m) => m.id), ...d.muzzles.pieces.map((m) => m.id)]],
    ['enemies', d.enemies.map((e) => e.id)],
    ['buffs', d.buffs.map((b) => b.id)],
    ['cards.runStats', d.cards.runStats.map((c) => c.id)],
  ] as const) {
    for (const id of duplicates(ids)) p.push(`${file}.json: duplicate id "${id}"`);
  }

  // Slot unlocks ascending; barrel slot 1 open from level 1.
  // Non-decreasing: several slots may open at the same level (all at level 1 by default).
  const ascending = (xs: number[]) => xs.every((x, i) => i === 0 || x >= xs[i - 1]!);
  if (barrelUnlockLevels[0] !== 1)
    p.push('config.json > slots.barrelUnlockLevels: slot 1 must unlock at level 1');
  if (!ascending(barrelUnlockLevels)) p.push('config.json > slots.barrelUnlockLevels: must be ascending');
  for (const g of d.guns) {
    const where = 'guns.json > ' + g.id + ' > barrel';
    if (g.barrel.slots % g.barrel.chains !== 0) p.push(where + ': slots must split evenly into chains');
    if (g.barrel.slots > d.config.slots.maxTotalSlots)
      p.push(where + ': more slots than config.slots.maxTotalSlots');
    if (g.barrel.critChamberMult > 0 && g.critEveryN === 0)
      p.push(where + ': a crit chamber needs a gun with crits (critEveryN > 0)');
    for (const [perk, level] of Object.entries(g.startingSupport ?? {})) {
      const def = d.supportPerks.find((s) => s.id === perk);
      if (!def) p.push(`guns.json > ${g.id} > startingSupport: unknown support perk "${perk}"`);
      else if (level > def.levels.length)
        p.push(`guns.json > ${g.id} > startingSupport: ${perk} has only ${def.levels.length} levels`);
    }
  }

  // Level-up paths: unique ids; every card type in exactly one path.
  for (const id of duplicates(d.cards.paths.map((x) => x.id)))
    p.push(`cards.json > paths: duplicate id "${id}"`);
  for (const type of Object.keys(d.cards.typeWeights)) {
    const n = d.cards.paths.filter((x) => x.types.includes(type as never)).length;
    if (n !== 1) p.push(`cards.json > paths: card type "${type}" must be in exactly one path, found ${n}`);
  }

  // Muzzle pieces: perLevel only grows numbers the piece has.
  for (const m of d.muzzles.pieces) {
    if (Object.keys(m.base).length === 0) p.push(`muzzles.json > ${m.id}: base has no stats`);
    for (const key of Object.keys(m.perLevel))
      if (!(key in m.base)) p.push(`muzzles.json > ${m.id}: perLevel.${key} is not in base`);
  }

  // Barrel modules: placeholders exist; hybrids are made of two different elements, and every
  // pair of elements present has exactly one hybrid.
  for (const mod of d.barrelMods) {
    const where = `barrelMods.json > ${mod.id}`;
    const keys = mod.family === 'fitting' ? ['left', 'right'] : Object.keys(mod.base);
    for (const key of placeholders(mod.description))
      if (!keys.includes(key)) p.push(`${where}: description uses {${key}} but has no "${key}"`);
    if (mod.family === 'hybrid' && mod.parents[0] === mod.parents[1])
      p.push(`${where}: a hybrid needs two different parent elements`);
  }
  const elements = [...new Set(d.barrelMods.flatMap((m) => (m.family === 'element' ? [m.element] : [])))];
  for (const id of duplicates(d.barrelMods.flatMap((m) => (m.family === 'element' ? [m.element] : []))))
    p.push(`barrelMods.json: more than one module for element "${id}"`);
  for (let i = 0; i < elements.length; i++)
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i]!;
      const b = elements[j]!;
      const n = d.barrelMods.filter(
        (m) => m.family === 'hybrid' && m.parents.includes(a) && m.parents.includes(b),
      ).length;
      if (n !== 1) p.push(`barrelMods.json: elements ${a} + ${b} need exactly one hybrid, found ${n}`);
    }
  for (const m of d.barrelMods)
    if (m.family === 'hybrid')
      for (const el of m.parents)
        if (!elements.includes(el)) p.push(`barrelMods.json > ${m.id}: no element module for parent "${el}"`);

  // Support perks: placeholders exist in every level.
  for (const perk of d.supportPerks)
    for (const key of placeholders(perk.description))
      perk.levels.forEach((lvl, i) => {
        if (!(key in lvl))
          p.push(
            `supportPerks.json > ${perk.id}: description uses {${key}} but level ${i + 1} has no "${key}"`,
          );
      });

  // Guns: Double Barrel style multi-pellet guns need a spread.
  for (const g of d.guns) {
    if (g.pellets > 1 && g.spreadDeg === 0)
      p.push(`guns.json > ${g.id}: ${g.pellets} pellets but spreadDeg is 0`);
  }

  // Enemies: caster keep-distance band is ordered.
  for (const e of d.enemies) {
    if (e.behaviour.type === 'caster' && e.behaviour.keepMin >= e.behaviour.keepMax)
      p.push(`enemies.json > ${e.id}: behaviour.keepMin must be below keepMax`);
  }

  // Boss: phases start at full HP and go down; summon points at a real enemy.
  const phases = d.boss.phases;
  if (phases[0]?.fromHp !== 1) p.push('boss.json > phases: the first phase must start at fromHp 1');
  phases.forEach((ph, i) => {
    if (i > 0 && ph.fromHp >= phases[i - 1]!.fromHp)
      p.push(`boss.json > phases.${i}: fromHp must be lower than the previous phase`);
  });
  if (!enemyIds.has(d.boss.attacks.summon.enemy))
    p.push(`boss.json > attacks.summon.enemy: unknown enemy "${d.boss.attacks.summon.enemy}"`);

  // Timeline: contiguous segments from 0, only the last is open-ended, weights point at enemies.
  const segs = d.timeline.segments;
  segs.forEach((s, i) => {
    const where = `timeline.json > segments.${i} (${s.name})`;
    const isLast = i === segs.length - 1;
    if (i === 0 && s.from !== 0) p.push(`${where}: the first segment must start at 0`);
    if (i > 0 && s.from !== segs[i - 1]!.to)
      p.push(`${where}: starts at ${s.from}, previous ends at ${segs[i - 1]!.to}`);
    if (s.to === null && !isLast) p.push(`${where}: only the last segment may have "to": null`);
    if (s.to !== null && s.to <= s.from) p.push(`${where}: "to" must be after "from"`);
    for (const id of Object.keys(s.weights))
      if (!enemyIds.has(id)) p.push(`${where}: unknown enemy "${id}" in weights`);
    const hasWeight = Object.values(s.weights).some((w) => w > 0);
    if (s.spawnPerSecond > 0 && (!hasWeight || s.maxAlive === 0))
      p.push(`${where}: spawns enemies but has no positive weight or maxAlive is 0`);
  });

  const bossEvents = d.timeline.events.filter((e) => e.type === 'boss');
  if (bossEvents.length !== 1)
    p.push(`timeline.json > events: needs exactly one "boss" event, found ${bossEvents.length}`);
  d.timeline.events.forEach((e, i) => {
    const where = `timeline.json > events.${i} (${e.type})`;
    if ((e.type === 'elite' || e.type === 'swarmRing') && !enemyIds.has(e.enemy))
      p.push(`${where}: unknown enemy "${e.enemy}"`);
    if (e.type === 'boss' && e.boss !== d.boss.id) p.push(`${where}: unknown boss "${e.boss}"`);
  });

  // Drops: every enemy drops scrap; no scrap entries for unknown enemies.
  for (const id of enemyIds)
    if (!(id in d.drops.scrapByEnemy)) p.push(`drops.json > scrapByEnemy: missing enemy "${id}"`);
  for (const id of Object.keys(d.drops.scrapByEnemy))
    if (!enemyIds.has(id)) p.push(`drops.json > scrapByEnemy: unknown enemy "${id}"`);
  const { small, medium, large } = d.drops.scrapPieces;
  if (!(small < medium && medium < large)) p.push('drops.json > scrapPieces: must be small < medium < large');

  // Training Ground: the map exists, layout entries name a known dummy and stand inside the map.
  const pg = d.playground;
  for (const id of duplicates(pg.dummies.map((x) => x.id)))
    p.push(`playground.json: duplicate dummy "${id}"`);
  const pgMap = d.maps[pg.map];
  if (!pgMap) p.push(`playground.json > map: unknown map "${pg.map}"`);
  const dummyIds = new Set(pg.dummies.map((x) => x.id));
  for (const id of dummyIds)
    if (enemyIds.has(id) || id === d.boss.id) p.push(`playground.json: dummy id "${id}" is also an enemy id`);
  pg.layout.forEach((l, i) => {
    if (!dummyIds.has(l.dummy)) p.push(`playground.json > layout.${i}: unknown dummy "${l.dummy}"`);
    if (pgMap && (l.x > pgMap.width || l.y > pgMap.height))
      p.push(`playground.json > layout.${i}: (${l.x}, ${l.y}) is outside the map`);
  });

  // Maps: everything inside the bounds, the player does not start inside an obstacle.
  for (const [key, m] of Object.entries(d.maps)) {
    const where = `maps/${key}.json`;
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= m.width && y <= m.height;
    const pts: [string, number, number][] = [
      ['playerStart', m.playerStart.x, m.playerStart.y],
      ['tower', m.tower.x, m.tower.y],
      ...m.obstacles.map((o, i): [string, number, number] => [`obstacles.${i}`, o.x, o.y]),
      ...m.powderBarrels.map((b, i): [string, number, number] => [`powderBarrels.${i}`, b.x, b.y]),
      ...m.crates.map((c, i): [string, number, number] => [`crates.${i}`, c.x, c.y]),
    ];
    for (const [name, x, y] of pts)
      if (!inside(x, y)) p.push(`${where} > ${name}: (${x}, ${y}) is outside the map`);
    const { x: px, y: py } = m.playerStart;
    m.obstacles.forEach((o, i) => {
      const hit =
        o.shape === 'circle'
          ? (px - o.x) ** 2 + (py - o.y) ** 2 < o.r * o.r
          : Math.abs(px - o.x) < o.w / 2 && Math.abs(py - o.y) < o.h / 2;
      if (hit) p.push(`${where} > playerStart: inside obstacles.${i}`);
    });
  }

  return p;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

// ---------- lookups ----------

/** Lookup helpers over validated data. Throw on unknown ids (a bug, not bad data). */
export function getById<T extends { id: string }>(items: readonly T[], id: string, what: string): T {
  const found = items.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown ${what} id "${id}"`);
  return found;
}
