import { audio, type Mood } from '../engine/audio';
import { Camera } from '../engine/camera';
import { Input } from '../engine/input';
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
  pomCandidates,
  rollBoonOffers,
  rollHammerOffers,
  takeBoon,
  type BoonOffer,
} from './boons';
import { createBoss } from './enemies';
import { ENCHANT_BY_ID, rollEnchantOffers, takeEnchant } from './enchants';
import { Pickup } from './entities';
import { drawHUD } from './hud';
import { applyMetaExtras, loadSave, metaBonuses, writeSave, type SaveData } from './meta';
import { Player } from './player';
import { REWARD_INFO, renderOpts } from './render';
import { BIOMES, generateEncounter, generateLayout, hubLayout } from './rooms';
import { Run, type RoomPlan } from './run';
import type { PlayerStats } from './stats';
import type { GodId, RewardSpec } from './types';
import { createWeapon, WEAPON_INFO } from './weapons';
import { World, type Door, type Interactable, type WorldHost } from './world';

const STEP = 1 / 60;

type Mode = 'title' | 'hub' | 'run' | 'over';

export interface RunSummary {
  victory: boolean;
  rooms: number;
  kills: number;
  time: number;
  ash: number;
  biome: string;
  cause: string;
}

const CHARON_LINES = ['Hrrrnnngh…', 'Mmmmhhhaaaah.', 'Hhhrrrraaaagh!', '…Hmmmm.'];

