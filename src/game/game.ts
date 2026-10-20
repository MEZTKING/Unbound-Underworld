import { dailyFor, dailyKey, dailyScore, recordDaily, type DailyRun } from './daily';
import { applyColorMode } from './palette';
import { audio, type Mood } from '../engine/audio';
import { Camera } from '../engine/camera';
import { Input, keyLabel, PadControl, type Action, type Control } from '../engine/input';
import { clamp, damp, fx, Rng } from '../engine/math';
import { Particles } from '../engine/particles';
import { UI, type ChoiceOpts } from '../ui/overlay';
import * as screens from '../ui/screens';
import { syncAfterEscape, syncAtStart } from '../ui/multiplayer';
import { TouchControls } from '../ui/touch';
import { ARTIFACT_BY_ID, ARTIFACTS } from './artifacts';
import {
  BOON_BY_ID,
  GODS,
  OLYMPIANS,
  RARITY_COLOR,
  boonValue,
  computeStats,
  needsCast,
  pomCandidates,
  boonRarityOdds,
  rollBoonOffers,
  rollHammerOffers,
  takeBoon,
  type BoonOffer,
} from './boons';
import { CHARACTER_BY_ID, characterUnlocked, type CharacterId } from './characters';
import { createBoss } from './enemies';
import type { Enemy } from './enemies/enemy';
import { ENCHANT_BY_ID, rollEnchantOffers, takeEnchant } from './enchants';
import { Pickup } from './entities';
import type { NetSession } from '../net/session';
import { drawHUD, drawHudTooltip, drawPartnerHUD, drawSaveIcon, setPartnerShown, useKeyLabels } from './hud';
import { newAchievements } from './codex';
import { applyGear, costText, equippedItems, gearDefiance, GEAR_RARITY, INVENTORY_SIZE, MATERIALS, regionMaterial, rollDrop, rollGhost, rollStarred, salvageValue, SLOT_NAME, type MaterialId } from './gear';
import type { Loot } from './entities';
import { applyAltar } from './altar';
import { applySkills, HERO_MAX_LEVEL, heroLevelFromXp, heroPoints, heroXpForLevel, spentSkill } from './herotree';
import { partFor, SMITH_PART_BY_ID } from './smith';
import { smithScreen } from '../ui/smith';
import { loadRun, loadSave, writeRun, writeSave, type SaveData } from './meta';
import { Player, useHeroLooks } from './player';
import { prefs } from './prefs';
import { applyFeatures, applyForge, applyLevel, hasFeature, levelFromXp, tierFor, unlocksAt, XP } from './progression';
import { REWARD_INFO, renderOpts, renderOverlay } from './render';
import type { VoxelQuality, VoxelRenderer } from '../render3d/voxel';
import { BIOMES, generateEncounter, generateLayout, hubLayout, type Wave } from './rooms';
import { MISSION_BY_ID, missionReward, missionStars, recordMission, type Mission, type MissionRoom } from './campaign';
import { Run, type LeftBehind, type RoomPlan, type RunSnapshot, type Spoils } from './run';
import type { PlayerStats } from './stats';
import type { GodId, RewardSpec } from './types';
import { createWeapon, WEAPON_INFO } from './weapons';
import { World, type Door, type Interactable, type WorldHost } from './world';
import { CHEST, FOE_DROP, GHOST_CHANCE, GUARDIAN_RULE_HEAT, POM_DOUBLE } from './odds';
import { MAX_PARTY, MEMBER_COLORS, partyHp, type Member, type MemberKind } from './party';

const STEP = 1 / 60;

type Mode = 'title' | 'hub' | 'run' | 'over';
const SAVE_MARK = 1.8;
/** Obols for skipping a card choice. */
const SKIP_OBOLS = 25;

/** What a remote player earned, sent to their device to keep in their save. */
export interface Grant {
  xp?: number;
  ash?: number;
  loot?: Loot;
  kill?: string;
  boss?: boolean;
  escape?: boolean;
  /** An escape began, or ended in death (their run and death counts). */
  run?: 'start' | 'death';
  /** A guardian fell (the Blacksmith's parts), and the Torment it fell at. */
  guardian?: string;
  heat?: number;
}

export interface RunSummary {
  victory: boolean;
  rooms: number;
  kills: number;
  time: number;
  ash: number;
  biome: string;
  cause: string;
  spoils: Spoils;
}

/** The 3D view's camera: yaw turns the room, pitch is how far it looks down. */
const VIEW_YAW = Math.PI / 4;
const VIEW_PITCH = 0.7;
/**
 * How far Z / X turn the 3D camera around the hero, each way (radians), and
 * how fast. Rooms are built to be seen from the south-east (tall walls and
 * doors to the north and west), so the camera stays within that quarter.
 */
const CAM_TURN_MAX = 0.74;
const CAM_TURN_SPEED = 1.6;

const DEV_KEY = 'unbound-underworld-dev';

const CHARON_LINES = ['Hrrrnnngh…', 'Mmmmhhhaaaah.', 'Hhhrrrraaaagh!', '…Hmmmm.'];

