import { audio } from '../engine/audio';
import type { Camera } from '../engine/camera';
import { circleArc, circleCapsule, circleCircle, resolveCircleCircle, resolveCircleRect, type Circle } from '../engine/collision';
import type { Input } from '../engine/input';
import { angleDiff, angleTo, clamp, fx, Rng, TAU, type Vec } from '../engine/math';
import type { Particles } from '../engine/particles';
import type { Actor } from './actor';
import { Ally, updateArtifacts } from './artifacts';
import { GODS } from './boons';
import { damageEnemy, deflect, hostileBlast, lightningBolt } from './combat';
import { onEnemyKilled } from './enchants';
import { createEnemy } from './enemies';
import { Enemy } from './enemies/enemy';
import { Pickup, Projectile, Zone, type Hitbox, type Loot, type Telegraph } from './entities';
import { Player } from './player';
import { FOE_DROP, POT } from './odds';
import { prefs } from './prefs';
import { WRATH_PER_TAKEN } from './progression';
import { buildGrid, CELL, DOOR_W, hazardContains, TRAP_SIZE, type BiomeInfo, type RoomLayout, type Wave } from './rooms';
import { renderWorld } from './render';
import type { PlayerStats } from './stats';
import type { EliteMod, EnemyKind, RewardSpec, Shape } from './types';

export interface Door {
  x: number;
  reward: RewardSpec | null;
  open: boolean;
}

export interface Interactable {
  id: string;
  x: number;
  y: number;
  r: number;
  label: string;
  prompt: string;
  kind: 'station' | 'shop' | 'fountain' | 'chest' | 'npc';
  price?: number;
  icon?: string;
  color?: string;
  used?: boolean;
}

export interface Breakable {
  x: number;
  y: number;
  r: number;
  dead: boolean;
}

export interface Trap {
  x: number;
  y: number;
  state: 'idle' | 'armed' | 'up' | 'cool';
  t: number;
  hit: Set<number>;
}

export interface WorldHost {
  readonly stats: PlayerStats;
  readonly input: Input;
  readonly artifacts: (string | null)[];
  readonly godMode: boolean;
  onRewardPicked(w: World, reward: RewardSpec, x: number, y: number): void;
  onDoorEntered(w: World, door: Door, by: Player): void;
  /** The whole party is down (or the only hero died). */
  onPlayerDied(w: World): void;
  /** Party play: a hero went down while partners still stand. */
  onPlayerDowned?(w: World, p: Player): void;
  /** Party play: makes `p` the hero that `stats`, `artifacts` and rewards refer to. */
  setActive?(p: Player): void;
  /** The heroes the camera keeps in view (this device's own). */
  viewPlayers?(): Player[];
  /** Party play: whether hero `p` may use this (hub stations are for this device's players). */
  canInteract?(p: Player, it: Interactable): boolean;
  onInteract(w: World, it: Interactable): void;
  onRoomCleared(w: World): void;
  onEnemyKilled(w: World, e: Enemy): void;
  tryDeathDefiance(): boolean;
  /** Feedback hook (haptics on phones). */
  onPlayerHurt?(): void;
  addGold(n: number): void;
  addAsh(n: number): void;
  /** Materials or gear picked up (loot unlocks at level 10). */
  onLoot?(w: World, loot: Loot): void;
}

interface Swipe {
  x: number;
  y: number;
  r: number;
  angle: number;
  half: number;
  t: number;
  dur: number;
  color: string;
  width: number;
  full: boolean;
  dir: number;
  owner: Actor | null;
}

interface Bolt {
  pts: Vec[];
  t: number;
  dur: number;
  color: string;
}

interface LightFlash {
  x: number;
  y: number;
  r: number;
  color: string;
  t: number;
  dur: number;
}

interface Encounter {
  waves: Wave[];
  next: number;
  hpScale: number;
  dmgScale: number;
  delay: number;
}

export function shapeHits(s: Shape, c: Circle): boolean {
  switch (s.type) {
    case 'circle':
      return circleCircle(s, c);
    case 'arc':
      return circleArc(c, s, s.r, s.angle, s.half);
    case 'capsule':
      return circleCapsule(c, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }, s.r);
    case 'ring': {
      const d = Math.hypot(c.x - s.x, c.y - s.y);
      return d + c.r > s.r1 && d - c.r < s.r2;
    }
  }
}

