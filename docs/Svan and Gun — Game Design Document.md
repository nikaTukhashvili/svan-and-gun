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

1. **The gun is the build.** Every upgrade goes into a physical gun part (the Core and the Barrel), not an abstract weapon list.
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

The Svan has a small set of base stats. Market buffs raise them permanently, and items (see Gear) raise them for one run only. All numbers below are first values for tuning.

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
| Invulnerability after a choice | 2.5 s | After a level-up or chest screen closes (the player blinks), to see where everything is before taking damage again (2026-11-23) | No |

**Controls (PC)**

| Action | Input |
| --- | --- |
| Move | WASD |
| Aim | Mouse |
| Shoot | Hold left mouse button (auto-fire can be turned on in settings) |
| Reload | R, or automatic when the magazine is empty |
| Build sheet (perks picked, stats, gun; pauses the run) | C |
| Pause | Esc |

**Controls (mobile, decided 2026-11-23): twin-stick**

Phones and tablets are played in landscape with two virtual sticks. Each stick appears where the thumb lands, so there is no fixed spot to find.

| Action | Input |
| --- | --- |
| Move | Left thumb anywhere on the left half of the screen; pushing further walks faster |
| Aim | Right thumb anywhere on the right half; with no right thumb, the gun faces the way the player walks |
| Shoot | Push the aim stick past about a third of its range (auto-fire in settings shoots without it) |
| Reload | RELOAD button on the right edge, or automatic when empty |
| Build sheet | BUILD button on the right edge; Close button on the sheet |
| Pause | II button; the run also pauses when the phone is turned upright |

- **Choosing the controls:** Settings > Controls is **Auto** (default), Touch, or Keyboard & mouse. Auto starts in touch mode when the main pointer is a finger, then follows the last device used: a touch switches to the sticks, a key or a mouse switches back, mid-run included (a tablet with a keyboard works either way).
- The tutorial prompts have touch versions. The page blocks pinch zoom and scrolling, goes fullscreen on the first touch where the browser allows it (not on iPhone), and asks to turn the phone sideways when held upright.
- Stick size, dead zone and fire threshold are data (`config.json > touch`).

**Damage formula:** final damage = gun damage × damage multiplier × mod multipliers − enemy defence (at least 1).

- Defence applies to bullet hits, shards, ricochets and lightning chains. Status damage (burn, poison) and explosions (Grenade Mag, powder barrels) ignore defence.
- Armour is therefore a soft counter to many small hits (Scrap SMG, pellets) and weak against the Long Gun and elements.
- A crit deals ×2 damage.

**Dodge roll:** not built in Phase 1. Decide after the first playtest whether the game needs it.

## Gun system

The player picks one of three guns at the start of a run and keeps it to the end. Each gun has two parts. The **Core** sets base stats and how the gun feels. The **Barrel** holds coloured modules that change each bullet; modules placed next to a match **fuse** into a stronger one. The **Muzzle** at the end shapes the shot with trade-offs. Level-ups bring new modules, support perks and Core Tiers.

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

### Barrel: fusion (decided 2026-11-20, replaces slot order, operators, levels and the magazine)

The barrel is a row of slots. Each slot holds one **module**. Where a module sits does not change what it does to a bullet; what matters is **what it sits next to**: fittings change their neighbours, and two maxed elements side by side can be mutated into a hybrid.

**Barrel length and twist depend on the gun** (`guns.json` > barrel). No gun has more than 12 slots. Slots open with level (`config.slots.barrelUnlockLevels`: 4 at the start, then one more at levels 4, 7, 10 and 13), so space stays scarce and growth stays visible. The list is an unlock *order* (revised 2026-11-21 after code review): a crit chamber opens first so the gun's twist works from level 1, and the two halves of a Double Barrel take turns, so neither half is ever fully locked.

| Gun | Barrel | Twist |
| --- | --- | --- |
| Long Gun | 8 | None in the barrel: its strength is 3 muzzle slots (see Muzzle). The old "last slot ×2" twist is gone |
| Double Barrel | 8, as two halves of 4 | **Two barrels:** trigger pulls alternate between the halves; nothing fuses or boosts across the gap |
| Scrap SMG | 6 + crit chamber | **Crit chamber:** the last slot works only on crit bullets (every 10th), ×3 |

**Module families**

