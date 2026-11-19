/**
 * zod schemas for every data file in public/data and public/maps.
 * TypeScript types are inferred from these (see types.ts), so data and code cannot drift.
 * Objects are strict: a misspelled key fails at boot instead of being silently ignored.
 */
import { z } from 'zod';

// ---------- shared primitives ----------

const pos = z.number().positive();
const nonNeg = z.number().min(0);
const unit01 = z.number().min(0).max(1);
const posInt = z.number().int().positive();
const nonNegInt = z.number().int().min(0);
/** snake_case ids: lower case letters, digits and underscores. */
export const IdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids are snake_case');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colours are #rrggbb');
const point = z.strictObject({ x: nonNeg, y: nonNeg });

export const StatIdSchema = z.enum([
  'maxHp',
  'defence',
  'moveSpeed',
  'fireRate',
  'bulletSpeed',
  'damage',
  'reloadSpeed',
  'pickupRadius',
  'hpRegen',
  'scrapGain',
  'rerolls',
  'revives',
]);
/** "add": flat bonus (max HP +10). "mult": percentage bonus (fire rate +4%). */
export const StatModeSchema = z.enum(['add', 'mult']);
export const RaritySchema = z.enum(['common', 'rare', 'epic']);
const byRarity = <T extends z.ZodType>(t: T) => z.strictObject({ common: t, rare: t, epic: t });

// ---------- config.json ----------

export const ConfigSchema = z.strictObject({
  player: z.strictObject({
    maxHp: pos,
    defence: nonNeg,
    moveSpeed: pos,
    fireRate: pos,
    bulletSpeed: pos,
    damage: pos,
    reloadSpeed: pos,
    pickupRadius: pos,
    hpRegen: nonNeg,
    scrapGain: pos,
    radius: pos,
    invulnerableSec: nonNeg,
    /** Second Wind: HP fraction after a revive, and invulnerability right after it. */
    reviveHpFraction: z.number().gt(0).max(1),
    reviveInvulnerableSec: nonNeg,
  }),
  combat: z.strictObject({
    minDamage: pos,
    critMultiplier: pos,
    maxFrameDeltaMs: pos,
    statusTickSec: pos,
  }),
  xp: z.strictObject({ base: pos, step: nonNeg }),
  slots: z.strictObject({
    barrelUnlockLevels: z.array(posInt).length(4),
    magazineUnlockLevels: z.array(posInt).length(2),
    maxModLevel: posInt,
    maxCoreTier: posInt,
  }),
  enemies: z.strictObject({
    hpScalePerMinute: nonNeg,
    elite: z.strictObject({
      hpMult: pos,
      defenceBonus: nonNeg,
      scale: pos,
      fastSpeedMult: pos,
      deathBurst: z.strictObject({ damage: pos, radius: pos, delaySec: nonNeg }),
    }),
  }),
  caps: z.strictObject({
    maxBullets: posInt,
    maxEnemyProjectiles: posInt,
    maxEnemies: posInt,
    maxPickups: posInt,
    maxBulletGeneration: nonNegInt,
    maxChildrenPerHit: posInt,
  }),
  pickups: z.strictObject({ mergeThreshold: posInt, magnetSpeed: pos }),
  world: z.strictObject({ spatialHashCellUnits: pos, cullDistanceScreens: pos }),
  silver: z.strictObject({ perKills: posInt, victoryBonus: nonNegInt }),
  score: z.strictObject({
    perKill: nonNeg,
    perElite: nonNeg,
    boss: nonNeg,
    perSecond: nonNeg,
    victory: nonNeg,
  }),
  highScoreCount: posInt,
});

// ---------- guns.json ----------

export const GunSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  role: z.string().min(1),
  traitText: z.string().min(1),
  damage: pos,
  pellets: posInt,
  shotsPerSecond: pos,
  magSize: posInt,
  reloadSec: pos,
  spreadDeg: nonNeg,
  range: pos,
  bulletSpeed: pos,
  pierce: nonNegInt,
  knockback: nonNeg,
  /** Every Nth bullet is a free crit; 0 = no crit trait. */
  critEveryN: nonNegInt,
  tierBonus: z.strictObject({ damage: nonNeg, fireRate: nonNeg }),
});
export const GunsSchema = z.array(GunSchema).min(1);

// ---------- barrelMods.json / magazineMods.json ----------

export const ElementSchema = z.enum(['fire', 'poison', 'lightning']);
export const BarrelHookSchema = z.enum(['stats', 'onFire', 'onHit']);
export const MagazineHookSchema = z.enum([
  'stats',
  'onReloadStart',
  'onMagazineEmpty',
  'onLastRound',
  'onKill',
]);

/**
 * One mod definition. `levels[i]` holds the numbers for mod level i+1.
 * `description` may use {param} placeholders, filled from the level's numbers.
 */
const levelsOf = <P extends z.ZodRawShape>(params: P) => z.array(z.strictObject(params)).min(1);

