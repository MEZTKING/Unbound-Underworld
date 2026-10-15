import { audio, type Mood } from '../engine/audio';
import { Camera } from '../engine/camera';
import { Input, keyLabel, type Action } from '../engine/input';
import { clamp, fx, Rng } from '../engine/math';
import { Particles } from '../engine/particles';
import { UI } from '../ui/overlay';
import * as screens from '../ui/screens';
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
import { drawHUD, drawHudTooltip, drawSaveIcon, useKeyLabels } from './hud';
import { newAchievements } from './codex';
import { applyGear, costText, equippedItems, gearDefiance, GEAR_RARITY, INVENTORY_SIZE, MATERIALS, regionMaterial, rollGear, salvageValue, SLOT_NAME, type MaterialId } from './gear';
import type { Loot } from './entities';
import { applyMetaExtras, loadRun, loadSave, metaBonuses, writeRun, writeSave, type SaveData } from './meta';
import { Player, useHeroLooks } from './player';
import { prefs } from './prefs';
import { applyFeatures, applyForge, applyTalents, hasFeature, levelFromXp, tierFor, unlocksAt, XP } from './progression';
import { REWARD_INFO, renderOpts, renderOverlay } from './render';
import type { VoxelQuality, VoxelRenderer } from '../render3d/voxel';
import { BIOMES, generateEncounter, generateLayout, hubLayout } from './rooms';
import { Run, type RoomPlan, type Spoils } from './run';
import type { PlayerStats } from './stats';
import type { GodId, RewardSpec } from './types';
import { createWeapon, WEAPON_INFO } from './weapons';
import { World, type Door, type Interactable, type WorldHost } from './world';
import { CHEST, FOE_DROP, GEAR_LUCK, POM_DOUBLE } from './odds';

const STEP = 1 / 60;