| Family | Modules | Grows by |
| --- | --- | --- |
| Element (colour) | Ember Shot (fire, red), Venom Shot (poison, green), Thunder Spark (lightning, yellow), Frost Shot (frost, blue; added 2026-11-21) | Dropping the same element on it, up to tier III. Two different elements at III can be mutated into their hybrid |
| Hybrid (mixed colour) | Plasma = fire + lightning (orange), Brimstone = fire + poison (amber), Blight Arc = poison + lightning (teal), Steam = fire + frost (pale), Frostbite = poison + frost (violet), Hailstorm = lightning + frost (ice blue) | Never: made at tier III by a Mutation, then final. Never offered as a card |
| Grey | Twin Shot, Ricochet, Long Rifling, Piercing Bore, Heavy Slug, Split Shot | Dropping the same module on it (no cap) |
| Fitting (directional) | Booster ▶, ◀ Booster, ◀ Brace ▶, Overcharger, Siphon | Never |

**Upgrades and Mutation** (revised 2026-11-21 after playtest: automatic merging took control away, and hybrids came too early and too strong)

- **Nothing merges by itself.** Two modules side by side stay two modules, even two Ember Shots, even Ember next to Thunder.
- **Upgrade:** a module card dropped **onto** the same module raises it one tier (Ember I → Ember II). A new card is tier 1.
- **Elements stop at tier III** (`config.slots.maxElementTier`; lowered from V on 2026-11-21 because mutations came too late). Grey modules have no cap. Fittings never upgrade.
- **Mutation:** a **Favor of the Gods** card. Dragged onto two **different elements side by side, both at tier III**, they become their **hybrid** in one slot and the other slot empties. Over the right half of a slot it pairs with the right neighbour, over the left half with the left one. It is only offered when such a pair exists.
- **Hybrids are final:** made at tier III, they never upgrade or mutate again (one mutation for now; more may come later).
- Numbers grow with tier by a formula per module: value = base + perTier × (tier − 1) (`barrelMods.json` > base, perTier). Counts (chains, bounces, shards, bullets, stacks) are rounded.

**Placing and moving** (drag and drop)

- The player **drags** a module card onto a barrel slot (clicking the card, then a slot or its number key, also works).
- On the same module (below its max) it **upgrades** it, with a flash. An empty slot takes it. On a different module (or a maxed one) it is **inserted**: the modules on one side slide one slot towards the nearest empty slot in the same half (right first, never into a locked slot).
- When a barrel half is full, a drop on a different module **replaces** it (asks for a second click).
- Dragging a module inside the barrel only moves it (or swaps it with the module there).
- While dragging, the slot under the pointer shows exactly what will happen.

**Fittings** multiply the strength of their neighbours in the same half of the barrel. A fitting next to an empty slot or another fitting does nothing.

| Fitting | Left neighbour | Right neighbour |
| --- | --- | --- |
| Booster ▶ | — | +40% |
| ◀ Booster | +40% | — |
| ◀ Brace ▶ | +20% | +20% |
| Overcharger | +100% | −50% |
| Siphon | −40% | +80% |

**Modules at tier 1** (numbers from `barrelMods.json`; on-hit effects follow the pellet rule; hybrids are made at tier III, so their "each extra tier" column is how they get there)

| Module | Tier 1 | Each extra tier |
| --- | --- | --- |
| Ember Shot (fire) | Each hit adds a burn stack: 3 damage per second for 3 s, up to 5 stacks | +2 max stacks |
| Venom Shot (poison) | Poisons for 8 damage per second for 6 s (does not stack); on death it spreads once to 2 enemies within 3 units | +1 spread target |
| Thunder Spark (lightning) | Each hit chains to 2 more enemies within 4 units for 50% damage | +1 chain |
| Frost Shot (frost) | Each hit adds a chill stack: −10% speed per stack for 2 s, up to 5. At 5 stacks the enemy **freezes** for 1 s (no movement, no attacks, harmless to touch) and takes +30% hit damage while frozen (shatter). After a freeze it cannot freeze again for 3 s (`config.combat.freezeImmunitySec`); chill never slows by more than 70% (`maxChillSlow`). The boss is slowed but never frozen | +2% slow, +0.2 s freeze, +10% shatter |
| Plasma (fire + lightning) | Chains to 2 enemies for 60% damage; every enemy it reaches burns (4 per second, 3 s) | +1 chain, +1.5 burn |
| Brimstone (fire + poison) | Hits burn (4/s) and poison (9/s); an enemy that dies burning and poisoned bursts for 20 damage in 2.5 units | +1.5 burn, +3 poison, +8 burst |
| Blight Arc (poison + lightning) | Chains to 2 enemies for 60% damage and poisons every enemy it reaches (9/s, 6 s) | +1 chain, +3 poison |
| Steam (fire + frost) | Burns (4/s) and chills (freezes at 4 stacks); an enemy that freezes bursts in steam for 25 damage in 2.5 units | +1.5 burn, +10 burst |
| Frostbite (poison + frost) | Poisons (9/s, 6 s) and chills; poison deals ×2 damage to chilled or frozen enemies | +3 poison, +0.25 multiplier |
| Hailstorm (lightning + frost) | Chains to 2 enemies for 60% damage and chills every enemy it reaches (freezes at 4 stacks) | +1 chain, +2% slow |
| Twin Shot | Fires 2 bullets at 65% damage each | +1 bullet every 2 tiers |
| Ricochet | Bullet bounces to 1 nearby enemy | +1 bounce |
| Long Rifling | Bullet speed +50%, range +30% | +20% speed |
| Piercing Bore | Passes through +1 enemy | +1 pierce |
| Heavy Slug | Damage +40%, fire rate −15%, more knockback | +15% damage |
| Split Shot | On hit, splits into 3 shards at 30% damage | +1 shard |

