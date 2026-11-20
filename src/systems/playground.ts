/**
 * Training Ground rules (dev tool): turn playground.json dummies into enemy kinds that the
 * EnemySystem can spawn, so bullets, mods, statuses and explosions treat them like real enemies.
 */
import type { EnemyDef, PlaygroundDummyDef } from '../data/types';

/** A dummy as an enemy kind: never hurts, never knocked back, stands still or patrols. */
export function dummyEnemyDef(d: PlaygroundDummyDef): EnemyDef {
  return {
    id: d.id,
    name: d.name,
    folklore: '',
    hp: d.hp,
    defence: d.defence,
    speed: d.patrol?.speed ?? 0,
    contactDamage: 0,
    radius: d.radius,
    knockbackResist: 1,
    visual: d.visual,
    behaviour: d.patrol ? { type: 'dummy', patrol: d.patrol } : { type: 'dummy' },
  };
}