type Mode = 'title' | 'hub' | 'run' | 'over';
const SAVE_MARK = 1.8;
/** Obols for skipping a card choice. */
const SKIP_OBOLS = 25;

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
  player: Player;
  world: World | null = null;
  stats: PlayerStats;
  mode: Mode = 'title';
  godMode = false;
  /** Developer options were used this session: achievements are off until restart. */
  cheated = false;
  private hubArtifacts: (string | null)[] = [null, null, null];
  private pendingDoors: RoomPlan[] = [];
  private fade = 1;
  private fadeTarget = 0;
  private fadeCb: (() => void) | null = null;
  private acc = 0;
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
    this.player = new Player(this.save.weapon, this.save.character);
    this.stats = computeStats([], [], metaBonuses(this.save));
    const unlock = () => audio.unlock();
    // iOS only lets audio start inside touchend/click, so listen for those too.
    for (const ev of ['keydown', 'mousedown', 'touchstart', 'touchend', 'click']) window.addEventListener(ev, unlock);
    this.touch.onFirstTouch = () => this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    this.resize();
  }

  get artifacts(): (string | null)[] {
    return this.run ? this.run.artifacts : this.hubArtifacts;
  }

  boot(): void {
    this.enterHub(true);
    this.mode = 'title';
    screens.title(this);
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
      // Autosave whenever the game goes to the background.
      this.persist();
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
  }

  /** Awards any achievements just earned. God mode (or developer cheats) disables them. */
  checkAchievements(): void {
    if (this.godMode || this.cheated) return;
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

  /** True while the 3D voxel view is drawing the world. */
  get view3d(): boolean {
    return !!this.voxel && this.save.settings.view3d && this.voxelState === 'ready';
  }

  /**
   * Switches between the 3D voxel view and the classic 2D view. three.js is
   * only downloaded the first time the 3D view is used; if WebGL isn't
   * available the game stays in 2D.
   */
  applyView(): void {
    const want = this.save.settings.view3d && !!this.canvas3d && this.params.get('view') !== '2d';
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
      cam.setAngle(VIEW_YAW, on ? VIEW_PITCH : null);
      cam.viewScale = on ? 1.15 : 1;
      cam.resize(cam.vw, cam.vh);
      const up = cam.lift;
      this.particles.liftX = up.x;
      this.particles.liftY = up.y;
    }
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
    const before = this.level;
    this.save.xp += n;
    const after = this.level;
    if (after <= before) return;
    this.recomputeStats();
    const p = this.player;
    p.castAmmo = this.stats.castAmmo;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25);
    this.persist();
    this.announceLevels();
  }

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
      w.particles.ring(this.player.x, this.player.y, tier.color, 160, 0.6, 8);
      w.particles.text(this.player.x, this.player.y, 100, `LEVEL ${level}`, tier.color, 26);
    }
    if (unlocks.length) {
      const u = unlocks[unlocks.length - 1];
      const keys = u.keys ? ` (${this.touch.enabled ? u.keys.touch : u.keys.pc})` : '';
      w?.showBanner(`Unlocked: ${u.title}`, `${u.desc}${keys}`);
      if (unlocks.length > 1) this.ui.toast(`Also unlocked: ${unlocks.slice(0, -1).map((x) => x.title).join(', ')}`, 4000);
    } else {
      w?.showBanner(`Level ${level}`, `${tier.name} · +1 talent point`);
    }
    if (this.save.seenLevel > 1) this.ui.toast(`Level ${level}! A talent point awaits at Ascension in the Hall.`, 3000);
  }
  // ---------------------------------------------------------------- loop

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000 || 0);
    this.last = t;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.input.pollGamepads();
    if (!this.ui.open) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) this.acc = 0;
    } else {
      this.acc = 0;
    }
    // Fade
    const fs = 1 / 0.3;
    if (this.fade < this.fadeTarget) {
      this.fade = Math.min(this.fadeTarget, this.fade + dt * fs);
      if (this.fade >= 1 && this.fadeCb) {
        const cb = this.fadeCb;
        this.fadeCb = null;
        cb();
        this.fadeTarget = 0;
      }
    } else if (this.fade > this.fadeTarget) this.fade = Math.max(this.fadeTarget, this.fade - dt * fs);
    this.render();
    requestAnimationFrame((tt) => this.frame(tt));
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
    if (this.input.pressed('pause') && (this.mode === 'hub' || this.mode === 'run') && this.player.state !== 'dead') {
      this.input.endStep();
      screens.pause(this);
      return;
    }
    w.titleDrift = this.mode === 'title';
    this.saveMark = Math.max(0, this.saveMark - dt);
    if (this.mode === 'title') {
      this.input.endStep();
      w.update(dt);
      return;
    }
    if (this.run && this.mode === 'run') this.run.time += dt;
    w.update(dt);
    this.updateMood(w);
    this.input.endStep();
  }

  private updateMood(w: World): void {
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
        drawHUD(ctx, w, this.run, this.save, this.camera.vw / this.uiScale, this.camera.vh / this.uiScale, this.mode === 'hub', this.touch.enabled, this.level, this.save.settings.leftHanded);
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
      castAmmo: p.castAmmo,
      interact: w.focus ? w.focus.prompt : null,
    });
  }

  /** Android back button. Returns false when the app should go to the background instead. */
  handleBack(): boolean {
    if (this.mode === 'title') return false;
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

  transition(fn: () => void): void {
    if (this.fadeCb) return;
    this.fadeTarget = 1;
    this.fadeCb = fn;
  }

  // ---------------------------------------------------------------- stats

  recomputeStats(fullHeal = false): void {
    let s: PlayerStats;
    if (this.run) s = this.run.computeStats(this.save);
    else {
      s = computeStats([], [], metaBonuses(this.save));
      applyMetaExtras(this.save, s);
    }
    // Order matters: features decide what exists, then talents, hero and forge build on top.
    applyFeatures(this.level, s, this.save.stats.escapes > 0);
    applyTalents(this.save.talents, s);
    this.player.hero.apply(s);
    applyForge(this.save.forge[this.player.weapon.id] ?? 1, s);
    if (this.has('gear')) applyGear(equippedItems(this.save.gear), s);
    if (prefs.assist) s.damageTaken *= 0.5;
    s.maxHp = Math.max(20, s.maxHp);
    this.stats = s;
    if (this.run) this.run.level = this.level;
    this.player.applyStats(this.stats, fullHeal);
  }

  // ---------------------------------------------------------------- hub

  enterHub(silent = false): void {
    this.mode = 'hub';
    this.run = null;
    this.particles.clear();
    this.player = new Player(this.save.weapon, this.save.character);
    this.hubArtifacts = [this.has('artifacts') ? this.save.startArtifact : null, null, null];
    this.recomputeStats(true);
    this.player.castAmmo = this.stats.castAmmo;
    this.player.dashCharges = this.stats.dashCharges;
    this.player.souls = this.stats.soulMax;
    const layout = hubLayout();
    const w = new World(this, layout, BIOMES[3], this.camera, this.particles, this.player);
    w.cleared = true;
    w.doors = [{ x: layout.w / 2, reward: null, open: true }];
    const st = (id: string, x: number, y: number, label: string, prompt: string, color: string): Interactable => ({ id, x, y, r: 90, label, prompt, kind: 'station', color });
    w.interactables.push(
      st('weapons', 230, 360, 'Armory', 'Choose weapon', 'rgba(255,120,120,0.5)'),
      st('mirror', layout.w - 230, 360, 'Altar of Ashes', 'Upgrade', 'rgba(200,140,255,0.6)'),
      st('chronicle', layout.w - 230, 650, 'Chronicle', 'Read', 'rgba(255,220,160,0.5)'),
      st('heroes', 440, 470, 'Hall of Heroes', 'Choose hero', 'rgba(255,140,110,0.5)'),
      st('ascension', layout.w - 440, 470, 'Ascension', this.unspentTalents() > 0 ? `Spend talents (${this.unspentTalents()})` : 'Talents', 'rgba(255,230,140,0.55)'),
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
  startRun(dev?: { biome: number; kind: RoomPlan['kind'] }): void {
    if (loadRun()) this.ui.toast('A new escape begins. The saved one was set aside.', 3000);
    const seedParam = this.params.get('seed');
    this.run = new Run(this.save, seedParam ? Number(seedParam) : undefined);
    const biomeParam = dev ? dev.biome : Number(this.params.get('biome'));
    if (biomeParam > 0) this.run.biomeIndex = clamp(Math.floor(biomeParam), 0, BIOMES.length - 1);
    this.save.stats.runs++;
    this.persist();
    this.player = new Player(this.save.weapon, this.save.character);
    this.run.level = this.level;
    this.run.deathDefiance += this.save.talents.undying ?? 0;
    if (this.has('gear')) this.run.deathDefiance += gearDefiance(equippedItems(this.save.gear));
    if (!this.has('artifacts')) this.run.artifacts[0] = null;
    this.recomputeStats(true);
    this.player.castAmmo = this.stats.castAmmo;
    this.player.dashCharges = this.stats.dashCharges;
    this.mode = 'run';
    const plan = dev ? { kind: dev.kind, reward: dev.kind === 'combat' ? { kind: 'boon' as const } : null } : this.params.get('room') === 'boss' ? { kind: 'boss' as const, reward: null } : this.run.startPlan();
    this.goToRoom(plan);
  }

  goToRoom(plan: RoomPlan): void {
    const run = this.run!;
    run.enter(plan);
    // Autosave at the start of every chamber, so Save & Quit (or closing the
    // app) resumes here.
    writeRun(run.snapshot(this.player.hp, this.player.souls));
    this.saveMark = SAVE_MARK;
    this.particles.clear();
    const biome = run.biome;
    const layout = generateLayout(run.rng, biome, plan.kind, this.stats.chestChance);
    const p = this.player;
    p.castAmmo = this.stats.castAmmo;
    const w = new World(this, layout, biome, this.camera, this.particles, p);
    this.world = w;
    this.pendingDoors = [];
    // Higher Torment: more foes attack at once, and they aim better.
    w.tokenBonus = Math.floor(run.heat / 2);
    w.foeAimError = Math.max(0.35, 1 - run.heat * 0.1);
    const sc = run.scales();
    switch (plan.kind) {
      case 'combat': {
        const elite = plan.reward?.kind === 'hammer' || plan.reward?.kind === 'artifact';
        const waves = generateEncounter(run.rng, biome, run.biomeIndex, run.depth, elite);
        w.startEncounter(waves, sc.hp, sc.dmg);
        if (run.depth === 0) w.showBanner(biome.name, biome.subtitle);
        else w.showBanner(`Chamber ${run.depth + 1}`, elite ? 'Enchanted foes lie in wait' : biome.name);
        break;
      }
      case 'boss': {
        const boss = createBoss(biome.boss, layout.w / 2, 380, sc.hp);
        boss.dmg *= sc.dmg;
        w.addEnemy(boss);
        w.startEncounter([], sc.hp, sc.dmg);
        w.showBanner(boss.name.toUpperCase(), boss.title);
        audio.play('roar');
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
    if (!run) return;
    if (run.current.kind === 'boss' && run.isFinalBiome) {
      w.later(2.5, () => this.victory());
      return;
    }
    this.pendingDoors = run.rollDoors();
    w.openDoors(this.pendingDoors.map((p) => p.reward));
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
    this.gainXp(run.current.kind === 'boss' ? XP.boss : XP.room);
    const s = this.stats;
    const p = this.player;
    if (s.afterParty > 0 && p.hp < p.maxHp * s.afterParty) {
      p.hp = p.maxHp * s.afterParty;
      w.particles.text(p.x, p.y, 80, 'After Party!', GODS.dionysus.color, 18);
    }
    this.save.stats.bestDepth = Math.max(this.save.stats.bestDepth, run.roomsCleared);
    const cx = clamp(p.x, 200, w.room.w - 200);
    const cy = clamp(p.y - 140, 220, w.room.h - 160);
    if (run.current.kind === 'boss') {
      this.save.stats.bossesSlain++;
      this.persist();
      w.healPlayer(p.maxHp * 0.3, true);
      if (run.isFinalBiome) {
        this.openExitDoors(w);
        return;
      }
      const god = new Rng(run.seed + run.roomsCleared).pick(OLYMPIANS);
      w.spawnReward({ kind: 'boon', god }, w.room.w / 2, w.room.h / 2);
      this.dropAsh(w, w.room.w / 2 + 90, w.room.h / 2 + 40, Math.round((25 + run.biomeIndex * 15) * run.ashMult()));
      return;
    }
    const reward = run.current.reward;
    if (reward) w.spawnReward(reward, cx, cy);
    else this.openExitDoors(w);
  }

  private dropAsh(w: World, x: number, y: number, amount: number): void {
    const pk = new Pickup('ash', x, y, amount);
    pk.vz = 200;
    pk.r = 16;
    w.pickups.push(pk);
  }

  onRewardPicked(w: World, reward: RewardSpec): void {
    const after = reward.bonus ? () => {} : () => this.openExitDoors(w);
    this.resolveReward(reward, after);
  }

  onDoorEntered(w: World, door: Door): void {
    if (this.mode === 'hub') {
      this.transition(() => this.startRun());
      return;
    }
    const idx = w.doors.indexOf(door);
    const plan = this.pendingDoors[idx];
    if (!plan) return;
    this.transition(() => this.goToRoom(plan));
  }

  onPlayerDied(w: World): void {
    const run = this.run;
    if (!run || this.mode !== 'run') {
      // Dying in the hub (shouldn't happen) just resets.
      w.later(1, () => this.transition(() => this.enterHub()));
      return;
    }
    this.mode = 'over';
    this.save.stats.deaths++;
    this.persist();
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
    w.later(1.8, () => screens.death(this, summary));
  }

  private victory(): void {
    const run = this.run;
    if (!run) return;
    this.mode = 'over';
    writeRun(null);
    const bonus = Math.round(60 * run.ashMult());
    this.addAsh(bonus);
    const couldJump = this.has('jump');
    this.save.stats.escapes++;
    this.gainXp(XP.escape);
    if (!couldJump) {
      this.recomputeStats();
      this.ui.toast('Unlocked: Jump & Slam (slaying the final guardian)', 4000);
    }
    this.save.maxHeat = Math.max(this.save.maxHeat, run.heat + 1);
    if (!this.save.stats.bestTime || run.time < this.save.stats.bestTime) this.save.stats.bestTime = run.time;
    this.persist();
    screens.victory(this, {
      victory: true,
      rooms: run.roomsCleared,
      kills: run.kills,
      time: run.time,
      ash: run.ash,
      biome: run.biome.name,
      cause: '',
      spoils: run.spoils,
    });
  }

  onEnemyKilled(w: World, e: Enemy): void {
    if (this.run) this.run.kills++;
    this.save.stats.kills++;
    this.save.bestiary[e.name] = (this.save.bestiary[e.name] ?? 0) + 1;
    this.checkAchievements();
    this.dropLoot(w, e);
    if (this.stats.lifeOnKill > 0) w.healPlayer(this.stats.lifeOnKill, false);
    if (this.run && !e.isBoss) this.gainXp(e.isElite ? XP.eliteKill : XP.kill);
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
    if (rng.next() < gearChance) w.dropLoot(e.x, e.y, { gear: rollGear(rng, e.isBoss ? GEAR_LUCK.guardian : run.biomeIndex * GEAR_LUCK.perRegion, undefined, e.isBoss ? 'rare' : 'common') });
  }

  onLoot(w: World, loot: Loot): void {
    const p = this.player;
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
      w.feed(`${GEAR_RARITY[item.rarity].name} ${SLOT_NAME[item.slot]}: ${item.name}`, color);
      if (this.save.gear.items.length >= INVENTORY_SIZE) {
        // Full: salvage it on the spot.
        const back = salvageValue(item);
        for (const [k, v] of Object.entries(back)) this.save.materials[k as MaterialId] = (this.save.materials[k as MaterialId] ?? 0) + (v ?? 0);
        this.ui.toast(`Inventory full: ${item.name} salvaged for ${costText(back)}`, 3000);
      } else {
        this.save.gear.items.push(item);
        const top = item.rarity === 'ghost' || item.rarity === 'unique';
        this.ui.toast(`${top ? '✦ ' : ''}Found ${GEAR_RARITY[item.rarity].name} ${SLOT_NAME[item.slot]}: ${item.name}`, top ? 4200 : 2600);
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
    this.save.ash += n;
    this.save.stats.totalAsh += n;
    if (this.run) this.run.ash += n;
    this.persist();
  }

  onInteract(w: World, it: Interactable): void {
    switch (it.kind) {
      case 'station':
        if (it.id === 'weapons') screens.weapons(this);
        else if (it.id === 'mirror') screens.mirror(this);
        else if (it.id === 'artifacts') screens.artifactLoadout(this);
        else if (it.id === 'chronicle') screens.chronicle(this);
        else if (it.id === 'pact') screens.pact(this);
        else if (it.id === 'heroes') screens.heroes(this);
        else if (it.id === 'ascension') screens.talents(this);
        break;
      case 'npc':
        audio.play('select');
        this.ui.toast(`Charon: ${fx.pick(CHARON_LINES)}`);
        break;
      case 'fountain': {
        it.used = true;
        w.healPlayer(this.player.maxHp * 0.4, true);
        w.particles.burst(it.x, it.y - 30, '#7fd8ff', 30, 300);
        break;
      }
      case 'chest':
        this.openChest(w, it);
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
      if (Math.random() < CHEST.gear) w.dropLoot(it.x, it.y, { gear: rollGear(run.rng, GEAR_LUCK.chest) });
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
      return;
    }
    this.resolveReward(spec, () => {});
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
      tag: o.rarity.toUpperCase(),
      tagColor: RARITY_COLOR[o.rarity],
      color: def.slot === 'duo' ? RARITY_COLOR.duo : GODS[def.god].color,
      desc: def.desc(v),
      note: replaces ? `Replaces ${replaces.name}` : undefined,
      icon: GODS[def.god].glyph,
    };
  }

  private offerBoons(god: GodId, after: () => void): void {
    const run = this.run!;
    const odds = boonRarityOdds(run.biomeIndex, run.roomsCleared === 0, run.favor(this.save));
    const offers = rollBoonOffers(run.rng, god, run.boons, odds, 3, this.stats.canCast ? undefined : (d) => !needsCast(d));
    const g = GODS[god];
    if (offers.length === 0) {
      // Nothing left from this god: compensate with obols.
      run.gold += 50;
      this.ui.toast(`${g.name} has nothing more to offer. +50 obols.`);
      after();
      return;
    }
    this.ui.choice({
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
    this.ui.choice({
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
    this.ui.choice({
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
    this.ui.choice({
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
    this.ui.choice({
      title: 'Artifact Cache',
      info: this.buildInfo(),
      subtitle: 'Equip an artifact (keys 1–3 to use).',
      color: '#7fe8ff',
      cards: pool.map((a) => ({
        title: a.name,
        subtitle: a.souls ? `Costs ${a.souls} souls` : `Cooldown ${a.cooldown}s`,
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
        screens.replaceArtifact(this, chosen.id, after);
      },
      skip: this.skipChoice(after, 'Leave it'),
    });
  }

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
    this.player.weapon = createWeapon(def.weapon);
    this.player.hero = def;
    this.player.wrath = 0;
    this.recomputeStats(true);
    this.world?.particles.ring(this.player.x, this.player.y, def.color, 90, 0.4, 6);
  }

  unspentTalents(): number {
    const spent = Object.values(this.save.talents).reduce((a, b) => a + b, 0);
    return Math.max(0, this.level - 1 - spent);
  }

  /** Refreshes the Ascension station prompt after spending points. */
  refreshHubPrompts(): void {
    const it = this.world?.interactables.find((i) => i.id === 'ascension');
    if (it) it.prompt = this.unspentTalents() > 0 ? `Spend talents (${this.unspentTalents()})` : 'Talents';
  }

  abandonRun(): void {
    writeRun(null);
    this.ui.closeAll();
    this.transition(() => this.enterHub());
  }

  /** The saved escape, if any (shown on the title screen). */
  savedRun(): ReturnType<typeof loadRun> {
    return loadRun();
  }

  /** Continues a saved escape from the start of the chamber it was saved in. */
  resumeRun(): boolean {
    const snap = loadRun();
    if (!snap) return false;
    this.ui.closeAll();
    const run = Run.restore(this.save, snap);
    this.run = run;
    this.player = new Player(run.weapon, this.save.character);
    run.level = this.level;
    this.recomputeStats(true);
    this.player.hp = Math.max(1, Math.min(this.player.maxHp, snap.hp));
    this.player.souls = snap.souls;
    this.player.dashCharges = this.stats.dashCharges;
    this.mode = 'run';
    this.goToRoom(snap.current);
    return true;
  }

  /** Leaves to the title screen; an escape in progress stays saved at its last chamber. */
  quitToTitle(): void {
    this.ui.closeAll();
    this.transition(() => {
      this.enterHub(true);
      this.mode = 'title';
      screens.title(this);
    });
  }

  rewardLabel(r: RewardSpec): string {
    return r.kind === 'boon' && r.god ? `${GODS[r.god].name}` : REWARD_INFO[r.kind].label;
  }
}