- **No slot order.** Every module applies to every bullet of its barrel half. Loop guard: shards from Split Shot carry element and hybrid effects but never split or bounce again (the bullet caps still apply).

### Muzzle (decided 2026-11-21)

Every gun ends in a few **muzzle slots**. A muzzle piece shapes the shot (bullet count, spread, range, speed) and always has an **upside and a downside**. All muzzle pieces on a gun **stack** on every shot. Dragging a muzzle card onto a piece of the **same type** upgrades it one level instead of taking another slot (Flared Muzzle → Flared Muzzle II); there is no fusing between muzzles.

| Gun | Muzzle slots |
| --- | --- |
| Long Gun | 3 |
| Double Barrel | 2. Makes up for it with a built-in **Grenade Mag** (level 1 from the start, see Support perks) |
| Scrap SMG | 3 |

First muzzle pieces (numbers to tune):

| Muzzle | Upside | Downside |
| --- | --- | --- |
| Flared Muzzle | +1 bullet | +8° spread, −15% range |
| Scatter Mouth | +2 bullets | −30% damage per bullet, −25% range |
| Choke | −50% spread, +20% range | −10% fire rate |
| Compensator | +20% fire rate | +6° spread |
| Heavy Crown | +25% damage | −20% bullet speed |
| Rifled Crown | +30% bullet speed, +15% range | −10% damage |
| Wild Muzzle | +15% crit chance | +15° spread |

- **Stacking:** across pieces, bullet counts and spread degrees add and percentages add up (two −15% range = −30%). Every stat has a floor so stacking downsides never breaks the gun (range at least 30% of base, fire rate at least 50%, damage at least 25%).
- Extra bullets fan out evenly across the spread; on the Long Gun (0° spread) an added bullet uses a small minimum fan, so Flared on the Long Gun gives a narrow volley.
- Extra bullets from muzzles count as one volley with the shot, so the pellet rule applies (on-hit effects once per enemy per volley).
- **Levels, no cap:** a muzzle card dropped on the same piece raises its level. Upside and downside both grow by formula, base + perLevel × (level − 1), with the downside growing slower than the upside, so upgrading is worth it but never free. Dropped on a different piece it replaces it (with a confirm); dropped on an empty slot it is fitted at level 1. The same type can still sit in two slots if the player chooses.
- No fusing: muzzle pieces never merge with each other or with barrel modules.
- **Source:** level-up cards (a new card type, Muzzle), since they are part of the gun. Placed by dragging onto a muzzle slot on the level-up screen, which shows the muzzle slots after the barrel. A full muzzle row replaces a piece (with a confirm).
- All muzzle slots are open from the start.
- Data: `muzzles.json` (pieces, upside and downside numbers, floors); slot counts in `guns.json`.

### Support perks (were the magazine)

The magazine and its slots are gone. Its mods became **support perks**: simple upgrades that need no slot, and taking one again raises its level (max 3). The Double Barrel starts with Grenade Mag at level 1.

| Support perk | Level 1 | Each level |
| --- | --- | --- |
| Extended Mag | Magazine +50% | +25% |
| Quick Hands | Reload time −30% | −10% |
| Grenade Mag | The empty magazine is thrown as a grenade (80 damage in an area) | +40 damage |
| Last Round | The last bullet in the magazine deals ×3 damage | +×1 |
| Shock Reload | Reloading pushes nearby enemies back | Bigger radius |
| Scavenger | Each kill has a 10% chance to put 1 round back in the magazine | +5% |