export class Game implements WorldHost {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
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
  private hubArtifacts: (string | null)[] = [null, null, null];
  private pendingDoors: RoomPlan[] = [];
  private fade = 1;
  private fadeTarget = 0;
  private fadeCb: (() => void) | null = null;
  private acc = 0;
  private last = 0;
  private params = new URLSearchParams(location.search);
  private lastHit = 'the Underworld';

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.input = new Input(canvas);
    this.ui = new UI(overlay, this.input);
    this.touch = new TouchControls(this.input);
    this.save = loadSave();
    this.godMode = this.params.has('god');
    // Debug: ?weapon=spear|bow tries a weapon for this session without unlocking it.
    const wp = this.params.get('weapon');
    if (wp === 'sword' || wp === 'spear' || wp === 'bow') this.save.weapon = wp;
    audio.volume = this.save.settings.volume;
    audio.musicVolume = this.save.settings.music;
    audio.muted = this.save.settings.muted;
    this.camera.shakeScale = this.save.settings.shake;
    this.player = new Player(this.save.weapon);
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
  }

  /** Pause and go quiet when the tab or app is backgrounded. */
  private onVisibility(): void {
    if (document.hidden) {
      this.touch.releaseAll();
      audio.suspend();
      if ((this.mode === 'hub' || this.mode === 'run') && !this.ui.open && this.player.state !== 'dead') screens.pause(this);
    } else audio.resume();
  }

  persist(): void {
    writeSave(this.save);
  }

  // ---------------------------------------------------------------- loop

  private frame(t: number): void {
    const dt = Math.min(0.1, (t - this.last) / 1000 || 0);
    this.last = t;
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
    audio.setMood(mood);
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.world;
    renderOpts.touch = this.touch.enabled;
    if (w) {
      w.render(ctx, this.dpr);
      if (this.mode !== 'title') {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        drawHUD(ctx, w, this.run, this.save, this.camera.vw, this.camera.vh, this.mode === 'hub', this.touch.enabled);
      }
      this.syncTouch(w);
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
      artifacts: this.artifacts.map((id, i) => {
        if (!id) return null;
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
    if (this.touch.enabled) navigator.vibrate?.(30);
  }

  transition(fn: () => void): void {
    if (this.fadeCb) return;
    this.fadeTarget = 1;
    this.fadeCb = fn;
  }

  // ---------------------------------------------------------------- stats

  recomputeStats(fullHeal = false): void {
    if (this.run) this.stats = this.run.computeStats(this.save);
    else {
      this.stats = computeStats([], [], metaBonuses(this.save));
      applyMetaExtras(this.save, this.stats);
    }
    this.player.applyStats(this.stats, fullHeal);
  }

  // ---------------------------------------------------------------- hub

  enterHub(silent = false): void {
    this.mode = 'hub';
    this.run = null;
    this.particles.clear();
    this.player = new Player(this.save.weapon);
    this.hubArtifacts = [this.save.startArtifact, null, null];
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
      st('artifacts', 230, 650, 'Artifact Shelf', 'Equip artifact', 'rgba(127,232,255,0.5)'),
      st('chronicle', layout.w - 230, 650, 'Chronicle', 'Read', 'rgba(255,220,160,0.5)'),
    );
    if (this.save.stats.bossesSlain > 0 || this.save.maxHeat > 0) w.interactables.push(st('pact', layout.w / 2, 300, 'Oath of Torment', 'Swear', 'rgba(255,80,80,0.5)'));
    w.spawn('dummy', layout.w / 2 + 200, 520);
    this.world = w;
    if (!silent) w.showBanner('The Hall of Shades', 'Rest, prepare, and try again.');
    audio.setMood('hub');
  }

  // ---------------------------------------------------------------- run flow

  startRun(): void {
    const seedParam = this.params.get('seed');
    this.run = new Run(this.save, seedParam ? Number(seedParam) : undefined);
    const biomeParam = Number(this.params.get('biome'));
    if (biomeParam > 0) this.run.biomeIndex = clamp(Math.floor(biomeParam), 0, BIOMES.length - 1);
    this.save.stats.runs++;
    this.persist();
    this.player = new Player(this.save.weapon);
    this.recomputeStats(true);
    this.player.castAmmo = this.stats.castAmmo;
    this.player.dashCharges = this.stats.dashCharges;
    this.mode = 'run';
    const plan = this.params.get('room') === 'boss' ? { kind: 'boss' as const, reward: null } : this.run.startPlan();
    this.goToRoom(plan);
  }

  goToRoom(plan: RoomPlan): void {
    const run = this.run!;
    run.enter(plan);
    this.particles.clear();
    const biome = run.biome;
    const layout = generateLayout(run.rng, biome, plan.kind, this.stats.chestChance);
    const p = this.player;
    p.castAmmo = this.stats.castAmmo;
    const w = new World(this, layout, biome, this.camera, this.particles, p);
    this.world = w;
    this.pendingDoors = [];
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
        w.showBanner("Charon's Wares", 'The ferryman will trade.');
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
    pool.push({ kind: 'enchant', label: 'Enchanting Tome', price: 120 });
    if (ARTIFACTS.some((a) => !run.artifacts.includes(a.id))) pool.push({ kind: 'artifact', label: 'Artifact Cache', price: 140 });
    if (rollHammerOffers(rng, run.weapon, run.hammers).length && !run.isUsed('hammer')) pool.push({ kind: 'hammer', label: "Hephaestus' Anvil", price: 200 });
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
    const s = this.stats;
    const p = this.player;
    if (s.afterParty > 0 && p.hp < p.maxHp * s.afterParty) {
      p.hp = p.maxHp * s.afterParty;
      w.particles.text(p.x, p.y - 80, 'After Party!', GODS.dionysus.color, 18);
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
    const summary: RunSummary = {
      victory: false,
      rooms: run.roomsCleared,
      kills: run.kills,
      time: run.time,
      ash: run.ash,
      biome: run.biome.name,
      cause: this.lastHit,
    };
    w.later(1.8, () => screens.death(this, summary));
  }

  private victory(): void {
    const run = this.run;
    if (!run) return;
    this.mode = 'over';
    const bonus = Math.round(60 * run.ashMult());
    this.addAsh(bonus);
    this.save.stats.escapes++;
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
    });
  }

  onEnemyKilled(): void {
    if (this.run) this.run.kills++;
    this.save.stats.kills++;
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
    if (run && run.current.kind === 'combat' && Math.random() < 0.15) {
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
    w.particles.burst(it.x, it.y - 20, '#ffd890', 30, 320);
    const r = Math.random();
    if (run && r < 0.35 && ARTIFACTS.some((a) => !run.artifacts.includes(a.id))) w.spawnReward({ kind: 'artifact', bonus: true }, it.x, it.y + 60);
    else if (run && r < 0.6) w.spawnReward({ kind: 'enchant', bonus: true }, it.x, it.y + 60);
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
        w.particles.text(p.x, p.y - 90, `+${amount} ◎`, '#ffd04a', 22);
        audio.play('gold');
        break;
      }
      case 'heart': {
        run.bonusHp += 25;
        this.recomputeStats();
        w.particles.text(p.x, p.y - 90, '+25 Max Health', '#ff5a6a', 20);
        audio.play('heal');
        break;
      }
      case 'ash': {
        const amount = Math.round((10 + run.biomeIndex * 6 + rng.int(0, 6)) * run.ashMult());
        this.addAsh(amount);
        w.particles.text(p.x, p.y - 90, `+${amount} Ash`, '#c8a8ff', 22);
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
    const offers = rollBoonOffers(run.rng, god, run.boons, run.favor(this.save), 3);
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
      subtitle: g.title,
      color: g.color,
      quote: fx.pick(g.greeting),
      cards: offers.map((o) => this.boonCard(o)),
      onPick: (i) => {
        run.boons = takeBoon(run.boons, offers[i]);
        this.recomputeStats();
        after();
      },
    });
  }

  private offerPom(after: () => void): void {
    const run = this.run!;
    const cands = run.rng.shuffle(pomCandidates(run.boons)).slice(0, 3);
    if (cands.length === 0) {
      this.resolveReward({ kind: 'gold' }, after);
      return;
    }
    const gain = run.rng.chance(0.2) ? 2 : 1;
    this.ui.choice({
      title: 'Pomegranate',
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
      subtitle: `Reforge the ${WEAPON_INFO[run.weapon].name}.`,
      color: '#d8d8e8',
      cards: offers.map((h) => ({ title: h.name, subtitle: WEAPON_INFO[h.weapon].name, color: '#d8d8e8', desc: h.desc, icon: '⚒' })),
      onPick: (i) => {
        run.hammers.push(offers[i].id);
        this.recomputeStats();
        after();
      },
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
        const free = run.artifacts.indexOf(null);
        if (free >= 0) {
          run.artifacts[free] = chosen.id;
          after();
          return;
        }
        screens.replaceArtifact(this, chosen.id, after);
      },
      skip: { label: 'Leave it', onSkip: after },
    });
  }

  // ---------------------------------------------------------------- menus helpers

  selectWeapon(id: Parameters<typeof createWeapon>[0]): void {
    this.save.weapon = id;
    this.persist();
    this.player.weapon = createWeapon(id);
  }

  abandonRun(): void {
    this.ui.closeAll();
    this.transition(() => this.enterHub());
  }

  rewardLabel(r: RewardSpec): string {
    return r.kind === 'boon' && r.god ? `${GODS[r.god].name}` : REWARD_INFO[r.kind].label;
  }
}