export class World {
  readonly host: WorldHost;
  room: RoomLayout;
  biome: BiomeInfo;
  camera: Camera;
  particles: Particles;
  /** Every hero in the room: one, or the whole party. */
  players: Player[];
  /** The hero the code running now acts for (see `as`). */
  private cur: Player;
  enemies: Enemy[] = [];
  allies: Ally[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  pickups: Pickup[] = [];
  hitboxes: Hitbox[] = [];
  telegraphs: Telegraph[] = [];
  swipes: Swipe[] = [];
  bolts: Bolt[] = [];
  flashes: LightFlash[] = [];
  breakables: Breakable[] = [];
  traps: Trap[] = [];
  doors: Door[] = [];
  interactables: Interactable[] = [];
  focus: Interactable | null = null;
  time = 0;
  hitstopT = 0;
  slowmo = 1;
  slowmoT = 0;
  cleared = false;
  /** How many times this room has been cleared (ambushes re-seal it). */
  clearCount = 0;
  encounter: Encounter | null = null;
  boss: Enemy | null = null;
  banner: { title: string; sub: string; t: number } | null = null;
  /** Behind the title screen the camera drifts slowly around the hall. */
  titleDrift = false;
  /** Extra attack tokens for foes (more at higher Torment). */
  tokenBonus = 0;
  private unstickT = 1;
  /** Scales foes' aim error (smaller at higher Torment). */
  foeAimError = 1;
  /** Recent pickups listed on the HUD (newest last). */
  lootFeed: { text: string; color: string; t: number }[] = [];
  hurtFlash = 0;
  /** Darkness from Erebos' Eclipse. */
  eclipseT = 0;
  exiting = false;
  /** Pre-rendered floor and walls. */
  roomCanvas: HTMLCanvasElement | null = null;
  rng: Rng;
  private timers: { t: number; fn: () => void; as: Player }[] = [];
  private zoneTargets = new Map<Zone, Actor>();
  private grid: { cols: number; rows: number; block: Uint8Array };
  /** A flow field toward each hero, so every foe can find its way to its own target. */
  private flows = new Map<Player, { flow: Int32Array; cell: number; t: number }>();
  /** Party play: the camera's extra zoom-out to keep everyone in view (eased). */
  private fitZoom = 1;

  constructor(host: WorldHost, room: RoomLayout, biome: BiomeInfo, camera: Camera, particles: Particles, players: Player | Player[]) {
    this.host = host;
    this.room = room;
    this.biome = biome;
    this.camera = camera;
    this.particles = particles;
    this.players = Array.isArray(players) ? players : [players];
    this.cur = this.players[0];
    this.rng = new Rng(room.seed);
    this.players.forEach((player, i) => {
      // The party comes in side by side.
      player.x = room.entrance.x + (i - (this.players.length - 1) / 2) * 44;
      player.y = room.entrance.y;
      player.vx = player.vy = player.kx = player.ky = 0;
      player.safe = { x: player.x, y: player.y };
      player.z = 0;
      player.jumpT = -1;
      player.beamT = 0;
      if (player.state !== 'dead') player.state = 'free';
      player.action = null;
      player.holyShield = true;
      player.weapon.reset();
    });
    this.grid = buildGrid(room);
    for (const p of room.pots) this.breakables.push({ x: p.x, y: p.y, r: 16, dead: false });
    for (const t of room.traps) this.traps.push({ x: t.x, y: t.y, state: 'idle', t: 0, hit: new Set() });
    room.chests.forEach((c, i) =>
      this.interactables.push({ id: `chest:${i}`, x: c.x, y: c.y, r: 60, label: 'Treasure Chest', prompt: 'Open', kind: 'chest' }),
    );
    camera.snap(this.players[0], room);
  }

  /** The hero the code running now acts for: the one updating, or the one a foe is after. */
  get player(): Player {
    return this.cur;
  }

  /**
   * Runs `fn` as hero `p`: inside, `player`, `stats` and `artifacts` mean that
   * hero's (and so does the host's reward flow). With one hero this is free.
   */
  as<T>(p: Player, fn: () => T): T {
    const prev = this.cur;
    if (p === prev) return fn();
    this.cur = p;
    this.host.setActive?.(p);
    try {
      return fn();
    } finally {
      this.cur = prev;
      this.host.setActive?.(prev);
    }
  }

  /**
   * Like `as`, and anything hero `p` creates on the way (zones, shots, hitboxes,
   * summons) is marked as theirs, so later damage and kills count for them.
   */
  acting(p: Player, fn: () => void): void {
    const z = this.zones.length;
    const pr = this.projectiles.length;
    const hb = this.hitboxes.length;
    const al = this.allies.length;
    this.as(p, fn);
    for (let i = z; i < this.zones.length; i++) this.zones[i].owner ??= p;
    for (let i = pr; i < this.projectiles.length; i++) if (this.projectiles[i].team === 'player') this.projectiles[i].owner ??= p;
    for (let i = hb; i < this.hitboxes.length; i++) if (this.hitboxes[i].team === 'player') this.hitboxes[i].owner ??= p;
    for (let i = al; i < this.allies.length; i++) this.allies[i].owner ??= p;
  }

  /** Heroes still standing. */
  /** The heroes this screen follows: this device's own (never empty). */
  get viewers(): Player[] {
    const v = this.host.viewPlayers?.().filter((p) => this.players.includes(p));
    return v?.length ? v : [this.players[0]];
  }

  /** Runs `fn` once as each hero in the party (drawing, mostly). */
  eachHero(fn: (p: Player) => void, who: Player[] = this.players): void {
    for (const p of who) this.as(p, () => fn(p));
  }

  get living(): Player[] {
    return this.players.filter((p) => p.state !== 'dead');
  }

  /** The hero who owns a hitbox, shot, zone or summon (the first hero when unknown). */
  ownerOf(a: Actor | null | undefined): Player {
    if (a instanceof Player) return a;
    const o = (a as { owner?: Actor | null } | null)?.owner;
    if (o instanceof Player) return o;
    return this.players[0];
  }

  /** The nearest standing hero to a point (any hero when everyone is down). */
  nearestPlayer(x: number, y: number): Player {
    let best = this.players[0];
    let bd = Infinity;
    for (const p of this.players) {
      if (p.state === 'dead' && this.players.length > 1) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /**
   * The hero foe `e` is after: the nearest one standing, kept for a while so
   * it doesn't flip-flop (guardians switch less often).
   */
  private targetFor(e: Enemy, dt: number): Player {
    if (this.players.length === 1) return this.players[0];
    const living = this.living;
    if (!living.length) return this.players[0];
    e.retargetT -= dt;
    const cur = e.target as Player | null;
    if (cur && cur.state !== 'dead' && this.players.includes(cur) && e.retargetT > 0) return cur;
    let best = living[0];
    let bd = Infinity;
    for (const p of living) {
      const d = Math.hypot(p.x - e.x, p.y - e.y) * (p === cur ? 0.8 : 1);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    e.target = best;
    e.retargetT = e.isBoss ? 4 + Math.random() * 3 : 1.2 + Math.random();
    return best;
  }

  get stats(): PlayerStats {
    return this.host.stats;
  }
  get input(): Input {
    return this.host.input;
  }
  get artifacts(): (string | null)[] {
    return this.host.artifacts;
  }

  // ---------------------------------------------------------------- helpers

  later(t: number, fn: () => void): void {
    this.timers.push({ t, fn, as: this.cur });
  }

  hitstop(t: number): void {
    if (!prefs.hitstop) return;
    this.hitstopT = Math.max(this.hitstopT, Math.min(0.12, t));
  }

  slowMotion(scale: number, dur: number): void {
    this.slowmo = scale;
    this.slowmoT = dur;
  }

  addHitbox(h: Hitbox): void {
    if (h.follow && h.owner && !h.offset && h.shape.type === 'capsule') {
      h.offset = { x: h.shape.x2 - h.shape.x1, y: h.shape.y2 - h.shape.y1 };
    }
    this.hitboxes.push(h);
  }

  addSwipe(x: number, y: number, r: number, angle: number, half: number, dur: number, color: string, width: number, full = false, dir = 1): void {
    this.swipes.push({ x, y, r, angle, half, t: 0, dur, color, width, full, dir, owner: this.player });
  }

  /** Lightning from (x1, y1) at height z1 to (x2, y2) at height z2. */
  addBolt(x1: number, y1: number, x2: number, y2: number, color: string, z1 = 0, z2 = 0): void {
    const gx = x2;
    const gy = y2;
    // Bolts are drawn flat, so put the heights in now (straight up on screen).
    const up = this.camera.lift;
    x1 += up.x * z1;
    y1 += up.y * z1;
    x2 += up.x * z2;
    y2 += up.y * z2;
    const pts: Vec[] = [{ x: x1, y: y1 }];
    const n = Math.max(3, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 22));
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const off = fx.range(-14, 14);
      pts.push({ x: x1 + (x2 - x1) * k + (nx / nl) * off, y: y1 + (y2 - y1) * k + (ny / nl) * off });
    }
    pts.push({ x: x2, y: y2 });
    this.bolts.push({ pts, t: 0, dur: 0.22, color });
    this.flashLight(gx, gy, 160, color, 0.15);
  }

  flashLight(x: number, y: number, r: number, color: string, dur: number): void {
    this.flashes.push({ x, y, r, color, t: 0, dur });
  }

  attachZone(z: Zone, target: Actor): void {
    this.zoneTargets.set(z, target);
  }

  showBanner(title: string, sub: string): void {
    this.banner = { title, sub, t: 0 };
  }

  groundAt(x: number, y: number): 'floor' | 'pit' | 'lava' {
    for (const h of this.room.hazards) if (hazardContains(h, x, y)) return h.kind;
    return 'floor';
  }

  private cellIndex(x: number, y: number): number {
    const cx = clamp(Math.floor(x / CELL), 0, this.grid.cols - 1);
    const cy = clamp(Math.floor(y / CELL), 0, this.grid.rows - 1);
    return cy * this.grid.cols + cx;
  }

  /** Clear walking line (obstacles, pits and lava block it). */
  lineOfSight(x1: number, y1: number, x2: number, y2: number, _pad = 0, projectile = false): boolean {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 18);
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const b = this.grid.block[this.cellIndex(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k)];
      if (b === 1 && (!projectile || this.solidAt(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k))) return false;
      if (b === 2 && !projectile) return false;
    }
    return true;
  }

