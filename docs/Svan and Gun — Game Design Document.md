# Svan and Gun — Game Design Document

Nov 19, 2026 · @Nika Tukhashvili

## Overview

Svan and Gun is a top-down survivor roguelike: one stubborn Svan, a homemade gun he rebuilds every run, and hordes of Georgian mythical creatures. It plays like Vampire Survivors, but you aim, reload and build your gun part by part. Tower defence levels come after the survival core feels right.

| Item | Decision |
| --- | --- |
| Genre | Top-down survivor roguelike, with tower defence levels added later |
| Camera | Straight top-down in Phase 1 (a slight 3/4 view can come with real art) |
| Platform | Desktop browser first (keyboard + mouse), built with Phaser + TypeScript; gamepad later |
| Session length | 6–9 minutes per level run |
| Phase 1 visuals | Placeholder shapes only: player, enemies and pickups are coloured blocks |

**Design pillars**

1. **The gun is the build.** Every upgrade goes into a physical gun part (Core, Magazine, Barrel), not an abstract weapon list.
2. **Stubborn, not helpless.** The player aims, reloads and moves; skill matters more than in auto-fire survivors.
3. **Svaneti, its folklore and its towers.** Enemies, places and items come from Georgian mythology and Svan culture.
4. **Short runs, long progress.** Each run pays silver for permanent upgrades at the market.

**How it differs from Vampire Survivors**

- One gun per run, made of slotted parts, instead of a growing list of auto-weapons.
- Manual aim plus ammo and reload, so the magazine is a real design lever (grenade mags, last-round bonus).
- Slot order on the barrel matters, so the same mods can make different guns.
- Levels end in a boss and a tower retaken, not an endless timer; later levels switch to tower defence.

## Story and setting

A crack splits the mountains above Svaneti. Creatures from Georgian myth pour out behind a Demon Lord and seize the Svan towers. One Svan, the most stubborn man in the valley, refuses to give up. He builds guns from whatever he finds and takes the towers back one by one.

- **Hero:** an unnamed Svan hunter and master gunsmith. He talks little, is stubborn and can fix anything. His name is still to be chosen.
- **Villain:** the Demon Lord, who leads the horde out of the crack. He is the final boss and does not appear in Phase 1.
- **Goal:** retake every tower (koshki). One retaken tower = one level cleared.
- **Tone:** grim mountain folklore with dry humour, like a tall tale told in a village about the one man too stubborn to run.

**Opening (Level 1, "Return from the Hunt")**

1. The Svan comes down from a hunt and hears the village bell ringing.
2. The village is overrun and its tower is taken. He picks his first gun at the workbench in his house.
3. He survives the horde around the village (free roam).
4. After about 5–6 minutes the area boss comes out of the tower. Killing it retakes the tower.
5. The tower becomes his base, and the market there unlocks permanent upgrades.

**Setting notes for later art and writing:** stone defence towers, snowy ridges, larch forest, river gorges, the village square and church. Creature names come from Georgian folklore (see Enemies); check each one against folklore sources before final writing.

## Core gameplay loop

```
META LOOP (once per run)
  Market: spend silver on permanent buffs
    -> Gun select: pick 1 of 3 cores
      -> RUN LOOP (15+ times per run)
           fight the horde -> collect scrap -> level up -> pick 1 of 3 cards -> fight a stronger horde
      -> Boss at 5:30 -> victory or defeat
    -> Results: score, silver earned
  -> back to the Market
```

The inner loop (fight, then level up) repeats 15 or more times per run. The outer loop (results, market, next run) repeats once per run and is what keeps players coming back.

## Level types

There are two level types, and they share the same gun, upgrades and enemies. Phase 1 builds only Free Roam. Tower Defence is added once Free Roam plays well.

|  | Free Roam (Phase 1) | Tower Defence (later phase) |
| --- | --- | --- |
| Fantasy | Fight your way back to a captured tower | Hold a retaken tower against a counter-attack |
| Map | Open area around a village, bounded by cliffs and rivers, with a few obstacles | Fixed map with lanes leading to the tower |
| Goal | Survive until the area boss appears, then kill it | The tower survives every wave |
| Lose condition | Player HP reaches 0 | Player dies, or tower HP reaches 0 |
| Enemy spawns | Ring around the player, off screen, rising over time | Set spawn points, wave by wave |
| Player role | Moves, aims and shoots | Same, plus building turrets and barricades from scrap |
| Length | About 6–9 min (boss at 5:30) | 8–12 waves |

