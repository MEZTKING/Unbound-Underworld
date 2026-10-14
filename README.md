# Unbound Underworld

A fast, top-down action roguelike for the browser. You fight your way out of the realm of the dead, one chamber at a time. The core loop is modeled on **Hades**, and it adds systems inspired by **Minecraft Dungeons II**: jump attacks, cooldown artifacts, enchantments, loot chests and enchanted foes.

![Combat in Tartarus](docs/combat.png)

| | |
|---|---|
| ![Title](docs/title.png) | ![Choosing a boon](docs/boons.png) |
| ![Talos, the Bronze Colossus](docs/boss.png) | |

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes a static site to `dist/`. It uses relative paths, so you can host it on GitHub Pages, itch.io or any static server.

## Controls

| Action | Keyboard & mouse | Gamepad |
|---|---|---|
| Move / aim | `WASD` / mouse | Left stick / right stick |
| Attack (hold to repeat or charge) | `LMB` or `J` | `X` |
| Special | `RMB` or `K` | `Y` |
| Cast a shard | `Q` or `L` | `RB` |
| Dash (brief invulnerability) | `Space` | `A` |
| Jump (attack mid-air to **Slam**) | `Shift` or `C` | `B` |
| Artifacts | `1` `2` `3` | `RT` · `LT` · `L3` |
| Healing potion | `R` | `LB` |
| Interact | `E` | `Select` / `R3` |
| Pause · Mute | `Esc` · `M` | `Start` |

Menus work with the mouse, arrow keys with `Enter`/`Space`, or the D-pad with `A`/`B`. Number keys pick cards directly.

## What's in it

### The Hades-style core
- **Combat.** Each weapon has a combo, a dash-strike and a special. You get a cast shard that lodges in foes and has to be picked up again. The dash has invulnerability frames. Hits have hit-stop, screen shake and knockback, and every enemy attack is telegraphed on the ground.
- **Three weapons.** *Nightblade* (sword: combo plus Nova Smash), *Thornspear* (thrusts, a charged spin, and a spear you throw and recall) and *Moonbow* (charged shots with a perfect-timing Power Shot, plus a volley). Each weapon has five anvil upgrades.
- **Boons from eight Olympians plus Hermes.** Each god has Attack, Special, Cast and Dash boons, each with its own status effect: lightning, knockback and wall slams, deflection, Doom, Weak, critical hits, Hangover and Chill. Boons come in Common, Rare, Epic and Heroic rarity. There are six duo boons, a limit of four gods per run, and Pomegranates that level boons up.
- **The run.** Tartarus, then Asphodel, then Elysium, then the Gates of the Styx: 20+ procedurally laid-out chambers. Each exit door shows its reward ahead of time (boon, Pomegranate, obols, Titan Heart, Ash, anvil, Hermes, enchantment, artifact, shop or fountain). Charon sells wares, and an antechamber with a shop and a fountain comes before each guardian.
- **Four guardians.** *Campe*, Jailer of Tartarus. *The Hydra*, which grows extra heads. *Talos, the Bronze Colossus*: break his armor and he overheats, leaving him open. *Cerberus*, Warden of the Gate, who charges, breathes fire and leap-slams.
- **Meta-progression.** Ash carries over when you die. In the Hall of Shades hub you can spend it on 11 permanent upgrades, unlock weapons and starting artifacts, read your stats in the Chronicle, raise the difficulty with *Torment* levels at the Oath of Torment, and practice on a training dummy.

### Inspired by Minecraft Dungeons II
- **Jump and Slam.** Hop over lava, chasms, spike traps and boss shockwaves. Attack mid-air for a weapon-specific ground slam.
- **Artifacts.** Three hotbar slots with 12 artifacts to find. Some run on cooldowns: Mending Totem, Thunder Rod, Gale Horn, Bone Whistle (summons a wolf), Ember Volley and others. Others spend **souls** gathered from fallen foes: Spirit Lantern, Soul Reaper, and the channeled Void Prism beam.
- **Healing potion** on a cooldown.
- **Enchantments.** A third build layer separate from the gods: 13 enchantments (Reverberation, Shackling, Combustion, Bloodthirst, Frenzy, Executioner, Singularity, Searing and more). Finding one again raises its tier, up to III.
- **Enchanted foes.** Swift, Armored, Volatile and Regenerating variants with a violet aura.
- **Treasure chests**, and some of them are Mimics.
- **New foes.** Hisslings (fused exploders), Weavers (web spitters that slow you) and Bonecallers (summoners).

## Development

```bash
npm test           # Vitest unit tests (combat pipeline, boons, rooms, run flow, saves)
npm run typecheck
npm run build
```

These URL parameters are handy for testing:

| Param | Effect |
|---|---|
| `?god` | Take no damage |
| `?biome=0..3` | Start runs in a later region |
| `?room=boss` | Start a run in that region's guardian chamber |
| `?weapon=sword\|spear\|bow` | Try a weapon for this session |
| `?seed=123` | Use a fixed run seed |

### Project layout

```
src/
  engine/        math & RNG, collision, input (keyboard/mouse/gamepad), synth audio, camera, particles
  game/
    game.ts      orchestrator: hub, run flow, rewards, shop, saves (implements WorldHost)
    world.ts     one room's simulation: actors, hitboxes, projectiles, zones, traps, doors, flow-field AI
    player.ts    movement, dash, jump/slam, cast, potion, action state machine
    weapons.ts   sword, spear, bow
    boons.ts     gods, boons, duos, rarities, offers, stat computation
    enchants.ts  enchantments    artifacts.ts  artifacts & allies
    combat.ts    damage pipeline and status effects
    enemies/     enemy base class, regular foes, bosses
    rooms.ts     biomes, procedural layouts, encounters
    run.ts       per-run state and door rewards
    meta.ts      save data and permanent upgrades
    render.ts    room art, lighting, effects     hud.ts  HUD
  ui/            DOM menus (boon cards, altar, armory, pause…)
tests/           Vitest suites
```

The art is all drawn in code on the canvas, and every sound and the music are synthesized with WebAudio, so the game ships without any image or audio files. Progress is saved to `localStorage`.

## Credits

This is an original fan project, inspired by *Hades* (Supergiant Games) and *Minecraft Dungeons* (Mojang Studios / Microsoft). It has no affiliation with either, and it uses none of their assets, characters or names. The gods, monsters and places come from Greek mythology.