const barrel = <Id extends string, P extends z.ZodRawShape, E extends z.ZodType = z.ZodNull>(
  id: Id,
  params: P,
  element?: E,
) =>
  z.strictObject({
    id: z.literal(id),
    name: z.string().min(1),
    description: z.string().min(1),
    element: (element ?? z.null()) as E,
    hooks: z.array(BarrelHookSchema).min(1),
    levels: levelsOf(params),
  });

export const BarrelModSchema = z.discriminatedUnion('id', [
  barrel('ember_shot', { dps: pos, durationSec: pos, maxStacks: posInt }, z.literal('fire')),
  barrel(
    'venom_shot',
    { dps: pos, durationSec: pos, spreadTargets: nonNegInt, spreadRadius: pos },
    z.literal('poison'),
  ),
  barrel('thunder_spark', { chains: posInt, radius: pos, damageFactor: pos }, z.literal('lightning')),
  barrel('twin_shot', { bullets: z.number().int().min(2), damageFactor: pos, spreadDeg: nonNeg }),
  barrel('ricochet', { bounces: posInt, radius: pos, damageFactor: pos }),
  barrel('long_rifling', { speedBonus: nonNeg, rangeBonus: nonNeg }),
  barrel('piercing_bore', { pierce: posInt }),
  barrel('heavy_slug', { damageBonus: nonNeg, fireRatePenalty: unit01, knockbackBonus: nonNeg }),
  barrel('split_shot', { shards: posInt, damageFactor: pos, arcDeg: nonNeg, range: pos }),
]);
export const BarrelModsSchema = z.array(BarrelModSchema).min(1);

const mag = <Id extends string, P extends z.ZodRawShape>(id: Id, params: P) =>
  z.strictObject({
    id: z.literal(id),
    name: z.string().min(1),
    description: z.string().min(1),
    hooks: z.array(MagazineHookSchema).min(1),
    levels: levelsOf(params),
  });

export const MagazineModSchema = z.discriminatedUnion('id', [
  mag('extended_mag', { magBonus: pos }),
  mag('quick_hands', { reloadReduction: unit01 }),
  mag('grenade_mag', { damage: pos, radius: pos, throwRange: pos, fuseSec: pos }),
  mag('last_round', { damageMult: pos }),
  mag('shock_reload', { radius: pos, knockback: pos }),
  mag('scavenger', { chance: unit01 }),
]);
export const MagazineModsSchema = z.array(MagazineModSchema).min(1);

// ---------- enemies.json ----------

export const BehaviourSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('swarm') }),
  z.strictObject({
    type: z.literal('flank'),
    circleRadius: pos,
    circleSec: pos,
    windupSec: nonNeg,
    dashSpeed: pos,
    dashSec: pos,
    recoverSec: nonNeg,
  }),
  z.strictObject({
    type: z.literal('charge'),
    triggerRange: pos,
    windupSec: nonNeg,
    chargeSpeed: pos,
    chargeMaxSec: pos,
    stunSec: nonNeg,
  }),
  z.strictObject({
    type: z.literal('caster'),
    keepMin: pos,
    keepMax: pos,
    castCooldownSec: pos,
    projectileSpeed: pos,
    projectileDamage: pos,
    projectileRange: pos,
    slowFactor: unit01,
    slowSec: pos,
  }),
  z.strictObject({ type: z.literal('tank') }),
]);

export const ShapeSchema = z.enum(['circle', 'square', 'triangle', 'diamond', 'hexagon']);

export const EnemySchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  folklore: z.string(),
  hp: pos,
  defence: nonNeg,
  speed: pos,
  contactDamage: nonNeg,
  /** Body radius in units. */
  radius: pos,
  /** 0 = full knockback, 1 = immune. */
  knockbackResist: unit01,
  visual: z.strictObject({ color, shape: ShapeSchema }),
  behaviour: BehaviourSchema,
});
export const EnemiesSchema = z.array(EnemySchema).min(1);

// ---------- boss.json ----------

export const BossAttackSchema = z.enum(['slam', 'boulder', 'summon']);

export const BossSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  hp: pos,
  defence: nonNeg,
  speed: pos,
  contactDamage: nonNeg,
  radius: pos,
  visual: z.strictObject({ color, shape: ShapeSchema }),
  enrageAfterSec: pos,
  enrageDamageMult: pos,
  retakeMomentSec: nonNeg,
  /** Ordered from full HP down. `fromHp` is the HP fraction at which the phase starts. */
  phases: z
    .array(
      z.strictObject({
        fromHp: z.number().gt(0).max(1),
        attacks: z.array(BossAttackSchema).min(1),
        cooldownSec: pos,
        speedMult: pos,
        slamRepeat: posInt,
      }),
    )
    .min(1),
  attacks: z.strictObject({
    slam: z.strictObject({
      damage: pos,
      ringSpeed: pos,
      ringMaxRadius: pos,
      ringThickness: pos,
      windupSec: nonNeg,
    }),
    boulder: z.strictObject({
      damage: pos,
      telegraphSec: pos,
      impactRadius: pos,
      rubbleRadius: pos,
      rubbleSec: pos,
      throwRange: pos,
    }),
    summon: z.strictObject({ enemy: IdSchema, count: posInt, radius: pos }),
  }),
});

