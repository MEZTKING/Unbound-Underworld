# Unbound Underworld

A fast, top-down action roguelike for desktop, phones and the browser. You fight your way out of the realm of the dead, one chamber at a time. The core loop is modeled on **Hades**, and it adds systems inspired by **Minecraft Dungeons II**: jump attacks, cooldown artifacts, enchantments, loot chests and enchanted foes.

![Combat in Tartarus](docs/combat.png)

| | |
|---|---|
| ![Title](docs/title.png) | ![Choosing a boon](docs/boons.png) |
| ![Talos, the Bronze Colossus](docs/boss.png) | |

## Download

Get the latest build from the [Releases page](https://github.com/MEZTKING/Unbound-Underworld/releases):

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

### Updates

When a new version comes out, the title screen shows **Update now**. You can also check under *Settings → Check for updates*. Your progress carries over.

- **Windows (installer) and Linux:** one press downloads the update, and the game restarts on the new version.
- **Windows (portable), macOS and Android:** the button downloads the new version for you. Open the file to install it over the old one.
- **Web version:** the game picks up the new version on its own. If it's open while you update the site, it offers *Restart to update*.

### iPhone and iPad (the web version)

iPhones only install apps from the App Store, so on iOS you play the web version instead. Each release includes `Unbound-Underworld-<version>-web.zip`. Put it on a free static host once, and you get a link you can open on any phone or computer:

- **Cloudflare Pages** (free, recommended): sign up at [cloudflare.com](https://dash.cloudflare.com/sign-up), then go to *Workers & Pages → Create → Pages → Upload assets*. Name the project and drop in the zip. You get an address like `https://unbound-underworld.pages.dev`. To update it later, upload the newer zip to the same project.
- **Netlify Drop:** drag the unzipped folder onto [app.netlify.com/drop](https://app.netlify.com/drop). Create a free account when it asks, or the site is deleted after an hour.
- **itch.io:** create a project, set *Kind of project* to *HTML*, upload the zip and tick *This file will be played in the browser*. This is the easiest place to share the game with friends. The game runs inside the itch.io page, though, so it doesn't open fullscreen from the home screen like the options above.

Open your link in Safari and tap *Share → Add to Home Screen* (in Chrome on Android: *⋮ → Add to Home screen*). The game then opens fullscreen like an app, works offline and keeps its saves on the phone. Hold your phone sideways to play.

On touch screens, drag anywhere on the left half to move. The buttons on the right are **⚔** Attack (hold to repeat or charge, drag to aim), **✦** Special, **◆** Cast, **»** Dash and **⤒** Jump. The small buttons above them are your artifacts and **⚗** potion. Without a drag, attacks aim at the nearest foe.

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
| Attack (hold to repeat or charge) | `LMB` or `J` | `X` |
| Special | `RMB` or `K` | `Y` |
| Cast a shard | `Q` or `L` | `RB` |
| Dash (brief invulnerability) | `Space` | `A` |
| Jump (attack mid-air to **Slam**) | `Shift` or `C` | `B` |
| Artifacts | `1` `2` `3` | `RT` · `LT` · `L3` |
| Healing potion | `R` | `LB` |
| Wrath (ultimate, when the gauge is full) | `F` | `R3` |
| Interact | `E` | `Select` / `R3` |
| Pause · Mute | `Esc` · `M` | `Start` |

Menus work with the mouse, arrow keys with `Enter`/`Space`, or the D-pad with `A`/`B`. Number keys pick cards directly.

New players start with just Attack, Special and Dash. The other controls unlock as you level up (see below), and the HUD, the touch buttons and the in-game control lists only show what you've unlocked.

## What's in it

### Progression
- **Levels and ranks.** Slain foes, cleared chambers, guardians and escapes earn experience that carries over between runs. There are 30 levels in five rank tiers: Shade, Wraith, Revenant, Champion and Unbound.
- **Gentle onboarding.** The first runs only have Attack, Special and Dash. New mechanics unlock one at a time, each announced with a short explanation: Healing Potion (level 2), Cast (3), Jump & Slam (4), Artifacts (5), Enchantments (6), Hephaestus' Anvil (7), a second artifact slot (8), Wrath (10) and a third artifact slot (12).
- **Talents.** Every level gives a point to spend at *Ascension* in the hub. There are 14 talents in five rows, and each row opens with a new rank tier. Resetting your talents is free.
- **Weapon forging.** At the Armory, spend Ash to forge each weapon from Tier I up to Tier V (Mythic) for more damage. From Tier III (Awakened), every fourth Attack also unleashes an arcane wave. The waves grow at Tier IV, and at Tier V they split in three and the weapon blazes.
- **Heroes.** Six heroes, each with their own look, perks and **Wrath** ultimate. You choose them in the Hall of Heroes. *Kael* (Inferno Nova), *Lyra* (Moonfall) and *Doran* (Titan's Quake) are available from the start. *Ione* (Tidal Surge) unlocks at level 8, *Erebos* (Eclipse) after slaying 2 guardians, and *Selene* (Starfall) after your first escape.
- **Wrath.** A golden gauge that fills as you deal and take damage. When it's full, press `F` to unleash your hero's screen-clearing ultimate.
- **Late-game weapons.** *Titan Gauntlets* (level 8): rapid punch combos and a rocketing Meteor Fist. *Reaper's Crescent* (level 14): wide sweeps and spectral scythes that orbit you. Each comes with its own anvil upgrades.

### The Hades-style core
- **Combat.** Each weapon has a combo, a dash-strike and a special. You get a cast shard that lodges in foes and has to be picked up again. The dash has invulnerability frames. Hits have hit-stop, screen shake and knockback, and every enemy attack is telegraphed on the ground.
- **Five weapons.** *Nightblade* (sword: combo plus Nova Smash), *Thornspear* (thrusts, a charged spin, and a spear you throw and recall) and *Moonbow* (charged shots with a perfect-timing Power Shot, plus a volley), followed later by the *Titan Gauntlets* and *Reaper's Crescent*. Each weapon has its own anvil upgrades.
- **Boons from eight Olympians plus Hermes.** Each god has Attack, Special, Cast and Dash boons, each with its own status effect: lightning, knockback and wall slams, deflection, Doom, Weak, critical hits, Hangover and Chill. Boons come in Common, Rare, Epic and Heroic rarity. There are six duo boons, a limit of four gods per run, and Pomegranates that level boons up.
- **The run.** Tartarus, then Asphodel, then Elysium, then the Gates of the Styx: 20+ procedurally laid-out chambers. Each exit door shows its reward ahead of time (boon, Pomegranate, obols, Titan Heart, Ash, anvil, Hermes, enchantment, artifact, shop or fountain). Charon sells wares, and an antechamber with a shop and a fountain comes before each guardian.
- **Four guardians.** *Campe*, Jailer of Tartarus. *The Hydra*, which grows extra heads. *Talos, the Bronze Colossus*: break his armor and he overheats, leaving him open. *Cerberus*, Warden of the Gate, who charges, breathes fire and leap-slams.
- **Meta-progression.** Ash carries over when you die. In the Hall of Shades hub you can spend it on 11 permanent upgrades, unlock and forge weapons, unlock starting artifacts, pick your hero, spend talent points at Ascension, read your stats in the Chronicle, raise the difficulty with *Torment* levels at the Oath of Torment, and practice on a training dummy.

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
- **Gameplay:** Assist mode (take half damage), aim assist, damage numbers, control hints.
- **Display:** screen shake, flash intensity, hit-stop, an FPS counter and fullscreen.
- **Touch:** button size and opacity, a left-handed (mirrored) layout, and vibration.

## Development

```bash
npm test           # Vitest unit tests (combat pipeline, boons, rooms, run flow, saves)
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

The **App builds** GitHub workflow builds Windows, macOS, Linux, Android and the web version zip. Push a version tag and it publishes everything on a GitHub Release:

```bash
npm version patch               # bump the version in package.json and create a tag such as v0.1.1
git push --follow-tags
```

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
    render.ts    room art, lighting, effects     hud.ts  HUD
  ui/            DOM menus (boon cards, altar, armory, pause…) and touch controls
tests/           Vitest suites
```

The art is all drawn in code on the canvas, and every sound and the music are synthesized with WebAudio, so the game ships without any image or audio files. The fonts (Cinzel and EB Garamond, under the SIL Open Font License) are bundled, so the game also runs offline. Progress is saved to `localStorage`.

## Credits

This is an original fan project, inspired by *Hades* (Supergiant Games) and *Minecraft Dungeons* (Mojang Studios / Microsoft). It has no affiliation with either, and it uses none of their assets, characters or names. The gods, monsters and places come from Greek mythology.
