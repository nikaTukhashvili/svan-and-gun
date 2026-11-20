import type { z } from 'zod';
import type {
  BarrelModSchema,
  BehaviourSchema,
  BossSchema,
  BuffSchema,
  CardPathSchema,
  CardsSchema,
  CardTypeSchema,
  ConfigSchema,
  DropsSchema,
  ElementSchema,
  EnemySchema,
  GunSchema,
  ModFamilySchema,
  SupportPerkSchema,
  MapSchema,
  MuzzlePieceSchema,
  MuzzlesSchema,
  MuzzleStatsSchema,
  ObstacleSchema,
  PlaygroundDummySchema,
  PlaygroundSchema,
  RaritySchema,
  StatIdSchema,
  StatModeSchema,
  TimelineEventSchema,
  TimelineSchema,
  TimelineSegmentSchema,
} from './schemas';

export type GameConfig = z.infer<typeof ConfigSchema>;
export type GunDef = z.infer<typeof GunSchema>;
export type BarrelModDef = z.infer<typeof BarrelModSchema>;
export type SupportPerkDef = z.infer<typeof SupportPerkSchema>;
export type MuzzlesDef = z.infer<typeof MuzzlesSchema>;
export type MuzzlePieceDef = z.infer<typeof MuzzlePieceSchema>;
export type MuzzleStats = z.infer<typeof MuzzleStatsSchema>;
export type ModFamily = z.infer<typeof ModFamilySchema>;
/** Barrel modules that have tiered numbers (everything but fittings). */
export type TieredModDef = Exclude<BarrelModDef, { family: 'fitting' }>;
export type FittingDef = Extract<BarrelModDef, { family: 'fitting' }>;
export type BarrelModId = BarrelModDef['id'];
export type SupportPerkId = SupportPerkDef['id'];
export type Element = z.infer<typeof ElementSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
export type Behaviour = z.infer<typeof BehaviourSchema>;
export type BossDef = z.infer<typeof BossSchema>;
export type TimelineDef = z.infer<typeof TimelineSchema>;
export type TimelineSegment = z.infer<typeof TimelineSegmentSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type CardsDef = z.infer<typeof CardsSchema>;
export type CardType = z.infer<typeof CardTypeSchema>;
export type CardPathDef = z.infer<typeof CardPathSchema>;
export type Rarity = z.infer<typeof RaritySchema>;
export type BuffDef = z.infer<typeof BuffSchema>;
export type DropsDef = z.infer<typeof DropsSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type ObstacleDef = z.infer<typeof ObstacleSchema>;
export type PlaygroundDef = z.infer<typeof PlaygroundSchema>;
export type PlaygroundDummyDef = z.infer<typeof PlaygroundDummySchema>;
export type StatId = z.infer<typeof StatIdSchema>;
export type StatMode = z.infer<typeof StatModeSchema>;

/** Numbers of a tiered barrel module, e.g. BarrelModParams<'ember_shot'>. */
export type BarrelModParams<Id extends TieredModDef['id']> = Extract<TieredModDef, { id: Id }>['base'];
export type SupportPerkParams<Id extends SupportPerkId> = Extract<
  SupportPerkDef,
  { id: Id }
>['levels'][number];

/** Everything loaded and validated at boot. Read-only for the rest of the game. */
export interface GameData {
  readonly config: GameConfig;
  readonly guns: readonly GunDef[];
  readonly barrelMods: readonly BarrelModDef[];
  readonly supportPerks: readonly SupportPerkDef[];
  readonly muzzles: MuzzlesDef;
  readonly enemies: readonly EnemyDef[];
  readonly boss: BossDef;
  readonly timeline: TimelineDef;
  readonly cards: CardsDef;
  readonly buffs: readonly BuffDef[];
  readonly drops: DropsDef;
  readonly playground: PlaygroundDef;
  readonly maps: Readonly<Record<string, MapDef>>;
}
