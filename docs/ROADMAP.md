# Unbound Underworld: roadmap

What's coming, in order. Each part below says whether it is **done**, **next**
or **planned**. Names, characters, places and bosses are all original to this
game.

- [The campaign, chapter by chapter](#the-campaign)
- [Bosses with a rule to learn](#bosses-with-a-rule-to-learn)
- [Levels that turn flat (2D)](#levels-that-turn-flat-2d)
- [Daily challenge](#daily-challenge)
- [Endgame](#endgame)
- [Accessibility](#accessibility)
- [Balance: boon rarity](#balance-boon-rarity)
- [Further ahead](#further-ahead)

---

## The campaign

Six chapters tell one story: a shade wakes in chains at the bottom of the
underworld and climbs, region by region, to the surface. Every chapter has six
missions, and its last mission is a guardian with its own rule (see [Bosses
with a rule to learn](#bosses-with-a-rule-to-learn)). Missions keep the shape
Chapter I set: a story scene before and after; fixed chambers, foes and goals
(clear, survive, defeat); three stars (finish, par time, health kept); and Ash
and experience, in full the first time.

The recurring cast:

- **Ysolde, the Unchained.** The guide. She remembers being alive and won't say
  why she stayed below.
- **The hero.** Whichever hero you play. The story talks to them by name.
- **The Hollow King.** The one who rules the underworld, unseen until the last
  chapter. Each chapter's guardian answers to him.

### Chapter I · Chains of the Deep — **done** (v0.11)

*The Shackled Deep.* You wake in a cell. Ysolde breaks your chain, and you fight
up through the cell blocks to Vexa, Warden of Chains.

| # | Mission | Goal |
|---|---|---|
| 1 | Awakening | Clear the cell block |
| 2 | The Long Stair | Survive the tide of jailers |
| 3 | Rattling Halls | Clear three chambers |
| 4 | The Drowned Cells | Survive, then clear |
| 5 | Under the Lash | Elite foes |
| 6 | The Warden | Defeat Vexa |

### Chapter II · Embers of the Field — **next**

*The Ember Fields.* The meadows burn without end, tended by the Cinder
Shepherd, who herds the souls of the restless dead. Ysolde admits she has been
here before.

| # | Mission | Goal | Twist |
|---|---|---|---|
| 1 | Ash on the Wind | Clear | Embers drift across the field and set the grass alight |
| 2 | The Burning Hedge | Survive 60 s | The fire spreads inwards from the edges |
| 3 | Lambs of Cinder | Clear | Ember lambs flee; catch them before they reach the bonfires |
| 4 | The Shepherd's Path | Clear 3 chambers | Raised ground: jump between burning terraces |
| 5 | Where Ysolde Fell | Survive | A story mission: hold the line while Ysolde remembers |
| 6 | The Cinder Shepherd | Defeat **Kindra, the Cinder Shepherd** | Rule: *Quench the fires* |

### Chapter III · The Painted Garden — planned

*The Gilded Groves.* The honoured dead live inside a fresco, a garden painted on
the walls of the world. **This chapter is where the game first turns flat**:
when you step into the paintings, the view becomes 2D.

| # | Mission | Goal | Twist |
|---|---|---|---|
| 1 | Gilt and Shadow | Clear | Ordinary 3D groves |
| 2 | Into the Fresco | Clear | **2D.** The first painted chamber |
| 3 | The Hedge Maze | Find the exit (survive) | **2D.** Walls move when the music changes |
| 4 | Gardeners of Gold | Clear 3 chambers | Back to 3D, with gold-armoured foes |
| 5 | The Gallery of Echoes | Clear | Back and forth between 3D halls and **2D** paintings |
| 6 | The Gilded Echo | Defeat **Seraphine, the Gilded Echo** | Rule: *Find the true reflection*. The fight is **2D** |

### Chapter IV · The Gate Unchained — planned

*The Last Gate.* Threefang, the three-headed hound, has been unchained by the
Hollow King to hunt you. The gate itself is alive.

| # | Mission | Goal | Twist |
|---|---|---|---|
| 1 | Howls at the Gate | Survive | Threefang hunts you between chambers |
| 2 | The Kennels | Clear | Hounds in packs: one alpha leads, the rest follow |
| 3 | Bones of the Gate | Clear 3 chambers | The gate's walls close in a little each wave |
| 4 | Scent and Shadow | Survive | Darkness: only your torch and the hounds' eyes light the room |
| 5 | The Leash | Clear | Free the souls chained to the gate |
| 6 | Three Heads, Three Hungers | Defeat **Threefang Unchained** | Rule: *Feed each head its own* |

### Chapter V · The Silent Mere — planned

*A new region, the Silent Mere.* A flooded archive where the forgotten go. Here
the light itself is something you carry.

| # | Mission | Goal | Twist |
|---|---|---|---|
| 1 | What the Water Keeps | Clear | Shallow water slows everyone, foes too |
| 2 | Lanternlight | Survive | Foes are invisible outside your lantern's light |
| 3 | The Drowned Shelves | Clear 3 chambers | Floating shelves: jumping is the only way across |
| 4 | Pages of the Lost | Clear | Each fallen foe drops a page; read three to open the door |
| 5 | Ysolde's Name | Story | **2D.** A memory, told in silhouette |
| 6 | The Unremembering | Defeat **Oblivia, the Unremembering** | Rule: *Keep her in the light* |

### Chapter VI · The Hollow Crown — planned

*The road to the surface.* The Hollow King waits at the last threshold. The
finale uses everything the earlier chapters taught.

| # | Mission | Goal | Twist |
|---|---|---|---|
| 1 | Every Chain Remembered | Clear | Foes from every region at once |
| 2 | The King's Road | Survive | The road crumbles behind you: keep moving |
| 3 | Four Guardians | Clear 4 chambers | Each chamber is one earlier guardian's arena, with their rule |
| 4 | The Last Light | Survive | Ysolde holds the gate; you hold the room |
| 5 | Crownless | Clear | Elite foes with two traits each |
| 6 | The Hollow King | Defeat **the Hollow King** | Rule: *Break the crown, not the king*. Phase 2 is **2D** |

The ending depends on whether you saved Ysolde in Chapter V's story mission (a
choice made at the end of mission 5).

---

## Bosses with a rule to learn

From Chapter II on, every guardian has **a rule**: something you must do to hurt
them. Damage alone won't do it. The game teaches each rule on the spot: the
first time it blocks your damage, a one-line hint appears under the health bar,
and the codex records it afterwards.

| Guardian | Where | The rule | How it plays |
|---|---|---|---|
| **Kindra, the Cinder Shepherd** | Chapter II | *Quench the fires* | Kindra can't be hurt while her three bonfires burn. Lure her ember bombers into a fire, or land a powered attack on one, to put it out for 10 seconds. With all three out she kneels, and can be hurt. |
| **Seraphine, the Gilded Echo** | Chapter III (2D) | *Find the true reflection* | She splits into four mirror images. Only the true one casts a shadow. Hitting a false one shatters it and stuns you briefly. |
| **Threefang Unchained** | Chapter IV | *Feed each head its own* | Each head only takes one kind of damage: the left one powered attacks, the middle one parries, the right one a jump slam. A head that's beaten stays down; the hound falls when all three are. |
| **Oblivia, the Unremembering** | Chapter V | *Keep her in the light* | She only exists inside your lantern's light. Plant the lantern to light a circle, then drive her into it. She steals the lantern if she touches it. |
| **The Hollow King** | Chapter VI | *Break the crown, not the king* | Phase 1: only his floating crown takes damage, and it orbits him. Phase 2 (**2D**): the room flattens, and he can only be hit from below, by a jump. Phase 3: every earlier rule, one at a time. |

**Rules come to the escape too. Done in v0.14.** At Torment 4 and above, the
four escape guardians each have a rule. The fight's opening banner names it,
and the bestiary records it.

| Guardian | Endgame rule | How it plays |
|---|---|---|
| Vexa, Warden of Chains | *Break the anchors* | Three chain anchors rise around the room, chained to her, and cut the damage she takes to 12%. Break all three and she staggers, and her shield stays down for 14 seconds before they rise again. |
| The Many-Maw | *Heads first* | Two heads rise at the start. While any head lives, the body takes 20% damage. |
| Aurex, the Gilded Colossus | *Crack the plating* | Ordinary hits do only 8% to his plating. Powered attacks, Specials and Casts crack it (150%). |
| Threefang | *Bait the charge* | His hide turns most blows (22%). Make him charge into a wall: while he's dazed, he takes 130%. |

---|---|
| Vexa, Warden of Chains | *Break the anchors*: three chain anchors shield her; break them to drop the shield. |
| The Many-Maw | *Burn the roots*: severed heads regrow unless their stump is hit with fire (a Cast or a burning boon). |
| Aurex, the Gilded Colossus | *Turn the beam*: only his own sweeping laser, parried back, can crack his core. |
| Threefang | *Cut the chains*: chained to the gate, he can't be hurt until you break the chain he pulls on during a charge. |

---

## Levels that turn flat (2D)

**Done in v0.13:** the player-facing 2D/3D switch (Tab and the Settings toggle)
is gone. The game plays in 3D, and **some levels turn flat on their own**. The
switch to 2D is part of the place: the screen folds flat with a short paper-fold
effect, and unfolds again when you leave. Devices that can't draw 3D still play
everything in 2D, as before.

Where the world goes flat:

| Where | Since | Why it's flat |
|---|---|---|
| **Painted Chambers** in the Gilded Groves (escape) | v0.13 | From the second chamber, 18% of the Groves' combat doors lead into a fresco (the door is marked *Painted*). The chamber is flat, with a gilded frame, and a boon there is at least Rare. |
| Chapter III missions 2, 3 and 5 | Chapter III | Stepping into the paintings |
| Seraphine, the Gilded Echo | Chapter III | Her whole fight is a painting |
| Chapter V mission 5 | Chapter V | A memory, told in silhouette |
| The Hollow King, phase 2 | Chapter VI | He tears the depth out of the world |
| Daily challenge *Flatland* days | Daily challenge | A daily modifier |

---

## Daily challenge

**Done in v0.14** (title screen → *Daily Challenge*). One escape a day, the same for everyone:

- **The same run for everyone.** The seed comes from the date (UTC), so every
  player gets the same rooms, foes, rewards and **modifiers**. You play your own
  hero, at Torment 0.
- **Modifiers.** Two each day, from seven:
  - *Glass Cannon*: double damage dealt and taken.
  - *Swarm*: +50% foes, each with half health.
  - *Flatland*: the whole run is 2D.
  - *Miser's Road*: no shops, double obols.
  - *Enchanted Day*: every chamber holds enchanted foes.
  - *No Second Chances*: no Death Defiance, Ash ×1.5.
  - *Bounty*: guardians +50% health, Ash ×1.5, score ×1.25.
- **Score.** Chambers cleared, guardians slain, time and health kept. The best
  score of the day counts, and you can try as often as you like.
- **Streaks.** Days in a row with at least one run. The first run of a day
  pays 10 Ash per day of streak, up to 100.
- **Leaderboard.** Your last 30 days are kept on your device. A shared
  leaderboard on a game server is planned.
- The daily run never touches your saved escape. Experience and Ash count as in
  a normal escape.

---

## Endgame

For players who have escaped and are climbing Torment. Stages 1 and 2 are done; the rest are planned:

1. **Elite traits, round two — done in v0.14.** From Torment 3, elite foes may
   also be *Warded* (a ward soaks 90% until a powered attack, Special or Cast
   breaks it), *Vampiric* (heals twice the damage it deals you), *Splitting*
   (splits into two half-health foes on death) or *Hasting* (foes near it act
   30% faster).
2. **Guardian rules at Torment 4+ — done in v0.14** (table above).
3. **Trial Chambers.** A rare door: a chamber with one condition (no dashing,
   parries only, a time limit) and a reward a tier above normal.
4. **Torment beyond 5.** New Torment levels, each adding a named condition (e.g.
   *Iron Tide*: foes regenerate armour) rather than only more health and damage.
5. **Ascended gear.** Gear can go past ten stars at Torment 6+, one star per
   guardian slain at that level.
6. **Weekly guardian rush.** All four guardians back to back, with a weekly
   leaderboard.

---

## Accessibility

**Done in v0.13** (Settings → Accessibility):

- **Text and UI size**, from 75% to 150%.
- **Screen shake**, from full down to off.
- **Flashes**, from full down to softest (hit flashes, screen flashes, light
  bursts).
- **Colour-blind colours**: *red–green* (deuteranopia, protanopia) or
  *blue–yellow* (tritanopia). Every boon and gear rarity is recoloured. Tiers
  are always named as well, so colour is never the only cue.
- **High-contrast foes**: a bright two-tone ring under every foe (magenta for
  guardians), in 2D and 3D.
- **Tap to guard**: tap once to raise Guard and again to lower it, instead of
  holding it.
- **Assist mode**: take half damage (moved here from Gameplay).
- **Game speed**: 100%, 85% or 70%, for more time to react. Achievements are
  off below 100%, and online play always runs at full speed.
- Touch button size and opacity, and a left-handed layout, are under Touch
  controls.

Planned:

- **Auto-attack**: hold Attack to keep attacking, with powered attacks moved to
  a long press of Special.
- A full remap of touch button positions.
- Subtitles for boss voice lines, once bosses speak.
- A screen-reader friendly menu mode.

---

## Balance: boon rarity

**Done in v0.13.** Tested by simulation (100,000 rolls per stage, plus 6,000
simulated escapes of real offers per region). The tests now hold these numbers
in place.

What the tests found:

- **Three boons always showed as Common.** Sacred Ward, Second Step and Extra
  Shard work the same at any rarity, but their cards said *Common*. That was
  5–8% of all offers, so players saw fewer rare boons than the odds promise.
  They now show as **Special**, and every other boon rolls exactly to the odds.
- **Rarity jumped at region gates.** It stayed flat for a whole region, then
  jumped at the next one. It now **climbs chamber by chamber** towards the next
  region's odds.

| Where | Common | Rare | Epic | Heroic |
|---|---|---|---|---|
| First boon of an escape | 95% | 5% | — | — |
| Shackled Deep, first chamber | 92.5% | 7% | 0.5% | — |
| Ember Fields, first chamber | 85% | 12% | 2.5% | 0.5% |
| Gilded Groves, first chamber | 77.5% | 15% | 6% | 1.5% |
| Last Gate, first chamber | 71% | 16.5% | 9.5% | 3% |
| End of the Last Gate | 65% | 18% | 12.5% | 4.5% |

These keep the halved rates set in v0.8. Each rank of Favor of the Gods (Altar)
moves 3.25% from Common to the rarer tiers. Full tables:
[GAME_DATA.md](GAME_DATA.md).

---|---|---|---|---|
| First boon of a run | 95% | 5% | — | — |
| Region 1, the Shackled Deep | 80% | 16% | 3.5% | 0.5% |
| Region 2, the Ember Fields | 68% | 23% | 7.5% | 1.5% |
| Region 3, the Gilded Groves | 56% | 29% | 12% | 3% |
| Region 4, the Last Gate | 45% | 33% | 17% | 5% |

Favor of the Gods (Altar) shifts these toward the rarer tiers. The current
numbers, with Favor and Torment included, are in [GAME_DATA.md](GAME_DATA.md).

---

## Pacing

**Done in v0.15.** Getting in is quick, and the mid and late game are a grind.
A model of a typical run at each level is checked by the tests:

| | Runs per level | Runs so far |
|---|---|---|
| Levels 1–9 | under 1 (a new mechanic almost every run) | Wrath at level 10 after ~5 |
| Level 15 | ~1.3 | ~11 |
| Level 20 | ~2.9 | ~22 |
| Level 30 | ~4.8 | ~61 |
| Level 40 | ~9.4 | ~134 |
| Level 49 | ~15 | ~245 to max (the old curve: ~107) |

- **Fledgling's Grace:** foes deal 30% less damage at level 1, fading out by
  level 6.
- **Weapon forge:** the top tiers cost more Ash (III 120, IV 400, V 900).
- **Old saves:** converted, so players keep their level and their progress into
  it.

## Further ahead

Ideas, in no fixed order:

- **New heroes:** a lantern-bearer (Chapter V), and a flat-world specialist
  whose attacks are stronger in 2D chambers.
- **New gods** to choose boons from, with their own duo boons.
- **Co-op campaign:** play the campaign with a friend online.
- **Photo mode:** pause, free camera, hide the HUD.
- **Play Store release:** store listing, screenshots and a privacy policy (the
  signed bundle is already built for each release).
- **Mod-friendly data:** missions and chambers as data files, so new missions
  can be made without code.