### Later (not Phase 1)

- Unlockable cores beyond the starting three, such as a flintlock pistol pair or a crossbow.

## Gear: items (decided 2026-11-21, replaces run stat perk cards)

Plain stat cards ("+10% speed, +8% fire rate") tell the player nothing about what they are building. Run stats now come from **named items** that the Svan finds and wears: *I found Boots of Speed and a Lightning Chokha* reads as a build. Level-up cards stay for the **gun** (barrel modules, support perks, Core Tier); chests and elites give **gear**. The two never share a hand.

Items last for one run, like everything except silver.

**Slots (6):** Boots, Chokha, Svan Hat, Ring, Ring, Cloak.

**Every item has a main theme, and the theme names it.** Rarity adds smaller extra stats. The themes each slot can roll lean the slot towards a role:

| Slot | Leans towards | Example themes |
| --- | --- | --- |
| Boots | Movement | Boots of Speed, Boots of Pursuit (pickup radius) |
| Chokha | Toughness, elements | Iron Chokha (armour), Lightning Chokha, Ember Chokha, Venom Chokha, Frost Chokha |
| Svan Hat | Growth, utility | Hunter's Hat (scrap gain), Hat of Focus (reload speed) |
| Ring (×2) | Offence | Ring of Fury (damage), Quick Ring (fire rate), Far Ring (bullet speed) |
| Cloak | Survival | Cloak of the Hearth (HP regen), Wolf Cloak (max HP) |

- **Element themes** (Ember, Venom, Lightning, Frost) strengthen that element's barrel modules and their hybrids, like a fitting does (+20% = their numbers ×1.2; Plasma gets both the fire and the lightning bonus). Gear then nudges which modules the player goes for.
- Extra stats are drawn from the general stat list (move speed, damage, fire rate, reload speed, bullet speed, pickup radius, max HP, HP regen, armour, scrap gain), never the same stat as the main theme.
- All themes, stats and numbers live in data (`items.json`), so they can be tuned in the Training Ground.

**Item level, no cap.** Like barrel modules, an item's numbers are base + perLevel × (level − 1). Rarity follows from the level, so an item found early can grow into a good one:

| Level | Rarity | Stats |
| --- | --- | --- |
| 1–2 | Common | Main theme only |
| 3–4 | Magic | + 1 extra stat (rolled when it reaches level 3) |
| 5+ | Rare | + 2 extra stats (the second rolled at level 5) |

There is no level cap: a run is about 6 minutes, so few items should go past level 8. A found Magic item starts at level 3 and a found Rare at level 5, so finding one and upgrading one are the same thing.

**Legendaries** are named items with a fixed main stat and a **passive** that changes how the player plays. They are only found (never made by upgrading), start at level 1 with their passive and no extra stats, and levelling one also makes the passive stronger. Built (2026-11-22):

| Legendary | Slot | Passive |
| --- | --- | --- |
| Hat of the Tower Keeper | Svan Hat | After standing still for 1 s: +30% damage until you move |
| Wolf-pelt Cloak | Cloak | A kill gives a short burst of move speed |
| Ring of the Ember Smith | Ring | Ember Shot and Fire hybrids count as one tier higher |
| Chokha of the Feast | Chokha | Scrap pickups heal 1 HP |
| Boots of the Mountain Runner | Boots | Moving builds a charge; the next shot after a full charge pierces everything |

**Where items come from**

| Source | When | What it gives |
| --- | --- | --- |
| Elite | Every elite (2:00, 4:00) | A chest, at least Magic; 25% chance of a Legendary choice |
| Supply chest on the map | Every 45 s from 0:45 until the boss, 6–12 units from the player | A chest; 4% chance of a Legendary choice |
| Boss | On death | Not built: the run ends when the boss dies, so a chest there could not be used. Legendaries come from elites and supply chests instead (2026-11-22) |

Aim for 8–10 chests in a full run: enough to fill the 6 slots and still upgrade a few.

**Opening a chest** pauses the game and offers **3 choices**:

- While a slot is empty, at least one choice is a new item for an empty slot.
- Each choice is either a **new item** (with a compare view against the one in that slot) or an **upgrade**: one of the player's items +1 level.
- Once every slot is full, chests keep their purpose through upgrades, so a late chest always improves something the player already owns.
- An item that is replaced is salvaged into scrap: 5 + 5 per level above 1.
- A chest has its own screen (not the level-up path flow). Level-ups queued at the same time are shown first.
- A second ring goes into the empty ring slot; with both full, a new ring replaces the weaker one.

