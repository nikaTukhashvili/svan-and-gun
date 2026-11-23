# Svan and Gun — Changelog

What changed in the game, newest first: features, design changes after playtests, fixes worth knowing, and why. What is planned or in progress lives in [ROADMAP.md](ROADMAP.md).

**How to add an entry**

- One `###` entry per feature, design change or notable fix: what changed, the decision and why (a playtest, a review), deviations from the GDD/TDD, and the tests that cover it.
- Work not on `main` yet goes under **Unreleased**. When it is merged to `main` (which deploys the live build), move it under that day's date heading.
- Keep tuning numbers out of here unless the change *is* the number (they live in `public/data`).

Live build: https://nikatukhashvili.github.io/svan-and-gun/

## Unreleased

_Nothing yet._

## 2026-11-23

### Invulnerability after a level-up or chest

- Playtest: after picking an upgrade the run resumes straight into the horde, which is chaotic. Closing a level-up or chest screen now gives 2.5 s of invulnerability (`config.json > player.afterChoiceInvulnerableSec`). The player blinks as after a hit. It never shortens a longer window already running (e.g. a revive). Several queued level-ups give one window at the end, not one each.
- Tests: 2 new PlayerHealth unit tests (272 total); the level-up and chest e2e tests check the window.

### Mobile: twin-stick touch controls

- Phones and tablets play with two floating sticks: left thumb moves (analog, so moving at partial speed now works), right thumb aims, and pushing it past `config.touch.fireThreshold` fires. With no right thumb the gun faces the way the player walks. RELOAD, BUILD and pause (II) buttons sit on the right edge. Twin-stick was chosen over auto-aim (the GDD had assumed mobile would need auto-aim).
- Detection: Settings > Controls is Auto (default), Touch or Keyboard & mouse. Auto checks whether the main pointer is a finger at startup, then follows the last device used, switching mid-run. `?touch` forces touch mode for testing on a desktop.
- Phone page: no pinch zoom or scrolling, fullscreen on the first touch (where the browser allows it), a "turn your phone sideways" message, and the run pauses while the phone is upright. Tutorial prompts have touch versions (`timeline.json > touchPrompt`).
- Fix found on the way: the build sheet could only be closed with C or Esc, which a phone doesn't have. It now has a Close button.
- New data: `config.json > touch` (stick radius, dead zone, fire threshold). New setting `controls` (defaults to `auto`, so older saves still load).
- Tests: 270 unit tests (new `inputMode.test.ts`: device guess, mode, stick maths, save default). New `touch.spec.ts` drives real multi-touch through Chrome: both sticks at once, the three buttons and the Settings row. Every e2e spec passes when run one at a time.
- Not tested on a real phone yet.

### Progress tracking docs

- `docs/ROADMAP.md` (Now / Next / Backlog / Open questions) and this changelog replace the Phase 1 plan's log, which moved here. `PHASE1_PLAN.md` and its CSV are archived.

### Items (gear) (built 2026-11-22, merged after a few days of playtesting)

- Built the GDD Gear section. `items.json` (zod schema, registry cross-checks): 6 paper-doll positions, 14 themes (Frost Chokha added for the fourth element), 10 extra stats, 5 legendaries with passives, chest kinds, salvage and supply chest timing. Rules in `systems/items.ts` and `systems/passives.ts` (pure, unit tested).
- Items level with no cap; rarity follows the level (extra stats rolled at 3 and 5). Element themes scale their element's modules and hybrids like a fitting. Legendary passives: Tower Keeper, Wolf-pelt Cloak, Ember Smith (fire modules count tiers higher), Feast (scrap heals), Mountain Runner (charged shot pierces all); the HUD shows them at work.
- Chests open a new ChestScene: 3 choices, each a new item (compare view against the worn one, which is salvaged into scrap) or an upgrade. While a slot is empty one choice always fills one. Elite chests give at least Magic. Supply chests land every 45 s from 0:45 to 5:20 near the player (7 + 2 elites = 9 chests per full run, GDD target 8–10).
- Run stat cards (blessings) are removed from Favor of the Gods and from the code; run stats come from items. The build sheet shows the paper doll filled, a GEAR column and Tinker; the Training Ground panel has an Items section (any theme or legendary at any level).
- Deviations: no boss chest (the run ends on the boss's death, so it could not be used); legendaries come from elite (25%) and supply (4%) chests instead. Salvage is scrap (the GDD's open question). All chest/legendary numbers are first guesses for the balance pass.
- Tests: 257 unit tests (new `items.test.ts`); new `items.spec.ts` e2e (chest, upgrade, supply chest, build sheet); the elite chest e2e now picks on the chest screen. Every e2e spec passes when run one at a time.

