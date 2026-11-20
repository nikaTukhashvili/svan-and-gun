# Svan and Gun — Technical Design Document

Nov 19, 2026 · @Nika Tukhashvili

## Overview and tech stack

Phase 1 is a browser game built with Phaser 4 and TypeScript, bundled by Vite. Game logic sits in plain TypeScript systems that the Phaser scenes call, so the logic can be unit tested without a browser. All tuning numbers live in JSON data files, not code.

| Layer | Choice | Why |
| --- | --- | --- |
| Engine | Phaser 4, pinned to an exact version (4.2.1 was the latest stable in July 2026; check for a newer 4.x at T01) | Stable since April 2026 and the official choice for new projects; Phaser 3 ended at 3.90 (May 2025). Arcade Physics, scenes, input and groups are unchanged from Phaser 3 |
| Language | TypeScript, `strict` mode | Typed data model, safer refactors |
| Bundler / dev server | Vite | Fast hot reload, simple static build |
| Physics | Phaser Arcade Physics | Circle and box overlap is all a top-down survivor needs, and it is fast |
| Data validation | zod schemas for every JSON file | Bad tuning data fails at load with a clear message |
| Unit tests | Vitest | Same config as Vite; tests pure logic (damage, card draw, mod pipeline) |
| End-to-end tests | Playwright | Boots the game, drives menus, checks a run starts and a save persists |
| Lint / format | ESLint + Prettier | Consistent code |
| Hosting | Static site (itch.io or GitHub Pages) | Free, a link anyone can play |

**Phaser 4 notes for whoever writes the code.** Most Phaser examples online, and most of what an AI model remembers, are Phaser 3. The API is almost the same, but these differ:

