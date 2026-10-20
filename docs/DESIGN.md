# Unbound Underworld — Design Guide

This is the readable overview of how the game works and how its parts fit together. Every number (boons, weapons, levels, enemy stats and so on) lives in **[GAME_DATA.md](GAME_DATA.md)**. That file is generated from the code with `npm run docs`, so it is always accurate. This guide explains the *why* and the *how*, plus anything that lives in code rather than data tables (boss attack patterns, enemy behaviour).

## Contents

1. [The game in one page](#1-the-game-in-one-page)
2. [A run](#2-a-run)
3. [Long-term progression](#3-long-term-progression)
4. [Combat](#4-combat)
5. [Build systems inside a run](#5-build-systems-inside-a-run)
6. [Heroes and Wrath](#6-heroes-and-wrath)
7. [Enemies](#7-enemies)
8. [Guardians (bosses)](#8-guardians-bosses)
9. [The Hall of Shades (hub)](#9-the-hall-of-shades-hub) · [Multiplayer](#9b-multiplayer)
10. [Platforms, UI and settings](#10-platforms-ui-and-settings)
11. [Where things live in the code](#11-where-things-live-in-the-code)
12. [How to add content](#12-how-to-add-content)
13. [Keeping docs up to date](#13-keeping-docs-up-to-date)

---

## 1. The game in one page

A top-down action roguelike. You are a shade escaping the Underworld one chamber at a time. The core loop is modelled on *Hades*, with systems inspired by *Minecraft Dungeons II* (jump attacks, artifacts, enchantments, chests). All art is made in code (blocks in the 3D view, canvas drawing in the 2D view) and all audio is synthesized, so the game ships without asset files. Names are original or taken from Greek myth.

**Loop:** Hall of Shades (hub) → walk through the gate → fight through 4 regions → slay each region's guardian → escape. When you die you return to the hub and keep **Ash** (a currency) and **experience**, then spend them on permanent growth and try again.

**Design pillars**
- **Readable, fair combat.** Every enemy attack is telegraphed on the ground. The dash has invulnerability frames and a cooldown (`dashRecharge`, 0.9 s a charge) that only boons (Hermes' Windstep), the Altar, hero skills, gear and perks shorten. Hits have hit-stop and screen shake.
- **A build every run.** Gods offer boons, and anvils, enchantments and artifacts stack on top, so no two runs play the same.
- **Gentle onboarding, deep late game.** New players start with three buttons. Everything else unlocks one level at a time, ending in flashy ultimates, Mythic weapons and the Torment difficulty levels.
- **Play together.** Up to four heroes on one screen (gamepads) or online (Wi-Fi, a hotspot or your own server), each keeping their own progress.
- **Artifacts run on Echoes**, left behind by slain foes. The gauge starts every escape empty, so artifact play ramps up as a run goes on.

## 2. A run

### Campaign (`campaign.ts`, `ui/campaign.ts`)
- **Chapters and missions.** Chapter I, *Chains of the Deep*, has six missions: Awakening, The Hounds Below, Cinder Cells, The Chain Gang, The Long Stair and Vexa, Warden of Chains. Chapter II is listed as coming soon. Missions open in order (`missionOpen`).
- **A mission** is an escape run with `run.mission` set: no Torment, the first region, set chambers (`MissionRoom`: a fixed `seed`, a set `shape`, raised ground only when every hero can jump) and set waves (`WaveSpec`; +35% foes per extra party member). Goals: *clear*, *survive* (a countdown; waves repeat until it runs out) and *boss*. A won chamber drops its set reward (a named god's boon, a Pomegranate, a Titan Heart), then one door leads to the next. The goal shows on the HUD.
- **Story scenes** (`story`): lines from Ysolde (the guide), Vexa, a narrator and your hero, before and after each mission; *Skip* jumps to the end.
- **Results:** three stars (finish, par time, health lost ≤ 50%), Ash and experience in full on the first clear (a quarter of the Ash and a third of the XP on replays). Best stars and time are kept in `save.campaign`. Dying offers *Try again*. Missions are never saved part-way and never write or clear the escape save.

| Region | Chambers | Hazard | Guardian |
|---|---|---|---|
| The Shackled Deep | 5 combat chambers, then the antechamber | Spike traps | Vexa |
| The Ember Fields | 5, then the antechamber | Lava | The Many-Maw |
| The Gilded Groves | 5, then the antechamber | Chasms (pits) | Aurex |
| The Last Gate | Antechamber only | — | Threefang (final) |

- **Chambers.** Each combat chamber spawns waves of foes, bought from an encounter budget that grows with depth and region. Clearing the room drops its reward, then the exit doors open.
- **Layouts** (`rooms.ts → generateLayout`). Every combat chamber picks a shape (`pickShape`): an open *hall*, an *ell* (a back corner solid; you enter on the open side), a *tee* (a wide hall up a narrow stem), a *cross*, an *hourglass* (rock juts in from both sides), a *ring* (a rock island), a *nook* (a front corner solid, so the doors sit off to one side), a long *gallery* or a tall *tower*, each with its own size range. Solid rock is a `rock` obstacle, so collision, pathing, line of sight and spawning treat it like any wall. The doors sit along the shape's `doorSpan` and the entrance moves with it; every layout is checked to be connected (`isConnected`), falling back to a hall.
- **Ledges** (`addLedges`, `LEDGE_H` = 32). In harder chambers (`Game.heightsFor`: never in the first region at Torment 0, otherwise 25% + 20% per region + 8% per Torment, up to 85%, and only when every hero can jump) the floor rises: a dais before the doors (so leaving takes a jump), a terrace across the room, and mesas, some with a level-2 tier on top. A jump peaks at 58, so it clears one level but not two. Heroes collide with ledges above their reach (`Player.reach`), land on them coming down, and fall as the back half of a jump when they walk off (`Player.dropTo`). Foes clamber freely (drawn raised via `Actor.lift`), and a chamber reward on a ledge can only be taken from up there. Hazards, traps and the entrance stay clear of ledges.
- **Doors.** Each exit door shows its reward and a one-line description ("No fight · buy with obols") on the floor in front of it, so you choose your path:
  - Boon of a named god, Pomegranate, obols, Titan Heart or Ash.
  - Hephaestus' Anvil or Artifact Cache. These rooms always have enchanted (elite) foes.
  - Enchanting Tome or Hermes.
  - Charon's shop or a Fountain. These have no fight.
- **Once per region:** a shop, a fountain, an anvil and Hermes.
- **Before each guardian** there is an *antechamber* with a shop and a fountain.
- **Treasure chests** sometimes appear in combat rooms. 3% of them are Mimics; a slain Mimic always drops a Unique piece of gear (`rollStarred`).
- **Saving:** the escape autosaves at the start of every chamber (`run.ts → snapshot/restore`, stored apart from the main save), and again the moment the chamber is won, after each reward, purchase or chest, and on quitting (`cleared`, `doors`, `usedHere`, `left` — rewards, drops and choices not yet taken — and the chamber's starting `roomRng`, so the same chamber is rebuilt with its fight skipped, what was left put back and the same doors open). Resuming never replays a won fight, so its drops can't be farmed. The final guardian's fall counts the escape at once (`recordVictory`), before the victory screen. *Save & Quit* and closing the app both resume from the latest of the two. Death, escape or abandoning clears it; party escapes are never saved.
- **Never stuck:** a pending fade callback always runs once the screen is black, a door that can't start its transition re-opens, and an error inside a frame or a transition is reported in a toast instead of stopping the game loop.
- **Dying** ends the run. *Death's Reprieve* (the last section of the Altar of Ashes) and *Undying* (the last section of the Deep Altar) let you cheat death once per rank; they're the dearest upgrades in the game. In a party, a fallen hero is downed instead until everyone is.

## 3. Long-term progression

Five layers, all permanent. The split is deliberate: the **Altar** and your **level** make *every* hero stronger, while **Ascension** belongs to one hero at a time.

| Layer | Currency | Where | What it gives |
|---|---|---|---|
| **Level & rank** | Experience (automatic) | — | Max level 50, eleven ranks (Shade → Deathless). Unlocks mechanics, heroes and forge tiers; +1 max Health per level and +1% damage per five levels for every hero (`applyLevel`); opens Altar sections |
| **Altar of Ashes** | Ash | Altar (mirror) | Two tables of permanent upgrades for every hero (`altar.ts`). Sections run weakest → strongest; each opens at a level *and* once enough Ash is spent on the sections above. The Deep Altar opens when the first table is complete. Paced to finish around level 50 |
| **Hero skill trees** | Hero skill points | *Ascension* stone | Each hero's own tree (`herotree.ts`): 3 branches × 4 rows (capstone last). Points come from that hero's level (max 20, one point per level), raised by the experience earned while playing them. Rows open with points in the branch; more ranks than points. Free respec |
| **Weapon forge** | Ash (+ level) | Blacksmith (needs the Whetstone) | Forge each class weapon from Tier I to Tier V |
| **Gear** | Materials | Blacksmith, Hall of Heroes | See *Loot and gear*. The Blacksmith's forge parts come from guardians (`smith.ts`) and unlock reforging and crafting |

Saves from before v0.9 (`progress < 2`) move their talents onto the matching Altar upgrades (anything without room is refunded as Ash), seed every hero's level from a share of their experience, and get the forge parts of guardians they already slew (`migrateTalents`, `normalizeSave`).

**Onboarding order.** The full table is in GAME_DATA.md. The intent is that each new mechanic arrives once the previous one is familiar:

1. Level 1: Attack, Special, Dash only. No potion, cast, jump or artifacts. The HUD, touch buttons and help screens hide everything else.
2. Level 2 Potion, level 3 Cast, level 4 Artifacts (1 slot), level 5 Jump & Slam (or earlier, as soon as you slay the final guardian).
3. Level 6 Enchantments, level 7 Anvils, level 8 second artifact slot (and the Ione hero and Titan Gauntlets).
4. Level 10 Wrath, level 12 third artifact slot, level 13+ Awakened weapons, level 14 Reaper's Crescent.

When a mechanic is locked, its rewards (tomes, artifact caches, anvils, Cast boons) also leave the reward pool. Saves from before levels existed are given experience for their past runs.

**Torment** (difficulty) unlocks after your first guardian kill. Each level raises foe health and damage and multiplies the Ash you earn. Each escape raises the maximum by one.

## 4. Combat

- **Inputs.**
  - Attack and Special. **Combat grammar:** taps chain (`ActionDef.chain` = the step); holding Attack for `POWER_HOLD` (0.22 s) after a chain hit swaps into `Weapon.powered(step)`, a charge built by `poweredAttack()` (level 1–3 from the chain step, a Perfect for releasing on the flash). Still holding after that = `Weapon.held()` (repeat, a spin, the bow's draw, the katana's ready stance…). A Special within 0.6 s of a chain hit is a combo special (30% faster windup, +25% damage).
  - **Attack outline and charge meter** (`render.ts`: `drawAttackPreview`, `drawChargeMeter`; setting `attackPreview`): `Weapon.preview()` returns the shapes the next tap would hit (it reads the chain step without advancing it, `nextStep()`); a charging `ActionDef` shows its own `preview` filled by charge, and its `power` (label, chain level, `mult(holdT)`) drives the meter. `hold.perfect` marks the Perfect window. The outline appears when you attack and fades 2.2 s after the last one (`OUTLINE_HOLD`); the charge outline shows whenever a move charges.
  - **Camera** (`Game.turnCamera`, `applyView`): the world is 3D, except flat chambers (`Game.flatNow`: Painted Chambers, `flat` campaign rooms), which are drawn in 2D with a paper-fold transition (`body.fold`); `Z` / `X` turn the 3D camera around the hero up to 0.74 rad (~42°) each way from the default 45° yaw, both together swing it back. Rooms are built to be seen from the south-east (tall walls and doors to the north and west), which is why the turn is limited. Movement and aim are camera-relative, so they follow the turn.
  - Cast: a shard that lodges in foes; walk over it to pick it up again.
  - Dash: brief invulnerability. Attacking right after a dash gives a *Dash-Strike*.
  - Jump: attack mid-air to *Slam*.
  - Guard (level 2): hold to block (front 140°, a 100-point meter that refills after 0.8 s; empty = Guard Break), tap to open a parry window (0.15 s; 0.18 blades, 0.2 brawlers; wider on touch and with Assist). A parry staggers the foe (guardians flinch), reflects shots, and makes the next attack a riposte (every hit crits). Ranged classes sidestep instead (Perfect Dodge in the first 0.15 s). Ground-tagged hits can't be guarded. All in `Player.defend()`, called first by `World.hurtPlayer()`.
  - Combo meter: `Player.combo` counts hits in a row (reset when hurt or after 2.5 s without a hit); +1% damage per 10 (max +10%).
  - Potion, artifact slots 1–3, and Wrath. Keyboard keys can be rebound (`Settings.keys`, applied with `Input.setBindings`; menu keys always work).
- **Moving while fighting** (`player.ts`, the `action` state): basic attack chains keep at least 85% of walking speed (`BASIC_MOVE`), casts 70%, other skills 45% and held charges 60%. Basic attacks never push the hero forward; only kit moves with a `lunge` (dash-strikes, some specials) do.
- **Weapons** (8, one per class; `weapons.ts`, `arsenal.ts`, `kits.ts`): each has a chain, a powered attack, a dash-strike, a special and a slam. See GAME_DATA.md → *Weapons* for names, classes and anvil upgrades.
- **Classes:** each hero (`characters.ts`) has a `role`, a signature `weapon` and a `guard` style; choosing the hero sets the weapon. Heroes unlock by level, some also by guardians or escapes (`unlock.or`).
- **Forging** adds weapon damage per tier. **Awakened** (Tier III and above) fires an arcane crescent wave every 4th Attack; it grows at Tier IV, and at Tier V (**Mythic**) it splits into three and gives a weapon aura.
- **Damage pipeline** (`combat.ts → damageEnemy`), applied in this order:
  1. Bonuses: global, per-slot boons, enchantments, low-health frenzy, *Giantslayer* against bosses and elites.
  2. Guard (blocking).
  3. Backstab.
  4. Critical hits.
  5. Armor soaks damage before health.
  6. On-hit god effects (lightning, Doom, Chill and so on), knockback, hit-stop and Wrath gain.
- **Status effects:** Doom (delayed burst), Weak (−damage), Hangover (stacking damage over time), Chill (slow, then shatter), Burn, Stun.
- **Jumping avoids "ground" attacks:** Brute, Mimic and boss slams and every shockwave ring.

## 5. Build systems inside a run

| System | Source | Notes |
|---|---|---|
| **Boons** | God doors, shops | 8 Olympians + Hermes. Slots: Attack/Special/Cast/Dash (a new one replaces the old), unlimited passives, 6 duo boons. Max 4 Olympians per run. Rarity Common/Rare/Epic/Heroic multiplies values; odds by region, first boon held to 90% Common (`boonRarityOdds`) |
| **Pomegranates** | Doors, shops | Level up a boon (+1, sometimes +2) |
| **Anvil upgrades** | Anvil doors (elite rooms) | Weapon-specific modifiers, one per region |
| **Enchantments** | Tomes, chests | 13, each up to Tier III by finding it again |
| **Artifacts** | Caches, chests, starting artifact | Cooldown or soul-cost actives in 1–3 slots. Souls drop from slain foes |
| **Titan Hearts** | Doors, shops | +25 max Health for the run |

Every reward choice screen (and the pause menu) has a **Your build** page to review what you already own: the four ability slots side by side, other boons grouped by god, then duos, anvil upgrades, enchantments and artifacts (`buildList` in `screens.ts`).

## 6. Heroes and Wrath

Eight heroes, each a class: a signature weapon, a guard style, perks, a distinct look (headwear and palette) and their own **Wrath** ultimate:

| Hero | Class | Weapon | Guard | Unlock | Wrath |
|---|---|---|---|---|---|
| Kael | Warrior | Nightblade | parry | Start | Inferno Nova |
| Lyra | Ranger | Moonbow | evade | Start | Moonfall |
| Doran | Vanguard | Thornspear | shield | Start | Titan's Quake |
| Gorran | Brawler | Titan Gauntlets | catch | Level 7 or 1 guardian | Hundred Fists |
| Ione | Monk | Riptide Chains | catch | Level 10 or 3 guardians | Tidal Surge |
| Erebos | Reaper | Reaper's Crescent | mist | Level 14 or 6 guardians | Eclipse |
| Rook | Gunner | Thunderbuss | evade | Level 18 or 1 escape | Cannonade |
| Selene | Duelist | Starsplitter | parry | Level 22 or 3 escapes | Starfall |

The Wrath gauge fills from damage dealt and taken (Altar and hero skills, and Kael, speed it up). When full, press `V`, `R3` or the ☄ touch button. Every Wrath grants a moment of invulnerability and slow motion.

## 7. Enemies

Base values; foes get tougher with region and Torment. The full stat table is in GAME_DATA.md → *Enemies*.

**Stuck foes** (`World.unstick`, checked once a second): a foe out of bounds, inside a wall, or that hasn't moved 20 px while it can't see or reach you for 6 s (`STUCK_TIME`) vanishes in smoke and reappears at a spawn point. Bosses, dummies and turrets are left alone.

**AI rules** (`enemies/enemy.ts`): foes turn at `turnRate` (5 rad/s; Brutes 2.5, Gorgehorns 2.2, guardians 3) and attacks lock to `aimAtPlayer()`: their facing pulled toward you by at most a snap angle, plus aim error for shots (`World.foeAimError`, smaller with Torment). `canAttack()` hands out **attack tokens**: 2 melee and 2 ranged at once, +1 per two Torment levels (`World.tokenBonus`); a foe without one circles at ~175 px. From afar, `chase()` heads for the foe's own `slot` around you so groups surround. Foes pause 0.15–0.6 s after spawning (`reactT`).

| Foe | Behaviour | Counterplay |
|---|---|---|
| **Ghoul** | Chases you and swipes in an arc (0.5s telegraph) | Dash out of the arc |
| **Numbling** | Shakes 0.35s (audio cue, no marker), then lunges fast | Sidestep the lunge |
| **Brute** | Slow and heavy (resists knockback). Ground slam in front, 0.9s telegraph | Jump the slam or stay behind it |
| **Wisp** | Flying caster that keeps distance. 3-bolt spread after a 0.6s charge | Close the gap; dash through bolts |
| **Lobber** | Lobs a bomb that leads your movement; the landing spot is marked | Change direction; bombs can't be deflected |
| **Sentinel** | Stationary turret firing 3 rotating bullet rings, then resting 2.6s | Kill it during the rest |
| **Gorgehorn** | Charges along a marked lane | Bait it into a wall: it stuns itself for 1.2s |
| **Gilded Hoplite** | Its shield blocks frontal hits (takes only 10%). Spear thrust. Turns slowly | Flank it, or hit it after a thrust |
| **Hissling** | Lights a 1s fuse up close, then explodes, hurting other foes too | Back off; stunning it puts the fuse out |
| **Weaver** | Spits webs that slow you (−55% speed) for 5s | Avoid the marked landing; jump the impact |
| **Bonecaller** | Summons Numblings (up to 5); its minions die with it | Kill the Bonecaller first |
| **Mimic** | A disguised chest that hop-slams (ground hit) | Jump or dash its landing zone |
| **Old Bones** | Training dummy in the hub. Heals to full when left alone | — |

**Enchanted (elite) foes:** +40% health, extra obols, a violet aura and a name tag, plus one modifier:
- **Armored:** extra armor equal to 70% of max health + 20.
- **Swift:** +50% speed and attacks about 45% faster, with shorter warnings.
- **Volatile:** explodes 0.8s after death (marked).
- **Regenerating:** heals 4% per second after 2s without taking damage.

**Shared rules:**
- Foes are invulnerable for 0.9s while spawning (red rising ring).
- Breaking a foe's armor stuns it for 0.8s.

## 8. Guardians (bosses)

All guardians share these rules:
- They resist knockback and never use the same attack twice in a row.
- Below **50% health** they enter **phase 2**: 1.4s of invulnerability, then about 30% faster attacks and more projectiles.
- When a guardian dies, every remaining foe in the room dies too.

### Vexa, Warden of Chains (2400 HP)
Circles you at mid range.
- **Lash:** 2 whip lines (3 in phase 2).
- **Dash:** a 700-long marked lane, then a fast dash for heavy damage.
- **Ring:** 2 bursts of 18 bullets (3 in phase 2).
- **Phase 2:** also summons 3 Ghouls once.
- *Counter:* step sideways off the dash lane; slip through the gaps in the rings.

### The Many-Maw (3400 HP)
Doesn't move.
- **Bite:** a circle on your position (0.85s telegraph).
- **Spit:** lobbed globs that leave fire patches (4, or 6 in phase 2).
- **Fan:** volleys of 7 fire bolts (3 volleys, or 4 in phase 2).
- **Phase 2:** bites twice.
- **Extra heads:** at **70% and 35%** health it grows 2 extra heads (up to 4). They spit fire bolts every 2s and die with the body.
- *Counter:* clear heads if overwhelmed, otherwise focus the body; keep away from the bite circles.

### Aurex, the Gilded Colossus (4200 HP + 800 armor)
- **Slam:** in front of him, sending out a **shockwave ring** (jump it). He slams twice in phase 2.
- **Laser:** a sweeping laser after a 1s charge.
- **Barrage:** a bomb barrage (6 bombs, or 9 in phase 2).
- **Overheat:** breaking his armor makes him **overheat**: he is stunned for 3.2s and takes **+50% damage**. His armor returns 9s after it breaks.
- *Counter:* strip the armor, then unload during the overheat.

### Threefang, Hound of the Last Gate (5600 HP), the final guardian
- **Charge:** along a long marked lane. If he hits a wall he is stunned for 1.6s.
- **Breath:** fire in 3 cones. In phase 2 it leaves fire patches.
- **Leap:** a slam on your position plus a shockwave ring (jump both).
- **Summons:** at **66% and 33%** health he summons 3 Hisslings.
- *Counter:* bait the charges into walls; jump the leap shockwaves.

Slaying Threefang is an **escape**. It raises the Torment cap, gives a large amount of experience and unlocks Jump (if it isn't already) and the hero Selene.

## 8b. Loot and gear

Loot drops from the first escape; the Gear & Inventory screen opens at level 2 (`feature: 'gear'`). Pickups fly to you within 120 px and all of them when a chamber is cleared; `World.feed()` lists them on the HUD, and `Run.spoils` is shown when the escape ends. Numbers are in GAME_DATA.md → *Loot and gear*; the code is `src/game/gear.ts` (data) and `src/ui/gear.ts` (screen).
- **Materials** drop from foes during escapes and are kept forever (`save.materials`): Bone Dust everywhere, a region material (Ember Shard, Golden Ichor, Gate Pearl), and Titan Scales from guardians and enchanted foes.
- **Gear** has a slot (helmet, armor, leggings, boots), one of seven tiers (Common, Uncommon, Rare, Epic, Legendary, Unique, Ghost: 1–5 random bonuses, stronger with each tier) and a star level. It drops from foes (12%), enchanted foes (35%), chests (30%) and guardians (always). It's kept in `save.gear` (40 pieces; a full bag salvages new finds).
- **Plain and starred** (`rollDrop`, tables in `odds.ts`): a drop rolls its stars first: one star at the source's chance (foes 5%, enchanted foes 10%, chests 8%, guardians always), each further star half as likely, capped by `maxDropStars` (1, +1 every 3 player levels). No star = a *plain* Common/Uncommon piece that can't be starred up; a star = a Rare+ piece whose tier comes from `STARRED_TIER` (Legendary only from guardians, 20% against Epic's 30%). About 1–2 starred pieces per 80-kill run. Any kill also rolls a Ghost piece at 0.1%; Ghost bonuses roll 1.0–1.25 (`minRoll`) so even the weakest beats the best Legendary roll. Unique pieces carry one of seven perks, Ghost pieces one of four stronger ones (`PERKS`): extra dashes, Death Defiance (added to the escape at its start), healing on kills and so on.
- **Stars** (1–10, Rare and better only): stars 2–5 are gold (+15% each), and stars 6–10 turn them purple one by one (+20% each, and they cost Titan Scales).
- **Gear & Inventory** (Hall of Heroes or pause menu) equips gear. The **Blacksmith** stars pieces up, salvages them (or every plain piece at once), reforges their bonuses (Ember Tongs) and crafts new ones of a chosen slot: plain and 1★ Rare (Crucible), 1★ Epic (Great Bellows), 1★ Legendary (Anvil Heart). Unique and Ghost pieces can't be crafted.
- **Tier colours** are distinct (`GEAR_RARITY`); Legendary and Ghost pieces get special frames in menus (a gilded double frame; a spectral frame that circles the piece) and on the ground (a studded double ring; a circling spectral ring).
- Equipped bonuses are added in `Game.recomputeStats` after the Altar, level, hero, skills and forge.

## 9. The Hall of Shades (hub)

| Station | Unlock | Purpose |
|---|---|---|
| Blacksmith | Always | Star up, reforge, salvage and craft gear; forge the hero's weapon. More of it opens with each forge part brought back |
| Altar of Ashes | Always | Permanent upgrades for every hero, for Ash (two tables, sectioned) |
| Hall of Heroes | Always | The hero you play in one place: class, weapon, armour and skills; switch hero, change gear, customise their colours and headwear |
| Ascension | Always | The selected hero's skill tree (the prompt shows their unspent points) |
| Chronicle | Always | Records, bestiary (foes stay silhouettes until slain) and achievements |
| Artifact Shelf | Level 4 | Choose (or buy) a starting artifact |
| Oath of Torment | After a guardian kill | Choose a difficulty |
| Old Bones | Always | Training dummy |

## 9b. Multiplayer

Up to four heroes (`MAX_PARTY`). The **party core** lets one `World` hold several heroes: `World.players`, and `w.player` / `w.stats` meaning *the hero acting now*. `World.as(p, fn)` switches the acting hero (and the host's active member), and `acting(p, fn)` also stamps that hero as the owner of zones, shots and summons it creates, so kills, damage and rewards go to the right player. Foes pick a target (`targetFor`: nearest living hero, held for a while), and every foe's own AI runs as if that hero were *the* player. `Run` keeps one `Build` per member (boons, hammers, enchants, artifacts, Death Defiance), switched with `setActive`.

**Rules.** Foes get +40% health and +35% numbers per extra hero (`partyHp`, `PARTY_FOES`). A hero at 0 health is *downed*: a partner within 70 px for 2.5 s revives them, and a cleared chamber revives everyone; the escape ends only when all are down. Chamber rewards go to every member (local members take turns, online members choose on their own screens in parallel); chest rewards go to whoever opened it. Picking a door starts a 2-second countdown for the party. Each player's experience, Ash, loot, kills and forge parts go to their own save (`grant`).

**Local co-op.** A second gamepad is claimed with `Input.capturePad` and drives its hero through `PadControl`; claimed pads only drive menus otherwise. The camera frames all local heroes and zooms out (to 70%) as they spread.

**Online.** One device *hosts*: it runs the whole simulation. The others run a *mirror* of the room (`src/net/client.ts`) and draw it with the normal renderers.
- **Relay** (`server/relay-core.cjs`): rooms with 5-letter codes, message routing host ↔ players, seats kept 2 minutes after a drop (rejoin with a token) and the room kept 1 minute if the host drops, plus a key → save store for save sync. It implements WebSocket itself (no dependencies), and the same code runs the standalone server, the Windows app's LAN hosting and the tests. The Android app has a Java port (`LanRelay.java`). Games on a LAN are found by a UDP broadcast on port 7778 (`server/lan.cjs`, `LanHostPlugin.java`).
- **Host** (`src/net/host.ts`): remote players' controls arrive 30 times a second (`RemoteControl`, presses kept until the next step). Every 50 ms it sends a snapshot: for each kind of object (foes, heroes, allies, shots, zones, pickups, telegraphs) only what changed since the last one (`Track`, `encode`/`diff` in `sync.ts`), plus new slashes/bolts/flashes, room state, per-member stats and builds, and the particles, sounds and shakes made during the step (recorded by wrapping `Particles`, `audio.play` and `camera.shake`). WebSocket order is guaranteed, so deltas need no acknowledgements; a new or returning player resets the tracks so everyone gets a full snapshot.
- **Client** (`src/net/client.ts`): builds the room from the host's layout, creates foes by name (`registry.ts`) and applies fields to live objects (`apply` never overwrites links or functions). Positions glide toward the host's (extrapolated by velocity); your own walking is predicted from your input and corrected by the host's acknowledgement. Choices, rewards and the end of an escape arrive as messages; Hall stations open locally on your own save, and changes to it are sent to the host (`profileForHost`) so your hero's stats follow.

## 10. Platforms, UI and settings

- **Platforms:**
  - Browser and installable web app (PWA, offline).
  - Desktop: Electron. Windows, macOS and Linux, with a one-button self-updater for the Windows installer and the Linux AppImage.
  - Android: Capacitor APK (the `sideload` flavour, which downloads its own updates and opens the system installer through `ApkUpdaterPlugin`), plus a Play Store bundle (the `play` flavour, which has no install permission and leaves updates to the store).
- **Touch:** a floating joystick on the left and an action cluster on the right: Attack, Special above it, Dash beside it, Cast, Jump, Wrath, potion and artifacts. Buttons appear as their mechanics unlock.
- **Views:** the 3D voxel view (default) renders the world with three.js, which is only loaded when this view is used. It has a Hades-style camera: the room is turned 45° and seen from about 40° up, so rooms show as diamonds with the doors on the far edges. Movement, sticks and mouse aim are turned to match, so up on the keyboard is up on screen. Effects, damage numbers, health bars, pickups and prompts are drawn by a 2D layer on top. That layer uses the same angle (`Camera.setAngle`), and heights go through `Camera.lift`, so the effects line up with the 3D scene. The classic 2D view looks straight down and draws everything on the canvas. On desktop the 3D view has shadows and point lights; phones get no shadows and a lower resolution.
- **Scaling:** the HUD and menus scale with screen size (1 at 1280×760, up to ×3 on 4K). Phones get compact layouts: a narrower health panel and boon choices that fit without scrolling.
- **Save slots:** four, chosen on the title screen. Slot 1 uses the original storage keys, so older saves land there; settings follow the device, not the slot. Switching reloads the game.
- **Map** (pause menu): each region's chambers, antechamber and guardian; where you are; your best run.
- **Window modes (desktop):** Windowed, Borderless (frameless, covering the screen) and Fullscreen. Saved by the desktop shell; switching to or from Borderless reopens the window, and an escape resumes from its chamber.
- **Menu style:** gilded double frames, banner titles with spaced capitals, lacquered card rows, and keyword notes beside card choices (`GLOSSARY` in `overlay.ts`). It's all CSS, with no image assets.
- **Tooltips (PC):** pointing at a HUD icon shows what it is; a door's description pops up when you point at its icon (or walk up to it). Phones show door descriptions on the floor.
- **Card choices** ignore input for 2s (`CHOICE_LOCK_MS`), so a click meant for the reward doesn't pick a card by accident.
- **Charon's wares** show what they do once you've bought that kind before (`save.shopSeen`); until then the text is blurred.
- **Achievements** (`src/game/codex.ts`) are checked whenever the save is written. God mode or developer options switch them off for the session.
- **Developer options** (`src/ui/dev.ts`): unlocked per device by tapping the version in Settings 7 times, or with `?dev`.
- **Music:** all synthesized (`audio.ts`): a drone, plucked arpeggios, a lyre, bowed strings, a flute with vibrato, FM bells, a formant choir, kick, snare, hats, toms and a shaker, through a light reverb. Each mood (title, hall, exploring, fighting) has its own arrangement, and each guardian has its own theme (`BOSS_THEMES`); phase 2 adds hi-hats, a high lead and (for most guardians) the choir.
- **Title screen:** an original emblem (a broken shackle in laurels with a flame), letters that rise in, a gold shine and drifting embers (CSS, with `prefers-reduced-motion` respected), over the hall with the camera slowly drifting (`World.titleDrift`).
- **Autosave:** at the start of every chamber (with a *Saved* mark), on every save-data change, and when the game goes to the background.
- **Settings:**
  - Audio.
  - Assist mode, aim assist, damage numbers, control hints, and door descriptions (every door, or only the nearest).
  - Accessibility: UI size, shake, flashes, colour-blind colours (`palette.ts` recolours rarities in place), high-contrast foe rings, tap-to-guard, assist mode, game speed (100/85/70%, achievements off below 100%, ignored online). Display: hit-stop, FPS counter, fullscreen.
  - Touch button size, opacity, left-handed layout and vibration.

## 11. Where things live in the code

| Area | File |
|---|---|
| Levels, ranks, unlocks, level bonuses, forge, Wrath tuning | `src/game/progression.ts` |
| Altar of Ashes (two tables) / hero skill trees / Blacksmith parts | `src/game/altar.ts` / `src/game/herotree.ts` / `src/game/smith.ts` |
| Party members, co-op scaling | `src/game/party.ts` |
| Online play: relay link, host, client, state sync, LAN, save sync | `src/net/` |
| Daily challenge: seed, modifiers, score, streak (`dailyFor`, `dailyScore`, `recordDaily`); hooks in `Run.hasMod`, `Game.startDaily/finishDaily` | `src/game/daily.ts`, `src/ui/daily.ts` |
| Endgame: traits from Torment 3 (`ENDGAME_TRAITS`), guardian rules from Torment 4 (`Boss.rule`, `ruleName`, `ruleHint`; `guard`/`armorFactor` overrides, `ChainAnchor`) | `src/game/odds.ts`, `src/game/enemies/bosses.ts`, `src/game/combat.ts` |
| Cloud saves in Google Drive: Drive calls and sign-in per platform (setup: [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md)) | `src/net/gdrive.ts`, `electron/google.cjs`, `GoogleDrivePlugin.java` |
| Backup files (Google Drive through the file picker or Drive folder, no setup) | `src/net/backupfile.ts`, `electron/backup.cjs`, `BackupFilePlugin.java` |
| Relay server (standalone, LAN, Docker) | `server/` (+ `android/.../LanRelay.java`, `LanHostPlugin.java`) |
| Heroes, perks, Wrath ultimates | `src/game/characters.ts` |
| Gods, boons, duos, anvil upgrades, stat assembly | `src/game/boons.ts` |
| Weapons (sword, spear, bow) and shared weapon helpers | `src/game/weapons.ts` |
| Late-game weapons (gauntlets, scythe) | `src/game/arsenal.ts` |
| Class weapons (katana, blunderbuss, chains) | `src/game/kits.ts` |
| Enchantments / Artifacts | `src/game/enchants.ts` / `src/game/artifacts.ts` |
| Save data, migrations, Torment scaling | `src/game/meta.ts` |
| Regions, room layouts, encounter budgets | `src/game/rooms.ts` |
| Enemies / Guardians | `src/game/enemies/types.ts` / `src/game/enemies/bosses.ts` |
| Damage pipeline and status effects | `src/game/combat.ts` |
| Run state and door rewards | `src/game/run.ts` |
| Chance rolls: doors, drops, chests, elites (tabled in GAME_DATA.md → *Probabilities*) | `src/game/odds.ts` |
| Orchestration (hub, rewards, level-ups, settings) | `src/game/game.ts` |
| HUD / 2D world rendering and the 3D view's overlay | `src/game/hud.ts` / `src/game/render.ts` |
| 3D voxel view (rooms, props, figures, lights) | `src/render3d/voxel.ts` |
| Menus / touch controls | `src/ui/screens.ts` / `src/ui/touch.ts` |
| Altar & Ascension / Blacksmith / Multiplayer & local co-op menus | `src/ui/progress.ts` / `src/ui/smith.ts` / `src/ui/multiplayer.ts`, `src/ui/party.ts` |
| Bestiary and achievements | `src/game/codex.ts` |
| Developer options | `src/ui/dev.ts` |
| Loot, gear and crafting | `src/game/gear.ts` / `src/ui/gear.ts` |
| Map | `src/ui/map.ts` |
| Save slots | `src/game/meta.ts` (`currentSlot`, `setSlot`) / `saveSlots` in `screens.ts` |

## 12. How to add content

After any change: run `npm test`, then `npm run docs`, and commit the regenerated `docs/GAME_DATA.md`.

- **A boon:** add an entry to `BOONS` in `boons.ts`. Fields: `god`, `slot`, `base` value, `desc(v)` and `apply(stats, v)`. Use `requiresAny` for passives that need another boon. If it only makes sense with Cast, add it to `needsCast()`.
- **An anvil upgrade:** add it to `HAMMERS`, then check `s.hammers.has('<id>')` inside the weapon's code.
- **A weapon:** add the id to `WeaponId` (`types.ts`) and `WEAPON_IDS` (`meta.ts`), its card info to `WEAPON_INFO`, its unlock level to `WEAPON_LEVEL`, and a class implementing `Weapon` (`attack`, `held`, `special`, `slam`, `draw` …) registered in `createWeapon()`.
- **A hero:** add it to `CHARACTERS` in `characters.ts`. Fields: palette and headwear (`crown`), `apply(stats)` for perks, an `unlock` condition and a `wrath.use(world)` ultimate.
- **An Altar upgrade:** add it to a section of `ALTAR` in `altar.ts` (weaker ones higher up), with its Ash costs and `apply`.
- **A hero skill:** each hero's tree is in `HERO_TREES` (`herotree.ts`), built from the effects in `E`.
- **A mechanic unlock:** add a `Feature` and an entry in `UNLOCKS`, set a stat flag in `applyFeatures()`, then gate the input in `player.ts`, the HUD in `hud.ts`, the touch button in `game.ts → syncTouch` and the reward pool in `run.ts`.
- **An enemy:** subclass `Enemy` in `enemies/types.ts`, add its kind to `EnemyKind`, `ENEMY_COST` and `createEnemy()`, and put it in a region's `pool` in `rooms.ts`. For the 3D view, give its name a `LOOKS` entry in `render3d/voxel.ts` (body shape and colours); without one it is drawn as a plain humanoid.
- **A guardian:** subclass `Boss` in `enemies/bosses.ts`, add it to `BossKind` and `createBoss()`, and set it as a region's `boss`. Add a `LOOKS` entry for the 3D view too.
- **An artifact / enchantment:** add it to `ARTIFACTS` / `ENCHANTS`. Enchantment effects hook into `enchants.ts → onAbilityHit / onEnemyKilled`.

## 13. Keeping docs up to date

- **`docs/GAME_DATA.md`** is generated by `scripts/gen-docs.ts` from the definitions above. CI regenerates it and fails if the committed copy differs, so the reference can never silently go stale.
- **This guide** is hand-written: update it when you change a system's behaviour or add a new kind of content.
- **The README** covers players (download, controls, features) and contributors (build and release).
