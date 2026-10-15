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
9. [The Hall of Shades (hub)](#9-the-hall-of-shades-hub)
10. [Platforms, UI and settings](#10-platforms-ui-and-settings)
11. [Where things live in the code](#11-where-things-live-in-the-code)
12. [How to add content](#12-how-to-add-content)
13. [Keeping docs up to date](#13-keeping-docs-up-to-date)

---

## 1. The game in one page

A top-down action roguelike. You are a shade escaping the Underworld one chamber at a time. The core loop is modelled on *Hades*, with systems inspired by *Minecraft Dungeons II* (jump attacks, artifacts, enchantments, chests). All art is drawn in code and all audio is synthesized, so the game ships without asset files. Names are original or taken from Greek myth.

**Loop:** Hall of Shades (hub) → walk through the gate → fight through 4 regions → slay each region's guardian → escape. When you die you return to the hub and keep **Ash** (a currency) and **experience**, then spend them on permanent growth and try again.

**Design pillars**
- **Readable, fair combat.** Every enemy attack is telegraphed on the ground. The dash has invulnerability frames. Hits have hit-stop and screen shake.
- **A build every run.** Gods offer boons, and anvils, enchantments and artifacts stack on top, so no two runs play the same.
- **Gentle onboarding, deep late game.** New players start with three buttons. Everything else unlocks one level at a time, ending in flashy ultimates, Mythic weapons and the Torment difficulty levels.

## 2. A run

| Region | Chambers | Hazard | Guardian |
|---|---|---|---|
| Tartarus | 5 combat chambers, then the antechamber | Spike traps | Campe |
| Asphodel | 5, then the antechamber | Lava | The Hydra |
| Elysium | 5, then the antechamber | Chasms (pits) | Talos |
| Gates of the Styx | Antechamber only | — | Cerberus (final) |

- **Chambers.** Each combat chamber spawns waves of foes, bought from an encounter budget that grows with depth and region. Clearing the room drops its reward, then the exit doors open.
- **Doors.** Each exit door shows its reward and a one-line description ("No fight · buy with obols") on the floor in front of it, so you choose your path:
  - Boon of a named god, Pomegranate, obols, Titan Heart or Ash.
  - Hephaestus' Anvil or Artifact Cache. These rooms always have enchanted (elite) foes.
  - Enchanting Tome or Hermes.
  - Charon's shop or a Fountain. These have no fight.
- **Once per region:** a shop, a fountain, an anvil and Hermes.
- **Before each guardian** there is an *antechamber* with a shop and a fountain.
- **Treasure chests** sometimes appear in combat rooms. 15% of them are Mimics.
- **Dying** ends the run. *Death's Reprieve* (an Altar upgrade) and the *Undying* talent let you cheat death once per rank.

## 3. Long-term progression

Four layers, all permanent:

| Layer | Currency | Where | What it gives |
|---|---|---|---|
| **Level & rank** | Experience (automatic) | — | Unlocks mechanics, heroes, weapons, forge tiers; 1 talent point per level |
| **Talents** | Talent points | *Ascension* stone | 14 talents in 5 rows; each row opens with a rank tier (Shade → Wraith → Revenant → Champion → Unbound). Free respec |
| **Altar of Ashes** | Ash | Altar (mirror) | 11 permanent stat upgrades |
| **Armory** | Ash (+ level) | Weapon rack | Buy weapons; forge each from Tier I to Tier V |

**Onboarding order.** The full table is in GAME_DATA.md. The intent is that each new mechanic arrives once the previous one is familiar:

1. Level 1: Attack, Special, Dash only. No potion, cast, jump or artifacts. The HUD, touch buttons and help screens hide everything else.
2. Level 2 Potion, level 3 Cast, level 4 Artifacts (1 slot), level 5 Jump & Slam (or earlier, as soon as you slay the final guardian).
3. Level 6 Enchantments, level 7 Anvils, level 8 second artifact slot (and the Ione hero and Titan Gauntlets).
4. Level 10 Wrath, level 12 third artifact slot, level 13+ Awakened weapons, level 14 Reaper's Crescent.

When a mechanic is locked, its rewards (tomes, artifact caches, anvils, Cast boons) also leave the reward pool. Saves from before levels existed are given experience for their past runs.

**Torment** (difficulty) unlocks after your first guardian kill. Each level raises foe health and damage and multiplies the Ash you earn. Each escape raises the maximum by one.

## 4. Combat

- **Inputs.**
  - Attack (hold to repeat or charge) and Special.
  - Cast: a shard that lodges in foes; walk over it to pick it up again.
  - Dash: brief invulnerability. Attacking right after a dash gives a *Dash-Strike*.
  - Jump: attack mid-air to *Slam*.
  - Potion, artifact slots 1–3, and Wrath.
- **Weapons** (5): each has a combo, a dash-strike, a special and a slam. See GAME_DATA.md → *Weapons* for names, costs and anvil upgrades.
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
| **Boons** | God doors, shops | 8 Olympians + Hermes. Slots: Attack/Special/Cast/Dash (a new one replaces the old), unlimited passives, 6 duo boons. Max 4 Olympians per run. Rarity Common/Rare/Epic/Heroic multiplies values |
| **Pomegranates** | Doors, shops | Level up a boon (+1, sometimes +2) |
| **Anvil upgrades** | Anvil doors (elite rooms) | Weapon-specific modifiers, one per region |
| **Enchantments** | Tomes, chests | 13, each up to Tier III by finding it again |
| **Artifacts** | Caches, chests, starting artifact | Cooldown or soul-cost actives in 1–3 slots. Souls drop from slain foes |
| **Titan Hearts** | Doors, shops | +25 max Health for the run |

Every reward choice screen has a **Your build** button to review what you already own before choosing.

## 6. Heroes and Wrath

Six heroes with different stats and perks, a distinct look (headwear and palette) and their own **Wrath** ultimate:

- **Starters:** Kael (balanced, Inferno Nova), Lyra (fast and precise, Moonfall) and Doran (tank, Titan's Quake).
- **Unlockable:** Ione (level 8, Tidal Surge), Erebos (2 guardians slain, Eclipse) and Selene (first escape, Starfall).

The Wrath gauge fills from damage dealt and taken (talents and Kael speed it up). When full, press `F`, `R3` or the ☄ touch button. Every Wrath grants a moment of invulnerability and slow motion.

## 7. Enemies

Base values; foes get tougher with region and Torment. The full stat table is in GAME_DATA.md → *Enemies*.

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

### Campe, Jailer of Tartarus (2400 HP)
Circles you at mid range.
- **Lash:** 2 whip lines (3 in phase 2).
- **Dash:** a 700-long marked lane, then a fast dash for heavy damage.
- **Ring:** 2 bursts of 18 bullets (3 in phase 2).
- **Phase 2:** also summons 3 Ghouls once.
- *Counter:* step sideways off the dash lane; slip through the gaps in the rings.

### The Hydra (3400 HP)
Doesn't move.
- **Bite:** a circle on your position (0.85s telegraph).
- **Spit:** lobbed globs that leave fire patches (4, or 6 in phase 2).
- **Fan:** volleys of 7 fire bolts (3 volleys, or 4 in phase 2).
- **Phase 2:** bites twice.
- **Extra heads:** at **70% and 35%** health it grows 2 extra heads (up to 4). They spit fire bolts every 2s and die with the body.
- *Counter:* clear heads if overwhelmed, otherwise focus the body; keep away from the bite circles.

### Talos, the Bronze Colossus (4200 HP + 800 armor)
- **Slam:** in front of him, sending out a **shockwave ring** (jump it). He slams twice in phase 2.
- **Laser:** a sweeping laser after a 1s charge.
- **Barrage:** a bomb barrage (6 bombs, or 9 in phase 2).
- **Overheat:** breaking his armor makes him **overheat**: he is stunned for 3.2s and takes **+50% damage**. His armor returns 9s after it breaks.
- *Counter:* strip the armor, then unload during the overheat.

### Cerberus, Warden of the Gate (5600 HP), the final guardian
- **Charge:** along a long marked lane. If he hits a wall he is stunned for 1.6s.
- **Breath:** fire in 3 cones. In phase 2 it leaves fire patches.
- **Leap:** a slam on your position plus a shockwave ring (jump both).
- **Summons:** at **66% and 33%** health he summons 3 Hisslings.
- *Counter:* bait the charges into walls; jump the leap shockwaves.

Slaying Cerberus is an **escape**. It raises the Torment cap, gives a large amount of experience and unlocks Jump (if it isn't already) and the hero Selene.

## 9. The Hall of Shades (hub)

| Station | Unlock | Purpose |
|---|---|---|
| Armory | Always | Buy, equip and forge weapons |
| Altar of Ashes | Always | Permanent upgrades for Ash |
| Hall of Heroes | Always | Choose your hero |
| Ascension | Always | Spend talent points (the prompt shows unspent points) |
| Chronicle | Always | Lifetime stats |
| Artifact Shelf | Level 4 | Choose (or buy) a starting artifact |
| Oath of Torment | After a guardian kill | Choose a difficulty |
| Old Bones | Always | Training dummy |

## 10. Platforms, UI and settings

- **Platforms:**
  - Browser and installable web app (PWA, offline).
  - Desktop: Electron. Windows, macOS and Linux, with a one-button self-updater for the Windows installer and the Linux AppImage.
  - Android: Capacitor APK, plus a Play Store bundle build.
- **Touch:** a floating joystick on the left and an action cluster on the right: Attack, Special above it, Dash beside it, Cast, Jump, Wrath, potion and artifacts. Buttons appear as their mechanics unlock.
- **Scaling:** the HUD and menus scale with screen size (1 at 1280×760, up to ×3 on 4K). Phones get compact layouts: a narrower health panel and boon choices that fit without scrolling.
- **Settings:**
  - Audio.
  - Assist mode, aim assist, damage numbers, control hints, and door descriptions (every door, or only the nearest).
  - Shake, flashes, hit-stop, FPS counter, fullscreen.
  - Touch button size, opacity, left-handed layout and vibration.

## 11. Where things live in the code

| Area | File |
|---|---|
| Levels, ranks, unlocks, talents, forge, Wrath tuning | `src/game/progression.ts` |
| Heroes, perks, Wrath ultimates | `src/game/characters.ts` |
| Gods, boons, duos, anvil upgrades, stat assembly | `src/game/boons.ts` |
| Weapons (sword, spear, bow) and shared weapon helpers | `src/game/weapons.ts` |
| Late-game weapons (gauntlets, scythe) | `src/game/arsenal.ts` |
| Enchantments / Artifacts | `src/game/enchants.ts` / `src/game/artifacts.ts` |
| Altar upgrades, save data, Torment scaling | `src/game/meta.ts` |
| Regions, room layouts, encounter budgets | `src/game/rooms.ts` |
| Enemies / Guardians | `src/game/enemies/types.ts` / `src/game/enemies/bosses.ts` |
| Damage pipeline and status effects | `src/game/combat.ts` |
| Run state and door rewards | `src/game/run.ts` |
| Orchestration (hub, rewards, level-ups, settings) | `src/game/game.ts` |
| HUD / world rendering | `src/game/hud.ts` / `src/game/render.ts` |
| Menus / touch controls | `src/ui/screens.ts` / `src/ui/touch.ts` |

## 12. How to add content

After any change: run `npm test`, then `npm run docs`, and commit the regenerated `docs/GAME_DATA.md`.

- **A boon:** add an entry to `BOONS` in `boons.ts`. Fields: `god`, `slot`, `base` value, `desc(v)` and `apply(stats, v)`. Use `requiresAny` for passives that need another boon. If it only makes sense with Cast, add it to `needsCast()`.
- **An anvil upgrade:** add it to `HAMMERS`, then check `s.hammers.has('<id>')` inside the weapon's code.
- **A weapon:** add the id to `WeaponId` (`types.ts`) and `WEAPON_IDS` (`meta.ts`), its card info to `WEAPON_INFO`, its unlock level to `WEAPON_LEVEL`, and a class implementing `Weapon` (`attack`, `held`, `special`, `slam`, `draw` …) registered in `createWeapon()`.
- **A hero:** add it to `CHARACTERS` in `characters.ts`. Fields: palette and headwear (`crown`), `apply(stats)` for perks, an `unlock` condition and a `wrath.use(world)` ultimate.
- **A talent:** add it to `TALENTS` in `progression.ts`. Its `tier` picks the row.
- **A mechanic unlock:** add a `Feature` and an entry in `UNLOCKS`, set a stat flag in `applyFeatures()`, then gate the input in `player.ts`, the HUD in `hud.ts`, the touch button in `game.ts → syncTouch` and the reward pool in `run.ts`.
- **An enemy:** subclass `Enemy` in `enemies/types.ts`, add its kind to `EnemyKind`, `ENEMY_COST` and `createEnemy()`, and put it in a region's `pool` in `rooms.ts`.
- **A guardian:** subclass `Boss` in `enemies/bosses.ts`, add it to `BossKind` and `createBoss()`, and set it as a region's `boss`.
- **An artifact / enchantment:** add it to `ARTIFACTS` / `ENCHANTS`. Enchantment effects hook into `enchants.ts → onAbilityHit / onEnemyKilled`.

## 13. Keeping docs up to date

- **`docs/GAME_DATA.md`** is generated by `scripts/gen-docs.ts` from the definitions above. CI regenerates it and fails if the committed copy differs, so the reference can never silently go stale.
- **This guide** is hand-written: update it when you change a system's behaviour or add a new kind of content.
- **The README** covers players (download, controls, features) and contributors (build and release).