  private solidAt(x: number, y: number): boolean {
    for (const o of this.room.obstacles) {
      if (o.type === 'rect' ? x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h : (x - o.x) ** 2 + (y - o.y) ** 2 < o.r * o.r) return true;
    }
    return false;
  }

  private rebuildFlow(p: Player): void {
    const g = this.grid;
    let f = this.flows.get(p);
    if (!f) {
      f = { flow: new Int32Array(g.cols * g.rows), cell: -1, t: 0 };
      this.flows.set(p, f);
    }
    const flow = f.flow;
    const start = this.cellIndex(p.x, p.y);
    flow.fill(-1);
    const q = new Int32Array(g.cols * g.rows);
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    flow[start] = 0;
    while (head < tail) {
      const c = q[head++];
      const cx = c % g.cols;
      const cy = (c / g.cols) | 0;
      const d = flow[c];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
          const n = ny * g.cols + nx;
          if (flow[n] !== -1 || g.block[n] !== 0) continue;
          // No corner cutting.
          if (dx && dy && (g.block[cy * g.cols + nx] !== 0 || g.block[ny * g.cols + cx] !== 0)) continue;
          flow[n] = d + 1;
          q[tail++] = n;
        }
      }
    }
    f.cell = start;
  }

  /** Keeps each hero's flow field fresh (rebuilt when they change cell, or every 0.4 s). */
  private updateFlows(dt: number): void {
    for (const p of this.players) {
      const f = this.flows.get(p);
      if (f) f.t -= dt;
      if (!f || f.cell !== this.cellIndex(p.x, p.y) || f.t <= 0) {
        this.rebuildFlow(p);
        this.flows.get(p)!.t = 0.4;
      }
    }
  }

  /** Direction along the flow field toward the current hero (the one a foe is after). */
  flowDir(x: number, y: number): Vec | null {
    const g = this.grid;
    const field = this.flows.get(this.cur);
    if (!field) return null;
    const flow = field.flow;
    const c = this.cellIndex(x, y);
    const cx = c % g.cols;
    const cy = (c / g.cols) | 0;
    let best = flow[c] === -1 ? 1e9 : flow[c];
    let bx = -1;
    let by = -1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
        const v = flow[ny * g.cols + nx];
        if (v >= 0 && v < best) {
          best = v;
          bx = nx;
          by = ny;
        }
      }
    }
    if (bx < 0) return null;
    return { x: bx * CELL + CELL / 2 - x, y: by * CELL + CELL / 2 - y };
  }

  nearestEnemy(x: number, y: number, maxDist: number, filter?: (e: Enemy) => boolean): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.spawning) continue;
      if (filter && !filter(e)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  enemiesInRadius(x: number, y: number, r: number): Enemy[] {
    return this.enemies
      .filter((e) => !e.dead && !e.spawning && Math.hypot(e.x - x, e.y - y) < r + e.r)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  }

  /** Integrates an actor's velocity and resolves collisions. Returns a wall normal if it hit something. */
  moveActor(a: Actor, dt: number): Vec | null {
    const vx = a.vx + a.kx;
    const vy = a.vy + a.ky;
    const steps = Math.max(1, Math.ceil((Math.hypot(vx, vy) * dt) / (a.r * 0.8)));
    let hit: Vec | null = null;
    const isEnemy = a.team === 'enemy';
    const knocked = Math.hypot(a.kx, a.ky) > 250;
    for (let i = 0; i < steps; i++) {
      a.x += (vx * dt) / steps;
      a.y += (vy * dt) / steps;
      const c = { x: a.x, y: a.y, r: a.r };
      for (const o of this.room.obstacles) {
        const n = o.type === 'rect' ? resolveCircleRect(c, o) : resolveCircleCircle(c, { x: o.x, y: o.y, r: o.r });
        if (n) hit = n;
      }
      // Stations, shops, chests and braziers are solid too.
      if (!a.flying) {
        for (const it of this.interactables) {
          const n = resolveCircleCircle(c, { x: it.x, y: it.y, r: PROP_RADIUS[it.kind] });
          if (n) hit = n;
        }
        for (const b of this.room.braziers) {
          const n = resolveCircleCircle(c, { x: b.x, y: b.y, r: 14 });
          if (n) hit = n;
        }
      }
      // Walking foes treat pits and lava as walls unless they are knocked in.
      if (isEnemy && !a.flying && !knocked) {
        for (const h of this.room.hazards) {
          const s = h.shape;
          if (s.type === 'rect') resolveCircleRect(c, s);
          else resolveCircleCircle(c, { x: s.x, y: s.y, r: s.r - a.r * 0.5 });
        }
      }
      const minY = a.team === 'player' && this.doorUnder(c.x) ? -40 : c.r;
      if (c.x < c.r) {
        c.x = c.r;
        hit = { x: 1, y: 0 };
      }
      if (c.x > this.room.w - c.r) {
        c.x = this.room.w - c.r;
        hit = { x: -1, y: 0 };
      }
      if (c.y < minY) {
        c.y = minY;
        hit = { x: 0, y: 1 };
      }
      if (c.y > this.room.h - c.r) {
        c.y = this.room.h - c.r;
        hit = { x: 0, y: -1 };
      }
      a.x = c.x;
      a.y = c.y;
    }
    const decay = Math.exp(-9 * dt);
    a.kx *= decay;
    a.ky *= decay;
    if (Math.abs(a.kx) < 1) a.kx = 0;
    if (Math.abs(a.ky) < 1) a.ky = 0;
    return hit;
  }

  private doorUnder(x: number): boolean {
    if (!this.cleared) return false;
    return this.doors.some((d) => d.open && Math.abs(d.x - x) < DOOR_W / 2 - 14);
  }

  // ---------------------------------------------------------------- spawning

  addEnemy(e: Enemy): Enemy {
    this.enemies.push(e);
    if (e.isBoss) this.boss = e;
    return e;
  }

  spawn(kind: EnemyKind, x: number, y: number, mod: EliteMod | null = null, hpScale = 1, dmgScale = 1): Enemy {
    const e = createEnemy(kind, x, y, hpScale);
    e.dmg *= dmgScale;
    if (mod) applyEliteMod(e, mod);
    return this.addEnemy(e);
  }

  startEncounter(waves: Wave[], hpScale: number, dmgScale: number): void {
    this.encounter = { waves, next: 0, hpScale, dmgScale, delay: 0.6 };
    this.cleared = false;
  }

  private activeFoes(): number {
    return this.enemies.filter((e) => !e.dead && !e.isDummy && !e.passive).length;
  }

  /**
   * Foes that end up outside the floor, or stand still out of reach for
   * STUCK_TIME seconds (behind a wall with no way round), reappear somewhere
   * open so a chamber can always be cleared. Turrets and guardians stay put.
   */
  private unstick(dt: number): void {
    this.unstickT -= dt;
    if (this.unstickT > 0) return;
    this.unstickT = 1;
    for (const e of this.enemies) {
      if (e.dead || e.spawning || e.isBoss || e.isDummy || e.speed <= 0) continue;
      const off = !Number.isFinite(e.x) || !Number.isFinite(e.y) || e.x < 8 || e.y < 8 || e.x > this.room.w - 8 || e.y > this.room.h - 8 || (!e.flying && this.grid.block[this.cellIndex(e.x, e.y)] !== 0);
      const moved = Math.hypot(e.x - e.lastPos.x, e.y - e.lastPos.y);
      e.lastPos = { x: e.x, y: e.y };
      const reachable = this.players.some((p) => Math.hypot(e.x - p.x, e.y - p.y) < 520 && this.lineOfSight(e.x, e.y, p.x, p.y, e.r));
      e.stuckT = off ? STUCK_TIME : moved < 20 && !reachable ? e.stuckT + 1 : 0;
      if (e.stuckT < STUCK_TIME) continue;
      this.particles.burst(e.x, e.y - e.height / 2, '#6a5a70', 12, 200, { kind: 'smoke', size: 10, gravity: 0, life: 0.5, additive: false });
      const pt = this.spawnPoint();
      e.x = pt.x;
      e.y = pt.y;
      e.lastPos = { ...pt };
      e.vx = e.vy = e.kx = e.ky = 0;
      e.stuckT = 0;
      e.spawnT = 0.6;
      e.cancelTelegraphs(this);
      e.setState('idle');
    }
  }

  private spawnPoint(): Vec {
    for (let i = 0; i < 60; i++) {
      const x = this.rng.range(90, this.room.w - 90);
      const y = this.rng.range(200, this.room.h - 90);
      if (this.players.some((p) => Math.hypot(x - p.x, y - p.y) < 300 - i * 2)) continue;
      if (this.grid.block[this.cellIndex(x, y)] !== 0) continue;
      if (this.enemies.some((e) => !e.dead && Math.hypot(e.x - x, e.y - y) < 60)) continue;
      return { x, y };
    }
    return { x: this.room.w / 2, y: this.room.h / 3 };
  }

  private updateEncounter(dt: number): void {
    const enc = this.encounter;
    if (!enc || this.cleared) return;
    const foes = this.activeFoes();
    if (enc.next < enc.waves.length) {
      const threshold = enc.next === 0 ? 0 : Math.max(1, Math.floor(enc.waves[enc.next - 1].length * 0.25));
      if (foes <= threshold) {
        enc.delay -= dt;
        if (enc.delay <= 0) {
          for (const s of enc.waves[enc.next]) {
            const pt = this.spawnPoint();
            this.spawn(s.kind, pt.x, pt.y, s.mod, enc.hpScale, enc.dmgScale);
          }
          audio.play('spawn');
          enc.next++;
          enc.delay = 0.8;
        }
      }
    } else if (foes === 0) {
      this.clearRoom();
    }
  }

  /** Seals a cleared room again for an ambush; it re-clears once the new foes fall. */
  reseal(hpScale: number, dmgScale: number): void {
    this.cleared = false;
    this.encounter = { waves: [], next: 0, hpScale, dmgScale, delay: 0 };
  }

  clearRoom(): void {
    if (this.cleared) return;
    this.cleared = true;
    this.clearCount++;
    this.encounter = null;
    for (const pr of this.projectiles) if (pr.team === 'enemy') pr.dead = true;
    for (const t of this.telegraphs) t.cancelled = true;
    // Shards return to the player once the fight is over.
    for (const pk of this.pickups) if (pk.kind === 'shard' || pk.kind === 'soul' || pk.kind === 'gold' || pk.kind === 'loot') pk.magnet = true;
    // Party play: heroes who went down get back up once the fight is won.
    for (const p of this.players) if (p.state === 'dead' && this.living.length) this.revive(p);
    this.host.onRoomCleared(this);
  }

  openDoors(rewards: (RewardSpec | null)[]): void {
    this.doors = rewards.map((reward, i) => ({ x: doorX(this.room.w, rewards.length, i), reward, open: true }));
    audio.play('door');
  }

  dropGold(x: number, y: number, amount: number): void {
    if (amount <= 0) return;
    const coins = Math.min(6, Math.max(1, Math.round(amount / 3)));
    let left = amount;
    for (let i = 0; i < coins; i++) {
      const v = i === coins - 1 ? left : Math.max(1, Math.round(amount / coins));
      left -= v;
      const pk = new Pickup('gold', x, y, v);
      const a = Math.random() * TAU;
      pk.vx = Math.cos(a) * fx.range(60, 160);
      pk.vy = Math.sin(a) * fx.range(60, 160);
      pk.vz = fx.range(150, 260);
      pk.r = 10;
      this.pickups.push(pk);
      if (left <= 0) break;
    }
  }

  /** Drops loot that pops out and waits to be picked up. */
  /** Adds a line to the HUD's loot feed. */
  feed(text: string, color: string): void {
    this.lootFeed.push({ text, color, t: 0 });
    if (this.lootFeed.length > 6) this.lootFeed.shift();
  }

  dropLoot(x: number, y: number, loot: Loot): void {
    const pk = new Pickup('loot', x, y);
    pk.loot = loot;
    const a = Math.random() * TAU;
    pk.vx = Math.cos(a) * fx.range(40, 120);
    pk.vy = Math.sin(a) * fx.range(40, 120);
    pk.vz = fx.range(200, 300);
    pk.r = loot.gear ? 16 : 11;
    pk.delay = 0.5;
    this.pickups.push(pk);
  }

  dropShard(x: number, y: number): void {
    const pk = new Pickup('shard', clamp(x, 20, this.room.w - 20), clamp(y, 20, this.room.h - 20), 1);
    pk.owner = this.cur;
    pk.vz = 120;
    pk.delay = 0.3;
    this.pickups.push(pk);
  }

  dropSouls(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const pk = new Pickup('soul', x, y, 1);
      const a = Math.random() * TAU;
      pk.vx = Math.cos(a) * 120;
      pk.vy = Math.sin(a) * 120;
      pk.vz = fx.range(80, 200);
      pk.delay = 0.4;
      pk.r = 8;
      this.pickups.push(pk);
    }
  }

  gainSouls(n: number): void {
    const p = this.player;
    p.souls = Math.min(this.stats.soulMax, p.souls + n * this.stats.soulGain);
  }

  spawnReward(reward: RewardSpec, x: number, y: number): void {
    const pk = new Pickup('reward', x, y, 0);
    pk.reward = reward;
    pk.r = 28;
    pk.vz = 260;
    pk.delay = 0.7;
    this.pickups.push(pk);
    audio.play('clear');
    this.particles.burst(x, y, '#ffd890', 30, 300);
  }

  // ---------------------------------------------------------------- damage & death

  hurtPlayer(dmg: number, src: Actor | { x: number; y: number } | null, environmental = false, o: { proj?: Projectile; ground?: boolean } = {}): void {
    const p = this.player;
    const s = this.stats;
    if (p.state === 'dead' || p.state === 'falling') return;
    // Guard, parry or Perfect Dodge first.
    if (!environmental && src && s.canGuard) {
      const share = p.defend(this, src, dmg, o);
      if (share <= 0) return;
      dmg *= share;
    }
    if (!environmental && p.invuln) return;
    if (environmental && p.state === 'dash') return;
    if (!environmental && s.holyShield && p.holyShield) {
      p.holyShield = false;
      p.iframes = 0.6;
      this.particles.ring(p.x, p.y, GODS.athena.color, 70, 0.4, 5);
      this.particles.text(p.x, p.y, 80, 'BLOCKED', GODS.athena.color, 18);
      audio.play('deflect');
      return;
    }
    let amount = dmg;
    if (src instanceof Enemy && src.status.weak) amount *= 1 - s.weakPct;
    amount *= s.damageTaken;
    if (p.ironHideT > 0) amount *= 0.5;
    amount = Math.max(1, Math.round(amount));
    if (this.host.godMode) amount = 0;
    p.hp -= amount;
    if (s.canWrath && amount > 0) p.gainWrath(amount * WRATH_PER_TAKEN * s.wrathGain);
    if (environmental) {
      p.flash = 0.1;
    } else {
      p.onHurt(amount);
      this.hitstop(0.06);
      // Screen shake, red flash and buzz are for the hero(es) on this screen.
      if (this.viewers.includes(p)) {
        this.host.onPlayerHurt?.();
        this.camera.shake(0.35);
        this.hurtFlash = 0.35;
        audio.play('hurt');
      } else audio.play('hurt', 0.4);
      if (src) {
        p.knock(p.x - src.x, p.y - src.y, 280);
      }
    }
    if (amount > 0 && prefs.damageNumbers) this.particles.text(p.x, p.y, 70, `-${amount}`, '#ff4a4a', 20);
    this.particles.burst(p.x, p.y - 25, '#ff3040', 12, 260);
    if (s.retaliate > 0 && src instanceof Enemy && !src.dead) lightningBolt(this, src, s.retaliate);
    if (p.hp <= 0) {
      if (this.host.tryDeathDefiance()) {
        p.hp = Math.round(p.maxHp * 0.5);
        p.iframes = 2;
        this.slowMotion(0.3, 0.8);
        this.particles.text(p.x, p.y, 90, 'REPRIEVE!', '#ffcf5a', 24);
        this.particles.ring(p.x, p.y, '#ffcf5a', 260, 0.6, 10);
        for (const e of this.enemiesInRadius(p.x, p.y, 260)) e.knock(e.x - p.x, e.y - p.y, 900);
        for (const pr of this.projectiles) if (pr.team === 'enemy' && Math.hypot(pr.x - p.x, pr.y - p.y) < 300) pr.dead = true;
        audio.play('boon');
      } else {
        p.hp = 0;
        p.state = 'dead';
        p.action = null;
        p.reviveT = 0;
        audio.play('death');
        if (this.living.length > 0) {
          // Party play: down, not out. A partner can stand by to revive them.
          this.particles.text(p.x, p.y, 80, 'DOWN!', '#ff6a6a', 22);
          this.host.onPlayerDowned?.(this, p);
        } else {
          this.slowMotion(0.25, 1.2);
          this.host.onPlayerDied(this);
        }
      }
    }
  }

  /** Brings a downed hero back with 30% health and a moment of safety. */
  revive(p: Player): void {
    p.state = 'free';
    p.hp = Math.max(1, Math.round(p.maxHp * 0.3));
    p.iframes = 2;
    p.reviveT = 0;
    this.particles.ring(p.x, p.y, '#ffd890', 90, 0.5, 6);
    this.particles.text(p.x, p.y, 90, 'REVIVED', '#ffd890', 20);
    audio.play('heal');
  }

  /** Party play: a partner standing by a downed hero for REVIVE_TIME brings them back. */
  private updateRevives(dt: number): void {
    if (this.players.length < 2) return;
    for (const p of this.players) {
      if (p.state !== 'dead') continue;
      const helper = this.living.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < REVIVE_RANGE);
      p.reviveT = helper ? p.reviveT + dt : Math.max(0, p.reviveT - dt * 0.5);
      if (p.reviveT >= REVIVE_TIME && this.living.length) this.revive(p);
    }
  }

  healPlayer(amount: number, showText: boolean): void {
    const p = this.player;
    if (p.state === 'dead') return;
    const a = amount * this.stats.healMult;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + a);
    const gained = Math.round(p.hp - before);
    if (showText && gained > 0) {
      this.particles.text(p.x, p.y, 80, `+${gained}`, '#7dff8a', 20);
      audio.play('heal');
    }
  }

  killEnemy(e: Enemy): void {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.cancelTelegraphs(this);
    e.onDeath(this);
    this.particles.burst(e.x, e.y - e.height / 2, '#ff3050', e.isBoss ? 80 : 20, e.isBoss ? 600 : 300);
    this.particles.burst(e.x, e.y - e.height / 2, '#2a1018', 10, 160, { kind: 'smoke', size: 12, gravity: 0, life: 0.7, additive: false });
    this.particles.ring(e.x, e.y, '#ff6070', e.r * 3, 0.3, 4);
    audio.play('enemyDie');
    if (!e.isDummy) {
      const [lo, hi] = e.gold;
      const gold = Math.round(fx.range(lo, hi + 0.99) * this.stats.goldMult);
      if (gold > 0 && Math.random() < FOE_DROP.gold) this.dropGold(e.x, e.y, gold);
      this.dropSouls(e.x, e.y, e.isBoss ? 25 : e.isElite ? 4 : 1 + (Math.random() < FOE_DROP.extraSoul ? 1 : 0));
      if (e.eliteMod === 'volatile') {
        const x = e.x;
        const y = e.y;
        this.telegraphs.push({ shape: { type: 'circle', x, y, r: 110 }, t: 0, dur: 0.8, color: 'rgba(200,90,255,1)', owner: null, onDone: () => hostileBlast(this, x, y, 110, 15 * (this.encounter?.dmgScale ?? 1), '#c86bff', null) });
      }
      onEnemyKilled(this, e);
      this.host.onEnemyKilled(this, e);
    }
    for (const pk of this.pickups) {
      if (pk.attached === e) {
        pk.attached = null;
        pk.vz = 160;
        pk.delay = 0.3;
      }
    }
  }

  private breakPot(b: Breakable): void {
    b.dead = true;
    audio.play('armorBreak');
    this.particles.burst(b.x, b.y - 12, '#9a6a50', 16, 260, { kind: 'shard', size: 4, gravity: 600, spin: 10, additive: false });
    if (Math.random() < POT.gold) this.dropGold(b.x, b.y, Math.round(fx.range(1, 5) * this.stats.goldMult));
    else if (Math.random() < POT.souls) this.dropSouls(b.x, b.y, 2);
  }

  // ---------------------------------------------------------------- update

  update(rawDt: number): void {
    if (this.slowmoT > 0) {
      this.slowmoT -= rawDt;
      if (this.slowmoT <= 0) this.slowmo = 1;
    }
    const dt = rawDt * this.slowmo;
    this.particles.update(dt * (this.hitstopT > 0 ? 0.2 : 1));
    if (this.banner) {
      this.banner.t += rawDt;
      if (this.banner.t > 3.2) this.banner = null;
    }
    for (const f of this.lootFeed) f.t += rawDt;
    if (this.lootFeed.length && this.lootFeed[0].t > LOOT_FEED_TIME) this.lootFeed.shift();
    this.hurtFlash = Math.max(0, this.hurtFlash - rawDt);
    this.eclipseT = Math.max(0, this.eclipseT - rawDt);
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      this.followCamera(rawDt);
      return;
    }
    this.time += dt;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        this.acting(tm.as, tm.fn);
      }
    }

    this.updateFlows(dt);

    for (const p of this.players) {
      this.acting(p, () => {
        p.update(this, dt);
        updateArtifacts(this, dt);
      });
    }
    for (const e of this.enemies) if (!e.dead) this.as(this.targetFor(e, dt), () => e.update(this, dt));
    for (const a of this.allies) this.acting(this.ownerOf(a), () => a.update(this, dt));
    this.updateRevives(dt);
    this.separate();
    this.updateEncounter(dt);
    this.unstick(dt);
    this.updateHitboxes(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateTelegraphs(dt);
    this.updateTraps(dt);
    this.updatePickups(dt);
    this.updateInteract();
    this.updateDoors();

    for (const s of this.swipes) s.t += dt;
    this.swipes = this.swipes.filter((s) => s.t < s.dur);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    this.enemies = this.enemies.filter((e) => !e.dead || e.deathT < 0.6);
    for (const e of this.enemies) if (e.dead) e.deathT += dt;
    this.allies = this.allies.filter((a) => !a.dead);
    if (this.boss?.dead && this.boss.deathT > 0.6) this.boss = null;

    this.ambient();
    this.followCamera(rawDt);
  }

  /** Embers drifting up around the camera. */
  private ambient(): void {
    if (Math.random() >= 0.3) return;
    this.particles.spawn({
      kind: 'ember',
      x: this.camera.x + fx.range(-700, 700),
      y: this.camera.y + fx.range(-200, 500),
      z: fx.range(0, 40),
      vz: fx.range(20, 60),
      vx: fx.range(-15, 15),
      size: fx.range(1, 2.4),
      color: this.biome.accent,
      life: fx.range(1.5, 3),
      drag: 0.2,
    });
  }

  /**
   * Online, on the screen of a player who joined: the host runs the room, so
   * this only advances what is purely visual (particles, fading slashes,
   * banners, the camera) between the host's updates.
   */
  mirrorStep(rawDt: number): void {
    const dt = rawDt * this.slowmo;
    this.particles.update(dt);
    if (this.banner) {
      this.banner.t += rawDt;
      if (this.banner.t > 3.2) this.banner = null;
    }
    for (const f of this.lootFeed) f.t += rawDt;
    if (this.lootFeed.length && this.lootFeed[0].t > LOOT_FEED_TIME) this.lootFeed.shift();
    this.hurtFlash = Math.max(0, this.hurtFlash - rawDt);
    this.eclipseT = Math.max(0, this.eclipseT - rawDt);
    this.time += dt;
    for (const s of this.swipes) s.t += dt;
    this.swipes = this.swipes.filter((s) => s.t < s.dur);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    this.ambient();
    this.focus = this.focusOf(this.viewers[0]);
    this.followCamera(rawDt);
  }

  /**
   * The camera follows this device's hero, or frames all of them (local
   * co-op), zooming out a little when they spread apart.
   */
  private followCamera(rawDt: number): void {
    const ps = this.viewers;
    let cx = 0;
    let cy = 0;
    for (const v of ps) {
      cx += v.x;
      cy += v.y;
    }
    cx /= ps.length;
    cy /= ps.length;
    const p = ps[0];
    const lead = ps.length === 1 && p.state === 'free' ? { x: p.vx * 0.12, y: p.vy * 0.12 } : { x: 0, y: 0 };
    // Lean toward an active boss so it stays framed.
    const boss = this.boss;
    if (boss && !boss.dead) {
      const dx = boss.x - cx;
      const dy = boss.y - boss.height * 0.5 - cy;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d * 0.35, ps.length > 1 ? 120 : 240) / d;
      lead.x += dx * k;
      lead.y += dy * k;
    }
    if (this.titleDrift) {
      lead.x += Math.sin(this.time * 0.11) * 150;
      lead.y += Math.sin(this.time * 0.07 + 1) * 90 - 40;
    }
    // Spread-apart heroes: zoom out (down to 70%) so both stay on screen.
    let want = 1;
    if (ps.length > 1) {
      let span = 0;
      for (const a of ps) for (const b of ps) span = Math.max(span, Math.hypot(a.x - b.x, a.y - b.y));
      want = clamp((this.camera.viewH * this.fitZoom * 0.6) / Math.max(1, span), 0.7, 1);
    }
    this.fitZoom += (want - this.fitZoom) * Math.min(1, rawDt * 2.5);
    this.camera.fit = this.fitZoom;
    this.camera.follow({ x: cx, y: cy - 30 }, rawDt, this.room, lead);
  }

  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.spawning || !a.solid) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.spawning || !b.solid) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const wa = pushWeight(a);
        const wb = pushWeight(b);
        if (wa + wb === 0) continue;
        a.x -= (dx / d) * push * wa;
        a.y -= (dy / d) * push * wa;
        b.x += (dx / d) * push * wb;
        b.y += (dy / d) * push * wb;
      }
      for (const p of this.players) {
        if (p.state === 'dash' || p.airborne || p.state === 'dead') continue;
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const rr = a.r + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = rr - d;
        const pw = a.knockResist >= 1 ? 1 : a.isBoss ? 0.9 : 0.35;
        p.x += (dx / d) * push * pw;
        p.y += (dy / d) * push * pw;
        a.x -= (dx / d) * push * (1 - pw);
        a.y -= (dy / d) * push * (1 - pw);
      }
    }
  }

  private updateHitboxes(dt: number): void {
    for (const hb of this.hitboxes) {
      if (hb.grow && hb.shape.type === 'ring') {
        hb.shape.r1 += hb.grow * dt;
        hb.shape.r2 += hb.grow * dt;
      }
      if (hb.follow && hb.owner) {
        const o = hb.owner;
        const sh = hb.shape;
        if (sh.type === 'capsule') {
          sh.x1 = o.x;
          sh.y1 = o.y;
          sh.x2 = o.x + (hb.offset?.x ?? 0);
          sh.y2 = o.y + (hb.offset?.y ?? 0);
        } else {
          sh.x = o.x;
          sh.y = o.y;
        }
      }
      if (hb.team === 'player') this.acting(this.ownerOf(hb.owner), () => this.playerHitbox(hb));
      else {
        for (const p of this.players) {
          this.as(p, () => {
            if (hb.hit.has(p.id) || (p.invuln && p.evadeT <= 0)) return;
            if (hb.tag === 'ground' && p.airborne) return;
            if (!shapeHits(hb.shape, p)) return;
            hb.hit.add(p.id);
            this.hurtPlayer(hb.damage, hb.owner ?? { x: (hb.shape as { x?: number }).x ?? p.x, y: (hb.shape as { y?: number }).y ?? p.y }, false, { ground: hb.tag === 'ground' });
          });
        }
      }
      hb.ttl -= dt;
    }
    this.hitboxes = this.hitboxes.filter((h) => h.ttl > 0);
  }

  /** A hero's hitbox hits foes and pots, and may knock shots back. */
  private playerHitbox(hb: Hitbox): void {
    const s = this.stats;
    {
      {
        const from = hb.owner ? { x: hb.owner.x, y: hb.owner.y } : undefined;
        for (const e of this.enemies) {
          if (e.dead || e.spawning || hb.hit.has(e.id)) continue;
          if (!shapeHits(hb.shape, e)) continue;
          hb.hit.add(e.id);
          damageEnemy(this, e, hb.damage, {
            source: hb.source,
            from,
            knock: hb.knock,
            armorMult: hb.armorMult,
            backstabMult: hb.backstabMult,
            lifesteal: hb.lifesteal,
            crit: hb.crit,
            hitstop: hb.hitstop,
          });
          hb.onHit?.(this, e);
        }
        for (const b of this.breakables) {
          if (!b.dead && shapeHits(hb.shape, b)) this.breakPot(b);
        }
        const deflects = hb.deflects || ((hb.source === 'attack' || hb.source === 'special') && s.hitEffects[hb.source]?.kind === 'deflect');
        if (deflects) {
          for (const pr of this.projectiles) {
            if (pr.dead || pr.team === 'player' || !pr.deflectable || pr.lob) continue;
            if (shapeHits(hb.shape, pr)) deflect(this, pr, 'player');
          }
        }
      }
    }
  }

  private endProjectile(pr: Projectile): void {
    if (pr.dead) return;
    pr.dead = true;
    pr.onEnd?.(this);
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.age += dt;
      if (pr.lob) {
        const l = pr.lob;
        l.t += dt;
        const k = Math.min(1, l.t / l.dur);
        pr.x = l.sx + (l.tx - l.sx) * k;
        pr.y = l.sy + (l.ty - l.sy) * k;
        pr.z = 20 + l.h * 4 * k * (1 - k);
        if (k >= 1) this.endProjectile(pr);
        continue;
      }
      if (pr.homing > 0) {
        const target: Actor | null = pr.team === 'player' ? this.nearestEnemy(pr.x, pr.y, 600) : this.nearestPlayer(pr.x, pr.y);
        if (target) {
          const cur = Math.atan2(pr.vy, pr.vx);
          const want = angleTo(pr, target);
          const turn = clamp(angleDiff(cur, want), -pr.homing * dt, pr.homing * dt);
          const sp = Math.hypot(pr.vx, pr.vy);
          pr.vx = Math.cos(cur + turn) * sp;
          pr.vy = Math.sin(cur + turn) * sp;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.ttl -= dt;
      if (pr.hitsWalls) {
        const out = pr.x < 0 || pr.y < -10 || pr.x > this.room.w || pr.y > this.room.h;
        if (out || this.solidAt(pr.x, pr.y)) {
          pr.x = clamp(pr.x, 4, this.room.w - 4);
          pr.y = clamp(pr.y, 4, this.room.h - 4);
          this.particles.burst(pr.x, pr.y, pr.color, 6, 160);
          this.endProjectile(pr);
          continue;
        }
      }
      if (pr.team === 'player') {
        this.acting(this.ownerOf(pr.owner), () => {
          for (const e of this.enemies) {
            if (e.dead || e.spawning || pr.hit.has(e.id)) continue;
            if (!circleCircle(pr, e)) continue;
            pr.hit.add(e.id);
            if (pr.onHit) pr.onHit(this, e);
            else if (pr.damage > 0) {
              damageEnemy(this, e, pr.damage, { source: pr.source, from: { x: pr.x - pr.vx * 0.05, y: pr.y - pr.vy * 0.05 }, knock: pr.knock, crit: pr.crit, noEffects: pr.source === 'effect' });
            }
            if (pr.charged) lightningBolt(this, e, 40);
            pr.pierce--;
            if (pr.pierce < 0) {
              this.endProjectile(pr);
              break;
            }
          }
          if (!pr.dead) {
            for (const b of this.breakables) if (!b.dead && circleCircle(pr, b)) this.breakPot(b);
          }
        });
      } else {
        const victim = this.players.find((p) => (!p.invuln || p.evadeT > 0) && circleCircle(pr, p));
        if (victim) {
          this.as(victim, () => {
            if (pr.onHit) pr.onHit(this, victim);
            else this.hurtPlayer(pr.damage, pr.owner ?? pr, false, { proj: pr });
          });
          // A parried shot flies back instead of ending.
          if ((pr.team as string) !== 'player') this.endProjectile(pr);
          continue;
        }
      }
      if (!pr.dead && pr.ttl <= 0) this.endProjectile(pr);
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  private updateZones(dt: number): void {
    for (const z of this.zones) {
      z.age += dt;
      z.ttl -= dt;
      const target = this.zoneTargets.get(z);
      if (target) {
        if (target.dead) this.zoneTargets.delete(z);
        else {
          z.x = target.x;
          z.y = target.y;
        }
      }
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT += z.interval;
        if (z.team === 'player') {
          this.acting(this.ownerOf(z.owner), () => {
            if (z.onTick) z.onTick(this, z);
            else {
              for (const e of this.enemiesInRadius(z.x, z.y, z.r)) {
                if (z.damage > 0) damageEnemy(this, e, z.damage, { source: z.source, noEffects: true, crit: z.crit, silent: true, from: z });
                z.onActor?.(this, e);
              }
            }
          });
        } else if (z.onTick) this.as(this.nearestPlayer(z.x, z.y), () => z.onTick!(this, z));
        else {
          for (const p of this.players) {
            if (p.airborne || p.state === 'dead' || Math.hypot(p.x - z.x, p.y - z.y) >= z.r + p.r * 0.5) continue;
            this.as(p, () => {
              if (z.damage > 0) this.hurtPlayer(z.damage, null, z.kind === 'fire');
              z.onActor?.(this, p);
            });
          }
        }
      }
    }
    this.zones = this.zones.filter((z) => {
      if (z.ttl > 0) return true;
      this.zoneTargets.delete(z);
      return false;
    });
  }

  private updateTelegraphs(dt: number): void {
    for (const t of this.telegraphs) {
      t.t += dt;
      if (t.owner && (t.owner.dead || (t.owner as Enemy).status?.stun !== undefined) && !t.cancelled) t.cancelled = true;
      if (t.t >= t.dur && !t.cancelled) {
        t.cancelled = true;
        const owner = t.owner as Enemy | null;
        const target = owner?.target instanceof Player ? owner.target : this.players[0];
        if (t.onDone) this.as(target, t.onDone);
        t.t = t.dur + 1;
      }
    }
    this.telegraphs = this.telegraphs.filter((t) => !t.cancelled || t.t < t.dur + 0.15);
  }

  private updateTraps(dt: number): void {
    const half = TRAP_SIZE / 2;
    for (const tr of this.traps) {
      const inside = (a: Actor) => a.alive && Math.abs(a.x - tr.x) < half + a.r * 0.4 && Math.abs(a.y - tr.y) < half + a.r * 0.4;
      switch (tr.state) {
        case 'idle':
          if (this.players.some((p) => inside(p) && !p.airborne) || this.enemies.some((e) => !e.dead && !e.spawning && !e.flying && inside(e))) {
            tr.state = 'armed';
            tr.t = 0.5;
            audio.play('telegraph');
          }
          break;
        case 'armed':
          tr.t -= dt;
          if (tr.t <= 0) {
            tr.state = 'up';
            tr.t = 0.55;
            tr.hit.clear();
            audio.play('swing');
            this.particles.burst(tr.x, tr.y, '#d8d0d0', 8, 180);
          }
          break;
        case 'up':
          tr.t -= dt;
          for (const p of this.players) {
            if (!inside(p) || p.airborne || tr.hit.has(p.id)) continue;
            tr.hit.add(p.id);
            this.as(p, () => this.hurtPlayer(Math.round(10 * this.biomeDmg()), tr));
          }
          for (const e of this.enemies) {
            if (e.dead || e.spawning || e.flying || tr.hit.has(e.id) || !inside(e)) continue;
            tr.hit.add(e.id);
            damageEnemy(this, e, 35, { source: 'hazard', noEffects: true, color: '#d8d0d0' });
          }
          if (tr.t <= 0) {
            tr.state = 'cool';
            tr.t = 1.3;
          }
          break;
        case 'cool':
          tr.t -= dt;
          if (tr.t <= 0) tr.state = 'idle';
          break;
      }
    }
    // Lava burns foes that are knocked into it.
    for (const e of this.enemies) {
      if (e.dead || e.spawning || e.flying) continue;
      const g = this.groundAt(e.x, e.y);
      if (g === 'pit' && !e.isBoss) {
        e.fellT += dt;
        if (e.fellT > 0.05) {
          this.particles.text(e.x, e.y, 30, 'FELL', '#b0a0ff', 16);
          this.killEnemy(e);
        }
      } else if (g === 'lava') {
        e.lavaT -= dt;
        if (e.lavaT <= 0) {
          e.lavaT = 0.5;
          damageEnemy(this, e, 12, { source: 'hazard', noEffects: true, color: '#ff9a3a', silent: true });
        }
      }
    }
  }

  biomeDmg(): number {
    return this.encounter?.dmgScale ?? this.biome.dmgScale;
  }

  private updatePickups(dt: number): void {
    for (const pk of this.pickups) {
      if (pk.collected) continue;
      pk.t += dt;
      pk.delay -= dt;
      if (pk.attached) {
        pk.x = pk.attached.x;
        pk.y = pk.attached.y;
        pk.z = pk.attached.height * 0.6;
        if (pk.t > 9) {
          pk.attached = null;
          pk.vz = 150;
        }
        continue;
      }
      // Physics
      if (pk.z > 0 || pk.vz !== 0) {
        pk.vz -= 900 * dt;
        pk.z += pk.vz * dt;
        if (pk.z <= 0) {
          pk.z = 0;
          pk.vz = Math.abs(pk.vz) > 80 ? -pk.vz * 0.35 : 0;
        }
      }
      const fr = Math.exp(-4 * dt);
      pk.vx *= fr;
      pk.vy *= fr;
      pk.x = clamp(pk.x + pk.vx * dt, 16, this.room.w - 16);
      pk.y = clamp(pk.y + pk.vy * dt, 16, this.room.h - 16);
      // The nearest standing hero draws it in and picks it up (a cast shard goes back to its thrower).
      const p = pk.owner instanceof Player && this.players.includes(pk.owner) ? pk.owner : this.nearestPlayer(pk.x, pk.y);
      if (pk.delay > 0 || p.state === 'dead') continue;
      this.as(p, () => this.collect(pk, p, dt));
    }
    this.pickups = this.pickups.filter((pk) => !pk.collected);
  }

  private collect(pk: Pickup, p: Player, dt: number): void {
    const s = this.stats;
    {
      const d = Math.hypot(p.x - pk.x, p.y - pk.y);
      const magnetRange = pk.kind === 'soul' ? 360 : pk.kind === 'gold' ? 140 : pk.kind === 'shard' || pk.kind === 'ash' || pk.kind === 'loot' ? 120 : 0;
      if (pk.kind === 'shard' && pk.t > 6) pk.magnet = true;
      if (pk.magnet || d < magnetRange) {
        const sp = pk.kind === 'soul' ? 700 : 900;
        pk.x += ((p.x - pk.x) / (d || 1)) * Math.min(d, sp * dt);
        pk.y += ((p.y - pk.y) / (d || 1)) * Math.min(d, sp * dt);
      }
      if (d < pk.r + p.r + 4) {
        switch (pk.kind) {
          case 'gold':
            pk.collected = true;
            this.host.addGold(pk.value);
            audio.play('gold');
            break;
          case 'heal':
            pk.collected = true;
            this.healPlayer(pk.value, true);
            break;
          case 'shard':
            pk.collected = true;
            p.castAmmo = Math.min(s.castAmmo, p.castAmmo + 1);
            audio.play('pickup');
            break;
          case 'soul':
            pk.collected = true;
            this.gainSouls(pk.value);
            break;
          case 'ash':
            pk.collected = true;
            this.host.addAsh(pk.value);
            audio.play('pickup');
            this.particles.text(pk.x, pk.y, 40, `+${pk.value} Ash`, '#c8a8ff', 18);
            break;
          case 'loot':
            pk.collected = true;
            if (pk.loot) this.host.onLoot?.(this, pk.loot);
            audio.play(pk.loot?.gear ? 'boon' : 'pickup');
            break;
          case 'reward':
            if (pk.reward) {
              pk.collected = true;
              audio.play('boon');
              this.host.onRewardPicked(this, pk.reward, pk.x, pk.y);
            }
            break;
        }
      }
    }
  }

  /** What hero `p` stands close enough to use (and may use). */
  focusOf(p: Player): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      if (it.used) continue;
      if (this.host.canInteract && !this.host.canInteract(p, it)) continue;
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (d < it.r && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  private updateInteract(): void {
    // The prompt on screen is for this device's first hero.
    const view = this.viewers[0];
    this.focus = this.focusOf(view);
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      const best = p === view ? this.focus : this.focusOf(p);
      const ctl = p.ctl(this);
      if (best && ctl.pressed('interact')) {
        ctl.consume('interact');
        this.as(p, () => this.host.onInteract(this, best));
      }
    }
  }

  private updateDoors(): void {
    if (!this.cleared || this.exiting) return;
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      for (const d of this.doors) {
        if (!d.open) continue;
        if (p.y < 6 && Math.abs(p.x - d.x) < DOOR_W / 2) {
          this.exiting = true;
          audio.play('door');
          this.as(p, () => this.host.onDoorEntered(this, d, p));
          return;
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, dpr: number): void {
    renderWorld(this, ctx, dpr);
  }
}

/** Solid size of each kind of interactable (its `r` is the reach to use it). */
/** Seconds a foe may stay stuck out of reach before it reappears. */
const STUCK_TIME = 6;
/** Party play: how close and how long a partner stands by to revive a downed hero. */
export const REVIVE_RANGE = 70;
export const REVIVE_TIME = 2.5;

/** Seconds a loot-feed line stays on screen. */
export const LOOT_FEED_TIME = 4;

const PROP_RADIUS: Record<Interactable['kind'], number> = { station: 30, shop: 26, fountain: 40, chest: 24, npc: 16 };

/** How much an enemy yields when crowding (0 = immovable). */
function pushWeight(e: Enemy): number {
  if (e.knockResist >= 1 && !e.isBoss) return 0;
  return e.isBoss ? 0.1 : 1;
}

export function doorX(w: number, n: number, i: number): number {
  if (n <= 1) return w / 2;
  const spacing = Math.min(360, (w - 300) / (n - 1));
  return w / 2 - (spacing * (n - 1)) / 2 + spacing * i;
}

export function applyEliteMod(e: Enemy, mod: EliteMod): void {
  e.eliteMod = mod;
  e.isElite = true;
  e.maxHp = e.hp = Math.round(e.maxHp * 1.4);
  e.gold = [e.gold[0] + 3, e.gold[1] + 5];
  switch (mod) {
    case 'armored':
      e.maxArmor = e.armor = Math.round(e.maxHp * 0.7 + 20);
      break;
    case 'swift':
      e.speed *= 1.5;
      e.haste = 1.45;
      break;
    case 'volatile':
    case 'regenerating':
      break;
  }
}