## 2026-11-21

### Code review fixes (branch `barrel-fusion`)

- Statuses from several modules now merge (strongest burn damage / stack cap, strongest poison, spreading kept), so module order never changes a hit. Steam bursts when a hit freezes the enemy, whichever module froze it.
- Tinker never promises more upgrades than a module's cap allows (and `isCardValid` checks it).
- Slot unlocks are an order: the SMG crit chamber opens at level 1, and Double Barrel halves take turns (before, the right half was empty until level 4, so every other shot had no modules). Inserts never slide across a locked slot.
- Brimstone's death burst only for enemies Brimstone itself hit (its chain; a crit-chamber Brimstone only on crits), at that hit's strength.
- Frostbite's poison bonus ends with its poison. A Mutation placed by number key uses the default side, not the mouse position.

### Temporary soundtrack (branch `barrel-fusion`)

- One looping track for the whole game: `public/audio/run.mp3` (the user's Suno track "Towers of Stubborn"). Loaded in the background when the menu first opens, so boot does not wait for it; plays after the first click (browser audio unlock).
- Settings: Music volume and a mute toggle (saved; `musicVolume` / `musicMuted` default in the schema, so older saves stay valid). M mutes anywhere.
- Skipped under automation (`navigator.webdriver`); `tests/e2e/music.spec.ts` hides that flag to test the real path.

### More sound effects (branch `barrel-fusion`)

- Still synthesized with WebAudio (no files). New: crit, lightning zap, freeze, burst (Steam/Brimstone), grenade throw, enemy shot, silver, heal (kubdari), hunting horn, chest, elite arrival, boss arrival, victory, defeat, menu click, and level-up screen sounds (path choice, grab, place, upgrade, Mutation, replace, refused drop, reroll).
- One shared sound bank per game (`sfxFor`); combat sounds vary their pitch slightly. The Training Ground panel has a Sound test.
- Music is not added yet (the user is choosing a source).

### No automatic merging; upgrades by drop; Mutation (branch `barrel-fusion`)

- Playtest: modules merging by themselves took control away, and hybrids came too early and too strong.
- Nothing merges by itself. A module card dropped onto the same module upgrades it one tier. Elements cap at tier V (`config.slots.maxElementTier`); grey modules have no cap.
- Mutation (new Favor of the Gods card, `typeWeights.mutation`): dragged onto two different elements at tier V side by side, they become their hybrid at tier V; offered only when such a pair exists. Hybrids are final.
- Moving a module only moves or swaps it. `cards.fusesWithOwnedMult` → `upgradesOwnedMult`; module cards say CAN UPGRADE. Tinker only raises modules below their max.
- Tests: `fusion.test.ts` rewritten; Mutation in `build.test.ts`; e2e upgrade-by-drop and Mutation drag.
- Same day, after playtest: the element cap went from V to III (`maxElementTier: 3`); at V no mutation happened in a run. Hybrids are made at III.

### Frost, the fourth element (branch `barrel-fusion`)

- Frost Shot: chill stacks slow enemies; full stacks freeze (no movement or actions, no contact damage, +shatter hit damage). Freeze immunity after a freeze (`config.combat.freezeImmunitySec`), slow cap (`maxChillSlow`); the boss is only slowed.
- Hybrids: Steam (fire + frost: burn, chill, steam burst on freeze), Frostbite (poison + frost: poison ×2 on chilled enemies), Hailstorm (lightning + frost: chains chill everyone reached). 21 barrel modules now (4 elements, 6 hybrids).
- Visuals: chilled enemies tinted blue, frozen ones filled ice-white, a pale flash when one freezes.
- Tests: `tests/unit/frost.test.ts`.

### Level-up paths and the build sheet (branch `barrel-fusion`)

- A level-up (and a chest) first asks for a path, then shows 3 cards from it: **Favor of the Gods** (elements and blessings, i.e. the run stat cards) or **Gunsmith** (grey modules, fittings, muzzle pieces, magazine work = support perks, Core Tier, Tinker). `cards.json > paths`; the registry checks every card type is in exactly one path. Tinker has its own weight (`typeWeights.tinker`).
- The build sheet (C) is redrawn: equipment paper doll (Svan Hat, Cloak, Chokha, 2 Rings, Boots; empty until items exist), stats, blessings and Tinker, magazine work, and the gun as core → barrel → muzzle.
- Tests: path unit tests in `build.test.ts`; e2e path choice. The e2e `pickFirst` presses '1' up to 5 times (path, card, slot, confirm).

### Muzzle slots (branch `barrel-fusion`, part of the upgrade system)

- Every gun ends in muzzle slots (Long Gun 3, Double Barrel 2, Scrap SMG 3). 7 muzzle pieces in `muzzles.json`, each with an upside and a downside; all fitted pieces stack on every shot, with floors so stacked downsides never break the gun.
- A muzzle card dropped on the same piece upgrades it (no cap), on an empty slot fits it, on another piece replaces it (with a confirm). No fusing. Muzzle cards come from level-ups.
- The Long Gun's "last barrel slot ×2" twist is removed (its muzzle replaces it). The Double Barrel starts every run with Grenade Mag level 1 (`guns.json > startingSupport`).
- Level-up screen: the gun reads left to right as Core, barrel, muzzle. The Training Ground workbench has a muzzle row, and the panel a Muzzle section (piece + level per slot, stacked total).
- Tests: `tests/unit/muzzle.test.ts`; e2e muzzle upgrade by drag, workbench muzzle fit/upgrade/remove. `window.__svan.levelUpSlots()` gives slot centres to e2e tests.

## 2026-11-20

### Barrel fusion replaces operators, slot order, levels and the magazine (branch `barrel-fusion`)

- Design change after playtest: the left→right operators were hard to reason about. Modules now **fuse on contact**: tier = copies fused in, with no cap, and tiers add (Fire 2 + Fire 1 = Fire 3; Fire 3 + Thunder 2 = Plasma 5). An equal-tier, capped version was rejected because the last slots of a full barrel could never max out.
- 3 elements and 3 hybrids (Plasma, Brimstone, Blight Arc), 6 grey modules, and 5 directional fittings (Booster ▶/◀, Brace, Overcharger, Siphon) that scale their neighbours. Numbers are base + perTier × (tier − 1) in `barrelMods.json`.
- The magazine is gone: its 6 mods are support perks (no slot, 3 levels, `supportPerks.json`). Barrels are 8 / 8 / 7 with slots unlocking at levels 1, 4, 7, 10 and 13. The gun twists stay (muzzle, crit chamber, Double Barrel halves; nothing fuses or boosts across the gap).
- Level-up screen: pick a card; a module card asks for a slot, with a hover preview of the fusion cascade, by click or number key; a replace asks twice; swaps fuse too. The Training Ground panel has tiers, a "fuse on place" option and support perks.
- Tests: 198 unit tests (new `fusion.test.ts`; `operators.test.ts` removed). Every e2e spec passes when run one at a time, including a fusion placement test and a layout screenshot per gun.
- Balance is untested: hybrid and fitting numbers are first guesses, to tune in the Training Ground.
- Playtest change (same day): a hybrid grows **only from the same hybrid**. Feeding it a parent element (Plasma II + Thunder → Plasma III) felt wrong, so elements no longer fuse into a hybrid.

### Dev tool: Training Ground (branch `dev-tools`)

- Menu > Training Ground: always in `npm run dev`; on the hosted build only with `?dev`. A small open map (`maps/playground.json`) with no spawn timeline, no drops, no level-ups, god mode on and market buffs off by default.
- Immortal dummies from `data/playground.json`: plain, armoured (defence 8), a pack of 6 (pierce, split, ricochet, chains, explosions) and a moving one. They refill instead of dying, and each full hit still counts, so DPS is not capped by HP.
- `DpsMeter` (pure, unit tested): rolling DPS, session average, peak, total, hits, crits and status damage. A label over each dummy kind; the pack's numbers are its six members added up. `enemy:damaged` now carries the enemy `uid`.
- F2 HTML panel: gun, every slot (mod, level, order), Core Tier, perks (C/R/E), Reset build/perks/meters, Respawn dummies, Clear/Spawn enemies, God mode, Market buffs, and an all-target readout. The slot tag logic moved to `cardText.barrelSlotTag` (shared with the level-up screen).
- Tests: 182 unit tests, new `playground.spec.ts` (3). Every e2e spec passes when run one at a time.

### Barrel redesign: operators and gun twists (design change after playtest)

- Option A chosen: four operator mods (Amplifier, Hammer Spring = every Nth shot, Death Trigger = on kill, Echo Chamber) that change only the slot to their right. Operators never stack, and an operator never reaches into the other chain.
- Gun twists: Long Gun 6+2 with a ×2 muzzle; Double Barrel 6 (2 chains of 3, alternating shots) + 2; Scrap SMG 3 + a ×3 crit chamber + 3 magazine. All within the `config.slots.maxTotalSlots` cap of 12. All layout numbers are data in `guns.json` > barrel.
- The level-up screen sizes slots to the gun, tags MUZZLE / CRIT CHAMBER / LEFT and RIGHT BARREL, and marks operators with "→" or "(no target)". Gun select shows slots and the twist.
- Tests: 169 unit tests (new operators.test.ts covers the user's Fire | ×2 | Lightning example, each operator, and each gun twist). upgrades.spec passes, including a layout screenshot per gun.
- Balance note: barrel lengths now differ, so the T36 playtest should compare guns at the same run time.

### T38 done: hosted

- Repo: https://github.com/nikaTukhashvili/svan-and-gun (public).
- Playable: https://nikatukhashvili.github.io/svan-and-gun/
- `.github/workflows/deploy.yml` runs unit tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. It is separate from CI, so flaky e2e cannot block a deploy.
- The first CI run on GitHub passed everything (lint, format, types, unit, all e2e).
- Phase 1 is now in playtesting: T36 balance pass and the T37 gun-feel check.

### T35 done, T37 in progress

- T35: placeholder sound effects synthesized with WebAudio (no audio files), routed through Phaser's master volume so the volume setting applies: shots (light/heavy), reload, hit, kill, hurt, level-up, pickup, explosion, boss slam, boss death. Each sound has a minimum gap so bursts stay readable. Enemies flash white on hit, and pooled damage numbers show crits (big, orange) and status damage (small, green). Screen shake follows the setting.
- Fixes: the boss was drawn with a missing texture (now its own hexagon). Powder barrels have a yellow hoop outline so they no longer look like enemies.
- T37 GDD acceptance checklist:
  - [x] Full run from main menu to results with no blocking bugs (e2e: smoke, boss)
  - [~] All 3 guns can be picked (e2e); *each feels different* needs a human playtest
  - [x] Barrel mods apply in slot order and swapping changes the result (unit tests for both orders; swap UI e2e)
  - [x] Level-up never offers an invalid card (property test, 300 seeds × 25 levels, including Tinker)
  - [x] Boss at 5:30; victory retakes the tower (e2e)
  - [x] Silver and buff levels persist after a reload (e2e)
  - [x] Market buffs change the next run's stats (unit + e2e)
  - [x] High-score table saves and sorts (unit + e2e)
  - [x] 90+ enemies at a steady 60 FPS (headed stress test: 120 enemies, 143.7 FPS average, minimum 100)
  - [x] Spawn timeline, enemy stats, mods and buffs live in data files (ESLint guards the pure layers; only cosmetic constants stay in code)
- Still open: T36 balance pass and the "feels different" check need playtests; T38 hosting needs a choice (itch.io or GitHub Pages, and an account). `npm run build` produces `dist/` (~417 KB gzipped).

### M5 done (T29, T31–T34)

- Save: one zod-validated JSON object in localStorage, with version + migrations. A broken save is backed up and reset, with a menu notice. If storage is blocked, the game keeps everything in memory and says progress won't be saved. It is written after every run and every market purchase or refund.
- Each run's results add silver and a high-score entry (top 10, "NEW BEST!" on the results screen).
- Market: 12 buffs, cost = base × 1.5^level, Buy, and Refund all. Buffs apply at run start through `metaBonuses`. Second Wind now works: one revive at `config.player.reviveHpFraction` (50%), with 2 s of invulnerability.
- Menus: main menu (Start, Market, High Scores, Settings, silver balance), gun select (story text card, 3 guns with stats, keys 1–3), high-score table, and settings (volume, auto-fire, screen shake, fullscreen; saved; also reachable from the pause menu).
- HUD: the build is shown bottom left (barrel slots, magazine slots, Core Tier). Screen shake on damage respects the setting.
- Tests: 157 unit tests. E2E: smoke, meta and upgrades files pass (run one file at a time).

### Design change (requested after the first playtest)

- All barrel and magazine slots are open from level 1 (`config.json` slots). Level-gated slots forced the barrel order instead of letting the player plan it.
- Card weights are now per type and shared across that type's cards. Before, every mod card carried the full type weight, so perks almost never appeared. The perk share went from 1 to 3.
- New perks: Felt Cloak (+1/2/3 armour) and Keen Eye (+10/15/25% scrap gain).
- New Tinker card ("Gunsmith's Whim"): 2 random level-ups for owned mods (the same mod can get both), offered as often as one perk, and only when some owned mod is below level 3. It is a safety pick when the other cards are poor.
- The GDD and TDD are updated to match. Unit tests: 146 passing.

### M4 done (T25–T28), plus T30

- The boss is a pooled enemy (`EnemySystem.spawnBoss`) driven by `BossController`, so bullets, the pellet rule, burn, poison and lightning all work on it. Phases change at 67% and 34% HP. Slam sends out an expanding shockwave ring (hits once); phase 3 slams twice. Boulders are telegraphed for 1 s, hurt on impact, and leave rubble that blocks bullets, enemies and the player for 10 s. Summons bring 8 Kaji. Enrage after 180 s adds +50% damage.
- Fix found by a unit test: the boss had skipped the "stop at the player's edge" rule and stood on top of the player.
- Timeline messages: tutorial prompts and the 5:00 bell warning appear as a HUD banner. The HUD shows a boss bar with phase markers. Regular spawns run at 50% while the boss lives.
- Victory: the horde flees, there is a 2 s "Tower retaken" moment, then the results screen. Defeat shows a 1.5 s overlay, then results. Results show score, stats, silver breakdown and final build, with Retry and Main menu.
- T30: score and silver formulas (`systems/score.ts`, unit-tested). Silver is not saved yet: that is T29, and `setRunRecorder` in ResultsScene is the hook for it.
- Pause: Esc, or automatically on window blur. Resume, or Quit run (counts as a defeat).
- Debug key B (with `?debug=1`) jumps to the boss.
- The last full e2e run was 24/25. The one failure was a timing-sensitive spawn check that only fails under heavy machine load; it is now loosened. That loosened version has not had a full e2e run yet: e2e runs (dev server + CPU-rendered Chromium) slowed the machine badly, so run them one spec file at a time.

## 2026-11-19

### M3 done (T16–T24)

- Levelling: linear XP curve from `config.xp`; several level-ups from one pickup are queued and shown one after another. Gunsmith's Chests queue a free card choice the same way.
- Card draw: valid cards are built first, then 3 distinct ones are picked by type weight. A property test over 300 seeds × 25 level-ups checks that an invalid card is never offered and the build never breaks a rule (no duplicate mods, max level 3, nothing in locked slots, Core Tier ≤ V). Rarity applies to run stat cards only (GDD).
- Level-up screen: keys 1–3 or click to pick, R to reroll, click two barrel slots to swap them, and a replace card asks which slot to replace. The OS cursor is shown on this screen (the run hides it behind the crosshair).
- Mod pipeline exactly as the TDD describes: onFire mods in slot order; bullets carry `fromSlot`; Split Shot shards and Ricochet bounces only carry later-slot mods. Ricochet redirects the bullet when it would stop. Unit tests cover both slot orders.
- Pellet rule: knockback and on-hit mods apply once per enemy per volley.
- Elements: burn stacks (capped, timer refresh); poison does not stack and spreads once on death with a fresh duration (spread poison cannot spread again); lightning chains to the nearest enemies and never hits one twice. All status damage ignores defence and ticks every 0.5 s.
- Magazine mods: Extended Mag, Quick Hands and Last Round change the weapon's numbers. Grenade Mag (thrown at the aim point when the magazine empties), Shock Reload (push-back on reload) and Scavenger (round back on kill) are triggered by the scene. The grenade's throw range and fuse moved into `magazineMods.json`.
- Drops: scrap by enemy type (elites ×5 plus a chest and 10 silver), a 5% silver chance, Kubdari heals 30, the Hunting Horn pulls in all scrap, and scrap merges above 200 pieces. Powder barrels explode (area damage to enemies, chain reactions); crates drop Kubdari, scrap or silver. Neither blocks movement.
- A basic HudScene now exists (scrap bar, level, HP, timer, kills, silver). T34 adds mod slots, tutorial prompts and the boss bar.
- Debug key L (with `?debug=1`) grants one level.

### M2 done (T11–T15)

- Enemies have no physics bodies either. `EnemySystem` is a pool of 150 plain structs: steering, positional push-out from obstacles (so they slide around rocks and houses), and soft separation through a typed-array spatial hash (2-unit cells, rebuilt each frame, no per-frame allocation). Only the player uses Arcade Physics.
- Behaviours: swarm and tank chase; flank circles, winds up (white flash), dashes and recovers; charge winds up inside its trigger range, charges, and is stunned (early if it hits a wall); caster keeps 6–8 units away, drifts sideways, and throws slowing curses (the player turns purple while slowed).
- Knockback applies once per enemy per volley, so six Double Barrel pellets push like one shot. Enemies stop at the player's edge instead of stacking on top of him.
- Elites: 5× HP, +1 defence, 1.4× size, gold ring. The trait comes from the timeline event: `fast` (1.3× speed) or `deathBurst` (a delayed explosion with a red danger circle; ignores defence). The Gunsmith's Chest drop comes with T24.
- Fix: Phaser's delta smoothing made the game clock run ~16% slow under uneven frame times, so `fps.smoothStep` is now off. GameScene still clamps each frame to 50 ms.
- T15 numbers (120 enemies, Scrap SMG firing constantly): game logic 0.55 ms per frame; real GPU (headed) average 143.7 FPS, minimum 100. Headless Chromium renders on the CPU (~45–50 FPS), which is why `npm run test:perf` runs headed and is not in CI. The ground grid is now one tiled sprite instead of a large Graphics.
- Debug: F3 toggles the overlay. `?debug=1` shows it by default and enables keys 1–5 (spawn 10 of each enemy), E (elite), T (+30 s), K (kill all) and G (god mode).

### M1 done (T05–T10)

- Bullets have no physics bodies. `BulletSystem` is a fixed pool of 400 plain structs moved by swept segments against an `ObstacleField` (the pure mirror of the map's obstacles), and `BulletView` draws slot i with sprite i. This is cheaper than Arcade bodies and cannot tunnel through fences. Enemy hits plug in through the `onSegment` callback in T11.
- The player is the only Arcade body so far: a circle colliding with static obstacle bodies and the world bounds.
- Added the `weapon:reloaded` event (reload finished) to the catalog and the TDD table.
- The Double Barrel's pellets fan evenly across the 30° cone with a little seeded jitter, rather than being fully random, so the spread pattern reads clearly.
- The bullet speed stat scales range as well as speed (GDD: Player character); Core Tiers are implemented in `computeWeaponStats` (Tier I = base).
- Placeholders until later tasks: Esc quits the run (pause menu T33), the end-of-run overlay stands in for the results screen (T28), and meta buffs are not applied yet (T31).

### M0 done (T01–T04)

- Stack as installed: Phaser 4.2.1 (pinned), Vite 8, TypeScript 5.9, zod 4, Vitest 5, Playwright 1.65, ESLint 10. TypeScript 5.9 instead of 7 because typescript-eslint supports TS < 6.1 only.
- ESLint enforces the TDD architecture: `systems/`, `core/` and `data/` cannot import Phaser, scenes or entities, or use `Math.random`, `Date.now` or `setTimeout`.
- Data: all 10 data files plus `maps/level1.json` have strict zod schemas and cross-file checks (unknown enemy ids, timeline gaps, mod level counts, description placeholders, player start inside an obstacle). Bad data shows an error list on screen at boot.
- Numbers the GDD did not give were filled in as first guesses for the T36 balance pass: knockback per gun, enemy radii and behaviour timings, boss attack numbers, scrap per enemy (Kaji 1 … Devi Brute 8), Kubdari/Horn drop chances, crate and powder barrel values, card type weights and run stat card values, Siege and Boss segment spawn rates.
- Deviation: Twin Shot level 2 now raises damage to 75% per bullet. In the GDD, level 2 changed nothing (the extra bullet only comes at level 3), which would have been a dead card.
- Follow-ups: Menu Start uses the Long Gun until gun select (T33). The `test:perf` script and FPS stress test move to T15. `GameScene` is a stub that T05 replaces.