**Free Roam rules**

- The map is finite (start size: about 4×4 screens). The camera follows the player.
- Enemies spawn just off screen and walk straight at the player. Swarm events can surround the player in a ring.
- Obstacles (rocks, houses, fences) block movement and bullets. Enemies use simple steering around them, not full pathfinding.
- The tower sits in the middle of the map. The boss comes out of it at 5:30.

**Tower Defence (outline only, not in Phase 1)**

- Between waves the player spends scrap on makeshift defences: a rifle turret, a spike barricade, a bell that stuns nearby enemies.
- The gun build carries over from the free roam level before it, so a campaign might alternate the two types: retake (Free Roam), then hold (Tower Defence).
- It is designed in detail after Phase 1.

## Player character

The Svan has a small set of base stats. Market buffs raise them permanently, and level-up choices raise them for one run only. All numbers below are first values for tuning.

| Stat | Base value | What it does | Raised by market? |
| --- | --- | --- | --- |
| Max HP | 100 | Damage he can take before dying | Yes |
| Defence (armour) | 0 | Flat damage taken off each hit (at least 1 damage always gets through) | Yes |
| Move speed | 5 units/s | Walking speed | Yes |
| Fire rate | ×1.0 | Multiplies the gun's shots per second | Yes |
| Bullet speed | ×1.0 | Multiplies projectile speed and range | Yes |
| Damage | ×1.0 | Multiplies all gun damage | Yes |
| Reload speed | ×1.0 | Reload time = gun reload time ÷ reload speed (higher is faster) | Yes |
| Pickup radius | 2 units | How far away scrap and items are pulled in | Yes |
| HP regen | 0 HP/s | Slow healing over time | Yes |
| Invulnerability after hit | 0.5 s | Short window after a hit with no further damage | No |

**Controls (PC)**

| Action | Input |
| --- | --- |
| Move | WASD |
| Aim | Mouse |
| Shoot | Hold left mouse button (auto-fire can be turned on in settings) |
| Reload | R, or automatic when the magazine is empty |
| Build sheet (perks picked, stats, gun; pauses the run) | C |
| Pause | Esc |

**Damage formula:** final damage = gun damage × damage multiplier × mod multipliers − enemy defence (at least 1).

- Defence applies to bullet hits, shards, ricochets and lightning chains. Status damage (burn, poison) and explosions (Grenade Mag, powder barrels) ignore defence.
- Armour is therefore a soft counter to many small hits (Scrap SMG, pellets) and weak against the Long Gun and elements.
- A crit deals ×2 damage.

**Dodge roll:** not built in Phase 1. Decide after the first playtest whether the game needs it.

## Gun system

The player picks one of three guns at the start of a run and keeps it to the end. Each gun has three parts. The **Core** sets base stats and how the gun feels. The **Magazine** holds ammo and changes reloading. The **Barrel** has 4 slots that change each bullet. Level-ups fill and upgrade the slots.

### Starting guns (Cores)

|  | Long Gun | Double Barrel | Scrap SMG |
| --- | --- | --- | --- |
| Role | Long-range heavy hitter | Close-range burst | Steady spray |
| Damage per bullet | 60 | 10 × 6 pellets | 8 |
| Shots per second | 0.8 | 2 (both barrels, then reload) | 10 |
| Magazine | 5 | 2 | 30 |
| Reload time | 2.0 s | 1.6 s | 1.8 s |
| Spread | 0° | 30° cone | 8° |
| Range | Long (14 units) | Short (5 units) | Medium (9 units) |
| Bullet speed | 30 units/s | 22 units/s | 26 units/s |
| Built-in trait | Pierces 1 enemy | Strong knockback | Every 10th bullet is a free crit |
| On-hit mods per trigger pull | Every hit | Once per enemy per trigger pull (see the pellet rule below) | Every hit |

The Core itself can be improved during a run with **Core Tier** upgrades (Tier I to V). Each tier adds +10% damage and +5% fire rate to that gun (Tier V = +40% damage, +20% fire rate).

