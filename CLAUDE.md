# Svan and Gun

Top-down survivor roguelike in the browser: Phaser 4.2.1 + TypeScript (strict) + Vite, zod for data, Vitest + Playwright for tests.

- Design: `docs/Svan and Gun — Game Design Document.md` (what the game does)
- Architecture: `docs/Svan and Gun — Technical Design Document.md` (how it is built; follow it)
- Task tracker: `docs/PHASE1_PLAN.md`. Tick tasks off there (and in the CSV) when done, add a dated note for any deviation.

## Commands

`npm run dev` · `npm test` (Vitest) · `npm run test:e2e` (Playwright, starts the dev server) · `npm run lint` · `npm run typecheck` · `npm run build` · `npm run format`

Before calling a task done: `npm run lint && npm run typecheck && npm test && npm run test:e2e`.

## Rules (enforced by ESLint where possible)

- `src/systems`, `src/core`, `src/data` never import Phaser, scenes or entities. They work on plain interfaces so every rule is unit tested without a browser.
- No tuning numbers in code. Every gameplay number lives in `public/data/*.json` or `public/maps/*.json`, has a zod schema in `src/data/schemas.ts`, and is read through `GameData`. New fields: add to the schema first, then the JSON, then cross-checks in `src/data/registry.ts` if they reference other files.
- Data files are in design units; `u(n)` converts to pixels (1 unit = 32 px).
- Gameplay randomness uses the seeded `RNG` (`src/core/rng.ts`), never `Math.random()`. Gameplay timers use the scene clock and delta, never `Date.now()`/`setTimeout`.
- Events go through the typed `EventBus` (catalog in `src/core/events.ts`; add events there first). One bus per run; remove listeners on scene shutdown.
- Scenes reset run state in `init()`, never in the constructor (scene instances are reused on restart).
- Extend `window.__svan` (`src/debug/testHook.ts`) when a feature needs an e2e hook; it exists only in dev/test builds.

## Phaser 4, not Phaser 3

Most examples online and in memory are Phaser 3. Use the `phaser-core` and `phaser-arcade-physics` skills, and check `node_modules/phaser/types/phaser.d.ts` instead of guessing.

- `setTintFill()` is gone: `setTint(c).setTintMode(Phaser.TintModes.FILL)` (hit flash).
- `Graphics.fillPoints/strokePoints` take `Phaser.Math.Vector2[]`, not plain `{x, y}`.
- `Geom.Point` → `Phaser.Math.Vector2`; `Phaser.Math.TAU` is 2π.
- FX/BitmapMask/custom pipelines became filters and render nodes (not needed in Phase 1).
- Arcade Physics has no swept collision: bullets use the swept segment test from the TDD, not plain overlaps.
