# Svan and Gun — Roadmap

What we are working on, what comes next, and what is parked. What already changed lives in [CHANGELOG.md](CHANGELOG.md). Design: [GDD](Svan%20and%20Gun%20—%20Game%20Design%20Document.md) · Architecture: [TDD](Svan%20and%20Gun%20—%20Technical%20Design%20Document.md) · Phase 1 task list (archived): [PHASE1_PLAN.md](PHASE1_PLAN.md).

**Status markers:** `[ ]` to do · `[~]` in progress · `[x]` done (then move it to the changelog and delete it here)

## Status

| | |
|---|---|
| Phase | **1: Free Roam demo**, built and in playtesting (Gate 1 not passed yet) |
| Live build | https://nikatukhashvili.github.io/svan-and-gun/ (deploys from `main`) |
| Working branch | `main` (mobile controls merged 2026-11-23) |
| Tests | 272 unit · e2e specs pass one file at a time |
| Last updated | 2026-11-23 |

## Now

- [~] **Mobile: play-test on a real phone**: twin-stick controls are live (see the changelog, 2026-11-23) but were only tested in emulated Chrome. Play the live build on iPhone Safari and Android Chrome. Things to check:
  - stick size and dead zone feel (`config.json > touch`)
  - level-up and chest drag-and-drop with a finger (cards and slots may be small)
  - text readability on a small screen
  - fullscreen and rotation on iPhone

## Next: close Phase 1

- [ ] **Balance pass** (was T36). First-guess numbers to tune in the Training Ground and in playtests:
  - hybrids and fittings (`barrelMods.json`), muzzle pieces (`muzzles.json`)
  - chest, supply chest and legendary numbers (`items.json`)
  - compare the guns at the same run time (their barrel lengths differ)
- [ ] **"Each gun feels different"** human playtest (the last open line of the T37 acceptance checklist)
- [ ] **Gate 1 decision**: is the free roam loop fun on its own? This decides when Phase 2 starts.

## Backlog

Decided we want it, not scheduled yet.

- [ ] Replace the temporary soundtrack (`public/audio/run.mp3`) with the final music
- [ ] Housekeeping: delete the merged `dev-tools` and `items` branches

## Open questions

Need a decision, usually after a playtest.

- Elements deal flat damage, which favours fast guns. Switch burn and poison to a share of the hit's damage? (GDD)
- Dodge roll: in or out? (GDD)
- Can the player find a second gun during a run, or is it one gun per run? (GDD)
- The hero's name, and how much story text goes into Phase 1. (GDD)
- Boss chest: dropped because the run ends on the boss's death. Revisit if runs get a post-boss moment. (Items deviation)
- Salvage gives scrap for now. Is that the right reward? (Items deviation)
- Target platforms after PC: Steam Deck, mobile (would need auto-aim)? (GDD)

## Later phases

- **Phase 2**: Tower Defence levels, real art and audio. Starts only after Gate 1.
- **Phase 3**: full campaign: more towers, forge recipes, more elements and cores (e.g. flintlock pistol pair, crossbow), the Demon Lord.