**Pellet rule.** All pellets from one trigger pull are one volley. On-hit mods (elements, Ricochet, Split Shot) trigger at most once per enemy per volley, on the first pellet that hits it. The other pellets deal damage only. This stops the Double Barrel from applying effects 6× as often as the other guns, with no hidden chance rolls.

### Barrel: 4 slots

- All 4 slots are open from the start of a run. Locking slots behind levels forced the barrel order on the player; with every slot open, the order is a plan the player builds and then upgrades.
- Any barrel mod fits any slot, but each mod can sit in only one slot: never two of the same mod. Mods apply in slot order, 1 to 4, and **a bullet created by a mod only carries the mods in later slots**. So order matters:
  - Split Shot (slot 1) then Ricochet (slot 2): the shards bounce.
  - Ricochet (slot 1) then Split Shot (slot 2): the bounced bullet splits again, but its shards do not bounce.
  - Split Shot then Ember Shot: the shards burn too. Ember Shot then Split Shot: only the main bullet burns.
  - Order does not matter between mods that only change stats (Twin Shot, Long Rifling, Piercing Bore, Heavy Slug).
- A new mod goes into the lowest open slot. On the level-up screen the player can swap any two filled barrel slots for free, so order is a choice and not an accident of pick order.
- Taking the same mod again upgrades it (levels 1–3) instead of using a new slot.
- When every slot is full, a new mod can replace an old one. The new mod starts at level 1 in that slot.

Phase 1 has three elements: Fire, Poison and Lightning. Each is a barrel mod. They work independently: an enemy hit by two elements takes both effects, but they do not combine or mix.

| Barrel mod | Effect at level 1 | Upgrade per level |
| --- | --- | --- |
| Ember Shot (Fire) | Each hit adds a burn stack: 3 damage per second for 3 s. Stacks up to 5; each new hit refreshes the timer | +2 max stacks |
| Venom Shot (Poison) | Poisons the enemy once: 8 damage per second for 6 s. Does not stack; another hit only refreshes the timer. When a poisoned enemy dies, the poison spreads once to up to 2 enemies within 3 units (spread poison does not spread again) | +1 spread target |
| Thunder Spark (Lightning) | Each hit chains to 2 more enemies within 4 units for 50% damage | +1 chain |
| Twin Shot | Fires 2 bullets, each deals 65% damage | +1 bullet at level 3 |
| Ricochet | Bullet bounces to 1 nearby enemy | +1 bounce |
| Long Rifling | Bullet speed +50%, range +30% | +20% speed |
| Piercing Bore | Bullet passes through +1 enemy | +1 pierce |
| Heavy Slug | Damage +40%, fire rate −15%, more knockback | +15% damage |
| Split Shot | On hit, splits into 3 shards at 30% damage | +1 shard |

### Magazine: 2 slots

- Both slots are open from the start of a run. The upgrade and replace rules are the same as the barrel's.

| Magazine mod | Effect at level 1 | Upgrade per level |
| --- | --- | --- |
| Extended Mag | Magazine +50% | +25% |
| Quick Hands | Reload time −30% | −10% |
| Grenade Mag | The empty magazine is thrown as a grenade (80 damage in an area) | +40 damage |
| Last Round | The last bullet in the magazine deals ×3 damage | +×1 |
| Shock Reload | Reloading pushes nearby enemies back | Bigger radius |
| Scavenger | Each kill has a 10% chance to put 1 round back in the magazine | +5% |

### Later (not Phase 1)

- More elements (for example frost and water) and element mixes: two elements on the same enemy combine into a stronger effect, such as frost + water freezing it into a glacier. The combination list is designed later.
- Forge recipes: set mod pairs that combine into a stronger mod, like Vampire Survivors evolutions (for example, Heavy Slug + Grenade Mag makes Cannon Mag).
- Unlockable cores beyond the starting three, such as a flintlock pistol pair or a crossbow.

## In-run progression and roguelike elements

Killed enemies drop **scrap** (XP). Each full scrap bar is a level-up: the game pauses at the workbench and the player picks 1 of 3 random cards. Everything gained in a run is lost when it ends, except silver.

**Level-up cards** (3 are drawn from these types; only valid ones appear):

