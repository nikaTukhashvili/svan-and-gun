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
/** Item rarity (GDD: Gear): follows from the item's level; legendaries are found only. */
export const RaritySchema = z.enum(['common', 'magic', 'rare', 'legendary']);

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
    /** Chill (Frost) never slows an enemy by more than this share of its speed. */
    maxChillSlow: unit01,
    /** After a freeze ends, the enemy cannot freeze again for this long (it can still be chilled). */
    freezeImmunitySec: nonNeg,
  }),
  xp: z.strictObject({ base: pos, step: nonNeg }),
  slots: z.strictObject({
    /** Unlock level per slot index; slots past the end of the list use the last entry. */
    barrelUnlockLevels: z.array(posInt).min(1),
    /** Barrel slots on any gun (GDD: no gun has more than 12). */
    maxTotalSlots: posInt,
    maxCoreTier: posInt,
    /** Elements stop upgrading at this tier; two different maxed elements can mutate. Hybrids are made at it. */
    maxElementTier: posInt,
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
  /** The gun's twist: barrel length, separate chains, crit chamber. */
  barrel: z.strictObject({
    slots: posInt,
    /** Separate chains the barrel is split into; trigger pulls alternate between them. */
    chains: posInt,
    /** If > 0, the last barrel slot is a crit chamber: it works only on crit bullets, this many times as strong. */
    critChamberMult: nonNeg,
  }),
  /** Muzzle slots at the end of the barrel (GDD: Muzzle). */
  muzzleSlots: posInt,
  /** Support perks this gun starts every run with: id → level (Double Barrel: Grenade Mag 1). */
  startingSupport: z.record(z.string(), posInt).optional(),
});
export const GunsSchema = z.array(GunSchema).min(1);

// ---------- barrelMods.json / supportPerks.json ----------

export const ElementSchema = z.enum(['fire', 'poison', 'lightning', 'frost']);
/**
 * Barrel module families (GDD: Barrel fusion):
 * - element: upgrades when the same card is dropped on it (up to maxElementTier); two different
 *   maxed elements side by side can MUTATE into their hybrid (Mutation card);
 * - hybrid: made by a Mutation at maxElementTier; final (never upgrades or mutates);
 * - grey: projectile shape; upgrades when the same card is dropped on it (no cap);
 * - fitting: directional, never upgrades; multiplies its neighbours' strength.
 */
export const ModFamilySchema = z.enum(['element', 'hybrid', 'grey', 'fitting']);

/**
 * Tiered numbers: value(tier) = base + perTier × (tier − 1). Tier = copies fused in, no cap.
 * Count params (chains, bullets, ...) are rounded when read (systems/fusion.ts > tierParams).
 * `description` may use {param} placeholders, filled from the tier's numbers.
 */
const tiered = <P extends z.ZodRawShape>(params: P) => {
  const perTier = Object.fromEntries(Object.keys(params).map((k) => [k, z.number()])) as {
    [K in keyof P]: z.ZodNumber;
  };
  return { base: z.strictObject(params), perTier: z.strictObject(perTier) };
};

const modCommon = { name: z.string().min(1), description: z.string().min(1), color };

const element = <Id extends string, E extends z.infer<typeof ElementSchema>, P extends z.ZodRawShape>(
  id: Id,
  el: E,
  params: P,
) =>
  z.strictObject({
    id: z.literal(id),
    family: z.literal('element'),
    element: z.literal(el),
    ...modCommon,
    ...tiered(params),
  });

const hybrid = <Id extends string, P extends z.ZodRawShape>(id: Id, params: P) =>
  z.strictObject({
    id: z.literal(id),
    family: z.literal('hybrid'),
    /** The two different elements that fuse into it. */
    parents: z.tuple([ElementSchema, ElementSchema]),
    ...modCommon,
    ...tiered(params),
  });

const grey = <Id extends string, P extends z.ZodRawShape>(id: Id, params: P) =>
  z.strictObject({ id: z.literal(id), family: z.literal('grey'), ...modCommon, ...tiered(params) });

/** Fittings: strength change for the left and right neighbour (+0.4 = ×1.4, −0.5 = ×0.5). */
const fitting = <Id extends string>(id: Id) =>
  z.strictObject({
    id: z.literal(id),
    family: z.literal('fitting'),
    ...modCommon,
    left: z.number().min(-1),
    right: z.number().min(-1),
  });