// ---------- timeline.json ----------

export const TimelineSegmentSchema = z.strictObject({
  name: z.string().min(1),
  from: nonNeg,
  /** null = until the run ends (last segment only). */
  to: pos.nullable(),
  maxAlive: nonNegInt,
  spawnPerSecond: nonNeg,
  weights: z.record(IdSchema, nonNeg),
});

export const TimelineEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('tutorial'), at: nonNeg, prompt: z.string().min(1), durationSec: pos }),
  z.strictObject({
    type: z.literal('elite'),
    at: nonNeg,
    enemy: IdSchema,
    trait: z.enum(['fast', 'deathBurst']),
  }),
  z.strictObject({ type: z.literal('swarmRing'), at: nonNeg, enemy: IdSchema, count: posInt, radius: pos }),
  z.strictObject({ type: z.literal('calm'), at: nonNeg }),
  z.strictObject({ type: z.literal('bossWarning'), at: nonNeg }),
  z.strictObject({ type: z.literal('boss'), at: nonNeg, boss: IdSchema }),
]);

export const TimelineSchema = z.strictObject({
  /** During the boss fight, maxAlive is multiplied by this. */
  bossSpawnFactor: unit01,
  segments: z.array(TimelineSegmentSchema).min(1),
  events: z.array(TimelineEventSchema),
});

// ---------- cards.json ----------

export const CardTypeSchema = z.enum(['newBarrelMod', 'newMagazineMod', 'modUpgrade', 'coreTier', 'runStat']);

export const CardsSchema = z.strictObject({
  baseRerolls: nonNegInt,
  cardsPerLevelUp: posInt,
  /** Tinker card: this many random level-ups for owned mods. */
  randomUpgrade: z.strictObject({ upgrades: posInt }),
  typeWeights: z.strictObject({
    newBarrelMod: nonNeg,
    newMagazineMod: nonNeg,
    modUpgrade: nonNeg,
    coreTier: nonNeg,
    runStat: nonNeg,
  }),
  rarity: z.strictObject({
    weights: byRarity(nonNeg),
    /** Added to the rare/epic weights per player level above 1. */
    shiftPerLevel: z.strictObject({ rare: nonNeg, epic: nonNeg }),
  }),
  runStats: z
    .array(
      z.strictObject({
        id: IdSchema,
        name: z.string().min(1),
        stat: StatIdSchema,
        mode: StatModeSchema,
        values: byRarity(pos),
      }),
    )
    .min(1),
});

// ---------- buffs.json ----------

export const BuffSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  stat: StatIdSchema,
  mode: StatModeSchema,
  perLevel: pos,
  maxLevel: posInt,
  baseCost: posInt,
  costGrowth: z.number().min(1),
});
export const BuffsSchema = z.array(BuffSchema).min(1);

// ---------- drops.json ----------

export const ScrapSizeSchema = z.enum(['small', 'medium', 'large']);

export const DropsSchema = z.strictObject({
  scrapByEnemy: z.record(IdSchema, posInt),
  eliteScrapMult: pos,
  /** Smallest scrap value shown as each piece size. */
  scrapPieces: z.strictObject({ small: posInt, medium: posInt, large: posInt }),
  silver: z.strictObject({ killChance: unit01, perPickup: posInt, elite: nonNegInt, boss: nonNegInt }),
  kubdari: z.strictObject({ killChance: unit01, heal: pos }),
  huntingHorn: z.strictObject({ killChance: unit01 }),
  crate: z.strictObject({
    hp: pos,
    contents: z.strictObject({ kubdari: nonNeg, scrap: nonNeg, silver: nonNeg }),
    scrapValue: posInt,
  }),
  powderBarrel: z.strictObject({ hp: pos, damage: pos, radius: pos }),
});

// ---------- maps/level1.json ----------

export const ObstacleKindSchema = z.enum(['tower', 'house', 'church', 'rock', 'fence']);

export const ObstacleSchema = z.discriminatedUnion('shape', [
  z.strictObject({
    shape: z.literal('rect'),
    kind: ObstacleKindSchema,
    x: nonNeg,
    y: nonNeg,
    w: pos,
    h: pos,
  }),
  z.strictObject({ shape: z.literal('circle'), kind: ObstacleKindSchema, x: nonNeg, y: nonNeg, r: pos }),
]);

export const MapSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Size in units; positions are centres, in units. */
  width: pos,
  height: pos,
  playerStart: point,
  tower: z.strictObject({ x: nonNeg, y: nonNeg, r: pos }),
  obstacles: z.array(ObstacleSchema),
  powderBarrels: z.array(point),
  crates: z.array(point),
});