| Card type | Example | Shown when |
| --- | --- | --- |
| New barrel mod | Ricochet | A barrel slot is open, or as a replace option when all are full |
| New magazine mod | Grenade Mag | A magazine slot is open, or as a replace option |
| Mod upgrade | Ricochet level 2 | The mod is owned and below level 3 |
| Core Tier | Long Gun Tier II | Below Tier V |
| Perk (run stat) | +10% move speed, +1 armour, +10% scrap gain… for this run | Always |
| Tinker | Upgrade 2 random owned mods (the same mod can get both) | An owned mod is below level 3; appears as often as one perk |

- Scrap needed to go from level L to L+1: `5 + 10 × (L − 1)`, so 5, 15, 25, 35… (tune in playtest). Totals: level 5 at 80 scrap, level 10 at 405, level 15 at 980, level 18 at 1,445. A run should yield roughly 1,200–1,500 scrap before the boss, which gives level 15–18 by the boss.
- The curve is linear on purpose: the earlier +40% per level curve needed 3,800 scrap for level 18, so late level-ups would barely have happened.
- Rerolls: 1 per run by default; the market can add more.
- Card weights are per type and shared by that type's cards (`cards.json` > typeWeights), so perks stay a real option even while there are 9 barrel mods to offer. Perks: move speed, damage, fire rate, reload speed, bullet speed, pickup radius, max HP, HP regen, armour, scrap gain.
- Card rarity: common, rare, epic. In Phase 1 rarity applies to run stat cards only (for example +10% / +15% / +25%). Mod and Core Tier cards have no rarity; their strength comes from mod levels. Rare and epic odds rise slightly with each level.
- Multiple level-ups from one pickup are shown one after another.

**Drops on the map**

| Drop | Source | Effect |
| --- | --- | --- |
| Scrap (small, medium, large) | Every enemy; bigger enemies drop bigger pieces | XP |
| Silver | About 5% of kills (1 silver), every elite (10 silver), the boss (50 silver) | Meta currency, kept after the run |
| Kubdari (Svan meat pie) | Rare drop, breakable crates | Heals 30 HP |
| Hunting Horn | Rare drop | Pulls in all scrap on the map |
| Gunsmith's Chest | Every elite enemy | A free level-up card choice |
| Barrel of Powder | Placed on the map | Explodes when shot, damaging nearby enemies |

## Enemies and bosses

Phase 1 needs 5 regular enemy types, an elite version of each and one area boss. Each one is a coloured block with a distinct shape and size so it reads clearly without art. The names come from Georgian folklore; check the lore before final writing.

| Enemy | Folklore source | Behaviour | HP | Defence | Speed | Contact damage | First appears |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kaji Imp | Kaji, malicious spirits | Swarmer: walks straight at the player in groups | 10 | 0 | 3.5 | 5 | 0:00 |
| Ali | Ali, female demons that hunt travellers | Flanker: circles, then dashes in | 18 | 0 | 4.5 (dash 9) | 8 | 1:00 |
| Ochopintre | Forest spirit, half goat | Charger: winds up and charges in a straight line | 40 | 0 | 3 (charge 10) | 12 | 2:00 |
| Rokapi | Hag-like evil creature | Caster: keeps its distance and throws a slowing curse | 25 | 0 | 2.5 | 6 (projectile) | 3:30 |
| Devi Brute | Devi, giant multi-headed ogres | Tank: slow, tough, has armour | 120 | 3 | 2 | 20 | 3:30 |

**Elites:** larger, with a coloured outline, 5× HP, +1 defence and one extra trait (faster, or a death burst). Each elite drops a Gunsmith's Chest. Scheduled at 2:00 and 4:00.

**Enemy scaling:** HP +12% per minute survived, applied when the enemy spawns. Damage and speed do not scale. The boss does not scale. Spawn numbers follow the difficulty timeline.

### Area boss: Devi Chieftain (Level 1)

A three-headed Devi who holds the village tower. It comes out of the tower at 5:30. Each head is a phase.

| Phase | Boss HP left | Pattern |
| --- | --- | --- |
| 1 | 100–67% | Slams the ground: shockwave rings expand outwards. Walks slowly towards the player. |
| 2 | 67–34% | Adds a boulder throw that leaves rubble obstacles, and calls Kaji Imp swarms |
| 3 | 34–0% | Enraged: faster, with shorter gaps between attacks; slams twice in a row |