/** Chill numbers shared by Frost and its hybrids: % slow per stack, stacks that freeze, shatter %. */
const chill = {
  slowPct: pos,
  chillSec: pos,
  chillStacks: posInt,
  freezeSec: nonNeg,
  shatterPct: nonNeg,
};

export const BarrelModSchema = z.discriminatedUnion('id', [
  element('ember_shot', 'fire', { dps: pos, durationSec: pos, maxStacks: posInt }),
  element('venom_shot', 'poison', {
    dps: pos,
    durationSec: pos,
    spreadTargets: nonNegInt,
    spreadRadius: pos,
  }),
  element('thunder_spark', 'lightning', { chains: posInt, radius: pos, damageFactor: pos }),
  element('frost_shot', 'frost', chill),
  // Hybrids: both parents' effects plus a combo.
  hybrid('plasma', {
    chains: posInt,
    radius: pos,
    damageFactor: pos,
    burnDps: pos,
    burnSec: pos,
    maxStacks: posInt,
  }),
  hybrid('brimstone', {
    burnDps: pos,
    burnSec: pos,
    maxStacks: posInt,
    poisonDps: pos,
    poisonSec: pos,
    blastDamage: pos,
    blastRadius: pos,
  }),
  hybrid('blight_arc', { chains: posInt, radius: pos, damageFactor: pos, poisonDps: pos, poisonSec: pos }),
  hybrid('steam', {
    burnDps: pos,
    burnSec: pos,
    maxStacks: posInt,
    ...chill,
    blastDamage: pos,
    blastRadius: pos,
  }),
  hybrid('frostbite', { poisonDps: pos, poisonSec: pos, ...chill, chilledPoisonMult: pos }),
  hybrid('hailstorm', { chains: posInt, radius: pos, damageFactor: pos, ...chill }),
  grey('twin_shot', { bullets: z.number().int().min(2), damageFactor: pos, spreadDeg: nonNeg }),
  grey('ricochet', { bounces: posInt, radius: pos, damageFactor: pos }),
  grey('long_rifling', { speedBonus: nonNeg, rangeBonus: nonNeg }),
  grey('piercing_bore', { pierce: posInt }),
  grey('heavy_slug', { damageBonus: nonNeg, fireRatePenalty: unit01, knockbackBonus: nonNeg }),
  grey('split_shot', { shards: posInt, damageFactor: pos, arcDeg: nonNeg, range: pos }),
  fitting('booster_right'),
  fitting('booster_left'),
  fitting('brace'),
  fitting('overcharger'),
  fitting('siphon'),
]);
export const BarrelModsSchema = z.array(BarrelModSchema).min(1);

/**
 * Support perks (were magazine mods): no slot; taking one again moves it up a level.
 * `levels[i]` holds the numbers for level i+1; the number of levels is its max.
 */
const levelsOf = <P extends z.ZodRawShape>(params: P) => z.array(z.strictObject(params)).min(1);

const support = <Id extends string, P extends z.ZodRawShape>(id: Id, params: P) =>
  z.strictObject({
    id: z.literal(id),
    name: z.string().min(1),
    description: z.string().min(1),
    levels: levelsOf(params),
  });

export const SupportPerkSchema = z.discriminatedUnion('id', [
  support('extended_mag', { magBonus: pos }),
  support('quick_hands', { reloadReduction: unit01 }),
  support('grenade_mag', { damage: pos, radius: pos, throwRange: pos, fuseSec: pos }),
  support('last_round', { damageMult: pos }),
  support('shock_reload', { radius: pos, knockback: pos }),
  support('scavenger', { chance: unit01 }),
]);
export const SupportPerksSchema = z.array(SupportPerkSchema).min(1);

// ---------- muzzles.json ----------

/**
 * Muzzle stats (GDD: Muzzle). Every key is optional (0 when missing). Across pieces they add:
 * bullets and spreadDeg are flat, the *Pct keys are fractions (-0.15 = -15%), critChance 0..1.
 */
export const MuzzleStatsSchema = z.strictObject({
  bullets: z.number().optional(),
  spreadDeg: z.number().optional(),
  spreadPct: z.number().optional(),
  rangePct: z.number().optional(),
  damagePct: z.number().optional(),
  fireRatePct: z.number().optional(),
  bulletSpeedPct: z.number().optional(),
  critChance: z.number().optional(),
});