- `setTintFill()` is gone: use `setTint()` plus `setTintMode()` (this matters for the hit flash).
- `Geom.Point` is replaced by `Vector2`; `Math.TAU` is now 2π.
- FX (Bloom, Shine, Circle), BitmapMask and custom WebGL pipelines were replaced by the filter system and render nodes. Phase 1 does not need them.
- WebGL is the only full-featured renderer; do not target Canvas.
- `SpriteGPULayer` can draw very large sprite counts in one call. Phase 1 does not need it at 90 enemies; keep it in mind if the stress test fails.
- When unsure, read the [migration guide](https://github.com/phaserjs/phaser/blob/v4.0.0/changelog/v4/4.0/MIGRATION-GUIDE.md) and the installed package's type definitions instead of guessing from Phaser 3 habits. Confirm `Graphics.generateTexture()` behaves as expected in T01.

**Targets:** desktop Chrome, Firefox and Edge; 1280×720 logical resolution, scaled to fit; 60 FPS with 90+ enemies and their bullets on screen.

## Architecture

```
Scenes (Phaser)      draw, take input, own sprites and physics bodies
   | call down            ^ listen to events
Systems (plain TS)   rules: weapon, mods, status, spawns, cards, score, save, market
   | read
Data + core          JSON data via DataRegistry, EventBus, ObjectPool, seeded RNG
```

Scenes call systems and react to their events; systems never touch Phaser scenes. That split lets every rule be tested in Vitest without starting the game.

To make that true in practice, files in `systems/` and `core/` never `import Phaser`. They work on small plain interfaces (for example `{x, y, hp, defence, status}` for an enemy), which the Phaser entities implement. Anything that needs a sprite, a physics body or the scene (spawning a pooled bullet, drawing a lightning line) is done by the scene or entity in response to a system's return value or event.

**Event catalog.** These are the EventBus events. Systems emit them; scenes and other systems listen. New events are added here first.

| Event | Payload | Emitted by | Main listeners |
| --- | --- | --- | --- |
| `player:damaged` | `{amount, hpLeft}` | Player | HUD, camera shake |
| `player:levelUp` | `{level}` | ProgressionSystem | LevelUpScene (queued) |
| `player:scrap` | `{scrap, toNext}` | ProgressionSystem | HUD |
| `weapon:fired` / `weapon:reload` / `weapon:reloaded` | `{ammo, magSize}` | WeaponSystem | HUD, magazine mods (reload = started, reloaded = magazine full) |
| `mod:applied` | `{modId, slot, tier, fused}` | Level-up pick | HUD slot icons, fusion feedback |
| `enemy:killed` | `{type, elite, x, y, byStatus}` | Enemy / StatusEffectSystem | DropSystem, ScoreSystem, poison spread, Scavenger |
| `timeline:event` | `{type, at}` | SpawnDirector | HUD warnings, audio |
| `boss:spawned` / `boss:phase` / `boss:dead` | `{phase, hpLeft}` | Boss | HUD boss bar, camera |
| `pickup:collected` | `{kind, value}` | DropSystem | HUD, ProgressionSystem |
| `run:ended` | `{result: 'victory' or 'defeat'}` | Player / Boss | GameScene → ResultsScene |

The EventBus is created per run and owned by GameScene. Every listener is removed when its scene shuts down. A global bus that survives Retry is the classic source of double-firing listeners in Phaser games.

## Project structure

Code is split by role: scenes draw and take input, systems hold the rules, entities are the things in the world, and data holds every number.

```
svan-and-gun/
  public/
    data/            guns.json, barrelMods.json, supportPerks.json, enemies.json,
                     boss.json, timeline.json, buffs.json, cards.json, drops.json, config.json
    maps/            level1.json (bounds, player start, tower, obstacles)
  src/
    main.ts          Phaser game config, scene list
    scenes/          BootScene, MenuScene, GunSelectScene, GameScene,
                     HudScene, LevelUpScene, PauseScene, ResultsScene,
                     MarketScene, HighScoreScene, SettingsScene
    entities/        Player, Enemy, Bullet, Pickup, Boss, Obstacle
    systems/         WeaponSystem, ModPipeline, StatusEffectSystem,
                     SpawnDirector, EnemyAI, ProgressionSystem, CardDraw, Fusion,
                     DropSystem, RunTimer, ScoreSystem, SaveSystem, MarketSystem
    data/            zod schemas, types.ts, DataRegistry (loads + validates JSON)
    core/            EventBus, ObjectPool, RNG (seeded), math helpers
    ui/              small reusable UI pieces (button, bar, card)
  tests/
    unit/            Vitest specs for systems
    e2e/             Playwright specs
```

**Rules**

- Systems do not import scenes. Scenes call systems and listen to the EventBus.
- Entities hold state; systems change it. This keeps the rules testable without Phaser.
- No tuning number is written in code. Every number comes from `public/data` through the DataRegistry.
- All gameplay randomness goes through the seeded RNG in `core/`. `Math.random()` is allowed only for cosmetic effects.
- Input is read through a small `InputSource` interface (move vector, aim angle, fire, reload, pause) so gamepad and touch can be added later without touching the Player.

## Scenes and game flow

Each screen is a Phaser scene. GameScene runs the world; HudScene runs on top of it in parallel; LevelUpScene and PauseScene pause GameScene while they are open.

| Scene | Job | Started by | Mode |
| --- | --- | --- | --- |
| BootScene | Load and validate all JSON, load save, show errors if data is bad | Game start | Replaces |
| MenuScene | Start, Market, High Scores, Settings | Boot, Results, Market | Replaces |
| GunSelectScene | Pick 1 of 3 cores; builds the starting RunState | Menu | Replaces |
| GameScene | Map, player, enemies, bullets, pickups, spawn director, boss | Gun select, Retry | Replaces |
| HudScene | HP, ammo, scrap bar, level, timer, kills, silver, mod slots, boss bar | GameScene | Runs in parallel |
| LevelUpScene | 3 cards, reroll, slot view with barrel slot swap, replace prompt | `player:levelUp` event | Pauses GameScene |
| PauseScene | Resume, Settings, Quit run | Esc | Pauses GameScene |
| ResultsScene | Victory/defeat, score, New best, build, silver; saves | `run:ended` event | Replaces |
| MarketScene | Buy buffs, refund all | Menu, Results | Replaces |
| HighScoreScene | Top 10 table | Menu | Replaces |
| SettingsScene | Volume, auto-fire, screen shake, fullscreen | Menu, Pause | Overlay |

**RunState** is one plain object created in GunSelectScene and passed to GameScene. It holds everything about the current run (core, slots, level, scrap, kills, silver picked up, time) and is thrown away at the end, after ResultsScene turns it into score, silver and a high-score entry. **MetaState** (silver balance, buff levels, scores, settings) lives in SaveSystem and outlives runs.

## World, physics and timing

The GDD gives sizes and speeds in units. In code, 1 unit = 32 px, so the player's 5 units/s is 160 px/s and the view at 1280×720 is 40×22.5 units. All data files stay in units; one helper (`u(n) = n * 32`) converts them.

### Map

- Phase 1 uses one handwritten `maps/level1.json`: map size, player start, tower position, and a list of obstacle rectangles and circles. There is no tile editor yet; Tiled can replace this later without changing the systems.
- Placeholder art is made at boot with `Graphics.generateTexture()` (coloured circles and squares per entity type), so no image files are needed.

### Collision matrix (Arcade Physics)

|  | Obstacles | Enemies | Player | Pickups |
| --- | --- | --- | --- | --- |
| **Player** | collide | overlap: contact damage | — | overlap: collect (inside pickup radius they fly to the player first) |
| **Enemies** | collide | separation force (not physics) | overlap: contact damage | — |
| **Player bullets** | overlap: destroy bullet | overlap: hit chain | — | — |
| **Enemy projectiles** (Rokapi, boulders) | overlap: destroy | — | overlap: damage | — |
| **Boss** | collide | — | overlap: contact damage | — |

Powder barrels are obstacles with HP: a bullet hit damages them and they explode on death.

### Timing and pause

- All gameplay timers (run timer, cooldowns, status ticks, spawn director) use GameScene's own clock and delta, so they stop when LevelUpScene or PauseScene pauses GameScene. Nothing uses `Date.now()` or `setTimeout` for gameplay.
- The frame delta is clamped to 50 ms so one slow frame cannot move everything a long way.
- The clamp alone does not stop tunnelling. A Long Gun bullet moves 30 units/s (960 px/s, more with Long Rifling), which is 16 px in a normal frame and 48 px in a clamped one, while a Kaji Imp is about 24 px wide. Bullets are therefore hit-tested as a swept segment from their previous position to their current one against enemy circles from the spatial hash, not with a plain Arcade overlap.
- When the browser tab or window loses focus, the game opens PauseScene automatically. This prevents a huge delta spike and an unfair death on return.

## Player, gun and projectile pipeline

A trigger pull becomes bullets in three steps: the Core builds a base shot, barrel mods change it in slot order, and hit effects ride on each bullet. Slot order matters because a bullet created by a mod only carries the mods in later slots.

### Player

- `Player` is an Arcade Physics sprite with a circle body. Stats are computed once per change (formula under Applying stats) and cached in `PlayerStats`, not recomputed every frame.
- Input: WASD to a normalised velocity vector; aim is the angle from the player to the mouse in world space; hold-to-fire or auto-fire from settings.
- Damage taken: `max(1, hit − defence)`, then 0.5 s of invulnerability. HP 0 emits `run:ended {result:'defeat'}`.

### WeaponSystem: ammo and reload

- State: `ammo`, `magSize`, `reloadTimer`, `fireCooldown`. Firing is allowed when `ammo > 0` and the cooldown is done.
- Reload time is `gun.reload / reloadSpeed`; shots per second is `gun.shotsPerSecond × fireRate`. Higher stat values are always better.
- Reload starts on R or when the magazine hits 0. Support perks (were magazine mods) hook into these events: reload start (Shock Reload), magazine empty (Grenade Mag), last round (Last Round), kill (Scavenger). Extended Mag and Quick Hands simply change stats. `buildPipeline` turns `RunState.support` levels into `WeaponMods` and `SupportEffects`.

### Fusion and ModPipeline: the barrel (2026-11-20)

Two pure modules in `src/systems`:

- **`fusion.ts`**: the barrel rules. `fuseResult(a, b)` (tiers add; same module, element + element → hybrid; a hybrid grows only from the same hybrid), `place(build, layout, slot, module)` (place / fuse / replace, then cascade), `swapAndFuse`, `previewPlace` / `previewSwap` (the same logic on a copy, for the level-up preview), `tierParams(def, tier)` (base + perTier × (tier − 1), counts rounded), `neighbours(layout, i)` (same chain only).
- **`modPipeline.ts`**: turns the barrel into behaviour.

```typescript
interface ModSlot { id: string; tier: number }          // tier = copies fused in, no cap
interface SlotMod { slot; chain; id; tier; p /* numbers at tier */; k /* strength */; critOnly }
interface Pipeline {
  layout; barrel: SlotMod[]; fittings: FittingInfo[]; strength: number[]; // per slot, for the UI
  weaponMods; support: SupportEffects; deathBlast: { damage; radius } | null;
}
```

1. **Strength:** each fitting multiplies `k` of its tiered neighbours in the same chain (`1 + left` / `1 + right`). The SMG's last slot gets ×critChamberMult and `critOnly`.
2. **Base shot:** the Core makes its `ShotSpec[]` and `applyOnFire` sets each shot's chain (Double Barrel alternates by `volleyId`).
3. **onFire:** Twin Shot, Long Rifling, Piercing Bore and Heavy Slug change the shots of their chain, scaled by `k`.
4. **onHit:** `HitResolver.onHit` runs every on-hit module of the bullet's chain (elements, hybrids, Split Shot). `onStop` runs Ricochet when the bullet would stop. Slot order plays no part.
5. **Muzzle:** `buildPipeline` adds up the muzzle (`totalMuzzle`) into `Pipeline.muzzle` and `weaponMods.muzzle` (see below); `computeWeaponStats` applies it to the Core's numbers.
6. **Hybrids:** Plasma and Blight Arc call `StatusEffectSystem.chainLightning` with an `onReach` callback that burns / poisons every enemy reached; Brimstone burns and poisons, and `StatusEffectSystem.deathBlast` (synced from the pipeline each frame) bursts a burning, poisoned enemy on death. Bursts are queued in `status.blasts` for the effects layer.

**Resolution rules**

- Loop guard (replaces the old "children only get later slots" rule): child bullets (generation ≥ 1) never split and never bounce. Ricochet bounces reuse the original bullet. The generation cap and children-per-hit cap stay as safety nets.
- Ricochet triggers only when the bullet would otherwise be destroyed (its pierce is used up), and aims at the nearest enemy not yet hit by this bullet.
- A child bullet keeps its parent's damage multiplier from the mod that made it (shards 30%, lightning 50%) and its parent's `volleyId`.
- Pellet rule: on-hit modules trigger at most once per enemy per `volleyId`.
- Any build change rebuilds the pipeline; bullets in flight read the new pipeline on their next hit.
- Defence is subtracted from bullet, shard, ricochet and lightning damage (minimum 1). Status ticks, explosions and Brimstone bursts ignore it.

Scrap fills a level bar; each level opens LevelUpScene with 3 cards from CardDraw. CardDraw builds the list of valid cards first and only then picks, so it can never offer an invalid card.


### Muzzle (2026-11-21)

`src/systems/muzzle.ts` (pure): `RunBuild.muzzle: (MuzzleSlot | null)[]` with `MuzzleSlot { id; level }` (no cap). The slot count comes from `guns.json > muzzleSlots`.

- `previewMuzzle` / `placeMuzzle(muzzle, i, id)`: empty slot → `fit` (level 1); the same piece → `upgrade` (+1 level); another piece → `replace`. `moveMuzzle` moves or swaps and never merges.
- `muzzleStats(def, level)`: base + perLevel × (level − 1), bullets rounded. `totalMuzzle` adds every fitted piece.
- `muzzleWeaponMods(data, totals)`: the totals as multipliers with the floors from `muzzles.json` (damage, fire rate, range, bullet speed), extra bullets, spread (flat degrees, then ×(1 + spreadPct)), crit chance, and `minFanDeg` when bullets were added.
- `computeWeaponStats`: pellets = gun pellets + extra bullets (one volley, so the pellet rule holds); spread at least `minFanDeg` when there is more than one pellet; `WeaponStats.critChance` rolls on the seeded RNG per trigger pull, on top of `critEveryN`.
- Muzzle cards: `Card { type: 'muzzle'; muzzleId; owned }`, weight `cards.typeWeights.muzzle` shared by all pieces; `applyCard` needs the muzzle slot.
- `guns.json > startingSupport` seeds `RunState.support` at run start (Double Barrel: Grenade Mag 1).

### Levelling

- `scrapToNext(level) = xpBase + xpStep × (level − 1)` with `xpBase = 5`, `xpStep = 10` from `config.json` (5, 15, 25…). `level` is the player's current level.
- Several level-ups from one big pickup are queued and shown one after another.
- Barrel slot unlock levels live in `config.json` > slots.barrelUnlockLevels (4 open at level 1, then levels 4, 7, 10, 13).

### CardDraw algorithm

1. Build candidates from the RunState:
   - a module card for every element, grey module and fitting (always valid: tiers have no cap, and a full barrel can still fuse or replace). Hybrids are never offered. A module that would fuse with one in the barrel weighs `cards.fusesWithOwnedMult` times more and is marked `fuses`;
   - a support perk card for each support perk below its max level;
   - a Core Tier card if below Tier V;
   - run stat cards (always valid).
2. Pick 3 distinct candidates using the type weights in `cards.json` (element, grey, fitting, coreTier, runStat, supportPerk), each split evenly across that type's cards. A Tinker card (random +1 tiers for modules in the barrel, resolved at draw time as slot + module id) joins with the weight of one perk when the barrel has a tiered module.
3. For each run stat card picked, roll a rarity (common, rare, epic; weights from `cards.json`, shifted slightly towards rare with level) to set its value. Module, support and Core Tier cards have no rarity.
4. A module card is applied with the slot the player chose: `fusion.place` (place / fuse with cascade / replace).
5. Reroll repeats steps 2–3 and uses one charge from `RunState.rerolls`.

The RNG is seeded per run (seed stored in RunState), so a bug report can include the seed and the same draws can be replayed in a test.

### Applying stats

```typescript
// mode "mult": fire rate, bullet speed, damage, reload speed, move speed, pickup radius, scrap gain
finalStat = baseStat
  * (1 + metaBuffBonus(stat))   // market levels from MetaState
  * (1 + runBonus(stat));       // run stat cards and Core Tiers

// mode "add": max HP (+10), defence (+1), HP regen (+0.2/s)
finalStat = baseStat + metaBuffBonus(stat) + runBonus(stat);
```

Each buff in `buffs.json` and each run stat card in `cards.json` carries `mode: "add" | "mult"`.

Market buffs are read once when GameScene starts. Changing them mid-run is not possible because the Market is only reachable from menus.

## Data model

Every tunable value is in a JSON file under `public/data`, checked by a zod schema at boot. The TypeScript types are inferred from the schemas (`z.infer`), so data and code cannot drift apart.

| File | Holds | Key fields |
| --- | --- | --- |
| `config.json` | Global numbers | XP curve (xpBase, xpStep), crit multiplier, map size, invulnerability time, slot unlock levels, boss spawn time |
| `guns.json` | 3 cores | damage, shotsPerSecond, magSize, reload, spreadDeg, range, bulletSpeed, pellets, trait, tierBonus, barrel (slots, chains, critChamberMult), muzzleSlots, startingSupport |
| `barrelMods.json` | 17 barrel modules: 3 elements, 3 hybrids, 6 grey, 5 fittings | id, family, colour, element / parents, base + perTier numbers (fittings: left, right) |
| `muzzles.json` | 7 muzzle pieces, minFanDeg, floors | id, name, colour, base + perLevel stats (bullets, spreadDeg, spreadPct, rangePct, damagePct, fireRatePct, bulletSpeedPct, critChance) |
| `supportPerks.json` | 6 support perks (were magazine mods) | id, description, values per level (1–3) |
| `enemies.json` | 5 enemy types | hp, speed, contactDamage, defence, behaviour, behaviour params, scrapDrop, silverChance |
| `boss.json` | Devi Chieftain | hp, phases (threshold, attacks, cooldowns), enrageAfter |
| `timeline.json` | Level 1 schedule | segments (from, to, maxAlive, spawnPerSecond, weights) and events |
| `cards.json` | Card rules | rarity weights, run stat cards, reroll count |
| `buffs.json` | Market buffs | id, stat, mode (add or mult), perLevel, maxLevel, baseCost, costGrowth |

One more file, `drops.json`, holds map drop rates: chance per kill for Kubdari and Hunting Horn, silver chance, scrap size by enemy, crate contents, and when small scrap merges. The map layout lives in `maps/level1.json` (see World, physics and timing).

**Example: one barrel mod and one timeline segment**

```json
{
  "id": "ember_shot",
  "name": "Ember Shot",
  "element": "fire",
  "hooks": ["onHit"],
  "levels": [
    { "dps": 3, "duration": 3, "maxStacks": 5 },
    { "dps": 3, "duration": 3, "maxStacks": 7 },
    { "dps": 3, "duration": 3, "maxStacks": 9 }
  ]
}
```

```json
{
  "segments": [
    { "from": 0, "to": 60, "maxAlive": 20, "spawnPerSecond": 2,
      "weights": { "kaji": 1 } },
    { "from": 60, "to": 120, "maxAlive": 40, "spawnPerSecond": 4,
      "weights": { "kaji": 0.7, "ali": 0.3 } }
  ],
  "events": [
    { "at": 120, "type": "elite", "enemy": "ali" },
    { "at": 210, "type": "swarmRing", "enemy": "kaji", "count": 30 },
    { "at": 300, "type": "bossWarning" },
    { "at": 330, "type": "boss", "boss": "devi_chieftain" }
  ]
}
```

**Mod code lookup:** each mod id maps to a small TypeScript class in `systems/mods/` that reads its numbers from the data. Adding a mod means one JSON entry plus one class registered in `ModRegistry`.

## Save, score and persistence

MetaState is saved as one JSON object in `localStorage` under `svan-and-gun:save`. It is written at the end of every run and after every market purchase or refund; a run in progress is never saved.

```typescript
interface SaveV1 {
  version: 1;
  silver: number;
  buffLevels: Record<string, number>;   // buff id -> level
  highScores: HighScoreEntry[];         // max 10, sorted by score desc
  settings: { volume: number; autoFire: boolean; screenShake: boolean; fullscreen: boolean };
}

interface HighScoreEntry {
  score: number; gun: string; timeSec: number;
  result: 'victory' | 'defeat'; date: string;  // ISO date
}
```

- **Versioning:** `version` is checked at load; `migrations[from]` upgrades old saves step by step. A save that fails the zod check is backed up under `svan-and-gun:save:broken` and replaced with a fresh one, with a notice on the menu.
- **Score:** `kills + 25 × elites + 500 × bossKilled + 2 × secondsSurvived + 1000 × victory`, computed by ScoreSystem from the RunState.
- **Silver:** silver picked up + `floor(kills / 20)` + 100 on victory + 50 boss drop. Added to the balance before the save is written.
- **Refund all:** sums the cost of every bought level using the same cost formula, adds it back, and sets all levels to 0.
- **Storage failures:** every `localStorage` call is wrapped in try/catch. If storage is blocked (private windows, or the itch.io iframe under strict third-party storage rules), the game keeps MetaState in memory and shows "progress will not be saved" on the menu.
- **Cheating:** not a concern for a local, offline Phase 1. Online leaderboards later would need a server check.

## Performance

The budget is 16.6 ms per frame at 90 enemies, about 300 bullets and 200 pickups on a mid-range laptop. Pooling and cheap collision are what get there; logic stays simple.

| Technique | Where | Detail |
| --- | --- | --- |
| Object pools | Bullets, enemies, pickups, damage numbers, effect lines | Created at boot (e.g. 400 bullets, 150 enemies); `get()` / `release()`, never `new` during a run |
| Arcade physics groups | Bullet vs enemy, enemy vs player, player vs pickup | One overlap check per group pair, not per object |
| Spatial hash | Separation, poison spread, lightning chain, ricochet target | 2-unit cells, rebuilt once per frame |
| Off-screen culling | Enemies far outside view | Skip separation and animation updates beyond 1.5 screens |
| Pickup merging | Scrap | Small scrap near each other merges into larger pieces when more than 200 exist |
| Throttled UI | HUD text | Redraw numbers only when they change |
| Status ticks | StatusEffectSystem | Tick every 0.5 s, not every frame |

**How we check:** a debug overlay (F3) shows FPS, alive counts and pool sizes. A Playwright test starts a run with a debug flag that spawns 120 enemies and fails if the average FPS over 10 s drops below 55. Run it locally in a headed browser (`npm run test:perf`), not in CI: headless CI machines have no GPU, so their FPS says nothing about the game.

## Testing, tooling, build and deploy

Rules are unit tested without Phaser; the running game is checked with Playwright through a small test hook exposed only in dev and test builds.

**Unit tests (Vitest), first targets**

- Fusion: tiers add, hybrids, cascade priority, chain gap, replace, no-cap feeding; ModPipeline: fittings, twists, hybrids, loop guard, Twin Shot counts
- StatusEffectSystem: burn stacking and cap, poison no-stack and single spread, lightning never hits the same enemy twice
- CardDraw: every offered card is valid, nothing lands in a locked slot, support perks stop at their max (property test over many seeds)
- Damage formula, XP curve, score, silver, buff cost and refund
- SaveSystem: round trip, migration, broken-save fallback
- Data: every JSON file passes its schema (runs in CI)

**End-to-end tests (Playwright)**

- `window.__svan` test hook (dev/test builds only): read RunState, set seed, skip time, grant scrap, kill boss; `startPlayground(gun)` and `run.playground` (DPS meter, dummies) for the Training Ground
- Boot → menu → pick each gun → run starts
- Level-up appears and a card applies
- Skip to 5:30 → boss spawns → kill → results → silver saved → reload page → silver still there
- Market purchase changes stats in the next run
- FPS stress test (see Performance; local only, not part of CI)

**Tooling and deploy**

| Item | Setup |
| --- | --- |
| Scripts | `dev`, `build`, `preview`, `test`, `test:e2e`, `test:perf`, `lint`, `typecheck` |
| CI | GitHub Actions on each push: lint, type check, Vitest, Playwright (headless Chromium) |
| Debug | F3 overlay, `?debug=1` URL flag for spawn and time controls; Training Ground (menu, dev builds or `?dev`): immortal DPS dummies and an F2 HTML build panel |
| Build | `vite build` to static files in `dist/` |
| Deploy | Upload `dist/` to itch.io (HTML5 game) or GitHub Pages from CI on tags |

## Plan mapping, risks and open questions

Progress is tracked in the [Phase 1 Implementation Plan](https://claude.ai/artifact/JTcj3XPXPxiWh6nYxeEjNA) (local copy: `PHASE1_PLAN.md`, which is the one to tick off during implementation): 38 tasks, about 43.5 working days estimated. Each milestone maps to sections of this document.

| Milestone | Tasks | Sections here |
| --- | --- | --- |
| M0 Setup | T01–T04 | Tech stack, Project structure, Data model, Testing |
| M1 Player and gun | T05–T10 | Player, gun and projectile pipeline |
| M2 Enemies | T11–T15 | Enemies, spawn director and boss; Performance |
| M3 Upgrades | T16–T24 | Projectile pipeline, Progression |
| M4 Boss and run end | T25–T28 | Boss; Scenes and game flow |
| M5 Meta and UI | T29–T34 | Save, score and persistence; Scenes |
| M6 Polish and playtest | T35–T38 | Testing, tooling, build and deploy |

**Risks**

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Mod combinations explode bullet counts (Twin + Split + Ricochet + Lightning) | FPS drops late in a run | Hard caps: max child bullets per hit, max 400 live bullets (oldest child bullets are dropped first), generation cap 2, the pellet rule |
| Arcade physics cost at 90+ enemies | Frame drops | Pools, spatial hash, early stress test in M2 (T15) |
| Slot-order rules confuse players | Builds feel random | Level-up screen previews the slot order; tooltip explains "applies after slot N" |
| Code is written from Phaser 3 habits | Subtle bugs (tint, removed APIs) | Pin the Phaser 4 version, keep the Phaser 4 notes above in the project's CLAUDE.md, rely on `tsc --noEmit` to catch removed APIs |
| Balance takes longer than planned | Late demo | All numbers in data files; debug flags to skip time and grant scrap |

**Open questions**

- Decided: Phaser 4 (stable since April 2026). Fallback is Phaser 3.90 if T01 finds a blocker; Arcade Physics and scene code would carry over nearly unchanged.
- Decided: input goes through a small `InputSource` interface from the start.
- Hosting choice: itch.io, GitHub Pages, or both.
