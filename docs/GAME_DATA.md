# Unbound Underworld — Game Data Reference

> **Generated file — do not edit by hand.** Run `npm run docs` after changing game data; CI checks that this file is up to date.
> Numbers are base values: enemies scale with region (see *Regions*) and Torment; boons scale with rarity and level.
> For how the systems fit together, see [DESIGN.md](DESIGN.md).

## Contents

- [Progression: levels, ranks and unlocks](#progression-levels-ranks-and-unlocks)
- [Hero skill trees (Ascension)](#hero-skill-trees-ascension)
- [Heroes and Wrath](#heroes-and-wrath)
- [Weapons, forging and anvil upgrades](#weapons-forging-and-anvil-upgrades)
- [Gods and boons](#gods-and-boons)
- [Enchantments](#enchantments)
- [Artifacts](#artifacts)
- [Altar of Ashes (permanent upgrades for every hero)](#altar-of-ashes-permanent-upgrades-for-every-hero)
- [The Blacksmith](#the-blacksmith)
- [Regions and guardians](#regions-and-guardians)
- [Enemies](#enemies)
- [Torment (difficulty)](#torment-difficulty)
- [Door rewards](#door-rewards)
- [Probabilities](#probabilities)

## Progression: levels, ranks and unlocks

Experience carries over between runs. Max level: **50**. Every level gives every hero +1 max Health, and every fifth level +1% damage. Levels also open the Altar of Ashes' sections. The same experience raises the hero you play (see *Hero skill trees*).

The curve is quick early (50–250 XP for levels 1–9, about a run each) and steep from level 10 (362 XP, rising to 23,450 for level 49). *Fledgling's Grace*: at level 1 foes deal 30% less damage, fading to nothing by level 6.

**Experience sources**

| Source | XP |
|---|---|
| Foe slain | 3 |
| Enchanted (elite) foe slain | 8 |
| Chamber cleared | 12 |
| Guardian slain | 120 |
| Escape (final guardian) | 250 |

**Rank names**

| Rank | From level |
|---|---|
| Shade | 1 |
| Wraith | 5 |
| Revenant | 10 |
| Champion | 15 |
| Unbound | 20 |
| Ascendant | 25 |
| Exarch | 30 |
| Eternal | 35 |
| Sovereign | 40 |
| Paragon | 45 |
| Deathless | 50 |

**Levels**

| Level | XP to next | Total XP | Rank | Bonus for every hero | Unlocks |
|---|---|---|---|---|---|
| 1 | 50 | 0 | Shade | +0 HP |  |
| 2 | 75 | 50 | Shade | +1 HP | Gear & Inventory, Guard & Parry, Healing Potion |
| 3 | 100 | 125 | Shade | +2 HP | Cast, Forge: Tier II · Tempered |
| 4 | 125 | 225 | Shade | +3 HP | Artifacts, Altar: Cinders (with 120 Ash spent above) |
| 5 | 150 | 350 | Wraith | +4 HP, +1% dmg | Jump & Slam, Weapon: Titan Gauntlets |
| 6 | 175 | 500 | Wraith | +5 HP, +1% dmg | Enchantments |
| 7 | 200 | 675 | Wraith | +6 HP, +1% dmg | Hephaestus' Anvil, Hero: Gorran |
| 8 | 225 | 875 | Wraith | +7 HP, +1% dmg | Second Artifact Slot, Weapon: Riptide Chains |
| 9 | 250 | 1100 | Wraith | +8 HP, +1% dmg |  |
| 10 | 362 | 1350 | Revenant | +9 HP, +2% dmg | Wrath, Hero: Ione, Weapon: Reaper's Crescent, Altar: Flames (with 500 Ash spent above) |
| 11 | 498 | 1712 | Revenant | +10 HP, +2% dmg |  |
| 12 | 658 | 2210 | Revenant | +11 HP, +2% dmg | Third Artifact Slot, Weapon: Thunderbuss |
| 13 | 842 | 2868 | Revenant | +12 HP, +2% dmg | Awakened Weapons, Forge: Tier III · Awakened |
| 14 | 1050 | 3710 | Revenant | +13 HP, +2% dmg | Hero: Erebos |
| 15 | 1282 | 4760 | Champion | +14 HP, +3% dmg | Weapon: Starsplitter |
| 16 | 1538 | 6042 | Champion | +15 HP, +3% dmg | Forge: Tier IV · Exalted |
| 17 | 1818 | 7580 | Champion | +16 HP, +3% dmg |  |
| 18 | 2122 | 9398 | Champion | +17 HP, +3% dmg | Hero: Rook, Altar: Blaze (with 1300 Ash spent above) |
| 19 | 2450 | 11520 | Champion | +18 HP, +3% dmg |  |
| 20 | 2802 | 13970 | Unbound | +19 HP, +4% dmg | Forge: Tier V · Mythic |
| 21 | 3178 | 16772 | Unbound | +20 HP, +4% dmg |  |
| 22 | 3578 | 19950 | Unbound | +21 HP, +4% dmg | Hero: Selene |
| 23 | 4002 | 23528 | Unbound | +22 HP, +4% dmg |  |
| 24 | 4450 | 27530 | Unbound | +23 HP, +4% dmg |  |
| 25 | 4922 | 31980 | Ascendant | +24 HP, +5% dmg |  |
| 26 | 5418 | 36902 | Ascendant | +25 HP, +5% dmg | Altar: Inferno (with 2600 Ash spent above) |
| 27 | 5938 | 42320 | Ascendant | +26 HP, +5% dmg |  |
| 28 | 6482 | 48258 | Ascendant | +27 HP, +5% dmg |  |
| 29 | 7050 | 54740 | Ascendant | +28 HP, +5% dmg |  |
| 30 | 7642 | 61790 | Exarch | +29 HP, +6% dmg | Altar: Smoulder (with 0 Ash spent above) |
| 31 | 8258 | 69432 | Exarch | +30 HP, +6% dmg |  |
| 32 | 8898 | 77690 | Exarch | +31 HP, +6% dmg |  |
| 33 | 9562 | 86588 | Exarch | +32 HP, +6% dmg |  |
| 34 | 10250 | 96150 | Exarch | +33 HP, +6% dmg |  |
| 35 | 10962 | 106400 | Eternal | +34 HP, +7% dmg |  |
| 36 | 11698 | 117362 | Eternal | +35 HP, +7% dmg | Altar: Pyre (with 3000 Ash spent above) |
| 37 | 12458 | 129060 | Eternal | +36 HP, +7% dmg |  |
| 38 | 13242 | 141518 | Eternal | +37 HP, +7% dmg |  |
| 39 | 14050 | 154760 | Eternal | +38 HP, +7% dmg |  |
| 40 | 14882 | 168810 | Sovereign | +39 HP, +8% dmg |  |
| 41 | 15738 | 183692 | Sovereign | +40 HP, +8% dmg |  |
| 42 | 16618 | 199430 | Sovereign | +41 HP, +8% dmg | Altar: Furnace (with 7000 Ash spent above) |
| 43 | 17522 | 216048 | Sovereign | +42 HP, +8% dmg |  |
| 44 | 18450 | 233570 | Sovereign | +43 HP, +8% dmg |  |
| 45 | 19402 | 252020 | Paragon | +44 HP, +9% dmg |  |
| 46 | 20378 | 271422 | Paragon | +45 HP, +9% dmg |  |
| 47 | 21378 | 291800 | Paragon | +46 HP, +9% dmg |  |
| 48 | 22402 | 313178 | Paragon | +47 HP, +9% dmg | Altar: Heart of the Pyre (with 12000 Ash spent above) |
| 49 | 23450 | 335580 | Paragon | +48 HP, +9% dmg |  |
| 50 | — | 359030 | Deathless | +49 HP, +10% dmg |  |

**Mechanic unlocks** (hidden from the HUD, buttons and help until unlocked)

| Level | Unlock | What it does | Keys (PC / touch) |
|---|---|---|---|
| 2 | Gear & Inventory | Equip the helmets, armor, leggings and boots foes drop, in the Hall of Heroes or from the pause menu. The Blacksmith stars them up and salvages them. |  |
| 2 | Guard & Parry | Hold Guard to block hits from the front. Tap it just before a hit lands to parry: the foe staggers and your next attack is a sure critical. Ground shockwaves can only be dodged or jumped. | F / ⛨ |
| 2 | Healing Potion | Drink to restore health. It refills over time. | R / ⚗ |
| 3 | Cast | Hurl a shard that lodges in foes. Walk over it to pick it up again. | Q / Middle mouse / ◆ |
| 4 | Artifacts | One artifact slot. Find artifacts in the Underworld or pick one at the Artifact Shelf. | 1 / the artifact button |
| 5 | Jump & Slam | Leap over lava, chasms and shockwaves. Attack mid-air to Slam the ground. Also unlocks after slaying the final guardian. | Space / C / ⤒ |
| 6 | Enchantments | Enchanting Tomes now appear behind doors and in chests. |  |
| 7 | Hephaestus' Anvil | Anvils that reforge your weapon now appear in the Underworld. |  |
| 8 | Second Artifact Slot | Carry two artifacts at once. | 2 / the artifact button |
| 10 | Wrath | Fill the golden gauge by dealing and taking damage, then unleash your hero's ultimate. | V / ☄ |
| 12 | Third Artifact Slot | Carry three artifacts at once. | 3 / the artifact button |
| 13 | Awakened Weapons | Forge a weapon to Tier III at the Blacksmith to awaken it. |  |

## Hero skill trees (Ascension)

Each hero has their own tree at the *Ascension* stone. Experience earned while playing a hero raises their hero level (max 20); each level after the first gives one skill point for that hero only (19 at most, about 10070 experience). Rows cost 1, 1, 2 and 3 points per rank; a row opens once 2, 4, 7 points sit in the rows above it in that branch. Resetting is free.

| Hero level | XP to next |
|---|---|
| 1 | 80 |
| 2 | 130 |
| 3 | 180 |
| 4 | 230 |
| 5 | 280 |
| 6 | 330 |
| 7 | 380 |
| 8 | 430 |
| 9 | 480 |
| 10 | 530 |
| 11 | 580 |
| 12 | 630 |
| 13 | 680 |
| 14 | 730 |
| 15 | 780 |
| 16 | 830 |
| 17 | 880 |
| 18 | 930 |
| 19 | 980 |

*Kael*: Blade · Resolve · Ember

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Blade | 1 | ⚔ Keen Edge | 3 × 1 | +15% Attack damage |
| Blade | 2 | ✦ Riposte Instinct | 3 × 1 | +9% critical chance with Attack |
| Blade | 3 | ✺ Flame Arc | 2 × 2 | +24% Special damage |
| Blade | 4 | ♛ Ember Lord | 1 × 3 | +8% damage; critical hits deal +15% damage |
| Resolve | 1 | ♥ Hardened | 3 × 1 | +18 max Health |
| Resolve | 2 | ⛨ Steel Skin | 3 × 1 | Take 9% less damage |
| Resolve | 3 | ✚ Battle Hunger | 2 × 2 | Restore 2 Health per foe slain |
| Resolve | 4 | ♜ Unyielding | 1 × 3 | +20 max Health; potion heals +15% and recharges 15% faster |
| Ember | 1 | ☄ Kindling | 3 × 1 | Wrath fills 30% faster |
| Ember | 2 | » Quickstep | 3 × 1 | Dash recharges 24% faster |
| Ember | 3 | ◆ Ember Shard | 2 × 2 | +30% Cast damage |
| Ember | 4 | ✹ Phoenix Heart | 1 × 3 | +1 Dash charge; wrath fills 15% faster |

*Lyra*: Marksman · Wanderer · Moonlight

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Marksman | 1 | ➹ Steady Draw | 3 × 1 | +15% Attack damage |
| Marksman | 2 | ✦ Eagle Eye | 3 × 1 | +9% critical chance |
| Marksman | 3 | ✺ Volley | 2 × 2 | +24% Special damage |
| Marksman | 4 | ☾ Moonpiercer | 1 × 3 | Critical hits deal +25% damage; +4% critical chance with Attack |
| Wanderer | 1 | ➶ Light Feet | 3 × 1 | +12% move speed |
| Wanderer | 2 | ✚ Hunter’s Instinct | 3 × 1 | Restore 3 Health per foe slain |
| Wanderer | 3 | ♥ Thick Cloak | 2 × 2 | +16 max Health |
| Wanderer | 4 | ❖ Untouchable | 1 × 3 | Dash recharges 15% faster; take 6% less damage |
| Moonlight | 1 | ☄ Lunar Tide | 3 × 1 | Wrath fills 30% faster |
| Moonlight | 2 | ◆ Silver Shard | 3 × 1 | +45% Cast damage |
| Moonlight | 3 | ✧ Star Quiver | 2 × 2 | +2 Cast shards |
| Moonlight | 4 | ✹ Moonfall Mastery | 1 × 3 | Wrath fills 20% faster; +6% damage |

*Doran*: Phalanx · Bulwark · Aegis

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Phalanx | 1 | ↟ Long Reach | 3 × 1 | +15% Attack damage |
| Phalanx | 2 | ⛨ Shield Bash | 3 × 1 | +24% Special damage |
| Phalanx | 3 | ⚒ Breaker | 2 × 2 | +30% damage to armour |
| Phalanx | 4 | ♛ Spearhead | 1 × 3 | +8% damage; +10% damage to guardians and enchanted foes |
| Bulwark | 1 | ♥ Iron Hide | 3 × 1 | +24 max Health |
| Bulwark | 2 | ⛨ Stalwart | 3 × 1 | Take 9% less damage |
| Bulwark | 3 | ✚ Unbroken | 2 × 2 | Potion heals +24% and recharges 24% faster |
| Bulwark | 4 | ♜ Living Fortress | 1 × 3 | +30 max Health; take 5% less damage |
| Aegis | 1 | ☄ Rallying Cry | 3 × 1 | Wrath fills 30% faster |
| Aegis | 2 | ✊ Heavy Blows | 3 × 1 | +30% knockback |
| Aegis | 3 | ✚ Guardian’s Mend | 2 × 2 | All healing +20% |
| Aegis | 4 | ✹ Aegis Eternal | 1 × 3 | Wrath fills 15% faster; restore 2 Health per foe slain |

*Gorran*: Fury · Grit · Rhythm

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Fury | 1 | ✊ Hard Knuckles | 3 × 1 | +15% Attack damage |
| Fury | 2 | ✺ Haymaker | 3 × 1 | +36% Special damage |
| Fury | 3 | ✦ Pressure Points | 2 × 2 | +6% critical chance |
| Fury | 4 | ♛ Unstoppable | 1 × 3 | Attack and Special 10% faster; +6% damage |
| Grit | 1 | ♥ Brawler’s Hide | 3 × 1 | +24 max Health |
| Grit | 2 | ⛨ Shrug It Off | 3 × 1 | Take 9% less damage |
| Grit | 3 | ✚ Second Wind | 2 × 2 | Restore 2 Health per foe slain |
| Grit | 4 | ♜ Last Man Standing | 1 × 3 | +25 max Health; all healing +15% |
| Rhythm | 1 | ➶ Footwork | 3 × 1 | +12% move speed |
| Rhythm | 2 | ☄ Rage | 3 × 1 | Wrath fills 30% faster |
| Rhythm | 3 | » Rolling Punches | 2 × 2 | Dash recharges 20% faster |
| Rhythm | 4 | ✹ Hundred Hands | 1 × 3 | Attack and Special 8% faster; wrath fills 15% faster |

*Ione*: Flow · Stillness · Tide

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Flow | 1 | ⛓ Whirling Links | 3 × 1 | +15% Attack damage |
| Flow | 2 | ✺ Crashing Wave | 3 × 1 | +30% Special damage |
| Flow | 3 | ✦ Pinpoint | 2 × 2 | +8% critical chance with Special |
| Flow | 4 | ♛ River’s Wrath | 1 × 3 | +20% Special damage; +15% knockback |
| Stillness | 1 | ♥ Centred | 3 × 1 | +18 max Health |
| Stillness | 2 | ⛨ Calm Mind | 3 × 1 | Take 9% less damage |
| Stillness | 3 | ✚ Clear Water | 2 × 2 | Potion heals +24% and recharges 24% faster |
| Stillness | 4 | ♜ Unmoved | 1 × 3 | Take 6% less damage; all healing +15% |
| Tide | 1 | ☄ Undertow | 3 × 1 | Wrath fills 30% faster |
| Tide | 2 | ◆ Tide Shard | 3 × 1 | +45% Cast damage |
| Tide | 3 | ✧ Deep Current | 2 × 2 | +2 Cast shards |
| Tide | 4 | ✹ Spring Tide | 1 × 3 | Wrath fills 15% faster; +25% Cast damage |

*Erebos*: Reaping · Hunger · Night

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Reaping | 1 | ⚰ Wide Sweep | 3 × 1 | +15% Attack damage |
| Reaping | 2 | ✺ Grim Harvest | 3 × 1 | +36% Special damage |
| Reaping | 3 | ☠ Executioner | 2 × 2 | +16% damage to guardians and enchanted foes |
| Reaping | 4 | ♛ Lord of the Dead | 1 × 3 | +8% damage; critical hits deal +15% damage |
| Hunger | 1 | ✚ Feast | 3 × 1 | Restore 3 Health per foe slain |
| Hunger | 2 | ♥ Grave Robes | 3 × 1 | +24 max Health |
| Hunger | 3 | ⛨ Bloodied Mist | 2 × 2 | Take 6% less damage |
| Hunger | 4 | ♜ Undying King | 1 × 3 | Restore 2 Health per foe slain; all healing +20% |
| Night | 1 | ✧ Echo Hunger | 3 × 1 | +45% Echoes gathered |
| Night | 2 | ⚙ Dark Relics | 3 × 1 | Artifacts recharge 24% faster |
| Night | 3 | ☄ Night’s Embrace | 2 × 2 | Wrath fills 24% faster |
| Night | 4 | ✹ Eclipse Eternal | 1 × 3 | Wrath fills 20% faster; +25% Echoes gathered |

*Rook*: Firepower · Grit · Powder

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Firepower | 1 | ✹ Heavy Shot | 3 × 1 | +15% Attack damage |
| Firepower | 2 | ✦ Point Blank | 3 × 1 | +9% critical chance with Attack |
| Firepower | 3 | ✺ Big Bore | 2 × 2 | +24% Special damage |
| Firepower | 4 | ♛ Broadside | 1 × 3 | +8% damage; +20% knockback |
| Grit | 1 | ♥ Leather Coat | 3 × 1 | +18 max Health |
| Grit | 2 | ⛨ Hard Cover | 3 × 1 | Take 9% less damage |
| Grit | 3 | ✚ Field Rations | 2 × 2 | Potion heals +24% and recharges 24% faster |
| Grit | 4 | ♜ Iron Nerve | 1 × 3 | +20 max Health; take 5% less damage |
| Powder | 1 | » Quick Reload | 3 × 1 | Dash recharges 24% faster |
| Powder | 2 | ☄ Powder Keg | 3 × 1 | Wrath fills 30% faster |
| Powder | 3 | ◆ Shrapnel | 2 × 2 | +30% Cast damage |
| Powder | 4 | ✹ Cannonade Mastery | 1 × 3 | Wrath fills 15% faster; +12% damage to guardians and enchanted foes |

*Selene*: Edge · Poise · Starlight

| Branch | Row | Skill | Ranks × points | At max rank |
|---|---|---|---|---|
| Edge | 1 | ⚔ Iaido | 3 × 1 | +15% Attack damage |
| Edge | 2 | ✦ Clean Cut | 3 × 1 | +12% critical chance with Attack |
| Edge | 3 | ✺ Crescent | 2 × 2 | +24% Special damage |
| Edge | 4 | ♛ Thousand Cuts | 1 × 3 | Critical hits deal +25% damage; attack and Special 6% faster |
| Poise | 1 | ➶ Grace | 3 × 1 | +12% move speed |
| Poise | 2 | ⛨ Parry Master | 3 × 1 | Take 9% less damage |
| Poise | 3 | ♥ Composure | 2 × 2 | +16 max Health |
| Poise | 4 | ♜ Perfect Form | 1 × 3 | Dash recharges 15% faster; restore 2 Health per foe slain |
| Starlight | 1 | ☄ Falling Star | 3 × 1 | Wrath fills 30% faster |
| Starlight | 2 | » Comet Step | 3 × 1 | +45% Dash-Strike damage |
| Starlight | 3 | ◆ Star Shard | 2 × 2 | +30% Cast damage |
| Starlight | 4 | ✹ Starfall Mastery | 1 × 3 | Wrath fills 20% faster; +6% damage |

## Heroes and Wrath

Choose a hero in the *Hall of Heroes*. Wrath (unlocks at level 10) fills by 3.13 per 100 damage dealt and 0.8 per damage taken; 100 unleashes the hero's ultimate.

| Hero | Class | Weapon | Guard | Unlock | Perks | Wrath | Wrath effect |
|---|---|---|---|---|---|---|---|
| Kael, Prince of Embers | Warrior | Nightblade | parry | Start | Balanced: no strengths, no weaknesses; +10% Wrath gain | Inferno Nova | A ring of hellfire bursts outward three times, burning everything it touches. |
| Lyra, Moon Huntress | Ranger | Moonbow | evade | Start | +12% move speed; +8% critical chance; −10 max Health | Moonfall | Beams of moonlight strike every foe in sight three times. |
| Doran, The Bronze Wall | Vanguard | Thornspear | shield | Start | +30 max Health; Take 12% less damage; −8% move speed | Titan's Quake | Three quakes roll out from you, stunning and crushing foes. |
| Gorran, The Unchained Fist | Brawler | Titan Gauntlets | catch | Reach level 7 or slay a guardian | Combo meter builds twice as fast; +20 max Health | Hundred Fists | A storm of punches in front of you, ending in a crushing blast. |
| Ione, Tidecaller | Monk | Riptide Chains | catch | Reach level 10 or slay 3 guardians | +1 Cast shard (once Cast is unlocked); +20% Special damage; +15% knockback | Tidal Surge | A tidal wave hurls every nearby foe away, chilling them to the bone. |
| Erebos, The Hollow King | Reaper | Reaper's Crescent | mist | Reach level 14 or slay 6 guardians | +10% damage; Restore 2 Health per foe slain; +50% Echoes gathered; −15 max Health | Eclipse | Darkness falls: every foe in sight is stunned and Doomed, and you drink their life. |
| Rook, The Powder Ghost | Gunner | Thunderbuss | evade | Reach level 18 or escape once | Hits on foes close to you deal +30% damage; +15% knockback | Cannonade | Cannon shots rain down on the foes around you. |
| Selene, Starbound | Duelist | Starsplitter | parry | Reach level 22 or escape 3 times | +1 Dash charge; +15% Attack damage; Dash recharges 20% faster | Starfall | A storm of falling stars pounds the area around you. |

Guard styles: *parry* (widest parry window), *shield* (blocks all frontal damage; Attack while guarding bashes), *evade* (a sidestep; one right before a hit is a Perfect Dodge), *catch* (wide parry window), *mist* (blocked damage becomes Echoes).

## Weapons, forging and anvil upgrades

Each weapon belongs to one class (hero): picking the hero picks the weapon. Every weapon chains on taps, and holding Attack after a chain hit starts its powered attack.

| Weapon | Id | Class | Hero | Description |
|---|---|---|---|---|
| Nightblade | sword | Warrior | Kael | Slash, backslash, heavy cleave. Powered: Crescent Cleave throws a blade wave. Special: Nova Smash knocks back everything nearby. |
| Thornspear | spear | Vanguard | Doran | Long-reach thrusts. Powered: Skewer Lance runs a whole line through; keep holding to spin. Special: throw the spear, press again to recall it. |
| Moonbow | bow | Ranger | Lyra | Tap for quick shots (every third is a triple). Hold to draw a Power Shot; draw right after quick shots for Rain of Arrows. Special: a wide volley. |
| Titan Gauntlets | fists | Brawler | Gorran | A blur of five punches. Powered: Titan Uppercut stuns and shakes the ground. Special: Meteor Fist rockets you forward into a shockwave. |
| Riptide Chains | nunchaku | Monk | Ione | Six flowing strikes ending in a whirl. Powered: Whirlpool pulls foes in. Special: Tidal Snap drags a foe to you. |
| Reaper's Crescent | scythe | Reaper | Erebos | Wide sweeps that end in a full spin. Powered: Harvest drags foes in for a giant reap. Special: Soul Reap sends a spectral scythe whirling around you. |
| Thunderbuss | blunderbuss | Gunner | Rook | Spread shots, then a piercing slug. Powered: Grapeshot Cannon. Special: a Powder Keg that blows up after a short fuse. |
| Starsplitter | katana | Duelist | Selene | Three lightning-fast draw-cuts. Powered: Moonlit Iaido blinks you through foes. Special: Thousand Cuts. |

**Forge tiers** (per weapon, at the Blacksmith once he has his Whetstone)

| Tier | Ash | Level needed | Effect |
|---|---|---|---|
| Tier I | — | 1 | Base weapon |
| Tier II · Tempered | 30 | 3 | +10% weapon damage |
| Tier III · Awakened | 120 | 13 | +20% weapon damage. Every 4th Attack unleashes an arcane wave. |
| Tier IV · Exalted | 400 | 16 | +30% weapon damage. Waves grow larger. |
| Tier V · Mythic | 900 | 20 | +45% weapon damage. Waves split in three and the weapon blazes. |

**Hephaestus' Anvil upgrades** (one per anvil, per run)

*Nightblade*

| Upgrade | Effect |
|---|---|
| Thirsting Edge | Your Attack restores 1 Health per hit. |
| Echoing Nova | Your Special strikes twice in quick succession. |
| Armorbane Edge | Your Attack deals +300% damage to Armor. |
| Backstabber's Edge | Your Attack deals +200% damage striking foes from behind. |
| Nova Lunge | Your Dash-Strike unleashes a Nova Smash. |

*Thornspear*

| Upgrade | Effect |
|---|---|
| Armorpiercer | Your Attack deals +400% damage to Armor. |
| Long Reach | Your Attack reaches +40% farther. |
| Blast Tip | Your thrown spear explodes on impact for 50 area damage. |
| Whirlwind | Your Spin Attack charges 50% faster and deals +100% damage. |
| Vengeful Return | Your recalled spear deals +200% damage. |

*Moonbow*

| Upgrade | Effect |
|---|---|
| Paired Arrows | Your Attack fires 2 arrows side by side. |
| Skewering Volley | Your Special arrows pierce through foes. |
| Bullseye | Your Power Shots deal +150% damage. |
| Fan of Arrows | Your Special fires 4 additional arrows. |
| Quick Draw | Your Attack charges 35% faster. |

*Titan Gauntlets*

| Upgrade | Effect |
|---|---|
| Crushing Blows | Your Attack deals +40% damage. |
| Meteor Crater | Your Special shockwave is 60% larger and deals +100% damage. |
| Life Tap | The final blow of your Attack combo restores 3 Health. |
| Aftershock | Your Dash-Strike also releases a 30-damage shockwave. |

*Riptide Chains*

| Upgrade | Effect |
|---|---|
| Flowing Current | Your Attack deals +25% damage. |
| Maelstrom | Whirlpool pulls from 50% farther and strikes 3 more times. |
| Undertow | Tidal Snap stuns the foe it pulls for 1.5 s. |

*Reaper's Crescent*

| Upgrade | Effect |
|---|---|
| Wide Arc | Your Attack reaches +30% farther. |
| Twin Specters | Your Special summons two spectral scythes. |
| Death Mark | Your Attack inflicts Doom: 60 damage after a short delay. |
| Lingering Shade | Your Special lasts 80% longer. |

*Thunderbuss*

| Upgrade | Effect |
|---|---|
| Packed Charge | Your spread shots fire 3 more pellets. |
| Heavy Slug | Your slug deals +50% damage and passes through 3 more foes. |
| Black Powder | Your Powder Keg's blast is 50% larger. |

*Starsplitter*

| Upgrade | Effect |
|---|---|
| Moonlit Edge | Your Attack deals +30% damage. |
| Endless Flurry | Thousand Cuts strikes 4 more times. |
| Lingering Cut | Moonlit Iaido's delayed slashes deal +100% damage. |

## Gods and boons

Boons fill four ability slots (Attack, Special, Cast, Dash) plus unlimited passives. A run allows boons from up to 4 Olympians (Hermes is extra).
Values shown are Common, level 1. Rarity multiplies the value; each Pomegranate level adds the boon's per-level fraction of the base.

| Rarity | Multiplier |
|---|---|
| common | ×1 |
| rare | ×1.3 |
| epic | ×1.6 |
| heroic | ×2 |

### ϟ Zeus — King of Olympus

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Thunder Edge | attack | Your Attack calls down a lightning bolt on foes, dealing 10 damage. |  |
| Forked Wrath | special | Your Special unleashes chain lightning that bounces 4 times, dealing 20 damage. |  |
| Storm Shard | cast | Your Cast becomes a storm shard that strikes nearby foes with lightning for 15 damage, repeatedly. |  |
| Thunder Step | dash | Your Dash calls lightning on nearby foes, dealing 15 damage. |  |
| Heaven's Retort | passive | When you are struck, a bolt hits your attacker for 60 damage. |  |
| Overcharge | passive | Your lightning effects deal +30% damage. | one of: Thunder Edge, Forked Wrath, Storm Shard, Thunder Step, Heaven's Retort |

### Ψ Poseidon — Lord of the Sea

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Tidal Edge | attack | Your Attack deals +30% damage and knocks foes away. |  |
| Riptide Strike | special | Your Special deals +50% damage and knocks foes away. |  |
| Breaker Shard | cast | Your Cast bursts into a crashing wave on impact, dealing 60 damage and knocking foes away. |  |
| Undertow Dash | dash | Your Dash creates a splash that deals 25 damage and knocks foes away. |  |
| Sunken Treasure | passive | Obols you find are worth +50%. |  |
| Crashing Surf | passive | Foes knocked into walls take 60 damage. | one of: Tidal Edge, Riptide Strike, Breaker Shard, Undertow Dash |

### ◈ Athena — Goddess of Wisdom

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Aegis Edge | attack | Your Attack deals +35% damage and deflects projectiles. |  |
| Bulwark Strike | special | Your Special deals +55% damage and deflects projectiles. |  |
| Sentinel Shard | cast | Your Cast bursts on impact for 70 damage, destroying nearby enemy projectiles. |  |
| Aegis Dash | dash | Your Dash deals 15 damage and deflects projectiles. |  |
| Sacred Ward | passive | The first hit you take in each encounter deals no damage. |  |
| Steadfast | passive | You take 10% less damage. |  |

### ⚔ Ares — God of War

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Curse of Ruin | attack | Your Attack inflicts Doom: after a moment the foe takes 50 damage. |  |
| Curse of Wrath | special | Your Special inflicts Doom, dealing 70 damage after a moment. |  |
| Blade Rift Shard | cast | Your Cast tears open a spinning blade rift that deals 12 damage several times per second. |  |
| Rending Dash | dash | Your Dash leaves behind a blade rift that deals 8 damage several times per second. |  |
| Bloodlust | passive | Deal up to +30% damage, increasing as your health drops. |  |
| Dire Ruin | passive | Doom deals +40% damage. | one of: Curse of Ruin, Curse of Wrath |

### ♥ Aphrodite — Goddess of Love

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Heartbreak Edge | attack | Your Attack deals +50% damage and inflicts Weak (foes deal less damage). |  |
| Lovesick Strike | special | Your Special deals +70% damage and inflicts Weak. |  |
| Swoon Shard | cast | Your Cast detonates at short range for 90 damage, inflicting Weak. |  |
| Rapture Dash | dash | Your Dash ends in a burst of hearts dealing 20 damage and inflicting Weak. |  |
| Lover's Vigor | passive | Gain +25 max Health. |  |
| Shattered Will | passive | Weak foes deal an extra 15% less damage. | one of: Heartbreak Edge, Lovesick Strike, Swoon Shard, Rapture Dash |

### ☾ Artemis — Goddess of the Hunt

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Deadly Edge | attack | Your Attack deals +20% damage and has +12% critical chance. |  |
| Hunter's Strike | special | Your Special deals +40% damage and has +18% critical chance. |  |
| Seeking Shard | cast | Your Cast seeks foes and pierces through them, dealing 70 damage with +15% critical chance. |  |
| Stalker's Dash | dash | Your Dash-Strike deals +60% damage. |  |
| Keen Eye | passive | Everything you do has +5% critical chance. |  |
| Mortal Wound | passive | Your critical hits deal +25% damage. | one of: Deadly Edge, Hunter's Strike, Seeking Shard, Keen Eye |

### ❦ Dionysus — God of Wine

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Drunken Edge | attack | Your Attack inflicts Hangover: 4 damage per second per stack. |  |
| Tipsy Strike | special | Your Special inflicts Hangover: 6 damage per second per stack. |  |
| Revelry Shard | cast | Your Cast bursts into a festive fog that deals 20 damage per second and inflicts Hangover. |  |
| Staggering Dash | dash | Your Dash leaves a cloud of fog that deals 12 damage per second. |  |
| Last Call | passive | If your Health is below 30% after an encounter, restore it to 30%. |  |
| Bottomless Cup | passive | Hangover can stack 2 more times. | one of: Drunken Edge, Tipsy Strike, Revelry Shard, Staggering Dash |

### ❄ Demeter — Goddess of Seasons

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Frost Edge | attack | Your Attack deals +40% damage and inflicts Chill, slowing foes. |  |
| Rime Strike | special | Your Special deals +60% damage and inflicts Chill. |  |
| Winter Shard | cast | Your Cast bursts into a frost nova dealing 50 damage and heavily Chilling foes. |  |
| Frost Dash | dash | Your Dash releases a chilling nova dealing 15 damage. |  |
| Harvest Blessing | passive | Healing effects are +30% stronger. Gain +10 max Health. |  |
| Shattering Frost | passive | Foes reaching maximum Chill shatter, taking 80 damage. | one of: Frost Edge, Rime Strike, Winter Shard, Frost Dash |

### ➶ Hermes — Messenger of the Gods

| Boon | Slot | Common Lv 1 | Needs |
|---|---|---|---|
| Second Step | passive | Gain +1 Dash charge. |  |
| Fleet Foot | passive | You move +15% faster. |  |
| Quicksilver Strikes | passive | Your Attack and Special are +10% faster. |  |
| Windstep | passive | Your Dash recharges 25% faster. |  |
| Rebound | passive | After taking damage, Dash quickly to recover 30% of the Health you lost. |  |
| Returning Shards | passive | Your Cast shards regenerate on their own every 5.0s. |  |
| Extra Shard | passive | Gain +1 Cast shard. |  |

### Duo boons

| Boon | Gods | Effect |
|---|---|---|
| Tempest Tide | Zeus + Poseidon | Whenever you knock foes away, they are also struck by lightning for 30 damage. |
| Ruinous Embrace | Ares + Aphrodite | Doom also inflicts Weak, and you deal +40% damage to Weak foes. |
| Frostwine | Dionysus + Demeter | Hangover damage also Chills foes, and Chilled foes take +30% Hangover damage. |
| Hunter's Ruin | Ares + Artemis | Doom and blade rifts can deal critical damage (+25% chance). |
| Storm Aegis | Zeus + Athena | Projectiles you deflect crackle with lightning, striking foes for 40 damage. |
| Cold Current | Poseidon + Demeter | Knocking foes away fully Chills them, and wall slams deal double damage. |

## Enchantments

Found in Enchanting Tomes. Finding one again raises its tier (max 3).

| Enchantment | Tier I | Tier II | Tier III |
|---|---|---|---|
| ≋ Reverberation | Your Attack has a 15% chance to strike again a moment later. | Your Attack has a 25% chance to strike again a moment later. | Your Attack has a 35% chance to strike again a moment later. |
| ⛓ Shackling | Hits have a 10% chance to chain nearby foes to your target, rooting them. | Hits have a 18% chance to chain nearby foes to your target, rooting them. | Hits have a 26% chance to chain nearby foes to your target, rooting them. |
| ✹ Combustion | Slain foes explode, dealing 20% of their max Health to foes nearby. | Slain foes explode, dealing 35% of their max Health to foes nearby. | Slain foes explode, dealing 50% of their max Health to foes nearby. |
| ✚ Bloodthirst | Slaying a foe restores 2 Health. | Slaying a foe restores 3 Health. | Slaying a foe restores 4 Health. |
| ⚡ Frenzy | Slaying a foe has a 10% chance to grant +50% attack speed for 5s. | Slaying a foe has a 15% chance to grant +50% attack speed for 5s. | Slaying a foe has a 20% chance to grant +50% attack speed for 5s. |
| ⚔ Executioner | Deal up to +30% damage to wounded foes. | Deal up to +50% damage to wounded foes. | Deal up to +70% damage to wounded foes. |
| ◎ Singularity | Your Special and Jump Slam pull foes toward the impact (radius +40). | Your Special and Jump Slam pull foes toward the impact (radius +80). | Your Special and Jump Slam pull foes toward the impact (radius +120). |
| ✦ Concussive | Hits have a 5% chance to stun foes for 1.5s. | Hits have a 9% chance to stun foes for 1.5s. | Hits have a 13% chance to stun foes for 1.5s. |
| ☀ Bloom | Hits have a 6% chance to bloom a healing circle around you. | Hits have a 10% chance to bloom a healing circle around you. | Hits have a 14% chance to bloom a healing circle around you. |
| ◆ Treasure Sense | Find +30% more obols and more treasure chests. | Find +60% more obols and more treasure chests. | Find +90% more obols and more treasure chests. |
| ✧ Echo Harvest | Hits have a 12% chance to grant 3 Echoes for your artifacts. | Hits have a 12% chance to grant 4 Echoes for your artifacts. | Hits have a 12% chance to grant 5 Echoes for your artifacts. |
| ✺ Whirling | Your Dash-Strike and Jump Slam release a spinning strike dealing 25 damage around you. | Your Dash-Strike and Jump Slam release a spinning strike dealing 40 damage around you. | Your Dash-Strike and Jump Slam release a spinning strike dealing 55 damage around you. |
| ♨ Searing | Hits set foes ablaze for 3 damage per second. | Hits set foes ablaze for 5 damage per second. | Hits set foes ablaze for 7 damage per second. |

## Artifacts

| Artifact | Uses | Starting-artifact unlock (Ash) | Effect |
|---|---|---|---|
| ♣ Mending Totem | 26s cooldown | Owned | Plants a totem that heals you while you stand near it. |
| ϟ Thunder Rod | 14s cooldown | Owned | Calls lightning down on up to four nearby foes for 60 damage each. |
| ❂ Gale Horn | 11s cooldown | 15 | A mighty blast of wind hurls nearby foes away, slows them and scatters projectiles. |
| ♞ Bone Whistle | 32s cooldown | 25 | Summons a shade-wolf companion that hunts foes for 25 seconds. |
| ⛨ Stoneskin Charm | 24s cooldown | 20 | For 6 seconds you take 50% less damage. |
| ✷ Ember Volley | 13s cooldown | 20 | Launches three seeking ember rockets that explode for 45 damage. |
| ✦ Thunder Dust | 16s cooldown | 30 | Stuns every nearby foe for 2.5 seconds. |
| ◉ Bell of Ruin | 18s cooldown | 30 | A resounding gong deals 30 damage and Weakens every foe nearby. |
| ⚗ Fury Draught | 26s cooldown | 25 | For 8 seconds you move and strike 40% faster. |
| ♁ Spirit Lantern | 30 Echoes | 35 | Spend 30 Echoes: a lantern spirit fights at your side for 14 seconds. |
| ☽ Echo Reaper | 40 Echoes | 35 | Spend 40 Echoes: unleash a burst of echoes dealing 120 damage around you. |
| ⌖ Void Prism | 10 Echoes | 50 | Channel a searing beam toward your aim. Drains Echoes while active. |

## Altar of Ashes (permanent upgrades for every hero)

Bought with Ash. Each table runs from its weakest upgrades (section I) to its strongest; a section opens at its level once enough Ash has been spent on the sections above it. The Deep Altar opens when every upgrade on the Altar of Ashes is complete. Everything costs 36128 Ash in all.

**Altar of Ashes**

| Section | Opens at | Upgrade | Ranks | Ash per rank | At max rank |
|---|---|---|---|---|---|
| I Embers | Lv 1 | ♥ Vitality | 4 | 13 / 26 / 45 / 70 | +32 max Health |
| I Embers | Lv 1 | ◎ Ferryman’s Purse | 3 | 13 / 33 / 59 | Begin each escape with 120 obols |
| I Embers | Lv 1 | ➶ Swiftness | 3 | 20 / 40 / 65 | +12% move speed |
| II Cinders | Lv 4, 120 Ash spent above | ⚔ Fury | 4 | 20 / 39 / 65 / 104 | +16% damage |
| II Cinders | Lv 4, 120 Ash spent above | ⚗ Alchemy | 2 | 33 / 78 | Potion recharges 40% faster and heals +20% |
| II Cinders | Lv 4, 120 Ash spent above | ✧ Echocraft | 2 | 26 / 65 | +50 max Echoes, +40% Echoes gathered |
| II Cinders | Lv 4, 120 Ash spent above | ✚ Bloodlust | 2 | 40 / 90 | Restore 2 Health per foe slain |
| III Flames | Lv 10, 500 Ash spent above | ⛨ Iron Will | 3 | 26 / 59 / 104 | Take 12% less damage |
| III Flames | Lv 10, 500 Ash spent above | ◆ Shard Keeper | 2 | 33 / 98 | +2 Cast shards |
| III Flames | Lv 10, 500 Ash spent above | ⚙ Tinkerer | 3 | 26 / 59 / 104 | Artifacts recharge 30% faster |
| III Flames | Lv 10, 500 Ash spent above | ✦ Precision | 3 | 45 / 90 / 150 | +9% critical chance |
| IV Blaze | Lv 18, 1300 Ash spent above | » Fleet Shadow | 1 | 260 | +1 Dash charge |
| IV Blaze | Lv 18, 1300 Ash spent above | ✧ Favor of the Gods | 3 | 60 / 120 / 230 | Boons are more often Rare or better: +9.75% (not an escape's first boon) |
| IV Blaze | Lv 18, 1300 Ash spent above | ☄ Wrathful | 3 | 70 / 140 / 230 | Wrath fills 45% faster |
| IV Blaze | Lv 18, 1300 Ash spent above | ☠ Giantslayer | 2 | 110 / 220 | +20% damage to guardians and enchanted foes |
| V Inferno | Lv 26, 2600 Ash spent above | ⚡ Godslayer | 2 | 350 / 700 | +12% damage and +20 max Health |
| V Inferno | Lv 26, 2600 Ash spent above | ✚ Death’s Reprieve | 2 | 900 / 2000 | Cheat death 2 times per escape |

**The Deep Altar**

| Section | Opens at | Upgrade | Ranks | Ash per rank | At max rank |
|---|---|---|---|---|---|
| I Smoulder | Lv 30 | ♥ Colossus | 3 | 400 / 600 / 850 | +36 max Health |
| I Smoulder | Lv 30 | ⚔ Warlord | 3 | 450 / 700 / 1000 | +15% damage |
| I Smoulder | Lv 30 | ◎ Ferryman’s Tithe | 2 | 300 / 600 | +40% obols found |
| II Pyre | Lv 36, 3000 Ash spent above | ✧ Echo Well | 2 | 700 / 1200 | Begin each escape with 80% Echoes |
| II Pyre | Lv 36, 3000 Ash spent above | » Phantom Step | 2 | 600 / 1000 | Dash recharges 30% faster; Dash-Strike +30% damage |
| II Pyre | Lv 36, 3000 Ash spent above | ⛨ Titan’s Blood | 3 | 600 / 900 / 1300 | Take 12% less damage |
| III Furnace | Lv 42, 7000 Ash spent above | ✦ Ruin | 2 | 1000 / 1600 | Critical hits deal +40% damage |
| III Furnace | Lv 42, 7000 Ash spent above | ◆ Deep Quiver | 1 | 1400 | +1 Cast shard |
| III Furnace | Lv 42, 7000 Ash spent above | ✧ Exalted Favor | 2 | 900 / 1400 | Boons are more often Rare or better: a further +6.5% |
| IV Heart of the Pyre | Lv 48, 12000 Ash spent above | ⚡ Ascendant | 2 | 2500 / 4000 | +16% damage and +30 max Health |
| IV Heart of the Pyre | Lv 48, 12000 Ash spent above | ✚ Undying | 1 | 5000 | Cheat death 1 more time per escape |

## The Blacksmith

He stars up, reforges and salvages gear in the Hall from the start of the game (starring up needs only materials). Each forge part he gets back lets him do more:

| Part | Found | Unlocks |
|---|---|---|
| ◇ Whetstone | Slay Vexa, guardian of the Shackled Deep | Weapon forging: temper your hero’s weapon with Ash |
| ⟟ Ember Tongs | Slay the Many-Maw | Reforging: roll a piece’s bonuses anew |
| ◒ Crucible | Slay Aurex | Crafting: plain and Rare gear, of the slot you choose |
| ♒ Great Bellows | Slay Threefang | Crafting: Epic gear |
| ♦ Anvil Heart | Slay any guardian under the Oath of Torment | Crafting: Legendary gear |

## Loot and gear

The Gear & Inventory screen opens at level 2; loot drops from the first escape. Foes drop materials; gear drops from foes (12%), enchanted foes (35%), chests (30%) and guardians (always). Every drop chance is listed under *Probabilities*. Up to 40 pieces are kept; a full inventory salvages new finds.

**Plain and starred pieces.** Common and Uncommon pieces are *plain*: no stars, and they can't be starred up (salvage them for materials). Rare and better pieces drop with stars: one star usually, each extra star half as likely, up to a cap set by your level. Legendary pieces come only from guardians.

| Material | Source |
|---|---|
| ☗ Bone Dust | Dropped by foes everywhere. The basic crafting material. |
| ♦ Ember Shard | Dropped by foes in the Shackled Deep and the Ember Fields. |
| ✹ Golden Ichor | Dropped by foes in the Gilded Groves. |
| ● Gate Pearl | Dropped by foes at the Last Gate. |
| ⬢ Titan Scale | Dropped by guardians and enchanted foes. Rare. |

| Tier | Bonuses | Bonus strength × | Bonus roll | Stars | Drops from | Perk |
|---|---|---|---|---|---|---|
| Common | 1 | 1 | 0.80–1.25 | None (plain) | Any drop that rolls no star | — |
| Uncommon | 2 | 1.15 | 0.80–1.25 | None (plain) | Any drop that rolls no star | — |
| Rare | 2 | 1.3 | 0.80–1.25 | 1–10 | Foes, Enchanted foes, Chests, Guardians | — |
| Epic | 3 | 1.55 | 0.80–1.25 | 1–10 | Enchanted foes, Chests, Guardians | — |
| Legendary | 4 | 1.85 | 0.80–1.25 | 1–10 | Guardians | — |
| Unique | 4 | 2.1 | 0.80–1.25 | 1–10 | Enchanted foes, Guardians | One Unique perk |
| Ghost | 5 | 2.5 | 1.00–1.25 | 1–10 | Any foe (0.1% a kill) | One Ghost perk |

A bonus is its base value × roll × tier strength × star bonus. Ghost bonuses never roll low: the weakest Ghost bonus (2.50× base) beats the best Legendary one (2.31×).

| Perk | Tier | Effect |
|---|---|---|
| Second Breath | Unique | +1 Death Defiance each escape. |
| Fleetfoot | Unique | +1 dash charge. |
| Leech | Unique | Heal 2 health for every foe slain. |
| Giantbane | Unique | +25% damage to guardians and enchanted foes. |
| Deep Quiver | Unique | +1 cast shard. |
| Keen Edge | Unique | Critical hits deal +50% more damage. |
| Artificer | Unique | Artifacts recharge 20% faster. |
| Phantom Step | Ghost | +1 dash charge and dashes recharge 25% faster. |
| Wraithblood | Ghost | Heal 4 health for every foe slain, and +15% damage. |
| Revenant | Ghost | +1 Death Defiance and +20 max health. |
| Spectral Ward | Ghost | Take 15% less damage and move 10% faster. |

| Bonus | Common, level 1 (typical) | Slots |
|---|---|---|
| +8 max health | 8 | Helmet, Breastplate, Leggings, Boots |
| +4% damage | 4% | Helmet, Breastplate, Leggings, Boots |
| +3% move speed | 3% | Leggings, Boots |
| +2% critical chance | 2% | Helmet, Breastplate |
| −3% damage taken | 3% | Breastplate, Leggings, Helmet |
| −6% dash recharge | 6% | Boots |
| +6% obols found | 6% | Helmet, Breastplate, Leggings, Boots |
| +8% Echoes gathered | 8% | Helmet, Breastplate |
| +6% Wrath gain | 6% | Helmet |
| +6% potion healing | 6% | Breastplate |

Rare and better pieces are starred up from 1 to 10 stars. Stars 2–5 are gold and add 15% to every bonus each; stars 6–10 turn the gold stars purple one by one and add 20% each.

| Stars | Bonus × | Next star (Rare) | Next star (Epic) | Next star (Ghost) |
|---|---|---|---|---|
| ★ gold | 1.00 | 6 ☗ · 2 ♦ | 6 ☗ · 2 ✹ · 1 ⬢ | 6 ☗ · 2 ● · 1 ⬢ |
| ★★ gold | 1.15 | 12 ☗ · 4 ♦ | 12 ☗ · 4 ✹ · 2 ⬢ | 12 ☗ · 4 ● · 2 ⬢ |
| ★★★ gold | 1.30 | 18 ☗ · 6 ♦ | 18 ☗ · 6 ✹ · 3 ⬢ | 18 ☗ · 6 ● · 3 ⬢ |
| ★★★★ gold | 1.45 | 24 ☗ · 8 ♦ | 24 ☗ · 8 ✹ · 4 ⬢ | 24 ☗ · 8 ● · 4 ⬢ |
| ★★★★★ gold | 1.60 | 30 ☗ · 10 ♦ · 1 ⬢ | 30 ☗ · 10 ✹ · 6 ⬢ | 30 ☗ · 10 ● · 6 ⬢ |
| ★ purple + ★★★★ gold | 1.80 | 36 ☗ · 12 ♦ · 2 ⬢ | 36 ☗ · 12 ✹ · 8 ⬢ | 36 ☗ · 12 ● · 8 ⬢ |
| ★★ purple + ★★★ gold | 2.00 | 42 ☗ · 14 ♦ · 3 ⬢ | 42 ☗ · 14 ✹ · 10 ⬢ | 42 ☗ · 14 ● · 10 ⬢ |
| ★★★ purple + ★★ gold | 2.20 | 48 ☗ · 16 ♦ · 4 ⬢ | 48 ☗ · 16 ✹ · 12 ⬢ | 48 ☗ · 16 ● · 12 ⬢ |
| ★★★★ purple + ★ gold | 2.40 | 54 ☗ · 18 ♦ · 5 ⬢ | 54 ☗ · 18 ✹ · 14 ⬢ | 54 ☗ · 18 ● · 14 ⬢ |
| ★★★★★ purple +  gold | 2.60 | — | — | — |

| Recipe | Makes | Cost |
|---|---|---|
| Plain piece | Common 70%, Uncommon 30% | 25 ☗ · 6 ♦ |
| Fine piece (1★ Rare) | Rare 100% | 40 ☗ · 6 ✹ |
| Grand piece (1★ Epic) | Epic 100% | 60 ☗ · 6 ● · 3 ⬢ |
| Legendary piece (1★ Legendary) | Legendary 100% | 140 ☗ · 18 ● · 12 ⬢ |


## Regions and guardians

| # | Region | Subtitle | Combat chambers | Hazard | Foe Health × | Foe damage × | Guardian |
|---|---|---|---|---|---|---|---|
| 1 | The Shackled Deep | Where the Damned Are Chained | 5 | spikes | 1 | 1 | Vexa, Warden of Chains |
| 2 | The Ember Fields | Meadows of Cinder and Ash | 5 | lava | 1.35 | 1.2 | The Many-Maw, Coiled Terror of the Fields |
| 3 | The Gilded Groves | Gardens of the Honored Dead | 5 | pits | 1.75 | 1.4 | Aurex, the Gilded Colossus |
| 4 | The Last Gate | Where the Hound Keeps Watch | 0 | none | 2 | 1.6 | Threefang, Hound of the Last Gate |

**Enemy pools** (spawn weights per region)

| Region | Foes (weight) |
|---|---|
| The Shackled Deep | Ghoul (5), Numbling (4), Wisp (2), Hissling (2), Brute (1) |
| The Ember Fields | Numbling (3), Lobber (3), Sentinel (2), Brute (2), Hissling (3), Wisp (2), Weaver (2) |
| The Gilded Groves | Gilded Hoplite (3), Gorgehorn (3), Wisp (2), Sentinel (2), Bonecaller (1), Weaver (2), Ghoul (2) |
| The Last Gate | Ghoul (1), Wisp (1) |

**Guardians** (base values; see DESIGN.md for their attacks)

| Guardian | Title | Health | Armor | Contact damage |
|---|---|---|---|---|
| Vexa | Warden of Chains | 2400 | — | 13 |
| The Many-Maw | Coiled Terror of the Fields | 3400 | — | 18 |
| Aurex | the Gilded Colossus | 4200 | 800 | 20 |
| Threefang | Hound of the Last Gate | 5600 | — | 22 |

## Enemies

*Cost* is the encounter-budget price: chambers buy foes with a budget that grows with depth and region.

| Foe | Id | Health | Damage | Speed | Cost | Obols dropped |
|---|---|---|---|---|---|---|
| Ghoul | grunt | 40 | 10 | 135 | 2 | 1–3 |
| Numbling | skitter | 18 | 6 | 210 | 1 | 0–2 |
| Brute | brute | 140 | 20 | 90 | 5 | 3–6 |
| Wisp | caster | 30 | 8 | 120 | 3 | 1–3 |
| Lobber | bomber | 40 | 14 | 105 | 3 | 1–4 |
| Sentinel | spinner | 70 | 8 | 0 | 4 | 2–4 |
| Gorgehorn | charger | 75 | 16 | 115 | 4 | 2–5 |
| Gilded Hoplite | shield | 85 | 13 | 105 | 4 | 2–5 |
| Hissling | hissling | 30 | 22 | 165 | 2 | 1–2 |
| Weaver | weaver | 45 | 6 | 150 | 3 | 1–3 |
| Bonecaller | bonecaller | 90 | 9 | 85 | 6 | 3–6 |
| Mimic | mimic | 130 | 16 | 0 | 6 | 20–35 |
| Old Bones | dummy | 9999 | 0 | 0 | 0 | 0–0 |

## Torment (difficulty)

Unlocked at the *Oath of Torment* after slaying a guardian; each escape raises the maximum by one.

| Torment | Foe Health | Foe damage | Ash × |
|---|---|---|---|
| 0 | +0% | +0% | ×1.00 |
| 1 | +15% | +10% | ×1.25 |
| 2 | +30% | +20% | ×1.50 |
| 3 | +45% | +30% | ×1.75 |
| 4 | +60% | +40% | ×2.00 |
| 5 | +75% | +50% | ×2.25 |


**Endgame traits** (Torment 3+): besides Armored, Swift, Volatile and Regenerating, elite foes may be *Warded* (a ward soaks 90% of damage until a powered attack, Special or Cast breaks it), *Vampiric* (heals twice the damage it deals you), *Splitting* (splits into two foes with half health on death) or *Hasting* (foes near it act 30% faster).

**Guardian rules** (Torment 4+): every guardian has a rule to learn; its banner names it when the fight starts.

| Guardian | Rule | How it works |
|---|---|---|
| Vexa | Break the anchors | Three chain anchors shield her. Break them all, then strike before they rise again. |
| The Many-Maw | Heads first | The body shrugs off blows while any head still bites. Sever the heads, then strike the body. |
| Aurex | Crack the plating | Ordinary blows spark off his plating. Only powered attacks, Specials and Casts crack it. |
| Threefang | Bait the charge | His hide turns most blows. Dodge his charge so he crashes into a wall, then strike while he is dazed. |


## Daily challenge

One escape a day, the same for everyone: the date (UTC) sets the seed and two modifiers. You play your own hero, at Torment 0. Score: 100 per chamber, 600 per guardian, and for an escape 2,500 plus up to 1,500 for speed (1 point a second under 25 minutes). The best score of each day is kept (30 days). The first daily run of a day extends your streak (or starts a new one) and pays 10 Ash per day of streak, up to 100. A daily run is never saved mid-way and never touches a saved escape.

| Modifier | Effect |
|---|---|
| ✦ Glass Cannon | You deal double damage, and take double damage. |
| ☍ Swarm | Half again as many foes, each with half the health. |
| ▭ Flatland | The whole escape is flat: drawn in 2D. |
| ◎ Miser's Road | No shops. Foes and pots drop double obols. |
| ✧ Enchanted Day | Every chamber holds enchanted foes (more of them carry elite traits). |
| ♱ No Second Chances | Death Defiance is off. Ash ×1.5. |
| ⚑ Bounty | Guardians have +50% health. Ash ×1.5 and score ×1.25. |

## Door rewards

| Reward | Shown on the door |
|---|---|
| ✦ Boon | Fight, then choose 1 of 3 boons |
| ❂ Pomegranate | Fight, then level up a boon |
| ◎ Obols | Fight for coins to spend at Charon's shop |
| ♥ Titan Heart | Fight for +25 max Health this run |
| ◆ Ash | Fight for Ash, kept after death |
| ⚒ Hephaestus' Anvil | Enchanted foes · upgrade your weapon |
| ➶ Hermes | Fight, then pick a speed boon |
| ⚖ Charon's Wares | No fight · buy with obols |
| ♒ Fountain | No fight · restore health |
| ☠ Guardian | This region's guardian |
| ⌂ Antechamber | Shop and fountain before the guardian |
| ✧ Enchanting Tome | Fight, then add an enchantment |
| ⚱ Artifact Cache | Enchanted foes · find an artifact |

## Probabilities

Every chance roll in an escape. The weights and chances come from `src/game/odds.ts`, `boons.ts` (boon rarity), `gear.ts` (gear tiers) and `enchants.ts` (enchantment procs).

### Doors

| Doors after a chamber | Weight | Chance |
|---|---|---|
| 1 | 1 | 11% |
| 2 | 5 | 56% |
| 3 | 3 | 33% |

Each door then rolls its reward from the weights below, among the rewards allowed right now. A reward shows on at most one door of a set, and two boon doors never share a god. *Chance* is for one door when every reward is allowed.

| Reward | Weight | Chance | Allowed when |
|---|---|---|---|
| ✦ Boon | 38 | 34% | Always (a god you can still take) |
| ❂ Pomegranate | 12 | 11% | You own a boon that can level up |
| ◎ Obols | 9 | 8.1% | Always |
| ♥ Titan Heart | 7 | 6.3% | Always |
| ◆ Ash | 9 | 8.1% | Always |
| ⚒ Hephaestus' Anvil | 6 | 5.4% | Anvil unlocked, from chamber 2, once per region |
| ➶ Hermes | 4 | 3.6% | From chamber 2, once per region |
| ✧ Enchanting Tome | 9 | 8.1% | Enchantments unlocked, something left to learn |
| ⚱ Artifact Cache | 6 | 5.4% | Artifacts unlocked, one left to find |
| ⚖ Charon's Wares | 7 | 6.3% | From chamber 3, once per region |
| ♒ Fountain | 4 | 3.6% | From chamber 3, once per region |

Fixed doors: after the last chamber of a region comes the antechamber, then the guardian; after a guardian, a boon door into the next region.
Painted Chambers: in The Gilded Groves, from its second chamber, each combat door has a 18% chance to lead into a fresco: the chamber is drawn flat (2D), and a boon there is at least Rare (its Common odds go to Rare).

### Boon rarity

Each boon offered rolls its rarity on its own. The first boon of an escape is held back so a run never opens on a big rarity spike. The odds climb chamber by chamber: from a region's first chamber (below) towards the next region's, so there is no jump at a region's gate. *Favor of the Gods* (Altar of Ashes) adds to Rare and Epic (and a little Heroic past the first region), but never to the first boon. Sacred Ward, Second Step and Extra Shard work the same at any rarity, so they show as *Special* and roll none.

| When | Common | Rare | Epic | Heroic |
|---|---|---|---|---|
| First boon of an escape | 95% | 5% | — | — |
| The Shackled Deep, first chamber | 93% | 7% | 0.5% | — |
| The Ember Fields, first chamber | 85% | 12% | 2.5% | 0.5% |
| The Gilded Groves, first chamber | 78% | 15% | 6% | 1.5% |
| The Last Gate, first chamber | 71% | 17% | 9.5% | 3% |
| End of the last region | 65% | 18% | 13% | 4.5% |
| The Shackled Deep, Favor 3 | 84% | 13% | 3.5% | — |
| The Ember Fields, Favor 3 | 75% | 18% | 5.5% | 1.3% |
| The Gilded Groves, Favor 3 | 68% | 21% | 9% | 2.3% |
| The Last Gate, Favor 3 | 61% | 23% | 13% | 3.8% |

Boon offers: up to 3 of the god's boons you can take, drawn evenly. A Duo boon (when its two gods are both in your build) replaces one of them 40% of the time. Duo boons have no rarity. Anvil upgrades: 3 drawn evenly from the ones you don't own. A Pomegranate levels a boon by 2 instead of 1 20% of the time.

### Chambers and foes

Chamber 1 of a region has 1 wave, chambers 2–3 have 2 and later chambers 3. Foes are drawn by weight from the region's pool until the wave's budget is spent. A foe that costs 2 or more may carry an elite trait (Armored, Swift, Volatile or Regenerating, evenly). Chambers behind an Anvil or Artifact door hold *enchanted foes*: +30%, up to 45%.

| Chamber | The Shackled Deep | The Ember Fields | The Gilded Groves | The Shackled Deep (enchanted) | The Ember Fields (enchanted) | The Gilded Groves (enchanted) |
|---|---|---|---|---|---|---|
| 1 | 5% | 13% | 21% | 35% | 43% | 45% |
| 2 | 9% | 17% | 25% | 39% | 45% | 45% |
| 3 | 13% | 21% | 29% | 43% | 45% | 45% |
| 4 | 17% | 25% | 33% | 45% | 45% | 45% |
| 5 | 21% | 29% | 37% | 45% | 45% | 45% |

### Foe drops

| Drop | Foe | Elite foe | Guardian |
|---|---|---|---|
| Obols (gold) | 55% | 55% | 55% |
| Echoes | 1, +1 at 40% | 4 | 25 |
| ☗ Bone Dust | 30% (×2 at 30%) | 48% (×2 at 30%) | 90% (×10) |
| Region material (Ember Shard / Golden Ichor / Gate Pearl) | 14% | 22% | 42% (×6) |
| ⬢ Titan Scale | — | 25% | 100% (×3–5) |
| Gear | 12% | 35% | 100% (starred) |
| Ghost gear | 0.1% | 0.1% | 0.1% |

Breaking a pot: 35% obols (1–5), else 20% two Echoes: 13% overall, nothing 52%.

### Treasure chests

| Roll | Chance |
|---|---|
| A combat chamber holds a chest | 25% (+10% per Treasure Sense tier) |
| The chest is a Mimic (combat chambers); slaying it always drops a Unique piece | 3% |
| Always inside | 15–35 obols, 6 Echoes, 3 Bone Dust |
| Also a piece of gear | 30% |
| An artifact pops out | 35% (artifacts unlocked, one left to find) |
| Otherwise an enchantment | 25% (60% when no artifact is left) |

### Gear drops

A run of about 80 kills (10 of them enchanted) yields about 0.9 starred pieces at level 1 and 1.6 at level 30, before guardians and chests; the rest of the gear is plain. Every guardian drops one starred piece.

| Source | Drops a piece | Plain (Common 70% / Uncommon 30%) | Starred | Starred tier |
|---|---|---|---|---|
| Foes | 12% | 90% | 10% | Rare 100% |
| Enchanted foes | 35% | 80% | 20% | Rare 70%, Epic 25%, Unique 5% |
| Chests | 30% | 84% | 16% | Rare 85%, Epic 15% |
| Guardians | 100% | — | 100% | Rare 45%, Epic 30%, Legendary 20%, Unique 5% |

Plus, on any kill (guardians too): a Ghost piece, 0.1%. *Plain* and *Starred* are at level 30; at low levels the star cap trims the many-star rolls (see below).

**Stars on a drop.** The first star has the source's chance (foes 5%, enchanted foes 10%, chests 8%); each further star is half as likely. A drop carries at most 1 star, +1 every 3 player levels (1 at level 1, 6 at level 15, 10 at level 30). Guardian and Ghost pieces always have at least one star, spread the same way.

| Source (level 30) | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ or more |
|---|---|---|---|---|---|---|
| Foes | 5% | 2.5% | 1.3% | 0.6% | 0.3% | 0.3% |
| Enchanted foes | 10% | 5% | 2.5% | 1.3% | 0.6% | 0.6% |
| Chests | 8% | 4% | 2% | 1% | 0.5% | 0.5% |
| Guardians | 50% | 25% | 13% | 6.3% | 3.1% | 3% |

| Player level | Most stars on a drop |
|---|---|
| 1+ | 1 |
| 3+ | 2 |
| 6+ | 3 |
| 9+ | 4 |
| 12+ | 5 |
| 15+ | 6 |
| 18+ | 7 |
| 21+ | 8 |
| 24+ | 9 |
| 27+ | 10 |

### Enchantment procs

| Enchantment | Roll | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Reverberation | Attack strikes again | 15% | 25% | 35% |
| Shackling | Hit roots nearby foes | 10% | 18% | 26% |
| Concussive | Hit stuns for 1.5s | 5% | 9% | 13% |
| Bloom | Hit blooms a healing circle | 6% | 10% | 14% |
| Frenzy | Kill grants +50% attack speed | 10% | 15% | 20% |
| Echo Harvest | Hit grants Echoes | 12% | 12% | 12% |

Critical hits come only from boons and riposte (a riposte is always critical).