/** A muzzle piece. value(level) = base + perLevel × (level − 1); bullets are rounded. No cap. */
export const MuzzlePieceSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  base: MuzzleStatsSchema,
  perLevel: MuzzleStatsSchema,
});

export const MuzzlesSchema = z.strictObject({
  /** Extra bullets on a gun with (almost) no spread fan out over at least this many degrees. */
  minFanDeg: nonNeg,
  /** Stacked downsides never push these multipliers below this share of the base. */
  floors: z.strictObject({ damage: unit01, fireRate: unit01, range: unit01, bulletSpeed: unit01 }),
  pieces: z.array(MuzzlePieceSchema).min(1),
});

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
  /** Training Ground dummy: stands still, or walks back and forth from its spawn point to spawn + (dx, dy). */
  z.strictObject({
    type: z.literal('dummy'),
    patrol: z.strictObject({ dx: z.number(), dy: z.number(), speed: pos }).optional(),
  }),
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

export const CardTypeSchema = z.enum([
  'element',
  'grey',
  'fitting',
  'coreTier',
  'supportPerk',
  'muzzle',
  'tinker',
  'mutation',
]);

/**
 * A level-up path (GDD: In-run progression): the player first picks a path, then 1 of 3 cards
 * drawn only from that path's card types.
 */
export const CardPathSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  types: z.array(CardTypeSchema).min(1),
});

export const CardsSchema = z.strictObject({
  baseRerolls: nonNegInt,
  cardsPerLevelUp: posInt,
  /** Level-up paths; every card type belongs to exactly one. */
  paths: z.array(CardPathSchema).min(1),
  /** Tinker card: this many random +1 tiers for modules in the barrel. */
  randomUpgrade: z.strictObject({ upgrades: posInt }),
  /**
   * Weight per card TYPE, shared by that type's cards (more modules in the game do not drown out
   * perks).
   */
  typeWeights: z.strictObject({
    element: nonNeg,
    grey: nonNeg,
    fitting: nonNeg,
    coreTier: nonNeg,
    supportPerk: nonNeg,
    muzzle: nonNeg,
    /** Tinker (random +1 tiers for barrel modules). */
    tinker: nonNeg,
    /** Mutation (two maxed elements side by side become their hybrid); only offered when possible. */
    mutation: nonNeg,
  }),
  /** A module card that would fuse with a module already in the barrel weighs this many times more. */
  upgradesOwnedMult: z.number().min(1),
});

// ---------- items.json (GDD: Gear) ----------

/** Equipment slot kinds; the paper doll lists the positions (two of them are rings). */
export const ItemSlotSchema = z.enum(['hat', 'cloak', 'chokha', 'ring', 'boots']);
/** Stats an item can raise (not rerolls or revives: those are market only). */
export const ItemStatSchema = StatIdSchema.exclude(['rerolls', 'revives']);

/**
 * What an item's number does: a player stat, or (element themes) the strength of that element's
 * barrel modules and the hybrids made from it (+0.2 = their numbers ×1.2, like a fitting).
 */
export const ItemEffectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('stat'), stat: ItemStatSchema, mode: StatModeSchema }),
  z.strictObject({ kind: z.literal('element'), element: ElementSchema }),
]);

/** A levelled number: value(level) = base + perLevel × (level − 1). Fractions for "mult" (0.1 = +10%). */
const levelled = { base: pos, perLevel: nonNeg };

/** A main theme: it names the item ("Boots of Speed") and sets its main stat. */
export const ItemThemeSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  slot: ItemSlotSchema,
  effect: ItemEffectSchema,
  ...levelled,
});

/** An extra stat that Magic and Rare items roll (never the main theme's stat, never twice). */
export const ItemExtraStatSchema = z.strictObject({
  stat: ItemStatSchema,
  mode: StatModeSchema,
  ...levelled,
});

/**
 * A legendary passive. Numbers grow with the item's level: base + perLevel × (level − 1); perLevel
 * may be negative (a shorter charge), and a value never drops below 20% of its base. `tiers` is
 * rounded. `description` uses {param} placeholders.
 */
