import type { z } from 'zod';
import type {
  BarrelModSchema,
  BehaviourSchema,
  BossSchema,
  BuffSchema,
  CardsSchema,
  CardTypeSchema,
  ConfigSchema,
  DropsSchema,
  ElementSchema,
  EnemySchema,
  GunSchema,
  MagazineModSchema,
  MapSchema,
  ObstacleSchema,
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
export type MagazineModDef = z.infer<typeof MagazineModSchema>;
export type BarrelModId = BarrelModDef['id'];
export type MagazineModId = MagazineModDef['id'];
export type Element = z.infer<typeof ElementSchema>;
export type EnemyDef = z.infer<typeof EnemySchema>;
export type Behaviour = z.infer<typeof BehaviourSchema>;
export type BossDef = z.infer<typeof BossSchema>;
export type TimelineDef = z.infer<typeof TimelineSchema>;
export type TimelineSegment = z.infer<typeof TimelineSegmentSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type CardsDef = z.infer<typeof CardsSchema>;
export type CardType = z.infer<typeof CardTypeSchema>;
export type Rarity = z.infer<typeof RaritySchema>;
export type BuffDef = z.infer<typeof BuffSchema>;
export type DropsDef = z.infer<typeof DropsSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type ObstacleDef = z.infer<typeof ObstacleSchema>;
export type StatId = z.infer<typeof StatIdSchema>;
export type StatMode = z.infer<typeof StatModeSchema>;

/** Numbers for one level of a specific barrel mod, e.g. BarrelModParams<'ember_shot'>. */
export type BarrelModParams<Id extends BarrelModId> = Extract<BarrelModDef, { id: Id }>['levels'][number];
export type MagazineModParams<Id extends MagazineModId> = Extract<
  MagazineModDef,
  { id: Id }
>['levels'][number];

/** Everything loaded and validated at boot. Read-only for the rest of the game. */
export interface GameData {
  readonly config: GameConfig;
  readonly guns: readonly GunDef[];
  readonly barrelMods: readonly BarrelModDef[];
  readonly magazineMods: readonly MagazineModDef[];
  readonly enemies: readonly EnemyDef[];
  readonly boss: BossDef;
  readonly timeline: TimelineDef;
  readonly cards: CardsDef;
  readonly buffs: readonly BuffDef[];
  readonly drops: DropsDef;
  readonly maps: Readonly<Record<string, MapDef>>;
}
