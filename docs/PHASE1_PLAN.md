# Svan and Gun — Phase 1 Implementation Plan

Stack: **Phaser 4 + TypeScript** (Vite). Design: `Svan and Gun — Game Design Document.md`. Architecture: `Svan and Gun — Technical Design Document.md`. Source: `Svan and Gun — Phase 1 Implementation Plan - Phase 1 Plan.csv`.

> **Archived 2026-11-23.** Phase 1 is built and hosted; the two open tasks (T36 balance pass, T37 gun-feel check) moved to [ROADMAP.md](ROADMAP.md). Change history: [CHANGELOG.md](CHANGELOG.md).

**Status markers:** `[ ]` to do · `[~]` in progress · `[x]` done

## Progress

| Milestone | Done | Tasks | Est. days | Days left |
|---|---|---|---|---|
| M0 Setup | 4 | 4 | 3.0 | 0.0 |
| M1 Player and gun | 6 | 6 | 5.5 | 0.0 |
| M2 Enemies | 5 | 5 | 7.0 | 0.0 |
| M3 Upgrades | 9 | 9 | 12.5 | 0.0 |
| M4 Boss and run end | 4 | 4 | 5.0 | 0.0 |
| M5 Meta and UI | 6 | 6 | 6.0 | 0.0 |
| M6 Polish and playtest | 2 | 4 | 4.5 | 3.0 |
| **Total** | **36** | **38** | **43.5** | **3.0** |

**Overall: 36 / 38 tasks (95%)** · Est. days left: **3.0**

---

## M0 Setup

- [x] **T01** (0.5d) — Create Vite + TypeScript + Phaser 4 project (exact version pinned), ESLint, Prettier, git repo; empty scene runs at 60 FPS; confirm generateTexture placeholders work
- [x] **T02** (0.5d) — Folder structure (scenes, systems, entities, data, core, ui), EventBus, seeded RNG, game config constants
- [x] **T03** (1.0d) — JSON data files for guns, mods, enemies, buffs, spawn timeline, with TS types and load-time validation
- [x] **T04** (1.0d) — Tests: Vitest for game logic, Playwright smoke test that boots the game and starts a run, window.__svan test hook, GitHub Actions CI

## M1 Player and gun

- [x] **T05** (1.0d) — Arena scene: bounded 4x4-screen map, camera follow, placeholder obstacles
- [x] **T06** (0.5d) — Player movement (WASD) through an InputSource interface, collision with obstacles
- [x] **T07** (1.0d) — Mouse aim, shooting, pooled bullets with swept hit test (no tunnelling)
- [x] **T08** (1.0d) — Ammo, magazine, reload (R and auto), reload ring at cursor
- [x] **T09** (1.5d) — Three cores from data: Long Gun (pierce), Double Barrel (pellets, knockback), Scrap SMG (10th-shot crit)
- [x] **T10** (0.5d) — Player HP, damage formula, defence, invulnerability after hit, death

## M2 Enemies

- [x] **T11** (1.5d) — Enemy base: chase steering, contact damage, HP, death, object pooling
- [x] **T12** (2.5d) — 5 behaviours: Kaji swarm, Ali dash, Ochopintre charge, Rokapi slowing caster, Devi Brute armour
- [x] **T13** (1.5d) — Spawn director driven by timeline data: off-screen ring spawns, max alive, swarm ring event
- [x] **T14** (0.5d) — Elites (5x HP, outline, chest drop) and +12% HP per minute scaling
- [x] **T15** (1.0d) — Performance: 90+ enemies plus bullets at 60 FPS (physics groups, pooling, spatial hash), F3 debug overlay, local stress test

## M3 Upgrades

- [x] **T16** (1.0d) — Scrap drops, pickup radius, linear XP curve (5 + 10 per level), levelling, queued level-ups
- [x] **T17** (1.5d) — Level-up screen: pause, 3 cards (rarity on run stat cards), reroll
- [x] **T18** (1.0d) — Card draw validity rules: open slots, owned mods, max levels, no duplicate mods
- [x] **T19** (2.0d) — Barrel pipeline: ordered slots 1-4, later-slots-only rule for child bullets, unlocks at levels 5/10/15, swap two slots, replace when full
- [x] **T20** (2.0d) — Barrel mods: Twin Shot, Ricochet, Long Rifling, Piercing Bore, Heavy Slug, Split Shot; pellet rule and bullet caps
- [x] **T21** (2.0d) — Elements: Fire stacking burn, Poison spread on death, Lightning chain
- [x] **T22** (1.5d) — Magazine slots (unlock at 3/8) and 6 magazine mods
- [x] **T23** (0.5d) — Core Tier upgrades (I-V) and run stat cards
- [x] **T24** (1.0d) — Map drops: silver, Kubdari, Hunting Horn, Gunsmith's Chest, breakable crates, powder barrels

## M4 Boss and run end

- [x] **T25** (0.5d) — Run timer and phase events (calm and bell warning at 5:00); auto-pause when the tab loses focus
- [x] **T26** (3.0d) — Devi Chieftain: 3-phase state machine, shockwave, boulders + rubble, summons, enrage
- [x] **T27** (0.5d) — Boss HP bar with phase markers; regular spawns at 50% during boss
- [x] **T28** (1.0d) — Victory (tower retaken) and defeat flow, results screen

## M5 Meta and UI

- [x] **T29** (1.0d) — Save system in localStorage with version field: silver, buffs, scores, settings; broken-save and blocked-storage fallback
- [x] **T30** (0.5d) — Silver income rules and score calculation
- [x] **T31** (1.5d) — Market screen: buy buffs, cost curve, refund all; buffs applied at run start
- [x] **T32** (0.5d) — High-score table: top 10, sorting, New best badge
- [x] **T33** (1.5d) — Main menu, gun select, pause, settings screens; opening story text card
- [x] **T34** (1.0d) — HUD: HP, ammo, scrap bar, level, timer, kills, silver, owned mods; first-minute tutorial prompts

## M6 Polish and playtest

- [x] **T35** (1.0d) — Placeholder SFX, hit flash, damage numbers, screen shake toggle
- [ ] **T36** (2.0d) — Balance pass: tune data files from playtests
- [~] **T37** (1.0d) — Run the GDD Phase 1 acceptance checklist
- [x] **T38** (0.5d) — Build and host the web demo (itch.io or GitHub Pages)

---

## Notes / Log

Moved to [CHANGELOG.md](CHANGELOG.md) on 2026-11-23 (newest first). The remaining Phase 1 work (T36, T37) is tracked in [ROADMAP.md](ROADMAP.md).