**Build sheet (C)** shows a paper doll with the 6 equipment slots (name, level, rarity colour), each item's stats and passive, the stats, Tinker picks, magazine work, and the gun drawn as core → barrel → muzzle. The HUD shows legendary passives at work (Tower Keeper bonus, Wolf Pelt burst, Mountain Runner charge).

## In-run progression and roguelike elements

Killed enemies drop **scrap** (XP). Each full scrap bar is a level-up: the game pauses at the workbench, the player first picks a **path**, then 1 of 3 cards drawn only from that path (decided 2026-11-21, so the player steers the build instead of reacting to random cards).

| Path | Offers |
| --- | --- |
| **Favor of the Gods** | Elements (Ember Shot, Venom Shot, Thunder Spark, Frost Shot) and **Mutation** (two maxed elements → their hybrid, offered only when possible). The blessings (run stat cards) were removed on 2026-11-22: run stats come from items |
| **Gunsmith** | Grey barrel modules, fittings, muzzle pieces, magazine work (the support perks), Core Tier, Tinker |

- Choosing a path is a commitment for that level-up: there is no going back to look at the other path. The reroll redraws the 3 cards within the chosen path.
- Chests do not use this flow: they open the gear screen (see Gear).
- Paths and which card types they hold live in `cards.json > paths`. Everything gained in a run is lost when it ends, except silver.

**Level-up cards** (3 are drawn from the chosen path's types; only valid ones appear):

| Card type | Example | Shown when |
| --- | --- | --- |
| New module (element, grey or fitting) | Ember Shot | Always (no cap; a module that would fuse with one in the barrel is 3× as likely and marked CAN FUSE) |
| Support perk | Quick Hands level 2 | Below its max level |
| Muzzle piece | Flared Muzzle | Always (onto the same piece it upgrades it; a full muzzle row otherwise means replacing one) |
| Core Tier | Long Gun Tier II | Below Tier V |
| Tinker | 2 random +1 tiers for modules in the barrel (the same one can get both) | The barrel has a module (not a fitting) |

- Scrap needed to go from level L to L+1: `5 + 10 × (L − 1)`, so 5, 15, 25, 35… (tune in playtest). Totals: level 5 at 80 scrap, level 10 at 405, level 15 at 980, level 18 at 1,445. A run should yield roughly 1,200–1,500 scrap before the boss, which gives level 15–18 by the boss.
- The curve is linear on purpose: the earlier +40% per level curve needed 3,800 scrap for level 18, so late level-ups would barely have happened.
- Rerolls: 1 per run by default; the market can add more.
- Card weights are per type and shared by that type's cards (`cards.json` > typeWeights), so support perks stay a real option however many modules there are. Run stats (move speed, damage, fire rate…) are no longer cards: they come from items (see Gear).
- Level-up cards have no rarity: module strength comes from fusing, support perks from their level. Rarity belongs to items.
- Multiple level-ups from one pickup are shown one after another.

**Drops on the map**

| Drop | Source | Effect |
| --- | --- | --- |
| Scrap (small, medium, large) | Every enemy; bigger enemies drop bigger pieces | XP |
| Silver | About 5% of kills (1 silver), every elite (10 silver), the boss (50 silver) | Meta currency, kept after the run |
| Kubdari (Svan meat pie) | Rare drop, breakable crates | Heals 30 HP |
| Hunting Horn | Rare drop | Pulls in all scrap on the map |
| Chest | Every elite, supply chests on the map (about every 45 s), the boss | 3 gear choices: a new item or an item upgrade (see Gear) |
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

**Elites:** larger, with a coloured outline, 5× HP, +1 defence and one extra trait (faster, or a death burst). Each elite drops a gear chest (at least Magic). Scheduled at 2:00 and 4:00.

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
| Level-up | Game paused; 3 cards with type, rarity and effect; Reroll button; the gun's barrel shown in colour; a module card is placed by choosing a slot, with a preview of what will fuse; click two slots to swap | Back to the run |
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
- Barrel fusion (elements, hybrids, grey modules, fittings), support perks and Core Tiers
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
- [ ] Fusing modules (same or mixed colours) and placing fittings visibly changes the result
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
- Target platforms after PC: Steam Deck? Mobile browsers are supported with twin-stick controls (2026-11-23); a native mobile release is still open.

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