export class Game implements WorldHost {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** The 3D voxel view's canvas, under the 2D one (which then holds effects and text). */
  readonly canvas3d: HTMLCanvasElement | null;
  private voxel: VoxelRenderer | null = null;
  private voxelState: 'off' | 'loading' | 'ready' | 'failed' = 'off';
  dpr = 1;
  /** HUD and menu scale: 1 at the 1280×760 design size, larger on bigger screens. */
  uiScale = 1;
  readonly input: Input;
  readonly camera = new Camera();
  readonly particles = new Particles();
  readonly ui: UI;
  readonly touch: TouchControls;
  save: SaveData;
  run: Run | null = null;
  /** The heroes in this game: you, a second gamepad player, players online. */
  members: Member[] = [];
  /** The online game this device is in, if any (see src/net). */
  net: NetSession | null = null;
  /** The member the code running now acts for (see `withMember`). */
  private active!: Member;
  world: World | null = null;
  mode: Mode = 'title';
  godMode = false;
  /** Developer options were used this session: achievements are off until restart. */
  cheated = false;
  private pendingDoors: RoomPlan[] = [];
  /** Rewards taken in this chamber whose choice isn't finished yet (saved as still to take). */
  private resolving: RewardSpec[] = [];
  private fade = 1;
  private fadeTarget = 0;
  private fadeCb: (() => void) | null = null;
  private acc = 0;
  /** Z / X camera turn away from the default 3D angle (radians). */
  private camTurn = 0;
  private last = 0;
  private params = new URLSearchParams(location.search);
  private lastHit = 'the Underworld';
  private debugLevel = 0;
  private fps = 60;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.canvas3d = document.getElementById('game3d') as HTMLCanvasElement | null;
    // If the GPU drops the 3D view, carry on in 2D.
    this.canvas3d?.addEventListener('webglcontextlost', () => {
      this.voxelState = 'failed';
      this.voxel = null;
      this.applyView();
    });
    this.input = new Input(canvas);
    this.ui = new UI(overlay, this.input);
    this.touch = new TouchControls(this.input);
    this.save = loadSave();
    this.godMode = this.params.has('god');
    // Debug: ?weapon=spear|bow tries a weapon for this session without unlocking it.
    const wp = this.params.get('weapon');
    if (wp === 'sword' || wp === 'spear' || wp === 'bow' || wp === 'fists' || wp === 'scythe') this.save.weapon = wp;
    // Debug: ?level=12 tries the game at that level for this session.
    const lv = Number(this.params.get('level'));
    if (lv > 0) this.debugLevel = Math.floor(lv);
    this.applySettings();
    useHeroLooks(this.save.looks);
    // Unlock conditions can change between versions: a hero this save no longer has falls back to Kael.
    const hero = CHARACTER_BY_ID[this.save.character];
    if (!hero || !characterUnlocked(hero, this.save, this.level)) {
      this.save.character = 'kael';
      this.save.weapon = CHARACTER_BY_ID.kael.weapon;
    }
    this.members = [this.makeMember(0, 'local', this.save, this.save.character, 'Player 1')];
    this.active = this.members[0];
    const unlock = () => audio.unlock();
    // iOS only lets audio start inside touchend/click, so listen for those too.
    for (const ev of ['keydown', 'mousedown', 'touchstart', 'touchend', 'click']) window.addEventListener(ev, unlock);
    this.touch.onFirstTouch = () => this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    this.resize();
  }

  // ---------------------------------------------------------------- party

  /** The active member's hero (see `withMember`). Offline with one player: you. */
  get player(): Player {
    return this.active.player;
  }

  /** The active member's stats. */
  get stats(): PlayerStats {
    return this.active.stats;
  }

  get artifacts(): (string | null)[] {
    return this.run ? this.run.artifacts : this.active.hubArtifacts;
  }

  /** This device's first player. */
  get me(): Member {
    return this.members[0];
  }

  /** Builds a party member and their hero. */
  private makeMember(id: number, kind: MemberKind, profile: SaveData, character: CharacterId, name: string, pad?: number): Member {
    const def = CHARACTER_BY_ID[character] ?? CHARACTER_BY_ID.kael;
    const m: Member = {
      id,
      kind,
      name,
      profile,
      character: def.id,
      player: new Player(kind === 'local' ? profile.weapon : def.weapon, def.id),
      stats: computeStats([], []),
      pad,
      hubArtifacts: [null, null, null],
    };
    this.outfit(m);
    return m;
  }

  /** Gives a member's hero their controls and name tag. */
  private outfit(m: Member): void {
    const p = m.player;
    p.control = m.kind === 'pad' && m.pad !== undefined ? new PadControl(this.input, m.pad) : m.kind === 'remote' ? (this.remoteControl?.(m) ?? null) : null;
    p.tag = this.members.length > 1 || m.kind !== 'local' ? m.name : '';
    p.tagColor = MEMBER_COLORS[m.id % MEMBER_COLORS.length];
    // Players online bring their own customised look.
    p.look = m.kind === 'remote' ? (m.profile.looks[m.character] ?? null) : null;
  }

  /** Online (joined): the party as the host has it, with this device's player first. */
  setParty(members: Member[]): void {
    this.members = members;
    this.active = members[0];
  }

  /** Back to just this device's player (leaving an online game). */
  soloParty(): void {
    this.members = [this.makeMember(0, 'local', this.save, this.save.character, 'Player 1')];
    this.active = this.members[0];
  }

  /** A blank member for a player seen online (their hero is filled in by the host's updates). */
  mirrorMember(id: number, kind: MemberKind, name: string, profile: SaveData): Member {
    const m = this.makeMember(id, kind, profile, kind === 'local' ? profile.character : 'kael', name);
    m.player.tag = name;
    return m;
  }

  /** Fades in from black (a new room arriving online). */
  fadeIn(): void {
    this.fade = 1;
    this.fadeTarget = 0;
    this.fadeCb = null;
  }

  /** Online games plug in each remote player's controls (see the net session). */
  remoteControl: ((m: Member) => Control) | null = null;

  /** Runs `fn` as member `m`: `player`, `stats`, the run's build and rewards are theirs. */
  withMember<T>(m: Member, fn: () => T): T {
    const prev = this.active;
    this.active = m;
    this.run?.setActive(m.id);
    try {
      // The world's "current hero" follows, so `w.player` and `w.stats` agree.
      const w = this.world;
      return w && w.players.includes(m.player) ? w.as(m.player, fn) : fn();
    } finally {
      this.active = prev;
      this.run?.setActive(prev.id);
    }
  }

  /** Wraps a callback (a card pick, say) so it runs as the member active now, whenever it fires. */
  private bound<A extends unknown[]>(fn: (...a: A) => void): (...a: A) => void {
    const m = this.active;
    return (...a: A) => this.withMember(m, () => fn(...a));
  }

  /** WorldHost: the world switches heroes as it updates each one. */
  setActive(p: Player): void {
    const m = this.members.find((x) => x.player === p);
    if (!m) return;
    this.active = m;
    this.run?.setActive(m.id);
  }

  memberOf(p: Player): Member | undefined {
    return this.members.find((m) => m.player === p);
  }

  /** WorldHost: the heroes this device's camera keeps in view. */
  viewPlayers(): Player[] {
    const own = this.members.filter((m) => m.kind !== 'remote').map((m) => m.player);
    const standing = own.filter((p) => p.state !== 'dead');
    return standing.length ? standing : own;
  }

  /** WorldHost: hub stations open menus on this device, so only its own players use them. */
  canInteract(p: Player, it: Interactable): boolean {
    const m = this.memberOf(p);
    return !(it.kind === 'station' && m?.kind === 'remote');
  }

  /** A member's level: theirs online, this save's otherwise. */
  levelOf(m: Member): number {
    if (m.profile === this.save) return this.level;
    return levelFromXp(m.profile.xp).level;
  }

  /** A fresh hero for every member (entering the hub or starting an escape). */
  private respawnMembers(): void {
    for (const m of this.members) {
      const def = CHARACTER_BY_ID[m.character] ?? CHARACTER_BY_ID.kael;
      const weapon = m.kind === 'local' ? m.profile.weapon : def.weapon;
      m.player = new Player(weapon, def.id);
      this.outfit(m);
    }
    this.active = this.members[0];
  }

  /** Adds a member to the party (a second gamepad, or a player online). Returns null when full. */
  addMember(kind: MemberKind, profile: SaveData, character: CharacterId, name: string, extra: { pad?: number; peer?: number } = {}): Member | null {
    if (this.members.length >= MAX_PARTY) return null;
    let id = 1;
    while (this.members.some((m) => m.id === id)) id++;
    const m = this.makeMember(id, kind, profile, character, name, extra.pad);
    m.peer = extra.peer;
    this.members.push(m);
    for (const x of this.members) this.outfit(x);
    if (this.run) {
      this.run.addMember(m.id, profile);
      this.run.builds.get(m.id)!.weapon = m.player.weapon.id;
      this.run.partySize = this.members.length;
    }
    this.withMember(m, () => this.recomputeStats(true));
    m.player.castAmmo = m.stats.castAmmo;
    m.player.dashCharges = m.stats.dashCharges;
    m.player.souls = 0;
    const w = this.world;
    if (w) {
      const lead = this.me.player;
      m.player.x = lead.x + 40;
      m.player.y = lead.y + 30;
      w.players.push(m.player);
      w.particles.ring(m.player.x, m.player.y, MEMBER_COLORS[m.id % MEMBER_COLORS.length], 80, 0.5, 6);
    }
    return m;
  }

  /** Takes a member out of the party (player 2 leaves, or someone online disconnects). */
  removeMember(m: Member): void {
    if (m === this.me) return;
    this.members = this.members.filter((x) => x !== m);
    if (this.active === m) this.active = this.me;
    if (m.pad !== undefined) this.input.claimed.delete(m.pad);
    const w = this.world;
    if (w) {
      w.players = w.players.filter((p) => p !== m.player);
      for (const e of w.enemies) if (e.target === m.player) e.target = null;
    }
    this.run?.builds.delete(m.id);
    if (this.run) this.run.partySize = this.members.length;
    for (const x of this.members) this.outfit(x);
  }

  boot(): void {
    this.enterHub(true);
    this.mode = 'title';
    screens.title(this);
    syncAtStart(this);
    if (this.save.notice) {
      this.ui.toast(this.save.notice, 7000);
      this.save.notice = '';
      this.persist();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  resize(): void {
    // Phones get a slightly lower render resolution to keep the frame rate up.
    this.dpr = Math.min(this.touch.enabled ? 1.5 : 2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h);
    if (this.voxel) {
      this.voxel.setQuality(this.voxelQuality);
      this.voxel.resize(w, h, this.dpr);
    }
    // Grow the HUD and menus with the screen so they keep their proportions on
    // 1440p and 4K displays. Smaller screens keep the compact layouts.
    this.updateUiScale();
  }

  /** HUD and menu scale from the screen size and the UI size setting. */
  private updateUiScale(): void {
    const base = Math.max(1, Math.min(3, Math.min(window.innerWidth / 1280, window.innerHeight / 760)));
    this.uiScale = base * (this.save?.settings.uiSize ?? 1);
    document.documentElement.style.setProperty('--ui', this.uiScale.toFixed(3));
  }

  /** Pause and go quiet when the tab or app is backgrounded. */
  private onVisibility(): void {
    if (document.hidden) {
      // Autosave whenever the game goes to the background (a won chamber as it stands).
      this.persist();
      this.saveClearedRoom();
      this.touch.releaseAll();
      audio.suspend();
      if ((this.mode === 'hub' || this.mode === 'run') && !this.ui.open && this.player.state !== 'dead') screens.pause(this);
    } else audio.resume();
  }

  /** Seconds left on the "Saved" mark shown after an autosave. */
  private saveMark = 0;

  persist(): void {
    this.checkAchievements();
    writeSave(this.save);
    this.net?.profileChanged?.();
  }

  /** Awards any achievements just earned. God mode (or developer cheats) disables them. */
  checkAchievements(): void {
    if (this.godMode || this.cheated || this.gameSpeed < 1) return;
    for (const a of newAchievements(this.save)) {
      this.save.achievements.push(a.id);
      this.ui.toast(`${a.glyph} Achievement: ${a.name}`, 3200);
      audio.play('boon');
    }
  }

  /** Pushes saved settings into the audio, camera and gameplay systems. */
  applySettings(): void {
    const st = this.save.settings;
    audio.volume = st.volume;
    audio.musicVolume = st.music;
    audio.muted = st.muted;
    this.camera.shakeScale = st.shake;
    prefs.damageNumbers = st.damageNumbers;
    prefs.hitstop = st.hitstop;
    prefs.flashes = st.flashes;
    prefs.aimAssist = st.aimAssist;
    prefs.vibration = st.vibration;
    prefs.showFps = st.showFps;
    prefs.hints = st.hints;
    prefs.assist = st.assist;
    prefs.doorInfo = st.doorInfo;
    prefs.attackPreview = st.attackPreview;
    prefs.foeOutline = st.foeOutline;
    prefs.toggleGuard = st.toggleGuard;
    applyColorMode(st.colorMode);
    this.touch.configure(st.touchSize, st.touchOpacity, st.leftHanded);
    this.input.setBindings(st.keys as Partial<Record<Action, string[]>>);
    // The HUD shows the first key bound to each action (keyboard play only).
    useKeyLabels((a) => {
      const k = this.input.keysFor(a as Action)[0];
      return k ? keyLabel(k) : '';
    });
    this.updateUiScale();
    this.applyView();
  }

  /** Phones skip shadows and render the 3D view at a lower resolution. */
  private get voxelQuality(): VoxelQuality {
    const q = this.params.get('quality');
    if (q === 'high' || q === 'balanced') return q;
    return this.touch.enabled ? 'balanced' : 'high';
  }

  /** Accessibility game speed (achievements are off below 100%). */
  get gameSpeed(): number {
    const s = this.save.settings.speed;
    return s >= 1 ? 1 : Math.max(0.7, s);
  }

  /** True while the 3D voxel view is drawing the world. */
  get view3d(): boolean {
    return !!this.voxel && this.voxelState === 'ready' && this.want3d;
  }

  /** The chamber is flat: painted chambers, flat missions and daily Flatland runs are drawn in 2D. */
  get flatNow(): boolean {
    const run = this.run;
    return !!run && (!!run.current.reward?.painted || !!this.mission?.room.flat || run.hasMod('flatland'));
  }

  /** The game is 3D, except in flat chambers and on devices that can't draw 3D (and with ?view=2d). */
  private get want3d(): boolean {
    return !!this.canvas3d && this.params.get('view') !== '2d' && !this.flatNow;
  }

  /** Whether the last applyView left the world flat, to fold the screen when that changes. */
  private wasFlat = false;

  /**
   * Draws the world in 3D or, in flat chambers, in 2D. three.js is only
   * downloaded the first time the 3D view is used; if WebGL isn't available
   * the game stays in 2D.
   */
  applyView(): void {
    const want = this.want3d;
    const flat = this.flatNow;
    if (flat !== this.wasFlat) {
      this.wasFlat = flat;
      // The world folds flat (or unfolds): a short paper-fold as the view changes.
      document.body.classList.remove('fold');
      void document.body.offsetWidth;
      document.body.classList.add('fold');
      setTimeout(() => document.body.classList.remove('fold'), 700);
    }
    if (want && this.voxelState === 'off') {
      this.voxelState = 'loading';
      import('../render3d/voxel')
        .then(({ VoxelRenderer }) => {
          this.voxel = new VoxelRenderer(this.canvas3d!, this.voxelQuality);
          this.voxel.resize(this.camera.vw, this.camera.vh, this.dpr);
          this.voxelState = 'ready';
        })
        .catch((err) => {
          console.warn('3D view unavailable, using 2D', err);
          this.voxelState = 'failed';
        })
        .finally(() => this.applyView());
    }
    const on = want && this.view3d;
    if (this.canvas3d) this.canvas3d.style.display = on ? 'block' : 'none';
    // A Hades-style angle: the room turned 45° and seen from about 40° up.
    const cam = this.camera;
    if ((cam.yaw !== 0) !== on) {
      this.camTurn = 0;
      cam.viewScale = on ? 1.15 : 1;
      cam.resize(cam.vw, cam.vh);
      this.setCameraAngle(on);
    }
  }

  /** Z / X turn the 3D camera around the hero; both together swing it back. */
  private turnCamera(dt: number): void {
    const cam = this.camera;
    if (cam.yaw === 0) {
      this.camTurn = 0;
      return;
    }
    const inp = this.input;
    const l = inp.down('camLeft');
    const r = inp.down('camRight');
    const turn = l && r ? damp(this.camTurn, 0, 8, dt) : clamp(this.camTurn + ((r ? 1 : 0) - (l ? 1 : 0)) * CAM_TURN_SPEED * dt, -CAM_TURN_MAX, CAM_TURN_MAX);
    if (Math.abs(turn - this.camTurn) < 1e-5) return;
    this.camTurn = Math.abs(turn) < 1e-4 ? 0 : turn;
    this.setCameraAngle(true);
  }

  /** Points the camera for the current view (3D: the default angle plus the player's turn). */
  private setCameraAngle(on: boolean): void {
    const cam = this.camera;
    cam.setAngle(VIEW_YAW + this.camTurn, on ? VIEW_PITCH : null);
    const up = cam.lift;
    this.particles.liftX = up.x;
    this.particles.liftY = up.y;
  }

  /** Developer options: play as if at this level (0 = your real level). */
  setDebugLevel(level: number): void {
    this.debugLevel = level;
    this.recomputeStats();
  }

  get debugLevelValue(): number {
    return this.debugLevel;
  }

  /** Developer options are unlocked on this device (secret: tap the version in Settings 7 times) or by ?dev. */
  get devUnlocked(): boolean {
    try {
      return this.params.has('dev') || localStorage.getItem(DEV_KEY) === '1';
    } catch {
      return this.params.has('dev');
    }
  }

  unlockDev(): void {
    try {
      localStorage.setItem(DEV_KEY, '1');
    } catch {
      /* private mode: ?dev still works */
    }
  }

  /** Your level (from total experience). */
  get level(): number {
    return this.debugLevel || levelFromXp(this.save.xp).level;
  }

  has(feature: Parameters<typeof hasFeature>[1]): boolean {
    return hasFeature(this.level, feature, this.save.stats.escapes > 0);
  }

  /** Grants experience and announces any level-ups and what they unlock. */
  gainXp(n: number): void {
    if (n <= 0) return;
    // Each hero played also grows in their own level (skill points at Ascension).
    const heroes = new Set(this.members.filter((m) => m.profile === this.save).map((m) => m.player.hero.id));
    for (const id of heroes) this.gainHeroXp(id, n);
    const before = this.level;
    this.save.xp += n;
    const after = this.level;
    if (after <= before) return;
    for (const m of this.members) {
      if (m.profile !== this.save) continue;
      this.withMember(m, () => {
        this.recomputeStats();
        const p = m.player;
        p.castAmmo = m.stats.castAmmo;
        if (p.state !== 'dead') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
      });
    }
    this.persist();
    this.announceLevels();
  }

  /** A hero's own experience; announces their new levels. */
  private gainHeroXp(id: CharacterId, n: number): void {
    const xp = this.save.heroXp;
    const before = heroLevelFromXp(xp[id] ?? 0).level;
    xp[id] = Math.min(heroXpForLevel(HERO_MAX_LEVEL), (xp[id] ?? 0) + n);
    const after = heroLevelFromXp(xp[id] ?? 0).level;
    if (after > before) {
      const name = CHARACTER_BY_ID[id]?.name ?? 'Your hero';
      this.ui.toast(`${name} reached hero level ${after}: a skill point awaits at Ascension.`, 3500);
    }
  }

  /** Skill points the selected hero hasn't spent yet. */
  unspentSkills(): number {
    const id = this.me.player.hero.id;
    const level = heroLevelFromXp(this.save.heroXp[id] ?? 0).level;
    return Math.max(0, heroPoints(level) - spentSkill(this.save.skills[id] ?? {}));
  }

  /** A guardian fell: the Blacksmith's part it carried, if this save still lacks it. */
  awardPart(guardian: string, heat: number): void {
    const part = partFor(guardian, heat, this.save.smith.parts);
    if (!part) return;
    this.save.smith.parts.push(part);
    this.persist();
    const def = SMITH_PART_BY_ID[part];
    this.world?.showBanner(`Found: ${def.name}`, 'A lost part of the forge. Bring it to the Blacksmith in the Hall.');
    this.ui.toast(`The Blacksmith can now: ${def.unlocks}`, 5000);
  }

  /** Experience for the whole party: this save once, and each player online their share. */
  private gainXpAll(n: number): void {
    this.gainXp(n);
    for (const m of this.members) if (m.kind === 'remote') this.grant?.(m, { xp: n });
  }

  /** Online games send a remote player what they earned (experience, Ash, loot, records). */
  grant: ((m: Member, g: Grant) => void) | null = null;

  /** Shows the banner for levels reached but not yet announced. */
  announceLevels(): void {
    const level = this.level;
    if (level <= this.save.seenLevel) return;
    const unlocks = [];
    for (let l = this.save.seenLevel + 1; l <= level; l++) unlocks.push(...unlocksAt(l));
    this.save.seenLevel = level;
    this.persist();
    const w = this.world;
    const tier = tierFor(level);
    audio.play('boon');
    if (w) {
      const me = this.me.player;
      w.particles.ring(me.x, me.y, tier.color, 160, 0.6, 8);
      w.particles.text(me.x, me.y, 100, `LEVEL ${level}`, tier.color, 26);
    }
    if (unlocks.length) {
      const u = unlocks[unlocks.length - 1];
      const keys = u.keys ? ` (${this.touch.enabled ? u.keys.touch : u.keys.pc})` : '';
      w?.showBanner(`Unlocked: ${u.title}`, `${u.desc}${keys}`);
      if (unlocks.length > 1) this.ui.toast(`Also unlocked: ${unlocks.slice(0, -1).map((x) => x.title).join(', ')}`, 4000);
    } else {
      w?.showBanner(`Level ${level}`, `${tier.name} · +1 max Health for every hero`);
    }
    if (this.save.seenLevel > 1) this.ui.toast(`Level ${level}! New sections of the Altar of Ashes may be open.`, 3000);
  }
  // ---------------------------------------------------------------- loop

  private frame(t: number): void {
    // Schedule the next frame first: an error below must never stop the game.
    requestAnimationFrame((tt) => this.frame(tt));
    try {
      this.tick(t);
    } catch (err) {
      this.reportError(err);
    }
  }

  private errorShownAt = -Infinity;

  /** Logs an unexpected error and tells the player once in a while, rather than freezing. */
  reportError(err: unknown): void {
    console.error(err);
    const now = performance.now();
    if (now - this.errorShownAt > 10000) {
      this.errorShownAt = now;
      this.ui.toast('Something went wrong, but the game carries on. If you get stuck, Save & Quit and resume.', 5000);
    }
  }

  private tick(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000 || 0);
    this.last = t;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.input.pollGamepads();
    // Online the room never pauses: a menu just stands your hero still.
    this.input.blocked = !!this.net && this.ui.open;
    if (!this.ui.open || this.net) {
      // Accessibility: a slower game (not online, where everyone shares one clock).
      this.acc += dt * (this.net ? 1 : this.gameSpeed);
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        try {
          this.step(STEP);
        } catch (err) {
          this.input.endStep();
          this.reportError(err);
        }
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) this.acc = 0;
    } else {
      this.acc = 0;
    }
    // Fade
    const fs = 1 / 0.3;
    if (this.fade < this.fadeTarget) this.fade = Math.min(this.fadeTarget, this.fade + dt * fs);
    else if (this.fade > this.fadeTarget) this.fade = Math.max(this.fadeTarget, this.fade - dt * fs);
    // Fully black with a transition waiting: run it (even when it was asked for
    // on the very frame the screen was already black from the last one).
    if (this.fade >= 1 && this.fadeCb) {
      const cb = this.fadeCb;
      this.fadeCb = null;
      try {
        cb();
      } catch (err) {
        // Don't leave the screen black or the door shut: let the player try again.
        if (this.world) this.world.exiting = false;
        this.reportError(err);
      }
      // A callback may start the next transition itself; it keeps its fade.
      if (!this.fadeCb) this.fadeTarget = 0;
    }
    this.render();
  }

  private step(dt: number): void {
    const w = this.world;
    if (!w) return;
    if (this.input.pressed('mute')) {
      audio.muted = !audio.muted;
      this.save.settings.muted = audio.muted;
      this.persist();
      this.ui.toast(audio.muted ? 'Sound off (M)' : 'Sound on (M)');
    }
    if (this.input.pressed('pause') && (this.mode === 'hub' || this.mode === 'run') && (this.player.state !== 'dead' || this.net)) {
      this.input.endStep();
      screens.pause(this);
      return;
    }
    this.turnCamera(dt);
    w.titleDrift = this.mode === 'title';
    this.saveMark = Math.max(0, this.saveMark - dt);
    if (this.mode === 'title') {
      this.input.endStep();
      w.update(dt);
      return;
    }
    const net = this.net;
    if (net?.clientStep) {
      net.clientStep(dt);
      this.updateMood(w);
      this.input.endStep();
      return;
    }
    if (this.run && this.mode === 'run') this.run.time += dt;
    this.updateMission(dt);
    net?.beginStep?.();
    w.update(dt);
    net?.afterStep?.(dt);
    this.updateMood(w);
    this.input.endStep();
  }

  updateMood(w: World): void {
    let mood: Mood = 'explore';
    if (this.mode === 'hub') mood = 'hub';
    else if (w.boss && !w.boss.dead) mood = 'boss';
    else if (w.encounter && !w.cleared) mood = 'combat';
    // Each guardian has its own theme; it grows denser in phase 2.
    const theme = Math.max(0, BIOMES.findIndex((b) => b.id === w.biome.id));
    audio.intensity = w.boss && !w.boss.dead && (w.boss as { phase?: number }).phase === 2 ? 1 : 0;
    audio.setMood(mood, theme);
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.world;
    renderOpts.touch = this.touch.enabled;
    renderOpts.shopSeen = this.save.shopSeen;
    renderOpts.mouse = !this.touch.enabled && this.input.mouseInside && !this.ui.open ? this.input.mouse : null;
    // Labels, prompts and floating text follow the UI size, not the camera zoom.
    renderOpts.textScale = Math.max(this.camera.zoom, this.uiScale);
    this.particles.uprightScale = renderOpts.textScale * this.dpr;
    if (w) {
      if (this.view3d && this.voxel) {
        this.voxel.render(w, this.camera);
        renderOverlay(w, ctx, this.dpr);
      } else w.render(ctx, this.dpr);
      if (this.mode !== 'title') {
        const k = this.dpr * this.uiScale;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        const vw = this.camera.vw / this.uiScale;
        const vh = this.camera.vh / this.uiScale;
        const pads = this.members.filter((m) => m.kind === 'pad' && w.players.includes(m.player));
        setPartnerShown(pads.length > 0);
        drawHUD(ctx, w, this.run, this.save, vw, vh, this.mode === 'hub', this.touch.enabled, this.level, this.save.settings.leftHanded);
        pads.forEach((m, i) => this.withMember(m, () => drawPartnerHUD(ctx, w, this.run, vw, vh - i * 104, m.name, m.player.tagColor)));
        if (this.saveMark > 0) drawSaveIcon(ctx, this.camera.vw / this.uiScale, 1 - this.saveMark / SAVE_MARK, performance.now() / 1000);
        if (!this.touch.enabled && this.input.mouseInside && !this.ui.open) {
          drawHudTooltip(ctx, this.input.mouse.x / this.uiScale, this.input.mouse.y / this.uiScale, this.camera.vw / this.uiScale);
        }
      }
      this.syncTouch(w);
    }
    if (prefs.showFps) {
      const k = this.dpr * this.uiScale;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.font = '600 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(200,255,200,0.8)';
      ctx.fillText(`${Math.round(this.fps)} FPS`, this.camera.vw / this.uiScale / 2, this.camera.vh / this.uiScale - 8);
    }
    if (this.fade > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.fade;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  private syncTouch(w: World): void {
    if (!this.touch.enabled) return;
    const p = this.player;
    const s = this.stats;
    this.touch.update({
      active: !this.ui.open && (this.mode === 'hub' || this.mode === 'run') && p.state !== 'dead',
      cast: s.canCast,
      jump: s.canJump,
      guard: s.canGuard,
      potion: s.canPotion,
      wrath: s.canWrath ? Math.min(1, p.wrath / 100) : null,
      artifacts: this.artifacts.map((id, i) => {
        if (!id || i >= s.artifactSlots) return null;
        const def = ARTIFACT_BY_ID[id];
        return {
          glyph: def.glyph,
          color: def.color,
          cd: Math.min(1, p.artifactCd[i] / (def.cooldown * s.artifactCdMult)),
          usable: !def.souls || p.souls >= def.souls,
        };
      }),
      potionCd: Math.min(1, p.potionCd / s.potionCooldown),
      dashCd: p.dashCharges > 0 || s.dashRecharge <= 0 ? 0 : Math.min(1, p.dashRechargeT / s.dashRecharge),
      castAmmo: p.castAmmo,
      interact: w.focus ? w.focus.prompt : null,
    });
  }

  /** Android back button. Returns false when the app should go to the background instead. */
  handleBack(): boolean {
    // On the title screen itself, Back leaves the app; from a menu opened there it closes the menu.
    if (this.mode === 'title') return this.ui.depth > 1 && this.ui.back();
    if (this.ui.back()) return true;
    if ((this.mode === 'hub' || this.mode === 'run') && this.player.state !== 'dead') {
      screens.pause(this);
      return true;
    }
    return false;
  }

  onPlayerHurt(): void {
    if (this.touch.enabled && prefs.vibration) navigator.vibrate?.(30);
  }

  /**
   * Fades to black, runs `fn`, and fades back in. Returns false (and does
   * nothing) while another transition is under way, unless `force` (quitting
   * always wins over, say, walking through a door).
   */
  transition(fn: () => void, force = false): boolean {
    if (this.fadeCb && !force) return false;
    this.fadeTarget = 1;
    this.fadeCb = fn;
    return true;
  }

  // ---------------------------------------------------------------- stats

  /** Rebuilds the active member's stats from their save, build, hero, weapon and gear. */
  recomputeStats(fullHeal = false): void {
    const m = this.active;
    const save = m.profile;
    const level = this.levelOf(m);
    let s: PlayerStats;
    if (this.run) s = this.run.computeStats(save);
    else {
      s = computeStats([], []);
      applyAltar(save.upgrades, s);
    }
    // Order matters: features decide what exists, then level, hero, skills and forge build on top.
    applyFeatures(level, s, save.stats.escapes > 0);
    applyLevel(level, s);
    m.player.hero.apply(s);
    applySkills(m.player.hero.id, save.skills[m.player.hero.id], s);
    applyForge(save.forge[m.player.weapon.id] ?? 1, s);
    if (hasFeature(level, 'gear', save.stats.escapes > 0)) applyGear(equippedItems(save.gear), s);
    // Assist mode is this device's setting: it covers this device's players.
    if (prefs.assist && m.kind !== 'remote') s.damageTaken *= 0.5;
    s.maxHp = Math.max(20, s.maxHp);
    m.stats = s;
    if (this.run) this.run.level = this.level;
    m.player.applyStats(s, fullHeal);
  }

  /** Recomputes every member's stats. */
  recomputeAll(fullHeal = false): void {
    for (const m of this.members) this.withMember(m, () => this.recomputeStats(fullHeal));
  }

  // ---------------------------------------------------------------- hub

  enterHub(silent = false): void {
    // Back from an escape: keep-in-sync uploads the save (see Multiplayer → Sync saves).
    if (this.run && !this.net?.clientStep) syncAfterEscape(this);
    this.mode = 'hub';
    this.run = null;
    this.particles.clear();
    this.respawnMembers();
    for (const m of this.members) {
      m.hubArtifacts = [hasFeature(this.levelOf(m), 'artifacts', m.profile.stats.escapes > 0) ? m.profile.startArtifact : null, null, null];
      this.withMember(m, () => {
        this.recomputeStats(true);
        m.player.castAmmo = m.stats.castAmmo;
        m.player.dashCharges = m.stats.dashCharges;
        // Echoes start empty: foes fill the gauge.
      });
    }
    // The hall is never flat.
    this.applyView();
    const layout = hubLayout();
    const w = new World(this, layout, BIOMES[3], this.camera, this.particles, this.members.map((m) => m.player));
    w.cleared = true;
    w.doors = [{ x: layout.w / 2, reward: null, open: true }];
    const st = (id: string, x: number, y: number, label: string, prompt: string, color: string): Interactable => ({ id, x, y, r: 90, label, prompt, kind: 'station', color });
    w.interactables.push(
      st('smith', 230, 360, 'Blacksmith', 'Visit the forge', 'rgba(255,140,60,0.55)'),
      st('mirror', layout.w - 230, 360, 'Altar of Ashes', 'Upgrade', 'rgba(200,140,255,0.6)'),
      st('chronicle', layout.w - 230, 650, 'Chronicle', 'Read', 'rgba(255,220,160,0.5)'),
      st('heroes', 440, 470, 'Hall of Heroes', 'Choose hero', 'rgba(255,140,110,0.5)'),
      st('ascension', layout.w - 440, 470, 'Ascension', this.ascensionPrompt(), 'rgba(255,230,140,0.55)'),
    );
    if (this.has('artifacts')) w.interactables.push(st('artifacts', 230, 650, 'Artifact Shelf', 'Equip artifact', 'rgba(127,232,255,0.5)'));
    if (this.save.stats.bossesSlain > 0 || this.save.maxHeat > 0) w.interactables.push(st('pact', layout.w / 2, 300, 'Oath of Torment', 'Swear', 'rgba(255,80,80,0.5)'));
    w.spawn('dummy', layout.w / 2 + 230, 640);
    this.world = w;
    if (!silent) w.showBanner('The Hall of Shades', 'Rest, prepare, and try again.');
    if (!silent) w.later(1.2, () => this.announceLevels());
    audio.setMood('hub');
  }

  // ---------------------------------------------------------------- run flow

  /** Starts an escape. `dev` (developer options) picks the region and first chamber. */
  startRun(dev?: { biome: number; kind: RoomPlan['kind'] }, missionId?: string, daily?: DailyRun): void {
    const mission = missionId ? MISSION_BY_ID[missionId] : undefined;
    if (!mission && !daily && loadRun()) this.ui.toast('A new escape begins. The saved one was set aside.', 3000);
    const seedParam = this.params.get('seed');
    this.run = new Run(this.save, mission ? mission.rooms[0].seed : daily ? daily.seed : seedParam ? Number(seedParam) : undefined);
    if (daily) {
      // The same for everyone: no Torment, the day's seed and modifiers.
      this.run.daily = daily;
      this.run.heat = 0;
    }
    const biomeParam = dev ? dev.biome : Number(this.params.get('biome'));
    if (biomeParam > 0) this.run.biomeIndex = clamp(Math.floor(biomeParam), 0, BIOMES.length - 1);
    if (mission) {
      // A campaign mission: its own region, no Torment, and nothing saved mid-way.
      this.run.biomeIndex = 0;
      this.run.heat = 0;
      this.run.mission = { id: mission.id, step: 0, next: 0, damage: 0, lastHp: 0, maxHp: 1, surviveLeft: 0, goal: '' };
    } else this.save.stats.runs++;
    this.persist();
    for (const m of this.members) if (m.kind === 'remote') this.grant?.(m, { run: 'start' });
    this.respawnMembers();
    const run = this.run;
    run.level = this.level;
    run.partySize = this.members.length;
    for (const m of this.members) {
      if (m.id !== 0) run.addMember(m.id, m.profile);
      run.builds.get(m.id)!.weapon = m.player.weapon.id;
      this.withMember(m, () => {
        const level = this.levelOf(m);
        const esc = m.profile.stats.escapes > 0;
        if (hasFeature(level, 'gear', esc)) run.deathDefiance += gearDefiance(equippedItems(m.profile.gear));
        run.artifacts[0] = hasFeature(level, 'artifacts', esc) ? m.profile.startArtifact || null : null;
        this.recomputeStats(true);
        m.player.castAmmo = m.stats.castAmmo;
        m.player.dashCharges = m.stats.dashCharges;
        // Echoes start empty, unless the Deep Altar's Echo Well pre-fills them.
        m.player.souls = m.stats.soulMax * Math.min(1, m.stats.soulStart);
      });
    }
    if (run.hasMod('nosecond')) run.deathDefiance = 0;
    this.mode = 'run';
    if (mission && this.run.mission) {
      this.run.mission.lastHp = this.player.hp;
      this.run.mission.maxHp = this.player.maxHp;
      this.goToRoom(missionPlan(mission, 0));
      return;
    }
    const plan = dev ? { kind: dev.kind, reward: dev.kind === 'combat' ? { kind: 'boon' as const } : null } : this.params.get('room') === 'boss' ? { kind: 'boss' as const, reward: null } : this.run.startPlan();
    this.goToRoom(plan);
  }

  /** The mission being played, and the chamber of it you're in. */
  get mission(): { m: Mission; room: MissionRoom; last: boolean } | null {
    const mr = this.run?.mission;
    const m = mr ? MISSION_BY_ID[mr.id] : undefined;
    if (!mr || !m) return null;
    const room = m.rooms[Math.min(mr.step, m.rooms.length - 1)];
    return { m, room, last: mr.step >= m.rooms.length - 1 };
  }

  /** Starts today's daily challenge (from its menu). */
  startDaily(): void {
    const daily = dailyFor(dailyKey());
    this.ui.closeAll();
    this.transition(() => this.startRun(undefined, undefined, daily), true);
  }

  /** A daily run is over (fallen, escaped or given up): score it and show the results. */
  private finishDaily(victory: boolean): void {
    const run = this.run;
    const d = run?.daily;
    if (!run || !d) return;
    const score = dailyScore({ rooms: run.roomsCleared, bosses: run.guardians, victory, time: run.time, mods: d.mods });
    const { newBest, streakBonus } = recordDaily(this.save.daily, d.key, score);
    if (streakBonus > 0) this.addAsh(streakBonus);
    this.persist();
    this.mode = 'over';
    screens.dailyResults(this, { daily: d, score, newBest, streakBonus, victory, rooms: run.roomsCleared, guardians: run.guardians, time: run.time, kills: run.kills });
  }

  /** Starts a campaign mission (from the campaign menu or after the last one). */
  startMission(id: string): void {
    if (!MISSION_BY_ID[id]) return;
    this.ui.closeAll();
    this.transition(() => this.startRun(undefined, id), true);
  }

  /** A mission chamber was won: its reward drops, then a single door leads on (or the mission ends). */
  private missionRoomCleared(w: World): void {
    const ms = this.mission;
    const mr = this.run?.mission;
    if (!ms || !mr) return;
    if (ms.room.kind === 'boss') {
      this.save.stats.bossesSlain++;
      this.persist();
    }
    if (ms.last) {
      w.showBanner('Mission complete', ms.m.title);
      w.later(2, () => this.completeMission());
      return;
    }
    const p = this.me.player;
    if (ms.room.reward) w.spawnReward({ ...ms.room.reward }, clamp(p.x, 200, w.room.w - 200), clamp(p.y - 140, 220, w.room.h - 160));
    else this.openExitDoors(w);
  }

  /** Every chamber of the mission is won: stars, rewards, the story's next beat. */
  private completeMission(): void {
    const run = this.run;
    const ms = this.mission;
    if (!run?.mission || !ms || this.mode !== 'run') return;
    const share = run.mission.damage / Math.max(1, run.mission.maxHp);
    const result = missionStars(ms.m, run.time, share);
    const first = recordMission(this.save.campaign, ms.m.id, result.stars, run.time);
    const reward = missionReward(ms.m, first);
    this.addAsh(reward.ash);
    this.gainXpAll(reward.xp);
    this.persist();
    this.mode = 'over';
    this.ui.closeAll();
    screens.missionComplete(this, { mission: ms.m, time: run.time, ...result, first, ...reward, kills: run.kills, spoils: run.spoils });
  }

  /** Leaves a mission (nothing is saved) for the campaign menu on the title screen. */
  toCampaign(): void {
    this.ui.closeAll();
    this.transition(() => {
      this.enterHub(true);
      this.mode = 'title';
      screens.title(this);
      screens.campaign(this);
    }, true);
  }

  /** Mission goals tick: the "survive" countdown, the HUD goal line and the damage tally. */
  private updateMission(dt: number): void {
    const run = this.run;
    const mr = run?.mission;
    const ms = this.mission;
    const w = this.world;
    if (!mr || !ms || !w || this.mode !== 'run') return;
    const p = this.me.player;
    if (p.hp < mr.lastHp) mr.damage += mr.lastHp - p.hp;
    mr.lastHp = p.hp;
    if (w.cleared) {
      mr.goal = w.doors.some((d) => d.open) ? 'Go through the door' : ms.last ? 'Mission complete' : 'Take your reward';
      return;
    }
    if (ms.room.goal === 'survive') {
      mr.surviveLeft -= dt;
      // Foes keep coming until the time is up.
      const enc = w.encounter;
      if (enc && enc.next >= enc.waves.length) enc.next = 0;
      if (mr.surviveLeft <= 0) {
        for (const e of [...w.enemies]) if (!e.dead && !e.isDummy) w.killEnemy(e);
        w.clearRoom();
        return;
      }
      const t = Math.ceil(mr.surviveLeft);
      mr.goal = `Hold out: ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    } else mr.goal = ms.room.goal === 'boss' ? 'Defeat the guardian' : 'Slay every foe';
  }

  /**
   * Enters a chamber. `resume` (a saved escape that was won in this chamber)
   * rebuilds the same room with its doors open instead of a fresh fight.
   */
  goToRoom(plan: RoomPlan, resume?: RunSnapshot): void {
    const run = this.run!;
    run.enter(plan);
    if (run.mission) run.mission.step = run.mission.next;
    const ms = this.mission;
    const restore = resume?.cleared && Array.isArray(resume.doors) && typeof resume.roomRng === 'number' ? resume : null;
    if (restore) run.rng.state = restore.roomRng!;
    run.roomRng = run.rng.state;
    // Autosave at the start of every chamber (and again once its doors open),
    // so Save & Quit, or closing the app, resumes here. Party escapes aren't
    // saved mid-way (everyone would have to come back).
    if (!restore) this.saveRun();
    this.particles.clear();
    const biome = run.biome;
    const layout = ms
      ? generateLayout(new Rng(ms.room.seed), biome, plan.kind, { chestChance: 0, depth: 1, shape: ms.room.shape, heights: ms.room.heights && this.members.every((m) => m.stats.canJump) ? ms.room.heights : 0 })
      : generateLayout(run.rng, biome, plan.kind, { chestChance: this.stats.chestChance, depth: run.depth, heights: this.heightsFor(run) });
    for (const m of this.members) m.player.castAmmo = m.stats.castAmmo;
    const w = new World(this, layout, biome, this.camera, this.particles, this.members.map((m) => m.player));
    w.painted = !!plan.reward?.painted || !!ms?.room.flat;
    this.world = w;
    this.pendingDoors = [];
    this.resolving = [];
    // Higher Torment: more foes attack at once, and they aim better.
    w.tokenBonus = Math.floor(run.heat / 2);
    w.foeAimError = Math.max(0.35, 1 - run.heat * 0.1);
    const sc = run.scales();
    // Party play: tougher foes, and more of them.
    sc.hp *= partyHp(this.members.length);
    switch (plan.kind) {
      case 'combat': {
        const elite = plan.reward?.kind === 'hammer' || plan.reward?.kind === 'artifact';
        const waves = ms?.room.waves
          ? missionWaves(ms.room, this.members.length)
          : generateEncounter(run.rng, biome, run.biomeIndex, run.depth, elite || run.hasMod('enchanted'), this.members.length, run.hasMod('swarm') ? 1.5 : 1, run.heat);
        w.startEncounter(waves, sc.hp, sc.dmg);
        if (run.depth === 0) w.showBanner(biome.name, biome.subtitle);
        else if (plan.reward?.painted) w.showBanner('A Painted Chamber', 'The world turns flat. A boon here is at least Rare.');
        else w.showBanner(`Chamber ${run.depth + 1}`, elite ? 'Enchanted foes lie in wait' : biome.name);
        break;
      }
      case 'boss': {
        const boss = createBoss(biome.boss, layout.w / 2, 380, sc.hp * (run.hasMod('bounty') ? 1.5 : 1));
        boss.dmg *= sc.dmg;
        // From Torment 4 every guardian has a rule to learn.
        boss.rule = run.heat >= GUARDIAN_RULE_HEAT;
        w.addEnemy(boss);
        w.startEncounter([], sc.hp, sc.dmg);
        w.showBanner(boss.name.toUpperCase(), boss.rule ? `Rule: ${boss.ruleName}. ${boss.ruleHint}` : boss.title);
        if (!restore) audio.play('roar');
        break;
      }
      case 'shop':
        this.setupShop(w, 4);
        w.cleared = true;
        this.openExitDoors(w);
        w.showBanner("Charon's Wares", 'Buy something, or walk on through any door.');
        break;
      case 'fountain':
        w.interactables.push({ id: 'fountain', x: layout.w / 2, y: layout.h / 2, r: 90, label: 'Fountain of Lethe', prompt: 'Drink', kind: 'fountain' });
        w.cleared = true;
        this.openExitDoors(w);
        w.showBanner('Fountain Chamber', 'Restore your strength.');
        break;
      case 'antechamber':
        this.setupShop(w, 3);
        w.interactables.push({ id: 'fountain', x: layout.w / 2, y: layout.h * 0.62, r: 90, label: 'Fountain of Lethe', prompt: 'Drink', kind: 'fountain' });
        w.cleared = true;
        this.openExitDoors(w);
        w.showBanner('Antechamber', `The guardian of ${biome.name} awaits.`);
        break;
      default:
        break;
    }
    if (ms && run.mission) {
      // Campaign chambers: the mission's title and the chamber's goal.
      w.showBanner(ms.m.title, ms.room.line);
      run.mission.surviveLeft = ms.room.goal === 'survive' ? (ms.room.survive ?? 30) : 0;
    }
    if (restore) {
      // The chamber was already won: no foes, what was used stays used, what
      // was left lying there is put back, and the same doors open.
      for (const e of w.enemies) e.dead = true;
      w.enemies = [];
      w.boss = null;
      w.encounter = null;
      w.cleared = true;
      w.clearCount = Math.max(1, w.clearCount);
      run.rng.state = restore.rng;
      for (const it of w.interactables) if (restore.usedHere?.includes(it.id)) it.used = true;
      const left = restore.left;
      const cx = w.room.w / 2;
      const cy = w.room.h / 2;
      left?.rewards.forEach((r, i) => w.spawnReward({ ...r }, cx + (i - (left.rewards.length - 1) / 2) * 120, cy));
      if (left?.gold) w.dropGold(cx, cy + 80, left.gold);
      if (left?.souls) w.dropSouls(cx, cy + 80, left.souls);
      if (left?.ash) this.dropAsh(w, cx + 90, cy + 40, left.ash);
      for (const l of left?.loot ?? []) w.dropLoot(cx, cy + 80, l);
      for (const pk of w.pickups) if (pk.kind !== 'reward') pk.magnet = true;
      this.pendingDoors = (restore.doors ?? []).map((d) => ({ kind: d.kind, reward: d.reward ? { ...d.reward } : null }));
      if (this.pendingDoors.length) w.openDoors(this.pendingDoors.map((d) => d.reward));
      else if (!left?.rewards.length) this.openExitDoors(w);
      w.showBanner('Escape resumed', left?.rewards.length ? 'This chamber is won: claim its reward.' : 'This chamber is won: choose a door.');
      this.saveClearedRoom();
    }
    // Flat chambers are drawn in 2D; everywhere else in 3D.
    this.applyView();
  }

  /** Set once another save replaces this one (it reloads): the escape here is no longer saved. */
  private runSaveOff = false;

  /** Drops the saved escape for good (another save is taking this one's place). */
  dropSavedRun(): void {
    writeRun(null);
    this.runSaveOff = true;
  }

  /**
   * How much raised ground the next chamber gets (0 = none): only once every
   * hero can jump, more often in later regions and under Torment.
   */
  private heightsFor(run: Run): number {
    if (!this.members.every((m) => m.stats.canJump)) return 0;
    const chance = run.biomeIndex === 0 && run.heat === 0 ? 0 : Math.min(0.85, 0.25 + run.biomeIndex * 0.2 + run.heat * 0.08);
    if (!run.rng.chance(chance)) return 0;
    return Math.min(1, 0.2 + run.biomeIndex * 0.25 + run.heat * 0.1 + run.depth * 0.03);
  }

  /** Saves the escape at the start of the current chamber (solo play only). */
  private saveRun(extra: Partial<RunSnapshot> = {}): void {
    const run = this.run;
    // Missions are short and never saved mid-way (an escape's save is left alone).
    if (!run || this.net?.clientStep || this.runSaveOff || run.mission || run.daily) return;
    if (this.members.length !== 1) {
      writeRun(null);
      return;
    }
    writeRun(run.snapshot(this.player.hp, this.player.souls, { character: this.me.player.hero.id, ...extra }));
    this.saveMark = SAVE_MARK;
  }

  /** Once a chamber is won and its doors are open, saves it as it stands so resuming keeps what you earned there. */
  saveClearedRoom(): void {
    const w = this.world;
    const run = this.run;
    if (this.mode !== 'run' || !run || !w?.cleared || w !== this.world || this.members.length !== 1) return;
    // The last guardian's fall ends the escape: nothing to resume.
    if (run.current.kind === 'boss' && run.isFinalBiome) return;
    const left: LeftBehind = { rewards: this.resolving.map((r) => ({ ...r })), gold: 0, souls: 0, ash: 0, loot: [] };
    for (const pk of w.pickups) {
      if (pk.collected) continue;
      if (pk.kind === 'reward' && pk.reward) left.rewards.push({ ...pk.reward });
      else if (pk.kind === 'gold') left.gold += pk.value;
      else if (pk.kind === 'soul') left.souls += pk.value;
      else if (pk.kind === 'ash') left.ash += pk.value;
      else if (pk.kind === 'loot' && pk.loot) left.loot.push(pk.loot);
    }
    this.saveRun({
      cleared: true,
      doors: this.pendingDoors.map((d) => ({ kind: d.kind, reward: d.reward ? { ...d.reward } : null })),
      usedHere: w.interactables.filter((i) => i.used).map((i) => i.id),
      left,
    });
  }

  /** A reward's choice is under way: until it's done, a save keeps it as still to take. */
  private track(r: RewardSpec, after: () => void): () => void {
    this.resolving.push(r);
    return () => {
      const i = this.resolving.indexOf(r);
      if (i >= 0) this.resolving.splice(i, 1);
      after();
    };
  }

  private setupShop(w: World, count: number): void {
    const run = this.run!;
    const rng = run.rng;
    const mult = 1 + run.biomeIndex * 0.2;
    const pool: { kind: RewardSpec['kind']; label: string; price: number; god?: GodId }[] = [];
    const god = rng.pick(OLYMPIANS);
    pool.push({ kind: 'boon', label: `${GODS[god].name}'s Boon`, price: 150, god });
    if (pomCandidates(run.boons).length) pool.push({ kind: 'pom', label: 'Pomegranate', price: 100 });
    pool.push({ kind: 'fountain', label: 'Life Essence', price: 70 });
    pool.push({ kind: 'heart', label: 'Titan Heart', price: 130 });
    if (this.has('enchants')) pool.push({ kind: 'enchant', label: 'Enchanting Tome', price: 120 });
    if (this.has('artifacts') && ARTIFACTS.some((a) => !run.artifacts.includes(a.id))) pool.push({ kind: 'artifact', label: 'Artifact Cache', price: 140 });
    if (this.has('anvil') && rollHammerOffers(rng, run.weapon, run.hammers).length && !run.isUsed('hammer')) pool.push({ kind: 'hammer', label: "Hephaestus' Anvil", price: 200 });
    pool.push({ kind: 'hermes', label: "Hermes' Boon", price: 120 });
    const picks = rng.shuffle(pool).slice(0, count);
    const spacing = 180;
    const startX = w.room.w / 2 - (spacing * (picks.length - 1)) / 2;
    picks.forEach((it, i) => {
      w.interactables.push({
        id: `shop:${it.kind}:${it.god ?? ''}`,
        x: startX + i * spacing,
        y: w.room.h * 0.42,
        r: 70,
        label: it.label,
        prompt: 'Buy',
        kind: 'shop',
        price: Math.round(it.price * mult),
      });
    });
    w.interactables.push({ id: 'charon', x: w.room.w / 2, y: 230, r: 80, label: 'Charon', prompt: 'Greet', kind: 'npc' });
  }

  private openExitDoors(w: World): void {
    const run = this.run;
    // A late answer from a chamber already left (or an escape already over) changes nothing.
    if (!run || w !== this.world) return;
    const ms = this.mission;
    if (ms && run.mission) {
      // A mission has one way on: its next chamber.
      if (ms.last) return;
      run.mission.next = run.mission.step + 1;
      this.pendingDoors = [missionPlan(ms.m, run.mission.next)];
      w.openDoors(this.pendingDoors.map((p) => p.reward));
      return;
    }
    if (run.current.kind === 'boss' && run.isFinalBiome) {
      // The escape counts at once; the victory screen follows a moment later.
      const summary = this.recordVictory();
      if (summary) w.later(2.5, () => this.showVictory(summary));
      return;
    }
    this.pendingDoors = run.rollDoors();
    w.openDoors(this.pendingDoors.map((p) => p.reward));
    this.saveClearedRoom();
  }

  // ---------------------------------------------------------------- WorldHost

  onRoomCleared(w: World): void {
    const run = this.run;
    if (!run || this.mode !== 'run') return;
    // A room re-sealed by an ambush (mimic) only needs unlocking again.
    if (w.clearCount > 1) return;
    run.roomsCleared++;
    if (run.current.kind === 'combat') run.depth++;
    audio.play('clear');
    this.gainXpAll(run.current.kind === 'boss' ? XP.boss : XP.room);
    for (const m of this.members) {
      this.withMember(m, () =>
        w.as(m.player, () => {
          const s = m.stats;
          const p = m.player;
          if (s.afterParty > 0 && p.state !== 'dead' && p.hp < p.maxHp * s.afterParty) {
            p.hp = p.maxHp * s.afterParty;
            w.particles.text(p.x, p.y, 80, 'After Party!', GODS.dionysus.color, 18);
          }
          if (run.current.kind === 'boss') w.healPlayer(p.maxHp * 0.3, true);
        }),
      );
    }
    if (run.mission) {
      this.missionRoomCleared(w);
      return;
    }
    const p = this.me.player;
    this.save.stats.bestDepth = Math.max(this.save.stats.bestDepth, run.roomsCleared);
    const cx = clamp(p.x, 200, w.room.w - 200);
    const cy = clamp(p.y - 140, 220, w.room.h - 160);
    if (run.current.kind === 'boss') {
      run.guardians++;
      this.save.stats.bossesSlain++;
      for (const m of this.members) if (m.kind === 'remote') this.grant?.(m, { boss: true });
      this.persist();
      if (run.isFinalBiome) {
        this.openExitDoors(w);
        return;
      }
      const god = new Rng(run.seed + run.roomsCleared).pick(OLYMPIANS);
      w.spawnReward({ kind: 'boon', god }, w.room.w / 2, w.room.h / 2);
      this.dropAsh(w, w.room.w / 2 + 90, w.room.h / 2 + 40, Math.round((25 + run.biomeIndex * 15) * run.ashMult()));
      // Saved as won right away: resuming never replays the fight (or its drops).
      this.saveClearedRoom();
      return;
    }
    const reward = run.current.reward;
    if (reward) {
      w.spawnReward(reward, cx, cy);
      this.saveClearedRoom();
    } else this.openExitDoors(w);
  }

  private dropAsh(w: World, x: number, y: number, amount: number): void {
    const pk = new Pickup('ash', x, y, amount);
    pk.vz = 200;
    pk.r = 16;
    w.pickups.push(pk);
  }

  onRewardPicked(w: World, reward: RewardSpec): void {
    // A bonus (from a chest) is for whoever picked it up; a chamber's reward is for everyone.
    if (reward.bonus) {
      this.resolveReward(reward, this.track(reward, () => this.saveClearedRoom()));
      return;
    }
    this.forEachMember(
      (done) => this.resolveReward(reward, done),
      this.track(reward, () => this.openExitDoors(w)),
    );
  }

  /**
   * Runs `fn` once as each member, then `after` when all are done. This
   * device's players take turns (they share the screen); players online
   * answer at the same time on their own screens.
   */
  private forEachMember(fn: (done: () => void) => void, after: () => void): void {
    if (this.members.length === 1) {
      this.withMember(this.me, () => fn(after));
      return;
    }
    let left = this.members.length;
    const done = () => {
      if (--left === 0) after();
    };
    for (const m of this.members) if (m.kind === 'remote') this.withMember(m, () => fn(done));
    const local = this.members.filter((m) => m.kind !== 'remote');
    const next = (i: number): void => {
      if (i >= local.length) return;
      this.withMember(local[i], () =>
        fn(() => {
          done();
          next(i + 1);
        }),
      );
    };
    next(0);
  }

  onDoorEntered(w: World, door: Door, by?: Player): void {
    if (this.mode === 'hub') {
      if (!this.transition(() => this.startRun())) w.exiting = false;
      return;
    }
    const idx = w.doors.indexOf(door);
    const plan = this.pendingDoors[idx];
    if (!plan) {
      w.exiting = false;
      return;
    }
    const go = () => {
      // Another transition is under way: don't leave the door shut for good.
      if (!this.transition(() => this.goToRoom(plan))) w.exiting = false;
    };
    if (this.members.length > 1) {
      // The party follows whoever chose: a short moment to catch up.
      const who = by ? this.memberOf(by)?.name : null;
      w.showBanner(`${who ?? 'The party'} chose a door`, 'Everyone goes through in 2 seconds');
      w.later(2, go);
      return;
    }
    go();
  }

  /** WorldHost: a hero went down while partners still stand. */
  onPlayerDowned(_w: World, p: Player): void {
    const m = this.memberOf(p);
    this.ui.toast(`${m?.name ?? 'A hero'} is down! Stand by them to revive them.`, 3000);
  }

  onPlayerDied(w: World): void {
    const run = this.run;
    if (!run || this.mode !== 'run') {
      // Dying in the hub (shouldn't happen) just resets.
      w.later(1, () => this.transition(() => this.enterHub()));
      return;
    }
    // The escape is already won: its victory screen is on the way.
    if (run.won) return;
    if (run.mission) {
      // A mission is simply retried; an escape's save is left alone.
      this.mode = 'over';
      this.save.stats.deaths++;
      this.persist();
      const m = MISSION_BY_ID[run.mission.id];
      w.later(1.8, () => screens.missionFailed(this, m));
      return;
    }
    if (run.daily) {
      // A daily run is scored; a saved escape is left alone.
      this.mode = 'over';
      this.save.stats.deaths++;
      this.persist();
      w.later(1.8, () => this.finishDaily(false));
      return;
    }
    this.mode = 'over';
    this.save.stats.deaths++;
    this.persist();
    for (const m of this.members) if (m.kind === 'remote') this.grant?.(m, { run: 'death' });
    writeRun(null);
    const summary: RunSummary = {
      victory: false,
      rooms: run.roomsCleared,
      kills: run.kills,
      time: run.time,
      ash: run.ash,
      biome: run.biome.name,
      cause: this.lastHit,
      spoils: run.spoils,
    };
    this.net?.over?.(false, summary);
    w.later(1.8, () => screens.death(this, summary));
  }

  /**
   * The final guardian fell: the escape counts straight away (so quitting
   * during the moment before the victory screen loses nothing).
   */
  private recordVictory(): RunSummary | null {
    const run = this.run;
    if (!run || run.won) return null;
    run.won = true;
    if (!run.daily) writeRun(null);
    const bonus = Math.round(60 * run.ashMult());
    this.addAsh(bonus);
    const couldJump = this.has('jump');
    this.save.stats.escapes++;
    this.gainXpAll(XP.escape);
    for (const m of this.members) if (m.kind === 'remote') this.grant?.(m, { escape: true, ash: bonus });
    if (!couldJump) {
      this.recomputeStats();
      this.ui.toast('Unlocked: Jump & Slam (slaying the final guardian)', 4000);
    }
    this.save.maxHeat = Math.max(this.save.maxHeat, run.heat + 1);
    if (!this.save.stats.bestTime || run.time < this.save.stats.bestTime) this.save.stats.bestTime = run.time;
    this.persist();
    return {
      victory: true,
      rooms: run.roomsCleared,
      kills: run.kills,
      time: run.time,
      ash: run.ash,
      biome: run.biome.name,
      cause: '',
      spoils: run.spoils,
    };
  }

  private showVictory(summary: RunSummary): void {
    if (this.mode !== 'run') return;
    if (this.run?.daily) {
      this.ui.closeAll();
      this.finishDaily(true);
      return;
    }
    this.mode = 'over';
    this.ui.closeAll();
    this.net?.over?.(true, summary);
    screens.victory(this, summary);
  }

  onEnemyKilled(w: World, e: Enemy): void {
    if (this.run) this.run.kills++;
    this.save.stats.kills++;
    this.save.bestiary[e.name] = (this.save.bestiary[e.name] ?? 0) + 1;
    for (const m of this.members) if (m.kind === 'remote') this.grant?.(m, { kill: e.name, ...(e.isBoss && { guardian: e.name, heat: this.run?.heat ?? 0 }) });
    if (e.isBoss && this.run) this.awardPart(e.name, this.run.heat);
    this.checkAchievements();
    this.dropLoot(w, e);
    if (this.stats.lifeOnKill > 0) w.healPlayer(this.stats.lifeOnKill, false);
    if (this.run && !e.isBoss) this.gainXpAll(e.isElite ? XP.eliteKill : XP.kill);
  }

  /** Loot (from level 10): materials from most foes, gear now and then. */
  private dropLoot(w: World, e: Enemy): void {
    const run = this.run;
    if (!run || e.isDummy || e.passive) return;
    const rng = run.rng;
    const region = regionMaterial(run.biomeIndex);
    const D = FOE_DROP;
    const elite = !!(e.isElite || e.eliteMod);
    const big = e.isBoss ? D.guardianMult : elite ? D.eliteMult : 1;
    if (rng.next() < D.bone * big) w.dropLoot(e.x, e.y, { material: 'bone', count: e.isBoss ? 10 : 1 + (rng.next() < D.extraBone ? 1 : 0) });
    if (rng.next() < D.regional * big) w.dropLoot(e.x, e.y, { material: region, count: e.isBoss ? 6 : 1 });
    if (e.isBoss || (elite && rng.next() < D.eliteScale)) w.dropLoot(e.x, e.y, { material: 'scale', count: e.isBoss ? 3 + Math.floor(rng.next() * 3) : 1 });
    const gearChance = e.isBoss ? 1 : elite ? D.eliteGear : D.gear;
    if (rng.next() < gearChance) w.dropLoot(e.x, e.y, { gear: rollDrop(rng, e.isBoss ? 'guardian' : elite ? 'elite' : 'foe', this.level) });
    if (rng.next() < GHOST_CHANCE) w.dropLoot(e.x, e.y, { gear: rollGhost(rng, this.level) });
    // A Mimic guards a hoard: always a Unique piece (otherwise a rare find).
    if (e.name === 'Mimic') {
      w.dropLoot(e.x, e.y, { gear: rollStarred(rng, 'unique', this.level) });
      w.showBanner("Mimic's Hoard", 'It was guarding something unique.');
    }
  }

  onLoot(w: World, loot: Loot): void {
    const p = this.player;
    if (this.active.kind === 'remote') {
      // Their loot goes to their save, on their device.
      this.grant?.(this.active, { loot });
      const text = loot.gear ? loot.gear.name : `+${loot.count ?? 1} ${MATERIALS[loot.material!].glyph}`;
      w.particles.text(p.x, p.y, 70, text, loot.gear ? GEAR_RARITY[loot.gear.rarity].color : MATERIALS[loot.material!].color, 15);
      return;
    }
    const spoils = this.run?.spoils;
    if (loot.material) {
      const m = MATERIALS[loot.material];
      const n = loot.count ?? 1;
      this.save.materials[loot.material] = (this.save.materials[loot.material] ?? 0) + n;
      if (spoils) spoils.materials[loot.material] = (spoils.materials[loot.material] ?? 0) + n;
      w.particles.text(p.x, p.y, 70, `+${n} ${m.glyph} ${m.name}`, m.color, 15);
      w.feed(`+${n} ${m.glyph} ${m.name}`, m.color);
    }
    if (loot.gear) {
      const item = loot.gear;
      const color = GEAR_RARITY[item.rarity].color;
      spoils?.gear.push({ name: item.name, rarity: item.rarity });
      const stars = item.level > 0 ? ` ${'★'.repeat(Math.min(5, item.level))}${item.level > 5 ? `+${item.level - 5}` : ''}` : '';
      w.feed(`${GEAR_RARITY[item.rarity].name} ${SLOT_NAME[item.slot]}${stars}: ${item.name}`, color);
      if (this.save.gear.items.length >= INVENTORY_SIZE) {
        // Full: salvage it on the spot.
        const back = salvageValue(item);
        for (const [k, v] of Object.entries(back)) this.save.materials[k as MaterialId] = (this.save.materials[k as MaterialId] ?? 0) + (v ?? 0);
        this.ui.toast(`Inventory full: ${item.name} salvaged for ${costText(back)}`, 3000);
      } else {
        this.save.gear.items.push(item);
        const top = item.rarity === 'ghost' || item.rarity === 'unique' || item.rarity === 'legendary';
        // Plain finds only show in the feed; starred ones get a toast too.
        if (item.level > 0) this.ui.toast(`${top ? '✦ ' : ''}Found ${GEAR_RARITY[item.rarity].name} ${SLOT_NAME[item.slot]}${stars}: ${item.name}`, top ? 4200 : 2600);
        if (top) {
          audio.play('boon');
          w.particles.burst(p.x, p.y - 20, color, 30, 260, { kind: 'spark', life: 0.8 });
        }
      }
      w.particles.text(p.x, p.y, 80, item.name, color, 18);
    }
    this.persist();
  }

  tryDeathDefiance(): boolean {
    if (this.run && this.run.deathDefiance > 0) {
      this.run.deathDefiance--;
      return true;
    }
    return false;
  }

  addGold(n: number): void {
    if (this.run) this.run.gold += n;
  }

  addAsh(n: number): void {
    if (this.active.kind === 'remote') {
      this.grant?.(this.active, { ash: n });
      return;
    }
    this.save.ash += n;
    this.save.stats.totalAsh += n;
    if (this.run) this.run.ash += n;
    this.persist();
  }

  onInteract(w: World, it: Interactable): void {
    switch (it.kind) {
      case 'station':
        if (it.id === 'smith') smithScreen(this);
        else if (it.id === 'mirror') screens.mirror(this);
        else if (it.id === 'artifacts') screens.artifactLoadout(this);
        else if (it.id === 'chronicle') screens.chronicle(this);
        else if (it.id === 'pact') screens.pact(this);
        else if (it.id === 'heroes') screens.heroes(this);
        else if (it.id === 'ascension') screens.ascension(this);
        break;
      case 'npc':
        audio.play('select');
        this.ui.toast(`Charon: ${fx.pick(CHARON_LINES)}`);
        break;
      case 'fountain': {
        it.used = true;
        // The fountain refreshes the whole party.
        for (const m of this.members) this.withMember(m, () => w.as(m.player, () => w.healPlayer(m.player.maxHp * 0.4, true)));
        w.particles.burst(it.x, it.y - 30, '#7fd8ff', 30, 300);
        this.saveClearedRoom();
        break;
      }
      case 'chest':
        this.openChest(w, it);
        this.saveClearedRoom();
        break;
      case 'shop':
        this.buy(w, it);
        break;
    }
  }

  private openChest(w: World, it: Interactable): void {
    const run = this.run;
    it.used = true;
    audio.play('door');
    if (run && run.current.kind === 'combat' && Math.random() < CHEST.mimic) {
      const sc = run.scales();
      const m = w.spawn('mimic', it.x, it.y, null, sc.hp, sc.dmg);
      m.spawnT = 0.2;
      w.interactables = w.interactables.filter((i) => i !== it);
      w.showBanner('MIMIC!', 'The chest bites back.');
      audio.play('roar', 0.5);
      if (w.cleared) w.reseal(sc.hp, sc.dmg);
      return;
    }
    w.dropGold(it.x, it.y, Math.round(fx.range(15, 35) * this.stats.goldMult));
    w.dropSouls(it.x, it.y, 6);
    if (run) {
      w.dropLoot(it.x, it.y, { material: 'bone', count: 3 });
      if (Math.random() < CHEST.gear) w.dropLoot(it.x, it.y, { gear: rollDrop(run.rng, 'chest', this.level) });
    }
    w.particles.burst(it.x, it.y - 20, '#ffd890', 30, 320);
    const r = Math.random();
    if (run && r < CHEST.artifact && this.has('artifacts') && ARTIFACTS.some((a) => !run.artifacts.includes(a.id))) w.spawnReward({ kind: 'artifact', bonus: true }, it.x, it.y + 60);
    else if (run && r < CHEST.enchant && this.has('enchants')) w.spawnReward({ kind: 'enchant', bonus: true }, it.x, it.y + 60);
    else if (run && r < 0.6) w.dropGold(it.x, it.y, Math.round(fx.range(20, 40) * this.stats.goldMult));
  }

  private buy(w: World, it: Interactable): void {
    const run = this.run;
    if (!run || it.used) return;
    const price = it.price ?? 0;
    if (run.gold < price) {
      audio.play('deny');
      this.ui.toast(`Not enough obols (${run.gold}/${price})`);
      return;
    }
    run.gold -= price;
    it.used = true;
    audio.play('gold');
    const [, kind, god] = it.id.split(':');
    // Buying a kind of ware once reveals what it does from then on.
    if (!this.save.shopSeen.includes(kind)) this.save.shopSeen.push(kind);
    this.save.stats.shopBuys++;
    this.persist();
    const spec: RewardSpec = { kind: kind as RewardSpec['kind'], god: (god || undefined) as GodId | undefined, bonus: true };
    if (spec.kind === 'fountain') {
      w.healPlayer(this.player.maxHp * 0.5, true);
      this.saveClearedRoom();
      return;
    }
    this.resolveReward(spec, this.track(spec, () => this.saveClearedRoom()));
  }

  // ---------------------------------------------------------------- rewards

  resolveReward(r: RewardSpec, after: () => void): void {
    const run = this.run;
    const w = this.world!;
    const p = this.player;
    if (!run) {
      after();
      return;
    }
    const rng = run.rng;
    switch (r.kind) {
      case 'boon':
        this.offerBoons(r.god ?? rng.pick(OLYMPIANS), after);
        return;
      case 'hermes':
        run.markUsed('hermes');
        this.offerBoons('hermes', after);
        return;
      case 'pom':
        this.offerPom(after);
        return;
      case 'hammer':
        run.markUsed('hammer');
        this.offerHammer(after);
        return;
      case 'enchant':
        this.offerEnchant(after);
        return;
      case 'artifact':
        this.offerArtifact(after);
        return;
      case 'gold': {
        const amount = Math.round(rng.range(40, 75) * (1 + run.biomeIndex * 0.3) * this.stats.goldMult);
        run.gold += amount;
        w.particles.text(p.x, p.y, 90, `+${amount} ◎`, '#ffd04a', 22);
        audio.play('gold');
        break;
      }
      case 'heart': {
        run.bonusHp += 25;
        this.recomputeStats();
        w.particles.text(p.x, p.y, 90, '+25 Max Health', '#ff5a6a', 20);
        audio.play('heal');
        break;
      }
      case 'ash': {
        const amount = Math.round((10 + run.biomeIndex * 6 + rng.int(0, 6)) * run.ashMult());
        this.addAsh(amount);
        w.particles.text(p.x, p.y, 90, `+${amount} Ash`, '#c8a8ff', 22);
        break;
      }
      default:
        break;
    }
    after();
  }

  private boonCard(o: BoonOffer): screens.CardData {
    const def = BOON_BY_ID[o.id];
    const v = boonValue(def, o.rarity, 1);
    const replaces = o.replaces ? BOON_BY_ID[o.replaces] : null;
    const slotName = def.slot === 'duo' ? 'Duo' : def.slot[0].toUpperCase() + def.slot.slice(1);
    return {
      title: def.name,
      subtitle: def.duoOf ? `${GODS[def.duoOf[0]].name} & ${GODS[def.duoOf[1]].name}` : `${GODS[def.god].name} · ${slotName}`,
      // Boons whose effect doesn't change with rarity show no rarity at all.
      tag: def.fixed && def.slot !== 'duo' ? 'SPECIAL' : o.rarity.toUpperCase(),
      tagColor: def.fixed && def.slot !== 'duo' ? '#d8c8a0' : RARITY_COLOR[o.rarity],
      color: def.slot === 'duo' ? RARITY_COLOR.duo : GODS[def.god].color,
      desc: def.desc(v),
      note: replaces ? `Replaces ${replaces.name}` : undefined,
      icon: GODS[def.god].glyph,
    };
  }

  private offerBoons(god: GodId, after: () => void): void {
    const run = this.run!;
    let odds = boonRarityOdds(run.biomeIndex, run.roomsCleared === 0, run.favor(this.save), run.regionProgress);
    // A Painted Chamber's boon is at least Rare.
    if (run.current.reward?.painted) odds = { ...odds, rare: odds.rare + odds.common, common: 0 };
    const offers = rollBoonOffers(run.rng, god, run.boons, odds, 3, this.stats.canCast ? undefined : (d) => !needsCast(d));
    const g = GODS[god];
    if (offers.length === 0) {
      // Nothing left from this god: compensate with obols.
      run.gold += 50;
      this.ui.toast(`${g.name} has nothing more to offer. +50 obols.`);
      after();
      return;
    }
    this.choose({
      title: g.name,
      info: this.buildInfo(),
      subtitle: g.title,
      color: g.color,
      quote: fx.pick(g.greeting),
      cards: offers.map((o) => this.boonCard(o)),
      onPick: (i) => {
        run.boons = takeBoon(run.boons, offers[i]);
        this.recomputeStats();
        after();
      },
      skip: this.skipChoice(after),
    });
  }

  private offerPom(after: () => void): void {
    const run = this.run!;
    const cands = run.rng.shuffle(pomCandidates(run.boons)).slice(0, 3);
    if (cands.length === 0) {
      this.resolveReward({ kind: 'gold' }, after);
      return;
    }
    const gain = run.rng.chance(POM_DOUBLE) ? 2 : 1;
    this.choose({
      title: 'Pomegranate',
      info: this.buildInfo(),
      subtitle: `Level up a boon by ${gain}.`,
      color: '#ff4a5a',
      cards: cands.map((b) => {
        const def = BOON_BY_ID[b.id];
        const now = boonValue(def, b.rarity, b.level);
        const next = boonValue(def, b.rarity, b.level + gain);
        return {
          title: def.name,
          subtitle: `${GODS[def.god].name} · Lv ${b.level} → ${b.level + gain}`,
          tag: b.rarity.toUpperCase(),
          tagColor: RARITY_COLOR[b.rarity],
          color: GODS[def.god].color,
          desc: def.desc(next),
          note: `${def.inverse ? now.toFixed(1) : Math.round(now)} → ${def.inverse ? next.toFixed(1) : Math.round(next)}`,
          icon: GODS[def.god].glyph,
        };
      }),
      onPick: (i) => {
        const b = run.boons.find((x) => x.id === cands[i].id);
        if (b) b.level += gain;
        this.recomputeStats();
        after();
      },
      skip: this.skipChoice(after),
    });
  }

  private offerHammer(after: () => void): void {
    const run = this.run!;
    const offers = rollHammerOffers(run.rng, run.weapon, run.hammers);
    if (offers.length === 0) {
      this.resolveReward({ kind: 'gold' }, after);
      return;
    }
    this.choose({
      title: "Hephaestus' Anvil",
      info: this.buildInfo(),
      subtitle: `Reforge the ${WEAPON_INFO[run.weapon].name}.`,
      color: '#d8d8e8',
      cards: offers.map((h) => ({ title: h.name, subtitle: WEAPON_INFO[h.weapon].name, color: '#d8d8e8', desc: h.desc, icon: '⚒' })),
      onPick: (i) => {
        run.hammers.push(offers[i].id);
        this.recomputeStats();
        after();
      },
      skip: this.skipChoice(after),
    });
  }

  private offerEnchant(after: () => void): void {
    const run = this.run!;
    const offers = rollEnchantOffers(run.rng, run.enchants);
    if (offers.length === 0) {
      this.resolveReward({ kind: 'gold' }, after);
      return;
    }
    this.choose({
      title: 'Enchanting Tome',
      info: this.buildInfo(),
      subtitle: 'Imbue your gear. Find an enchantment again to empower it (up to III).',
      color: '#c98bff',
      cards: offers.map((o) => {
        const def = ENCHANT_BY_ID[o.id];
        return { title: `${def.name} ${'I'.repeat(o.tier)}`, subtitle: o.tier > 1 ? 'Upgrade' : 'New enchantment', color: def.color, desc: def.desc(o.tier), icon: def.glyph };
      }),
      onPick: (i) => {
        run.enchants = takeEnchant(run.enchants, offers[i]);
        this.recomputeStats();
        after();
      },
      skip: this.skipChoice(after),
    });
  }

  private offerArtifact(after: () => void): void {
    const run = this.run!;
    const pool = run.rng.shuffle(ARTIFACTS.filter((a) => !run.artifacts.includes(a.id))).slice(0, 3);
    if (pool.length === 0) {
      this.resolveReward({ kind: 'gold' }, after);
      return;
    }
    this.choose({
      title: 'Artifact Cache',
      info: this.buildInfo(),
      subtitle: 'Equip an artifact (keys 1–3 to use).',
      color: '#7fe8ff',
      cards: pool.map((a) => ({
        title: a.name,
        subtitle: a.souls ? `Costs ${a.souls} Echoes` : `Cooldown ${a.cooldown}s`,
        color: a.color,
        desc: a.desc,
        icon: a.glyph,
      })),
      onPick: (i) => {
        const chosen = pool[i];
        const free = run.artifacts.findIndex((a, i) => a === null && i < this.stats.artifactSlots);
        if (free >= 0) {
          run.artifacts[free] = chosen.id;
          after();
          return;
        }
        // Online, a full set of artifacts swaps out the first one.
        if (this.active.kind === 'remote') {
          run.artifacts[0] = chosen.id;
          after();
          return;
        }
        screens.replaceArtifact(this, chosen.id, after);
      },
      skip: this.skipChoice(after, 'Leave it'),
    });
  }

  /**
   * Shows a card choice to the active member: on this screen (with their
   * name in party play), or on their own device when they play online. Its
   * answers run as that member, whenever they come.
   */
  private choose(opts: ChoiceOpts): void {
    const m = this.active;
    const wrapped: ChoiceOpts = {
      ...opts,
      onPick: this.bound(opts.onPick),
      skip: opts.skip ? { label: opts.skip.label, onSkip: this.bound(opts.skip.onSkip) } : undefined,
      who: this.members.length > 1 ? { name: `${m.name} · ${m.player.hero.name}`, color: MEMBER_COLORS[m.id % MEMBER_COLORS.length] } : undefined,
    };
    if (m.kind === 'remote') {
      if (this.remoteChoice) this.remoteChoice(m, wrapped);
      else wrapped.skip?.onSkip();
      return;
    }
    this.ui.choice(wrapped);
  }

  /** Online games send a remote player's card choices to their device. */
  remoteChoice: ((m: Member, opts: ChoiceOpts) => void) | null = null;

  /** Every card choice can be skipped for a few obols, so nothing is forced on you. */
  private skipChoice(after: () => void, label = 'Skip'): { label: string; onSkip: () => void } {
    return {
      label: `${label} (+${SKIP_OBOLS} obols)`,
      onSkip: () => {
        if (this.run) this.run.gold += SKIP_OBOLS;
        audio.play('gold');
        this.ui.toast(`Skipped. +${SKIP_OBOLS} obols.`);
        after();
      },
    };
  }

  // ---------------------------------------------------------------- menus helpers

  /** The "Your build" button shown on reward choices. */
  private buildInfo(): { label: string; onOpen: () => void } | undefined {
    if (!this.run || this.run.boons.length + this.run.hammers.length + this.run.enchants.length === 0) return undefined;
    return { label: 'Your build', onOpen: () => screens.buildView(this) };
  }

  selectWeapon(id: Parameters<typeof createWeapon>[0]): void {
    this.save.weapon = id;
    this.persist();
    this.player.weapon = createWeapon(id);
    this.recomputeStats();
  }

  selectCharacter(id: CharacterId): void {
    const def = CHARACTER_BY_ID[id];
    if (!def || !characterUnlocked(def, this.save, this.level)) return;
    this.save.character = id;
    // Each hero fights with their own class weapon.
    this.save.weapon = def.weapon;
    if (!this.save.weapons.includes(def.weapon)) this.save.weapons.push(def.weapon);
    this.persist();
    this.setHero(this.me, id);
    this.refreshHubPrompts();
  }

  /** Swaps a member's hero class on the spot (their weapon comes with it). */
  setHero(m: Member, id: CharacterId): void {
    const def = CHARACTER_BY_ID[id];
    if (!def) return;
    m.character = id;
    this.withMember(m, () => {
      const p = this.player;
      p.weapon = createWeapon(def.weapon);
      p.hero = def;
      p.wrath = 0;
      if (this.run) this.run.weapon = def.weapon;
      this.recomputeStats(true);
      this.world?.particles.ring(p.x, p.y, def.color, 90, 0.4, 6);
    });
  }

  /** Refreshes the Ascension station prompt after spending points or changing hero. */
  refreshHubPrompts(): void {
    const it = this.world?.interactables.find((i) => i.id === 'ascension');
    if (it) it.prompt = this.ascensionPrompt();
  }

  private ascensionPrompt(): string {
    const n = this.unspentSkills();
    return n > 0 ? `Skill tree (${n} point${n === 1 ? '' : 's'})` : 'Skill tree';
  }

  abandonRun(): void {
    if (this.run?.mission) {
      this.toCampaign();
      return;
    }
    if (this.run?.daily) {
      // Giving up still scores what you reached.
      this.ui.closeAll();
      this.finishDaily(false);
      return;
    }
    writeRun(null);
    this.ui.closeAll();
    this.transition(() => this.enterHub(), true);
  }

  /** The saved escape, if any (shown on the title screen). */
  savedRun(): ReturnType<typeof loadRun> {
    return loadRun();
  }

  /** Continues a saved escape from the start of the chamber it was saved in. */
  resumeRun(): boolean {
    const snap = loadRun();
    if (!snap) return false;
    try {
      this.restoreRun(snap);
      return true;
    } catch (err) {
      // A save that can't be rebuilt is dropped, rather than leaving a blank screen.
      console.error(err);
      writeRun(null);
      this.run = null;
      this.enterHub(true);
      this.mode = 'title';
      this.ui.closeAll();
      screens.title(this);
      return false;
    }
  }

  private restoreRun(snap: RunSnapshot): void {
    this.ui.closeAll();
    const run = Run.restore(this.save, snap);
    this.run = run;
    // A saved escape is a solo one.
    for (const m of [...this.members]) this.removeMember(m);
    // Resume as the hero the escape was played with (they become the selected hero again).
    const hero = snap.character && CHARACTER_BY_ID[snap.character] ? snap.character : this.save.character;
    if (hero !== this.save.character) {
      this.save.character = hero;
      this.save.weapon = CHARACTER_BY_ID[hero].weapon;
    }
    this.me.character = hero;
    this.me.player = new Player(run.weapon, hero);
    this.outfit(this.me);
    this.active = this.me;
    run.level = this.level;
    this.recomputeStats(true);
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, snap.hp));
    this.player.souls = snap.souls;
    this.player.dashCharges = this.stats.dashCharges;
    this.mode = 'run';
    this.goToRoom(snap.current, snap);
  }

  /** Leaves to the title screen; an escape in progress stays saved at its last chamber. */
  quitToTitle(): void {
    this.ui.closeAll();
    // A won chamber is saved as it stands (wares bought, fountain drunk).
    this.saveClearedRoom();
    this.transition(() => {
      this.enterHub(true);
      this.mode = 'title';
      screens.title(this);
    }, true);
  }

  rewardLabel(r: RewardSpec): string {
    return r.kind === 'boon' && r.god ? `${GODS[r.god].name}` : REWARD_INFO[r.kind].label;
  }
}

/** The plan for a mission's chamber (its reward shows on the door leading there). */
function missionPlan(m: Mission, step: number): RoomPlan {
  const room = m.rooms[step];
  return { kind: room.kind, reward: room.reward ? { ...room.reward } : null };
}

/** A mission chamber's set waves (more foes for a party: +35% per extra hero, as in escapes). */
function missionWaves(room: MissionRoom, party: number): Wave[] {
  const more = 1 + 0.35 * Math.max(0, party - 1);
  return (room.waves ?? []).map((wave) => wave.flatMap(([kind, n, mod]) => Array.from({ length: Math.max(1, Math.round(n * more)) }, () => ({ kind, mod: mod ?? null }))));
}