const passive = <T extends string, K extends string>(type: T, keys: readonly K[]) =>
  z.strictObject({
    type: z.literal(type),
    base: z.strictObject(Object.fromEntries(keys.map((k) => [k, pos])) as Record<K, typeof pos>),
    perLevel: z.strictObject(Object.fromEntries(keys.map((k) => [k, z.number()])) as Record<K, z.ZodNumber>),
  });

export const LegendaryPassiveSchema = z.discriminatedUnion('type', [
  /** After standing still for stillSec: +damagePct% damage until the Svan moves. */
  passive('towerKeeper', ['stillSec', 'damagePct'] as const),
  /** A kill gives +speedPct% move speed for durationSec. */
  passive('wolfPelt', ['speedPct', 'durationSec'] as const),
  /** Ember Shot and the fire hybrids count as `tiers` tiers higher. */
  passive('emberSmith', ['tiers'] as const),
  /** Every scrap pickup heals `heal` HP. */
  passive('feast', ['heal'] as const),
  /** Moving for chargeSec charges the gun: the next shot pierces every enemy. */
  passive('mountainRunner', ['chargeSec'] as const),
]);

export const LegendarySchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  slot: ItemSlotSchema,
  /** A fixed main stat; legendaries roll no extra stats. */
  main: z.strictObject({ effect: ItemEffectSchema, ...levelled }),
  passive: LegendaryPassiveSchema,
  description: z.string().min(1),
});

/** A chest kind: which level its new items are found at, and how likely a legendary choice is. */
const ChestKindSchema = z.strictObject({
  levels: z.array(z.strictObject({ level: posInt, weight: pos })).min(1),
  legendaryChance: unit01,
});

export const ItemsSchema = z.strictObject({
  /** The paper doll's positions in order (GDD: Gear). */
  equipment: z.array(ItemSlotSchema).min(1),
  slotNames: z.strictObject({
    hat: z.string(),
    cloak: z.string(),
    chokha: z.string(),
    ring: z.string(),
    boots: z.string(),
  }),
  /** Rarity follows from the level: an extra stat is rolled on reaching each of these levels. */
  extraStatLevels: z.array(posInt).min(1),
  themes: z.array(ItemThemeSchema).min(1),
  extraStats: z.array(ItemExtraStatSchema).min(2),
  legendaries: z.array(LegendarySchema),
  chests: z.strictObject({
    /** Choices offered when a chest is opened. */
    choices: posInt,
    /** Weight of an "upgrade one of your items" choice against a new item. */
    upgradeWeight: nonNeg,
    newItemWeight: nonNeg,
    supply: ChestKindSchema,
    elite: ChestKindSchema,
  }),
  /** A replaced item is salvaged into scrap: base + perLevel × (level − 1). */
  salvageScrap: z.strictObject(levelled),
  /** Supply chests that appear on the map during a run. */
  supplyChest: z.strictObject({
    firstSec: pos,
    intervalSec: pos,
    /** No supply chests after this time (the boss fight). */
    untilSec: pos,
    /** Spawn distance from the player, in units. */
    minDistance: pos,
    maxDistance: pos,
  }),
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

// ---------- playground.json (Training Ground, a dev tool) ----------

export const PlaygroundDummySchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Only for the HP bar: dummies refill instead of dying. */
  hp: pos,
  defence: nonNeg,
  /** Body radius in units. */
  radius: pos,
  visual: z.strictObject({ color, shape: ShapeSchema }),
  /** Walks from its spawn point to spawn + (dx, dy) and back (units, units/s). */
  patrol: z.strictObject({ dx: z.number(), dy: z.number(), speed: pos }).optional(),
});

export const PlaygroundSchema = z.strictObject({
  /** Map key in public/maps. */
  map: IdSchema,
  dummies: z.array(PlaygroundDummySchema).min(1),
  /** Where each dummy stands, in map units. */
  layout: z.array(z.strictObject({ dummy: IdSchema, x: nonNeg, y: nonNeg })).min(1),
  /** Rolling window for the live DPS number. */
  dpsWindowSec: pos,
  /** A new measurement starts after this long with no damage. */
  idleResetSec: pos,
  /** Session DPS divides by at least this many seconds, so one early hit does not read as a huge DPS. */
  minSessionSec: pos,
  /** How often the labels over the dummies and the panel readout refresh. */
  labelRefreshSec: pos,
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