- Boss HP: 4,000, defence 2 (tune so a typical build kills it in 60–90 s; a level-15 build will probably need this raised, so check it in the first balance pass).
- While the boss is alive, regular spawns drop to 50%.
- If the boss is still alive after 3 minutes, it enrages fully (+50% damage) so the run cannot drag on.
- Killing the boss retakes the tower and wins the level.

**Final boss:** the Demon Lord, at the crack. Designed later; not in Phase 1.

## Difficulty progression and endgame

A Level 1 run grows from a trickle of imps to a crowded screen over 5 minutes, then ends in a boss fight. Spawns are driven by a data table (time, enemy type, spawn rate, max alive) so designers can tune it without code changes.

| Time | Phase | New threats | Max enemies alive | Event |
| --- | --- | --- | --- | --- |
| 0:00–1:00 | Arrival | Kaji Imps | 20 | Tutorial prompts: move, aim, reload |
| 1:00–2:00 | Pressure | + Ali | 40 |  |
| 2:00–3:30 | Push | + Ochopintre | 60 | First elite at 2:00 |
| 3:30–5:00 | Siege | + Rokapi, Devi Brute | 90 | Swarm ring at 3:30, second elite at 4:00 |
| 5:00–5:30 | Calm | None (spawning stops; enemies already alive stay) | — | The tower bell rings: boss warning |
| 5:30 to boss death | Boss | Devi Chieftain | 45 (50% spawns) | Full enrage after 3 min |

"Max enemies alive" limits new spawns only; it never removes enemies. Timeline events (elites, the swarm ring, boss summons) ignore the limit.

**How a run ends**

- **Victory:** the boss dies. The tower is retaken, a short "Tower retaken" moment plays, then the results screen. Victory gives a silver bonus.
- **Defeat:** player HP reaches 0. The results screen shows how far he got. He keeps the silver collected.
- Phase 1 has no infinite mode. The run always ends at the boss kill or at death.

**Difficulty after Phase 1 (planned):** later towers start at higher enemy tiers. A "Storm" difficulty setting (higher HP scaling and spawn rate for more silver) adds replay value until infinite mode arrives.

## Meta progression: market and high score

The player brings silver home from every run, won or lost, and spends it at the village market on permanent buffs. Each buff has levels, and each level costs more: cost = base cost × 1.5^(current level).

| Buff | Per level | Max level | Base cost (silver) |
| --- | --- | --- | --- |
| Max HP | +10 HP | 10 | 50 |
| Defence | +1 armour | 5 | 120 |
| Walk speed | +3% | 5 | 80 |
| Shooting speed | +4% fire rate | 5 | 100 |
| Bullet speed | +5% | 5 | 60 |
| Damage | +5% | 5 | 120 |
| Reload speed | +5% | 5 | 80 |
| Pickup radius | +10% | 5 | 40 |
| HP regen | +0.2 HP/s | 3 | 150 |
| Scrap gain | +5% XP | 5 | 100 |
| Reroll | +1 level-up reroll per run | 3 | 200 |
| Second wind | Revive once per run at 50% HP | 1 | 1,000 |

**Silver income** (tune so an average run buys 1–2 cheap buffs)

- Silver picked up during the run, plus 1 silver per 20 kills.
- Victory bonus: +100 silver. Boss drop: +50 silver.
- A refund button gives back all spent silver, so players can try other builds.

**High score**

- Score = kills + 25 per elite + 500 for the boss + 2 per second survived + 1,000 for victory.
- A local top-10 table is saved with the score, gun used, time, result (win or loss) and date.
- The results screen shows the score, a "New best!" badge, kills, time, level reached, the final gun build and silver earned.

**Saved between sessions:** silver balance, buff levels, high-score table, settings. Saved locally (a save file); there are no online features in Phase 1.

## UI and menus

Phase 1 UI is plain and functional: text, boxes and bars, with no art. It needs the screens below.

