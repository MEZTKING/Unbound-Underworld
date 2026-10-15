# Unbound Underworld

A fast, top-down action roguelike for desktop, phones and the browser. You fight your way out of the realm of the dead, one chamber at a time. The core loop is modeled on **Hades**, and it adds systems inspired by **Minecraft Dungeons II**: jump attacks, cooldown artifacts, enchantments, loot chests and enchanted foes.

![Combat in the Shackled Deep](docs/combat.png)

| | |
|---|---|
| ![Title](docs/title.png) | ![Choosing a boon](docs/boons.png) |
| ![Aurex, the Gilded Colossus](docs/boss.png) | |

## Download

Get the latest build from the [Releases page](https://github.com/MEZTKING/Unbound-Underworld/releases).

> For now, new releases include only the **Windows installer** and the **Android APK**. The portable Windows build, macOS, Linux and the web zip were last published in [v0.2.1](https://github.com/MEZTKING/Unbound-Underworld/releases/tag/v0.2.1). They can be built again at any time (see *App builds* below).


| Platform | File | How to run |
|---|---|---|
| Windows | `Unbound-Underworld-Setup-<version>.exe` | Run the installer. |
| Windows (no install) | `Unbound-Underworld-<version>-Portable.exe` | Double-click to play. |
| macOS (Intel & Apple silicon) | `Unbound-Underworld-<version>-mac-universal.dmg` | Open the disk image and drag the app to Applications. |
| Linux | `Unbound-Underworld-<version>-linux-x86_64.AppImage` | `chmod +x` the file, then run it. |
| Android | `Unbound-Underworld-<version>-android.apk` | Open the file on your phone and allow installing from this source when asked. |

The builds are **not code-signed** by a store, so your system will warn you the first time you open the game:

- **Windows:** in the SmartScreen prompt, choose *More info → Run anyway*.
- **macOS:** right-click the app and choose *Open*, then confirm. If it still refuses, run `xattr -cr "/Applications/Unbound Underworld.app"`.
- **Android:** allow "Install unknown apps" for your browser or file manager.

In the desktop app, press `F11` or `Alt+Enter` to toggle fullscreen. Your progress is saved on your device.

**Saving and quitting.** An escape in progress is saved automatically at the start of every chamber. In the pause menu, *Save & Quit to Title* (or *Save & Exit Game* in the desktop and Android apps) lets you stop at any time. *Resume Escape* on the title screen picks up at the start of that chamber, even if the app was closed.

### Updates

When a new version comes out, the title screen shows **Update now**. You can also check under *Settings → Check for updates*. Your progress carries over.

- **Windows (installer) and Linux:** one press downloads the update, and the game restarts on the new version.
- **Android (from 0.6.0):** one press downloads the update inside the game and opens Android's installer; tap *Update* there and you're done. The first time, Android asks you to allow installs from Unbound Underworld. (Versions before 0.6.0 open the download in the browser instead.)
- **Windows (portable) and macOS:** the button downloads the new version for you. Open the file to install it over the old one.
- **Web version:** the game picks up the new version on its own. If it's open while you update the site, it offers *Restart to update*.

### iPhone and iPad (the web version)

iPhones only install apps from the App Store, so on iOS you play the web version instead. Each release includes `Unbound-Underworld-<version>-web.zip`. Put it on a free static host once, and you get a link you can open on any phone or computer:

- **Cloudflare Pages** (free, recommended): sign up at [cloudflare.com](https://dash.cloudflare.com/sign-up), then go to *Workers & Pages → Create → Pages → Upload assets*. Name the project and drop in the zip. You get an address like `https://unbound-underworld.pages.dev`. To update it later, upload the newer zip to the same project.
- **Netlify Drop:** drag the unzipped folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Create a free account when it asks, or the site is deleted after an hour.
- **itch.io:** create a project, set *Kind of project* to *HTML*, upload the zip and tick *This file will be played in the browser*. This is the easiest place to share the game with friends. The game runs inside the itch.io page, though, so it doesn't open fullscreen from the home screen like the options above.

Open your link in Safari and tap *Share → Add to Home Screen* (in Chrome on Android: *⋮ → Add to Home screen*). The game then opens fullscreen like an app, works offline and keeps its saves on the phone. Hold your phone sideways to play.

On touch screens, drag anywhere on the left half to move. The buttons on the right are **⚔** Attack (tap to chain, hold after a hit for a powered attack, drag to aim), **✦** Special, **◆** Cast, **»** Dash, **⤒** Jump and **⛨** Guard. The small buttons above them are your artifacts and **⚗** potion. Without a drag, attacks aim at the nearest foe.

## Game documentation

- **[docs/DESIGN.md](docs/DESIGN.md):** how the game works. Covers the run structure, progression and unlock order, combat, build systems, heroes, enemy and boss behaviour, where everything lives in the code, and how to add new content.
- **[docs/GAME_DATA.md](docs/GAME_DATA.md):** every number in the game, generated from the code. This includes the level table, talents, heroes, weapons and forge tiers, every boon, enchantment and artifact, regions, enemies, guardians and Torment. Run `npm run docs` after changing game data; CI checks that it's up to date.

## Play from source

```bash
npm install
npm run dev        # play in the browser at http://localhost:5173
npm run desktop    # or play in the desktop app window
```

To try the touch controls on a computer, open the browser's device toolbar (phone emulation) and reload.

`npm run build` writes a static site to `dist/`. It uses relative paths, so you can host it on any static server, in a subfolder too.

## Controls

| Action | Keyboard & mouse | Gamepad |
|---|---|---|
| Move / aim | `WASD` / mouse | Left stick / right stick |
| Attack (tap to chain; hold after a hit for the powered attack) | `LMB` or `J` | `X` |
| Special | `RMB` or `K` | `Y` |
| Cast a shard | `Q` or `L` | `RB` |
| Dash (brief invulnerability) | `Space` | `A` |
| Jump (attack mid-air to **Slam**) | `Shift` or `C` | `B` |
| Guard (hold to block, tap just before a hit to parry) | `V` | `LT` |
| Artifacts | `1` `2` `3` | `RT` · D-pad left · `L3` |
| Healing potion | `R` or `4` | `LB` |
| Wrath (ultimate, when the gauge is full) | `F` or `5` | `R3` |
| Interact | `E` | `Select` / `R3` |
| Pause · Mute | `Esc` · `M` | `Start` |

Menus work with the mouse, arrow keys with `Enter`/`Space`, or the D-pad with `A`/`B`. Number keys pick cards directly.

Every keyboard key can be changed under *Settings → Controls → Key bindings* (arrows, `Enter` and `Esc` always keep working in menus).

You can walk while you fight: basic attacks keep most of your speed and never push you forward, and only moves that are meant to (dash-strikes, some specials) lunge.

**The combat grammar.** Every weapon works the same way: tap Attack to chain hits; hold Attack after a chain hit to charge its **powered attack** (let go on the flash for a *Perfect*, +25%); use your Special straight out of a chain for a faster, stronger **combo special**. Hits in a row without getting hurt build the **combo meter** (+1% damage per 10 hits, up to +10%).

**Guard and parry** (level 2). Hold Guard to block hits from the front; blocking drains a guard meter, and an empty meter staggers you. Tap Guard just before a hit lands to **parry**: no damage, the foe staggers, shots fly back, and your next attack is a sure critical **riposte**. Ground shockwaves can't be guarded: jump or dash. Each class guards its own way (see Heroes).

New players start with just Attack, Special and Dash. The other controls unlock as you level up (see below), and the HUD, the touch buttons and the in-game control lists only show what you've unlocked.

## What's in it

### Progression
- **Levels and ranks.** Slain foes, cleared chambers, guardians and escapes earn experience that carries over between runs. There are 30 levels in five rank tiers: Shade, Wraith, Revenant, Champion and Unbound.
- **Gentle onboarding.** The first runs only have Attack, Special and Dash. New mechanics unlock one at a time, each announced with a short explanation: Guard & Parry, Healing Potion and Gear (level 2), Cast (3), Artifacts (4), Jump & Slam (5, or as soon as you slay the final guardian), Enchantments (6), Hephaestus' Anvil (7), a second artifact slot (8), Wrath (10) and a third artifact slot (12).
- **Talents.** Every level gives a point to spend at *Ascension* in the hub. There are 14 talents in five rows, and each row opens with a new rank tier. Resetting your talents is free.
- **Weapon forging.** At the Armory, spend Ash to forge each weapon from Tier I up to Tier V (Mythic) for more damage. From Tier III (Awakened), every fourth Attack also unleashes an arcane wave. The waves grow at Tier IV, and at Tier V they split in three and the weapon blazes.
- **Heroes are classes.** Eight heroes, each with their own signature weapon, guard style, perks and **Wrath** ultimate. Pick them in the Hall of Heroes (or pick a weapon at the Armory). From the start: *Kael* the Warrior (Nightblade sword, blade parry), *Lyra* the Ranger (Moonbow, evasive sidestep) and *Doran* the Vanguard (Thornspear and a tower shield). Then, as you rank up: *Gorran* the Brawler (Titan Gauntlets, level 5), *Ione* the Monk (Riptide Chains nunchaku, level 8), *Erebos* the Reaper (Reaper's Crescent, level 10 or 2 guardians), *Rook* the Gunner (Thunderbuss blunderbuss, level 12) and *Selene* the Duelist (Starsplitter katana, level 15 or your first escape). Ash spent unlocking weapons in earlier versions is refunded.
- **Wrath.** A golden gauge that fills as you deal and take damage. When it's full, press `F` to unleash your hero's screen-clearing ultimate.
- **Loot and gear.** From your very first escape, foes drop materials (Bone Dust, Ember Shards, Golden Ichor, Gate Pearls, Titan Scales), and foes, chests and guardians drop gear: helmets, armor, leggings and boots with random bonuses (health, damage, speed, critical chance, damage taken, dash recharge and more). Gear comes in seven tiers: Common, Uncommon, Rare, Epic, Legendary, Unique and the very rare Ghost. Unique and Ghost pieces carry a perk of their own (an extra dash, Death Defiance, healing on kills…). Star a piece up from 1 to 5 gold stars, then on to 10, as the stars turn purple one by one. Drops fly to you when you walk near them (and all of them when a chamber is cleared), a feed on the left lists what you picked up, and the end of each escape shows your **Spoils**. Manage it all in *Gear & Inventory* (level 2, at the Armory or in the pause menu): equip, star up with materials, salvage, or craft new pieces.
- **Save slots.** Four independent journeys; switch on the title screen.
- **Map.** The pause menu shows every region's chambers, where you are, the guardian ahead and your best run.

### The Hades-style core
- **Combat.** Each weapon has a chain, a powered attack, a dash-strike, a special and a slam. You get a cast shard that lodges in foes and has to be picked up again. The dash has invulnerability frames. Hits have hit-stop, screen shake and knockback, and every enemy attack is telegraphed on the ground.
- **Eight weapons, one per class.** *Nightblade* (Crescent Cleave), *Moonbow* (quick shots, Power Shot, Rain of Arrows), *Thornspear* (Skewer Lance, a spin, a spear you throw and recall), *Titan Gauntlets* (Titan Uppercut, Meteor Fist), *Riptide Chains* (Whirlpool, Tidal Snap), *Reaper's Crescent* (Harvest, Soul Reap), *Thunderbuss* (Grapeshot Cannon, Powder Keg) and *Starsplitter* (Moonlit Iaido, Thousand Cuts). Each weapon has three or more anvil upgrades.
- **Foes that fight fair.** Foes turn at their own speed (circle a Brute to get behind it), lock their aim when a windup starts, take turns (only a few attack at once while the rest circle), come at you from different sides, and pause a moment after appearing. Higher Torment makes them more aggressive and more accurate.
- **Boons from eight Olympians plus Hermes.** Each god has Attack, Special, Cast and Dash boons, each with its own status effect: lightning, knockback and wall slams, deflection, Doom, Weak, critical hits, Hangover and Chill. Boons come in Common, Rare, Epic and Heroic rarity. There are six duo boons, a limit of four gods per run, and Pomegranates that level boons up.
- **The run.** The Shackled Deep, then the Ember Fields, then the Gilded Groves, then the Last Gate: 20+ procedurally laid-out chambers. Each exit door shows its reward ahead of time (boon, Pomegranate, obols, Titan Heart, Ash, anvil, Hermes, enchantment, artifact, shop or fountain), with a short description: on PC point at the door's icon (or walk up to it); on phones it's on the floor in front of the door. Reward choices have a *Your build* button for reviewing the boons you already have, and every one of them can be skipped for 25 obols. Shops never block the way: walk through any door. Charon sells wares; what each one does is blurred until you've bought that kind once. An antechamber with a shop and a fountain comes before each guardian.
- **Four guardians.** *Vexa*, Warden of Chains. *The Many-Maw*, which grows extra heads. *Aurex, the Gilded Colossus*: break his armor and he overheats, leaving him open. *Threefang*, Hound of the Last Gate, who charges, breathes fire and leap-slams.
- **Meta-progression.** Ash carries over when you die. In the Hall of Shades hub you can spend it on 11 permanent upgrades, unlock and forge weapons, unlock starting artifacts, pick your hero, spend talent points at Ascension, read your records, the **bestiary** (each foe stays a black silhouette until you slay it) and **achievements** in the Chronicle, customise your hero's colours and headwear, raise the difficulty with *Torment* levels at the Oath of Torment, and practice on a training dummy.

### Inspired by Minecraft Dungeons II
- **Jump and Slam.** Hop over lava, chasms, spike traps and boss shockwaves. Attack mid-air for a weapon-specific ground slam.
- **Artifacts.** Three hotbar slots with 12 artifacts to find. Some run on cooldowns: Mending Totem, Thunder Rod, Gale Horn, Bone Whistle (summons a wolf), Ember Volley and others. Others spend **souls** gathered from fallen foes: Spirit Lantern, Soul Reaper, and the channeled Void Prism beam.
- **Healing potion** on a cooldown.
- **Enchantments.** A third build layer separate from the gods: 13 enchantments (Reverberation, Shackling, Combustion, Bloodthirst, Frenzy, Executioner, Singularity, Searing and more). Finding one again raises its tier, up to III.
- **Enchanted foes.** Swift, Armored, Volatile and Regenerating variants with a violet aura.
- **Treasure chests**, and some of them are Mimics.
- **New foes.** Hisslings (fused exploders), Weavers (web spitters that slow you) and Bonecallers (summoners).

### Settings
*Settings* (on the title screen or in the pause menu) has:
- **Audio:** sound and music volume, mute.
- **Gameplay:** Assist mode (take half damage), aim assist, damage numbers, control hints, and (on phones) door descriptions for every door or only the one you walk up to.
- **Display:** the **3D voxel view** (on by default, with a Hades-style angled camera) or the classic 2D view, plus **UI size**, a **window mode** on desktop (Windowed, Borderless or Fullscreen), screen shake, flash intensity, hit-stop, an FPS counter and fullscreen. On desktop the 3D view has real-time shadows and lights. Phones get a lighter version without shadows, at a lower resolution. If a device can't run WebGL, the game uses the 2D view.
- **Touch:** button size and opacity, a left-handed (mirrored) layout, and vibration.

On PC, point at a HUD icon (boons, enchantments, artifacts, potion) to see what it does. The synthesized score uses strings, flute, bells, a lyre, a choir and drums; each guardian has its own battle theme, which intensifies (and brings in the choir) in phase 2.

**Autosave.** The game saves at the start of every chamber (a small *Saved* mark appears at the top of the screen), whenever you pick up loot or change something in the hub, and whenever you switch away from it.

**Developer options.** A hidden test menu: tap the version number in Settings seven times (or add `?dev` to the address). It has god mode, play-at-level, +Ash, unlock everything, test chambers for every region and room type, and in-run tools (boons, artifacts, obols, Wrath, spawning foes and guardians). Using it switches achievements off until the game restarts.

## Development

```bash
npm test           # Vitest unit tests (combat pipeline, boons, rooms, run flow, saves)
npm run docs       # regenerate docs/GAME_DATA.md from the game data
npm run typecheck
npm run build
```

### App builds

The desktop app is the same game wrapped in [Electron](https://www.electronjs.org/) (`electron/main.cjs`), packaged with [electron-builder](https://www.electron.build/). The Android app wraps it with [Capacitor](https://capacitorjs.com/) (`android/`).

```bash
npm run dist:desktop            # installers for your current OS, written to release/
npm run dist:desktop -- --linux # or pick a platform: --win, --mac, --linux
npm run android:apk             # Android debug APK (needs the Android SDK and Java 21)
```

The **App builds** GitHub workflow builds the Windows installer and the Android APK. To also build the portable Windows exe, macOS, Linux and the web version zip, run it from the Actions tab with *all_platforms* ticked. Push a version tag and it publishes the builds on a GitHub Release:

```bash
npm version patch               # bump the version in package.json and create a tag such as v0.1.1
git push --follow-tags
```

Build artifacts are kept for only one day and aren't uploaded for pull requests. After a release is published, the release job deletes them, because the downloads live on the Release. The **Clean up artifacts** workflow runs weekly and can be started from the Actions tab: it removes leftovers to keep the account's Actions storage low.

You can also release without the command line: open *Actions → App builds → Run workflow* and enter the version from `package.json` (for example `0.1.1`). The workflow builds everything, creates the `v0.1.1` tag and publishes the Release. If you leave the version empty, the installers are only attached to the run as downloadable artifacts.

**Android signing (needed for updates and Google Play).** Without extra setup, the APK is signed with a throwaway debug key. Each build gets a different key, so Android refuses to install a newer version over the old one ("App not installed"), and the old one has to be uninstalled first, which loses its saves. Set this up before you share the APK, so every build is signed with the same key. Create a key once:

```bash
keytool -genkeypair -v -keystore unbound.keystore -alias unbound -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 unbound.keystore   # on macOS: base64 -i unbound.keystore
```

Then add these repository secrets (*Settings → Secrets and variables → Actions*): `ANDROID_KEYSTORE_BASE64` (the base64 output), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`unbound`) and `ANDROID_KEY_PASSWORD`. Keep the keystore file and passwords somewhere safe and private: you need the same key for every future update, and anyone who has it can sign apps as you.

**Google Play.** Once the signing secrets are set, each **App builds** run also makes `Unbound-Underworld-<version>-play.aab`. Download it from the run's *Artifacts* section; it isn't attached to the public release. That build has no in-game update button, because Google Play installs updates itself. To publish:

1. Create a [Google Play Console](https://play.google.com/console) developer account (a one-time fee of US$25).
2. Create the app, fill in the store listing, content rating and data safety forms, and link a privacy policy. The game collects no data: saves stay on the device.
3. Upload the `.aab` to a release track. Google keeps the final app-signing key (Play App Signing); your key becomes the *upload key*.
4. For each new version, bump the version in `package.json`, run the workflow and upload the new `.aab`. Play then updates players' games automatically.

New personal developer accounts must run a closed test with at least 12 testers for 14 days before the app can go public.

### Debug parameters

These URL parameters are handy for testing:

| Param | Effect |
|---|---|
| `?god` | Take no damage |
| `?biome=0..3` | Start runs in a later region |
| `?room=boss` | Start a run in that region's guardian chamber |
| `?weapon=sword\|spear\|bow\|fists\|scythe` | Try a weapon for this session |
| `?level=12` | Play at that level for this session (unlocks everything up to it) |
| `?seed=123` | Use a fixed run seed |
| `?dev` | Show the developer options |
| `?view=2d` | Use the classic 2D view for this session |
| `?quality=high\|balanced` | Force the 3D view's quality (shadows on or off) |

### Project layout

```
electron/        desktop app shell (window, app:// file serving, fullscreen toggle, self-updating)
android/         Android app project (Capacitor): landscape, immersive fullscreen, icons
pwa/             service worker template for the installable web version
public/          web manifest and home-screen icons
build/           app icon used for the installers
src/
  updates.ts     update checks against the latest GitHub release, and the one-button update
  engine/        math & RNG, collision, input (keyboard/mouse/gamepad), synth audio, camera, particles
  game/
    game.ts      orchestrator: hub, run flow, rewards, shop, saves (implements WorldHost)
    world.ts     one room's simulation: actors, hitboxes, projectiles, zones, traps, doors, flow-field AI
    player.ts    movement, dash, jump/slam, cast, potion, action state machine
    weapons.ts   sword, spear, bow (and shared weapon helpers)
    boons.ts     gods, boons, duos, rarities, offers, stat computation
    progression.ts  levels, rank tiers, feature unlocks, talents, weapon forge
    characters.ts   heroes, their perks and Wrath ultimates
    arsenal.ts   late-game weapons (Titan Gauntlets, Reaper's Crescent)
    prefs.ts     live gameplay/display settings
    enchants.ts  enchantments    artifacts.ts  artifacts & allies
    combat.ts    damage pipeline and status effects
    enemies/     enemy base class, regular foes, bosses
    rooms.ts     biomes, procedural layouts, encounters
    run.ts       per-run state and door rewards
    meta.ts      save data and permanent upgrades
    render.ts    2D room art, lighting, effects, and the overlay drawn over the 3D view     hud.ts  HUD
  render3d/
    voxel.ts     the 3D voxel view (three.js): block rooms, props, doors and animated figures
  ui/            DOM menus (boon cards, altar, armory, pause…) and touch controls
tests/           Vitest suites
scripts/         gen-docs.ts (writes docs/GAME_DATA.md)
docs/            DESIGN.md (how the game works), GAME_DATA.md (generated reference), screenshots
```

The art is all made in code: the 3D view builds every room, prop and character from blocks with three.js, and the 2D view draws them on a canvas. Every sound and the music are synthesized with WebAudio, so the game ships without any image or audio files. The fonts (Cinzel and EB Garamond, under the SIL Open Font License) are bundled, so the game also runs offline. Progress is saved to `localStorage`.

## Credits

This is an original fan project, inspired by *Hades* (Supergiant Games) and *Minecraft Dungeons* (Mojang Studios / Microsoft). It has no affiliation with either, and it uses none of their assets, characters or names. The gods, monsters and places come from Greek mythology.
