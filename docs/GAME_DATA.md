# Unbound Underworld — Game Data Reference

> **Generated file — do not edit by hand.** Run `npm run docs` after changing game data; CI checks that this file is up to date.
> Numbers are base values: enemies scale with region (see *Regions*) and Torment; boons scale with rarity and level.
> For how the systems fit together, see [DESIGN.md](DESIGN.md).

## Contents

- [Progression: levels, ranks and unlocks](#progression-levels-ranks-and-unlocks)
- [Talents (Ascension)](#talents-ascension)
- [Heroes and Wrath](#heroes-and-wrath)
- [Weapons, forging and anvil upgrades](#weapons-forging-and-anvil-upgrades)
- [Gods and boons](#gods-and-boons)
- [Enchantments](#enchantments)
- [Artifacts](#artifacts)
- [Altar of Ashes (permanent upgrades)](#altar-of-ashes-permanent-upgrades)
- [Regions and guardians](#regions-and-guardians)
- [Enemies](#enemies)
- [Torment (difficulty)](#torment-difficulty)
- [Door rewards](#door-rewards)
- [Probabilities](#probabilities)

## Progression: levels, ranks and unlocks

Experience carries over between runs. Max level: **30**. One talent point per level after the first.

**Experience sources**

| Source | XP |
|---|---|
| Foe slain | 3 |
| Enchanted (elite) foe slain | 8 |
| Chamber cleared | 12 |
| Guardian slain | 120 |
| Escape (final guardian) | 250 |

**Rank tiers** — each opens a new row of talents.

| Rank | From level |
|---|---|
| Shade | 1 |
| Wraith | 5 |
| Revenant | 10 |
| Champion | 15 |
| Unbound | 20 |

**Levels**

| Level | XP to next | Total XP | Rank | Talent points | Unlocks |
|---|---|---|---|---|---|
| 1 | 60 | 0 | Shade | 0 |  |
| 2 | 108 | 60 | Shade | 1 | Gear & Inventory, Guard & Parry, Healing Potion |
| 3 | 162 | 168 | Shade | 2 | Cast, Forge: Tier II · Tempered |
| 4 | 222 | 330 | Shade | 3 | Artifacts |
| 5 | 288 | 552 | Wraith | 4 | Jump & Slam, Hero: Gorran, Weapon: Titan Gauntlets |
| 6 | 360 | 840 | Wraith | 5 | Enchantments |
| 7 | 438 | 1200 | Wraith | 6 | Hephaestus' Anvil |
| 8 | 522 | 1638 | Wraith | 7 | Second Artifact Slot, Hero: Ione, Weapon: Riptide Chains |
| 9 | 612 | 2160 | Wraith | 8 |  |
| 10 | 708 | 2772 | Revenant | 9 | Wrath, Hero: Erebos, Weapon: Reaper's Crescent |
| 11 | 810 | 3480 | Revenant | 10 |  |
| 12 | 918 | 4290 | Revenant | 11 | Third Artifact Slot, Hero: Rook, Weapon: Thunderbuss |
| 13 | 1032 | 5208 | Revenant | 12 | Awakened Weapons, Forge: Tier III · Awakened |
| 14 | 1152 | 6240 | Revenant | 13 |  |
| 15 | 1278 | 7392 | Champion | 14 | Hero: Selene, Weapon: Starsplitter |
| 16 | 1410 | 8670 | Champion | 15 | Forge: Tier IV · Exalted |
| 17 | 1548 | 10080 | Champion | 16 |  |
| 18 | 1692 | 11628 | Champion | 17 |  |
| 19 | 1842 | 13320 | Champion | 18 |  |
| 20 | 1998 | 15162 | Unbound | 19 | Forge: Tier V · Mythic |
| 21 | 2160 | 17160 | Unbound | 20 |  |
| 22 | 2328 | 19320 | Unbound | 21 |  |
| 23 | 2502 | 21648 | Unbound | 22 |  |
| 24 | 2682 | 24150 | Unbound | 23 |  |
| 25 | 2868 | 26832 | Unbound | 24 |  |
| 26 | 3060 | 29700 | Unbound | 25 |  |
| 27 | 3258 | 32760 | Unbound | 26 |  |
| 28 | 3462 | 36018 | Unbound | 27 |  |
| 29 | 3672 | 39480 | Unbound | 28 |  |
| 30 | — | 43152 | Unbound | 29 |  |

**Mechanic unlocks** (hidden from the HUD, buttons and help until unlocked)

| Level | Unlock | What it does | Keys (PC / touch) |
|---|---|---|---|
| 2 | Gear & Inventory | Equip the helmets, armor, leggings and boots foes drop, and craft or star them up with materials, at the Armory or from the pause menu. |  |
| 2 | Guard & Parry | Hold Guard to block hits from the front. Tap it just before a hit lands to parry: the foe staggers and your next attack is a sure critical. Ground shockwaves can only be dodged or jumped. | V / ⛨ |
| 2 | Healing Potion | Drink to restore health. It refills over time. | R / ⚗ |
| 3 | Cast | Hurl a shard that lodges in foes. Walk over it to pick it up again. | Q / Middle mouse / ◆ |
| 4 | Artifacts | One artifact slot. Find artifacts in the Underworld or pick one at the Artifact Shelf. | 1 / the artifact button |
| 5 | Jump & Slam | Leap over lava, chasms and shockwaves. Attack mid-air to Slam the ground. Also unlocks after slaying the final guardian. | Space / C / ⤒ |
| 6 | Enchantments | Enchanting Tomes now appear behind doors and in chests. |  |
| 7 | Hephaestus' Anvil | Anvils that reforge your weapon now appear in the Underworld. |  |
| 8 | Second Artifact Slot | Carry two artifacts at once. | 2 / the artifact button |
| 10 | Wrath | Fill the golden gauge by dealing and taking damage, then unleash your hero's ultimate. | F / ☄ |
| 12 | Third Artifact Slot | Carry three artifacts at once. | 3 / the artifact button |
| 13 | Awakened Weapons | Forge a weapon to Tier III at the Armory to awaken it. |  |

## Talents (Ascension)

Spend one point per level at the *Ascension* stone in the Hall of Shades. Resetting is free.

| Row (rank) | Talent | Max rank | Per rank | At max rank |
|---|---|---|---|---|
| Shade (Lv 1) | ♥ Toughness | 5 | +6 max Health | +30 max Health |
| Shade (Lv 1) | ⚔ Might | 5 | +3% damage | +15% damage |
| Shade (Lv 1) | ➶ Swiftness | 3 | +4% move speed | +12% move speed |
| Wraith (Lv 5) | ⚗ Second Wind | 3 | Potion heals +8% and recharges 10% faster | Potion heals +24% and recharges 30% faster |
| Wraith (Lv 5) | ◆ Shardcraft | 3 | Cast deals +20% damage | Cast deals +60% damage |
| Wraith (Lv 5) | ✚ Bloodlust | 3 | Restore 1 Health per foe slain | Restore 3 Health per foe slain |
| Revenant (Lv 10) | ✦ Precision | 3 | +3% critical chance | +9% critical chance |
| Revenant (Lv 10) | » Phantom Step | 2 | Dash recharges 15% faster; Dash-Strike +15% damage | Dash recharges 30% faster; Dash-Strike +30% damage |
| Revenant (Lv 10) | ☄ Wrathful | 3 | Wrath fills 15% faster | Wrath fills 45% faster |
| Champion (Lv 15) | ⛨ Titan's Blood | 3 | Take 4% less damage | Take 12% less damage |
| Champion (Lv 15) | ☠ Giantslayer | 3 | +10% damage to guardians and enchanted foes | +30% damage to guardians and enchanted foes |
| Champion (Lv 15) | ⚙ Relic Lore | 2 | Artifacts recharge 10% faster | Artifacts recharge 20% faster |
| Unbound (Lv 20) | ✚ Undying | 1 | Cheat death one more time per run | Cheat death one more time per run |
| Unbound (Lv 20) | ⚡ Godslayer | 2 | +8% damage and +10 max Health | +16% damage and +20 max Health |

## Heroes and Wrath

Choose a hero in the *Hall of Heroes*. Wrath (unlocks at level 10) fills by 3.13 per 100 damage dealt and 0.8 per damage taken; 100 unleashes the hero's ultimate.

| Hero | Class | Weapon | Guard | Unlock | Perks | Wrath | Wrath effect |
|---|---|---|---|---|---|---|---|
| Kael, Prince of Embers | Warrior | Nightblade | parry | Start | Balanced: no strengths, no weaknesses; +10% Wrath gain | Inferno Nova | A ring of hellfire bursts outward three times, burning everything it touches. |
| Lyra, Moon Huntress | Ranger | Moonbow | evade | Start | +12% move speed; +8% critical chance; −10 max Health | Moonfall | Beams of moonlight strike every foe in sight three times. |
| Doran, The Bronze Wall | Vanguard | Thornspear | shield | Start | +30 max Health; Take 12% less damage; −8% move speed | Titan's Quake | Three quakes roll out from you, stunning and crushing foes. |
| Gorran, The Unchained Fist | Brawler | Titan Gauntlets | catch | Reach level 5 | Combo meter builds twice as fast; +20 max Health | Hundred Fists | A storm of punches in front of you, ending in a crushing blast. |
| Ione, Tidecaller | Monk | Riptide Chains | catch | Reach level 8 | +1 Cast shard (once Cast is unlocked); +20% Special damage; +15% knockback | Tidal Surge | A tidal wave hurls every nearby foe away, chilling them to the bone. |
| Erebos, The Hollow King | Reaper | Reaper's Crescent | mist | Reach level 10 or slay 2 guardians | +10% damage; Restore 2 Health per foe slain; +50% souls gathered; −15 max Health | Eclipse | Darkness falls: every foe in sight is stunned and Doomed, and you drink their life. |
| Rook, The Powder Ghost | Gunner | Thunderbuss | evade | Reach level 12 | Hits on foes close to you deal +30% damage; +15% knockback | Cannonade | Cannon shots rain down on the foes around you. |
| Selene, Starbound | Duelist | Starsplitter | parry | Reach level 15 or escape once | +1 Dash charge; +15% Attack damage; Dash recharges 20% faster | Starfall | A storm of falling stars pounds the area around you. |

Guard styles: *parry* (widest parry window), *shield* (blocks all frontal damage; Attack while guarding bashes), *evade* (a sidestep; one right before a hit is a Perfect Dodge), *catch* (wide parry window), *mist* (blocked damage becomes souls).

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

**Forge tiers** (per weapon, at the Armory)

| Tier | Ash | Level needed | Effect |
|---|---|---|---|
| Tier I | — | 1 | Base weapon |
| Tier II · Tempered | 30 | 3 | +10% weapon damage |
| Tier III · Awakened | 80 | 13 | +20% weapon damage. Every 4th Attack unleashes an arcane wave. |
| Tier IV · Exalted | 150 | 16 | +30% weapon damage. Waves grow larger. |
| Tier V · Mythic | 260 | 20 | +45% weapon damage. Waves split in three and the weapon blazes. |

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
| ✧ Soul Harvest | Hits have a 12% chance to grant 3 souls for your artifacts. | Hits have a 12% chance to grant 4 souls for your artifacts. | Hits have a 12% chance to grant 5 souls for your artifacts. |
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
| ♁ Spirit Lantern | 30 souls | 35 | Spend 30 souls: a lantern spirit fights at your side for 14 seconds. |
| ☽ Soul Reaper | 40 souls | 35 | Spend 40 souls: unleash a soul burst dealing 120 damage around you. |
| ⌖ Void Prism | 10 souls | 50 | Channel a searing soul beam toward your aim. Drains souls while active. |

## Altar of Ashes (permanent upgrades)

| Upgrade | Ranks | Ash per rank | At max rank |
|---|---|---|---|
| ♥ Vitality | 4 | 10 / 20 / 35 / 55 | +40 max Health |
| ✚ Death's Reprieve | 3 | 30 / 70 / 140 | Cheat death 3 times per run |
| ⚔ Fury | 4 | 15 / 30 / 50 / 80 | +20% damage |
| ➶ Fleet Shadow | 1 | 60 | +1 Dash charge |
| ◆ Shard Keeper | 2 | 25 / 75 | +2 Cast shards |
| ◎ Ferryman’s Purse | 3 | 10 / 25 / 45 | Begin each run with 120 obols |
| ✦ Favor of the Gods | 3 | 20 / 45 / 90 | Boons are more often Rare or better: +19.5% (not the first boon of an escape) |
| ⛨ Iron Will | 3 | 20 / 45 / 80 | Take 15% less damage |
| ⚗ Alchemy | 2 | 25 / 60 | Potion recharges 40% faster and heals +20% |
| ✧ Soulcraft | 2 | 20 / 50 | +50 max souls, +40% souls gathered |
| ⚙ Tinkerer | 3 | 20 / 45 / 80 | Artifacts recharge 30% faster |

## Loot and gear

Unlocks at level 2. Foes drop materials; gear drops from foes (1.2%), enchanted foes (12%), chests (30%) and guardians (always, Rare or better). Every drop chance is listed under *Probabilities*. Up to 40 pieces are kept; a full inventory salvages new finds.

| Material | Source |
|---|---|
| ☗ Bone Dust | Dropped by foes everywhere. The basic crafting material. |
| ♦ Ember Shard | Dropped by foes in the Shackled Deep and the Ember Fields. |
| ✹ Golden Ichor | Dropped by foes in the Gilded Groves. |
| ● Gate Pearl | Dropped by foes at the Last Gate. |
| ⬢ Titan Scale | Dropped by guardians and enchanted foes. Rare. |

| Tier | Bonuses | Bonus strength × | Chance (foe) | Chance (guardian luck) | Perk |
|---|---|---|---|---|---|
| Common | 1 | 1 | 49% | 35% | — |
| Uncommon | 2 | 1.15 | 27% | 25% | — |
| Rare | 2 | 1.3 | 14% | 19% | — |
| Epic | 3 | 1.55 | 5.4% | 11% | — |
| Legendary | 4 | 1.85 | 2.5% | 7% | — |
| Unique | 4 | 2.1 | 1.5% | 2.7% | One Unique perk |
| Ghost | 5 | 2.5 | 0.3% | 0.7% | One Ghost perk |

Guardians always drop Rare or better (lower tiers roll up to Rare).

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
| +8 max health | 8 | Helmet, Armor, Leggings, Boots |
| +4% damage | 4% | Helmet, Armor, Leggings, Boots |
| +3% move speed | 3% | Leggings, Boots |
| +2% critical chance | 2% | Helmet, Armor |
| −3% damage taken | 3% | Armor, Leggings, Helmet |
| −6% dash recharge | 6% | Boots |
| +6% obols found | 6% | Helmet, Armor, Leggings, Boots |
| +8% souls gathered | 8% | Helmet, Armor |
| +6% Wrath gain | 6% | Helmet |
| +6% potion healing | 6% | Armor |

Pieces are starred up from 1 to 10 stars. The first five stars are gold and add 15% to every bonus each; stars 6–10 turn the gold stars purple one by one and add 20% each.

| Stars | Bonus × | Next star (Common) | Next star (Epic) | Next star (Ghost) |
|---|---|---|---|---|
| ★ gold | 1.00 | 6 ☗ | 6 ☗ · 2 ✹ · 1 ⬢ | 6 ☗ · 2 ● · 1 ⬢ |
| ★★ gold | 1.15 | 12 ☗ | 12 ☗ · 4 ✹ · 2 ⬢ | 12 ☗ · 4 ● · 2 ⬢ |
| ★★★ gold | 1.30 | 18 ☗ | 18 ☗ · 6 ✹ · 3 ⬢ | 18 ☗ · 6 ● · 3 ⬢ |
| ★★★★ gold | 1.45 | 24 ☗ | 24 ☗ · 8 ✹ · 4 ⬢ | 24 ☗ · 8 ● · 4 ⬢ |
| ★★★★★ gold | 1.60 | 30 ☗ · 1 ⬢ | 30 ☗ · 10 ✹ · 6 ⬢ | 30 ☗ · 10 ● · 6 ⬢ |
| ★ purple + ★★★★ gold | 1.80 | 36 ☗ · 2 ⬢ | 36 ☗ · 12 ✹ · 8 ⬢ | 36 ☗ · 12 ● · 8 ⬢ |
| ★★ purple + ★★★ gold | 2.00 | 42 ☗ · 3 ⬢ | 42 ☗ · 14 ✹ · 10 ⬢ | 42 ☗ · 14 ● · 10 ⬢ |
| ★★★ purple + ★★ gold | 2.20 | 48 ☗ · 4 ⬢ | 48 ☗ · 16 ✹ · 12 ⬢ | 48 ☗ · 16 ● · 12 ⬢ |
| ★★★★ purple + ★ gold | 2.40 | 54 ☗ · 5 ⬢ | 54 ☗ · 18 ✹ · 14 ⬢ | 54 ☗ · 18 ● · 14 ⬢ |
| ★★★★★ purple +  gold | 2.60 | — | — | — |

| Recipe | Rarity | Cost |
|---|---|---|
| Craft a piece | Common or better | 25 ☗ · 6 ♦ |
| Craft a fine piece | Rare or better | 40 ☗ · 6 ✹ |
| Craft a grand piece | Epic or better | 60 ☗ · 6 ● · 3 ⬢ |
| Craft a masterwork | Legendary or better | 120 ☗ · 14 ● · 10 ⬢ |


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

### Boon rarity

Each boon offered rolls its rarity on its own. The first boon of an escape is held back so a run never opens on a big rarity spike; deeper regions raise the odds. *Favor of the Gods* (Altar of Ashes) adds to Rare and Epic (and a little Heroic past the first region), but never to the first boon.

| When | Common | Rare | Epic | Heroic |
|---|---|---|---|---|
| First boon of an escape | 90% | 10% | — | — |
| The Shackled Deep | 85% | 14% | 1% | — |
| The Ember Fields | 70% | 24% | 5% | 1% |
| The Gilded Groves | 55% | 30% | 12% | 3% |
| The Last Gate | 42% | 33% | 19% | 6% |
| The Shackled Deep, Favor 3 | 67% | 26% | 7% | — |
| The Ember Fields, Favor 3 | 51% | 36% | 11% | 2.5% |
| The Gilded Groves, Favor 3 | 36% | 42% | 18% | 4.5% |
| The Last Gate, Favor 3 | 23% | 45% | 25% | 7.5% |

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
| Souls | 1, +1 at 40% | 4 | 25 |
| ☗ Bone Dust | 30% (×2 at 30%) | 48% (×2 at 30%) | 90% (×10) |
| Region material (Ember Shard / Golden Ichor / Gate Pearl) | 14% | 22% | 42% (×6) |
| ⬢ Titan Scale | — | 25% | 100% (×3–5) |
| Gear | 1.2% | 12% | 100% (Rare or better) |

Breaking a pot: 35% obols (1–5), else 20% two souls: 13% overall, nothing 52%.

### Treasure chests

| Roll | Chance |
|---|---|
| A combat chamber holds a chest | 25% (+10% per Treasure Sense tier) |
| The chest is a Mimic (combat chambers) | 15% |
| Always inside | 15–35 obols, 6 souls, 3 Bone Dust |
| Also a piece of gear | 30% |
| An artifact pops out | 35% (artifacts unlocked, one left to find) |
| Otherwise an enchantment | 25% (60% when no artifact is left) |

### Gear tiers by source

Luck slides the tier odds toward the better tiers. Guardians then lift anything below Rare up to Rare.

| Source | Luck | Common | Uncommon | Rare | Epic | Legendary | Unique | Ghost |
|---|---|---|---|---|---|---|---|---|
| Foe, The Shackled Deep | 0.0 | 49% | 27% | 14% | 5.4% | 2.5% | 1.5% | 0.3% |
| Foe, The Ember Fields | 0.1 | 46% | 27% | 15% | 6.6% | 3.5% | 1.7% | 0.4% |
| Foe, The Gilded Groves | 0.2 | 43% | 27% | 16% | 7.6% | 4.3% | 1.9% | 0.4% |
| Foe, The Last Gate | 0.3 | 41% | 26% | 17% | 8.5% | 5.1% | 2.1% | 0.5% |
| Chest | 0.2 | 43% | 27% | 16% | 7.6% | 4.3% | 1.9% | 0.4% |
| Guardian | 0.6 | 35% | 25% | 19% | 11% | 7% | 2.7% | 0.7% |

### Enchantment procs

| Enchantment | Roll | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|---|
| Reverberation | Attack strikes again | 15% | 25% | 35% |
| Shackling | Hit roots nearby foes | 10% | 18% | 26% |
| Concussive | Hit stuns for 1.5s | 5% | 9% | 13% |
| Bloom | Hit blooms a healing circle | 6% | 10% | 14% |
| Frenzy | Kill grants +50% attack speed | 10% | 15% | 20% |
| Soul Harvest | Hit grants souls | 12% | 12% | 12% |

Critical hits come only from boons and riposte (a riposte is always critical).