| Screen | Contents | Leads to |
| --- | --- | --- |
| Main menu | Start, Market, High Scores, Settings; silver balance shown (no Quit: it is a browser game) | Any of these |
| Gun select | 3 guns with stats and trait, Start button | Run |
| HUD (in run) | HP bar, ammo count + reload ring at the cursor, scrap bar + level, timer, kill count, silver, owned mods (slot icons) | Level-up, Pause |
| Level-up | Game paused; 3 cards with type, rarity and effect; Reroll button; the gun's Core/Magazine/Barrel slots shown, with click-two-slots-to-swap on the barrel | Back to the run |
| Boss bar | Boss name and HP bar across the top, with phase markers |  |
| Pause | Resume, Settings, Quit run (counts as a loss, keeps silver) | Run, Main menu |
| Results | Victory or defeat, score, "New best!", stats, final gun build, silver earned | Market, Main menu, Retry |
| Market | Buff list with level, next effect, cost; Buy; Refund all | Main menu |
| High scores | Top 10 table | Main menu |
| Settings | Volume, auto-fire on/off, screen shake on/off, fullscreen on/off | Back |

## Phase 1: playable demo scope

Phase 1 is one free roam level, start to finish, with placeholder visuals. It is done when a player can start a run, build a gun, beat or lose to the boss, spend silver and try again for a higher score.

**In scope**

- 1 free roam map (Level 1, "Return from the Hunt"), placeholder blocks and simple obstacles
- Player movement, mouse aim, shooting, ammo and reload
- 3 starting guns (Long Gun, Double Barrel, Scrap SMG)
- Barrel (4 slots) and Magazine (2 slots) with the mods listed above, plus Core Tiers
- Scrap, level-up cards, rerolls, drops
- 5 enemy types, elites, the Devi Chieftain boss
- Data-driven difficulty timeline
- Market with permanent buffs, silver, save and load
- Score and local top-10 high scores
- Main menu, gun select, HUD, level-up, pause, results, market, settings

**Out of scope for Phase 1**

- Tower defence levels
- Art, animation, music (placeholder sound effects are fine)
- Story cutscenes (a text card at the start is fine)
- Infinite mode, Storm difficulty
- Forge recipes, extra cores, element mixes and extra elements
- Gamepad, online leaderboards

**Acceptance criteria**

- [ ] A full run from main menu to results works with no blocking bugs
- [ ] All 3 guns can be picked and each one feels different in a playtest
- [ ] Barrel mods apply in slot order, and changing the order visibly changes the result
- [ ] Level-up never offers an invalid card
- [ ] The boss appears at 5:30 and a victory retakes the tower
- [ ] Silver and buff levels persist after closing and reopening the game
- [ ] Market buffs change the player's stats in the next run
- [ ] The high-score table saves and sorts correctly
- [ ] A 90-enemy screen runs at a steady 60 FPS on a mid-range PC
- [ ] Spawn timeline, enemy stats, mods and buffs are all edited in data files, not code

## Roadmap, open questions and next steps

```
Phase 1: Free Roam demo (this document's scope)
   | Gate 1: playtests show the free roam loop is fun on its own
Phase 2: Tower Defence levels, real art and audio
   | Gate 2: both level types play well together
Phase 3: full campaign (more towers, forge recipes, more elements and cores, the Demon Lord)
```

Tower defence work starts only after playtests show the free roam loop is fun on its own.

**Open questions**

- Engine: decided. Phaser + TypeScript in the browser (see the Technical Design Document).
- Dodge roll: out of Phase 1; decide after the first playtest.
- Can the player find a second gun during a run, or is it always one gun per run (current plan)?
- The hero's name, and how much story text goes into Phase 1.
- Elements deal flat damage, so they favour fast guns (the SMG reaches 5 burn stacks in half a second; the Long Gun tops out near 3). If playtests show this, switch burn and poison to a share of the hit's damage.
- Target platforms after PC: Steam Deck, mobile (which would need auto-aim)?

**Handoff to the technical design document:** it should cover these systems, in this build order.

1. Player controller (movement, aim, shooting, reload) and camera
2. Projectile system with an ordered mod pipeline (barrel slots 1 to 4)
3. Enemy base class, steering, pooling for 90+ enemies
4. Spawn director driven by the difficulty timeline data
5. Scrap, levelling and card draw with validity rules
6. Boss state machine (3 phases)
7. Meta save: silver, buffs, high scores, settings
8. UI screens and flow
9. Data files for guns, mods, enemies, buffs, timeline
