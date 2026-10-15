// Playing in someone else's game: their device runs the room; this one keeps
// a copy of it up to date from their messages, draws it with the game's own
// renderer, and sends back this player's controls. Your own hero moves the
// moment you press (then settles onto where the host has it), so it feels
// immediate even with some delay on the connection.
import { audio, type Sfx } from '../engine/audio';
import type { Action } from '../engine/input';
import { Ally, type AllyKind } from '../game/artifacts';
import { CHARACTER_BY_ID, type CharacterId } from '../game/characters';
import type { Enemy } from '../game/enemies/enemy';
import { Pickup, Projectile, Zone, type Loot, type Telegraph } from '../game/entities';
import type { Game, Grant, RunSummary } from '../game/game';
import { defaultSave, type SaveData } from '../game/meta';
import type { Member } from '../game/party';
import { MOVE_SPEED, type Player } from '../game/player';
import { BIOMES, type RoomLayout } from '../game/rooms';
import { Run } from '../game/run';
import { createWeapon } from '../game/weapons';
import { World } from '../game/world';
import * as screens from '../ui/screens';
import { APP_VERSION } from '../updates';
import { RelayLink, type FromMsg } from './link';
import { INPUT_ACTIONS, INPUT_RATE, packActions, type ChoiceMsg, type SnapMsg, type ToHost, type ToPlayer, type WorldMsg } from './protocol';
import { makeFoe } from './registry';
import type { NetSession } from './session';
import { apply, type Fields } from './sync';

/** Where the host last had an object, and how fast it was going. */
interface Target {
  x: number;
  y: number;
  vx: number;
  vy: number;
  at: number;
}

interface TrackMsg {
  add?: Record<string, Fields>;
  upd?: Record<string, Fields>;
  del?: number[];
}

/** What of your save the host needs for your hero's strength and looks (the rest stays here). */
export function profileForHost(s: SaveData): string {
  const equipped = new Set(Object.values(s.gear.equipped));
  return JSON.stringify({
    ...s,
    gear: { items: s.gear.items.filter((i) => equipped.has(i.uid)), equipped: s.gear.equipped },
    bestiary: {},
    achievements: [],
    shopSeen: [],
    materials: {},
    notice: '',
  });
}

export class NetClient implements NetSession {
  readonly role = 'client' as const;
  readonly link: RelayLink;
  code = '';
  /** The host's game name. */
  hostName = '';
  private token = '';
  private peer = -1;
  /** This player's member id in the host's party. */
  private you = -1;
  private g: Game;
  private name: string;
  private wid = -1;
  private heroes = new Map<number, Player>();
  private foes = new Map<number, Enemy>();
  private allies = new Map<number, Ally>();
  private shots = new Map<number, Projectile>();
  private zones = new Map<number, Zone>();
  private picks = new Map<number, Pickup>();
  private tels = new Map<number, Telegraph>();
  private targets = new Map<object, Target>();
  private seq = 0;
  private inT = 0;
  private pressed = 0;
  /** Movement made here but not yet confirmed by the host, per input message. */
  private pred: { s: number; dx: number; dy: number }[] = [];
  private predCur = { dx: 0, dy: 0 };
  private lastHp = -1;
  private bannerId: unknown = 0;
  private profileT = 0;
  private profileDirty = false;
  private profileSent = '';
  private lastMode = '';
  private readyFn: (() => void) | null = null;
  /** Resolves when the host's room has arrived. */
  readonly ready: Promise<void>;
  /** The host dropped and the server is holding the game for them. */
  hostAway = false;

  private constructor(g: Game, url: string, name: string) {
    this.g = g;
    this.name = name;
    this.link = new RelayLink(url);
    this.ready = new Promise((r) => (this.readyFn = r));
  }

  /** Joins the game with room `code` on the relay at `url` (an empty code joins the only game on a LAN host). */
  static async join(g: Game, url: string, code: string, name: string): Promise<NetClient> {
    const c = new NetClient(g, url, name);
    const link = c.link;
    link.seat = () => ({ t: 'join', code: c.code || code, name, version: APP_VERSION, ...(c.token && { token: c.token }) });
    const joined = link.once('joined', 8000);
    await link.connect();
    const m = await joined;
    c.code = String(m.code);
    c.token = String(m.token);
    c.peer = Number(m.peer);
    c.hostName = String(m.name ?? '');
    c.install();
    return c;
  }

  private install(): void {
    const g = this.g;
    g.net?.leave();
    g.net = this;
    const link = this.link;
    link.on('from', (m) => this.onFrom(m as unknown as FromMsg));
    link.on('joined', (m) => {
      // Back after a drop (same seat), or a new seat if the old one expired.
      this.token = String(m.token);
      this.peer = Number(m.peer);
      this.hostAway = !!m.hostAway;
      this.sendHello();
    });
    link.on('host-lost', () => {
      this.hostAway = true;
      g.ui.toast('The host lost their connection. Waiting for them…', 4000);
    });
    link.on('host-back', () => {
      this.hostAway = false;
      g.ui.toast('The host is back.');
    });
    link.on('closed', (m) => this.end(String(m.text ?? 'The game ended.')));
    link.onRetry = (retrying) => {
      if (retrying) g.ui.toast('Connection lost. Reconnecting…', 2500);
    };
    link.onDown = (why) => this.end(`${why} You're back in your own Hall.`);
    this.sendHello();
  }

  private send(d: ToHost): void {
    this.link.send({ t: 'to', d });
  }

  private sendHello(): void {
    const s = this.g.save;
    this.profileSent = profileForHost(s);
    this.send({ k: 'hello', name: this.name, character: s.character, profile: this.profileSent });
  }

  private onFrom(m: FromMsg): void {
    const d = m.d as ToPlayer;
    if (!d || typeof d !== 'object') return;
    switch (d.k) {
      case 'welcome':
        this.you = d.you;
        this.hostName = d.name || this.hostName;
        return;
      case 'world':
        return this.buildWorld(d);
      case 's':
        return this.applySnap(d);
      case 'choice':
        return this.showChoice(d);
      case 'grant':
        return this.applyGrant(d.g);
      case 'over':
        return this.showOver(d.victory, d.summary as RunSummary);
      case 'toast':
        this.g.ui.toast(d.text, d.ms);
        return;
      default:
        return;
    }
  }

  // ---------------------------------------------------------------- the room

  private buildWorld(d: WorldMsg): void {
    const g = this.g;
    this.wid = d.wid;
    const infos = [...d.members];
    const mineAt = infos.findIndex((i) => i.id === this.you);
    if (mineAt > 0) infos.unshift(...infos.splice(mineAt, 1));
    const members: Member[] = infos.map((info) => {
      const mine = info.id === this.you;
      const m = g.mirrorMember(info.id, mine ? 'local' : 'remote', mine ? this.name : info.name, mine ? g.save : defaultSave());
      if (!mine) m.peer = info.peer;
      return m;
    });
    g.setParty(members);
    this.heroes = new Map(members.map((m) => [m.id, m.player]));
    this.foes.clear();
    this.allies.clear();
    this.shots.clear();
    this.zones.clear();
    this.picks.clear();
    this.tels.clear();
    this.targets.clear();
    this.pred = [];
    this.predCur = { dx: 0, dy: 0 };
    this.lastHp = -1;
    const biome = BIOMES.find((b) => b.id === d.biome) ?? BIOMES[0];
    g.particles.clear();
    const w = new World(g, d.layout as RoomLayout, biome, g.camera, g.particles, members.map((m) => m.player));
    w.cleared = true;
    g.world = w;
    if (d.mode === 'hub') g.run = null;
    else if (g.run) for (const m of members) if (!g.run.builds.has(m.id)) g.run.addMember(m.id, g.save);
    if (this.lastMode === 'over' && d.mode !== 'over') g.ui.closeAll();
    g.mode = d.mode === 'title' ? 'hub' : d.mode;
    this.lastMode = g.mode;
    g.fadeIn();
    this.readyFn?.();
    this.readyFn = null;
  }

  /** Brings a set of objects up to date: new ones are made, changed ones updated, gone ones dropped. */
  private sync<T extends object>(msg: unknown, map: Map<number, T>, make: (f: Fields) => T, update: (o: T, f: Fields) => void): boolean {
    const m = msg as TrackMsg | undefined;
    if (!m) return false;
    if (m.add) {
      for (const [k, f] of Object.entries(m.add)) {
        const id = Number(k);
        let o = map.get(id);
        if (!o) {
          o = make(f);
          map.set(id, o);
        }
        update(o, f);
      }
    }
    if (m.upd) {
      for (const [k, f] of Object.entries(m.upd)) {
        const o = map.get(Number(k));
        if (o) update(o, f);
      }
    }
    if (m.del) {
      for (const id of m.del) {
        const o = map.get(id);
        if (o) this.targets.delete(o);
        map.delete(id);
      }
    }
    return true;
  }

  /** Applies fields to a moving object without snapping it: it glides to the new spot each frame. */
  private move(o: { x: number; y: number }, f: Fields, snap = false): void {
    const had = this.targets.get(o);
    const px = o.x;
    const py = o.y;
    apply(o, f);
    if (!('x' in f) && !('y' in f)) return;
    const v = o as unknown as { vx?: number; vy?: number; kx?: number; ky?: number };
    const t: Target = { x: o.x, y: o.y, vx: (v.vx ?? 0) + (v.kx ?? 0), vy: (v.vy ?? 0) + (v.ky ?? 0), at: performance.now() };
    this.targets.set(o, t);
    if (had && !snap && Math.hypot(t.x - px, t.y - py) < 160) {
      o.x = px;
      o.y = py;
    }
  }

  private hero(p: Player, f: Fields): void {
    if (typeof f.wid === 'string' && f.wid !== p.weapon.id) p.weapon = createWeapon(f.wid as Parameters<typeof createWeapon>[0]);
    if (typeof f.hid === 'string' && f.hid !== p.hero.id && CHARACTER_BY_ID[f.hid as CharacterId]) p.hero = CHARACTER_BY_ID[f.hid as CharacterId];
    const { W, wid: _w, hid: _h, ...rest } = f;
    this.move(p, rest);
    if (W && typeof W === 'object') apply(p.weapon, W as Fields);
  }

  private applySnap(d: SnapMsg): void {
    const g = this.g;
    const w = g.world;
    if (!w || d.wid !== this.wid) return;
    if (Math.abs(w.time - d.t) > 0.3) w.time = d.t;
    else w.time += (d.t - w.time) * 0.3;
    const ack = d.ack?.[this.peer];
    if (ack !== undefined) this.pred = this.pred.filter((e) => e.s > ack);

    if (this.sync(d.E, this.foes, (f) => makeFoe(String(f.$n)), (e, f) => this.move(e, f))) w.enemies = [...this.foes.values()];
    if (d.H) {
      const m = d.H as TrackMsg;
      for (const part of [m.add, m.upd]) {
        if (!part) continue;
        for (const [k, f] of Object.entries(part)) {
          const p = this.heroes.get(Number(k));
          if (p) this.hero(p, f);
        }
      }
    }
    if (this.sync(d.A, this.allies, (f) => new Ally((f.kind as AllyKind) ?? 'wolf', 0, 0, 1), (a, f) => this.move(a, f))) w.allies = [...this.allies.values()];
    if (this.sync(d.R, this.shots, () => new Projectile(0, 0, 0, 0, 'enemy', 0, 'enemy'), (r, f) => this.move(r, f, true))) w.projectiles = [...this.shots.values()];
    if (this.sync(d.Z, this.zones, () => new Zone('fire', 0, 0, 1, 1, 'enemy', 0, 'enemy'), (z, f) => apply(z, f))) w.zones = [...this.zones.values()];
    if (this.sync(d.K, this.picks, () => new Pickup('gold', 0, 0), (k, f) => this.move(k, f, true))) w.pickups = [...this.picks.values()];
    if (this.sync(d.T, this.tels, () => ({ shape: { type: 'circle', x: 0, y: 0, r: 1 }, t: 0, dur: 1, color: '#fff', owner: null, onDone: null }) as Telegraph, (t, f) => apply(t, f))) w.telegraphs = [...this.tels.values()];
    if (d.N) {
      for (const s of d.N.s ?? []) w.swipes.push({ ...(s as object), owner: null } as (typeof w.swipes)[number]);
      for (const b of d.N.b ?? []) w.bolts.push(b as unknown as (typeof w.bolts)[number]);
      for (const f of d.N.f ?? []) w.flashes.push(f as unknown as (typeof w.flashes)[number]);
    }
    if (d.W) this.applyRoom(w, d.W);
    if (d.M) {
      for (const [k, v] of Object.entries(d.M)) {
        const id = Number(k);
        const m = g.members.find((x) => x.id === id);
        if (m && v.S) apply(m.stats, v.S);
        if (v.B) {
          const run = this.ensureRun();
          const b = run.builds.get(id) ?? run.addMember(id, g.save);
          apply(b, v.B);
        }
      }
    }
    if (d.U === null) g.run = null;
    else if (d.U) apply(this.ensureRun(), d.U);
    if (d.X) this.replay(d.X);
  }

  private ensureRun(): Run {
    const g = this.g;
    if (!g.run) {
      g.run = new Run(g.save);
      g.run.builds.clear();
      for (const m of g.members) g.run.addMember(m.id, g.save);
      g.run.setActive(this.you);
    }
    return g.run;
  }

  private applyRoom(w: World, f: Fields): void {
    const g = this.g;
    if (typeof f.mode === 'string' && f.mode !== 'title') {
      g.mode = f.mode as typeof g.mode;
      this.lastMode = g.mode;
    }
    if (typeof f.cleared === 'boolean') w.cleared = f.cleared;
    if (typeof f.eclipseT === 'number') w.eclipseT = f.eclipseT;
    if (typeof f.slowmo === 'number') w.slowmo = f.slowmo;
    if ('boss' in f) w.boss = typeof f.boss === 'number' && f.boss ? (this.foes.get(f.boss) ?? null) : null;
    if ('bn' in f) {
      const bn = f.bn as [unknown, string, string] | 0;
      if (bn && bn[0] !== this.bannerId) w.banner = { title: bn[1], sub: bn[2], t: 0 };
      this.bannerId = bn ? bn[0] : 0;
    }
    if (Array.isArray(f.doors)) w.doors = f.doors as World['doors'];
    if (Array.isArray(f.inter)) w.interactables = f.inter as World['interactables'];
    if (Array.isArray(f.brk)) {
      const brk = f.brk as number[];
      if (brk.length === w.breakables.length) brk.forEach((dead, i) => (w.breakables[i].dead = dead === 1));
    }
    if (Array.isArray(f.traps)) {
      const traps = f.traps as [string, number][];
      traps.forEach(([state, t], i) => {
        const tr = w.traps[i];
        if (tr) {
          tr.state = state as typeof tr.state;
          tr.t = t;
        }
      });
    }
  }

  /** Plays the host's effects: particles, sounds and shakes. */
  private replay(list: unknown[]): void {
    const parts = this.g.particles as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const e of list) {
      if (!Array.isArray(e)) continue;
      const [name, ...args] = e as [string, ...unknown[]];
      const a = args.map((x) => (x === null ? undefined : x));
      try {
        if (name === 'a') audio.play(a[0] as Sfx, (a[1] as number) ?? 1);
        else if (name === 'k') this.g.camera.shake((a[0] as number) * 0.6);
        else if (name === 'burst' || name === 'directional' || name === 'ring' || name === 'text' || name === 'spawn') parts[name].apply(this.g.particles, a);
      } catch {
        /* a malformed effect: skip it */
      }
    }
  }

  // ---------------------------------------------------------------- every frame

  clientStep(dt: number): void {
    const g = this.g;
    const w = g.world;
    if (!w) return;
    const inp = g.input;
    const me = g.members[0];
    const p = me?.player;
    const now = performance.now();

    // Controls → host (30 times a second), with presses gathered in between.
    let interact = inp.pressed('interact');
    // Hall stations open here, on this device's own save.
    if (interact && w.focus?.kind === 'station' && g.mode === 'hub') {
      g.onInteract(w, w.focus);
      interact = false;
    }
    this.pressed |= packActions((a) => (a === 'interact' ? interact : inp.pressed(a as Action)));
    const move = inp.worldMove(g.camera);
    const src = inp.aimSource();
    let as: 'angle' | 'move' | 'auto' = src === 'auto' ? 'auto' : src === 'move' ? 'move' : 'angle';
    let aim = p?.aim ?? 0;
    if (p && as === 'angle') aim = inp.aimAngle(p, g.camera);
    if (!p) as = 'move';
    // Predict your own walking (only plain walking; dashes and attacks come from the host).
    if (p && p.state === 'free' && !this.hostAway) {
      const sp = MOVE_SPEED * p.speedMult(me.stats);
      this.predCur.dx += move.x * sp * dt;
      this.predCur.dy += move.y * sp * dt;
    }
    this.inT += dt;
    if (this.inT >= 1 / INPUT_RATE) {
      this.inT = 0;
      const s = ++this.seq;
      const held = packActions((a) => inp.down(a as Action));
      this.send({ k: 'in', s, h: held, p: this.pressed, mx: Math.round(move.x * 1000) / 1000, my: Math.round(move.y * 1000) / 1000, a: Math.round(aim * 1000) / 1000, as, t: inp.touching ? 1 : 0 });
      this.pred.push({ s, ...this.predCur });
      if (this.pred.length > 60) this.pred.shift();
      this.predCur = { dx: 0, dy: 0 };
      this.pressed = 0;
    }

    // Glide everything toward where the host has it.
    const k = 1 - Math.exp(-dt * 16);
    for (const [o, t] of this.targets) {
      const obj = o as { x: number; y: number };
      const age = Math.min(0.15, (now - t.at) / 1000);
      let tx = t.x + t.vx * age;
      let ty = t.y + t.vy * age;
      if (obj === p) {
        tx = t.x;
        ty = t.y;
        for (const e of this.pred) {
          tx += e.dx;
          ty += e.dy;
        }
        tx += this.predCur.dx;
        ty += this.predCur.dy;
        const kk = 1 - Math.exp(-dt * 24);
        obj.x += (tx - obj.x) * kk;
        obj.y += (ty - obj.y) * kk;
        continue;
      }
      if (o instanceof Projectile || o instanceof Pickup) {
        obj.x = tx;
        obj.y = ty;
        continue;
      }
      obj.x += (tx - obj.x) * k;
      obj.y += (ty - obj.y) * k;
    }
    if (p && as === 'angle' && p.state !== 'dead') p.aim = aim;

    // Being hit: the flash, shake and buzz are yours to feel.
    if (p) {
      if (this.lastHp >= 0 && p.hp < this.lastHp - 0.5 && p.state !== 'dead') {
        w.hurtFlash = 0.35;
        g.camera.shake(0.3);
        g.onPlayerHurt();
      }
      this.lastHp = p.hp;
    }

    w.mirrorStep(dt);

    // Your save changed (an upgrade, new gear): tell the host, at most once a second.
    this.profileT -= dt;
    if (this.profileDirty && this.profileT <= 0) {
      this.profileDirty = false;
      this.profileT = 1;
      const text = profileForHost(g.save);
      if (text !== this.profileSent) {
        this.profileSent = text;
        this.send({ k: 'profile', character: g.save.character, profile: text });
      }
    }
  }

  profileChanged(): void {
    this.profileDirty = true;
  }

  // ---------------------------------------------------------------- choices, rewards, the end

  private showChoice(d: ChoiceMsg): void {
    this.g.ui.choice({
      title: d.title,
      subtitle: d.subtitle,
      color: d.color,
      cards: d.cards,
      quote: d.quote,
      who: d.who,
      onPick: (i) => this.send({ k: 'pick', id: d.id, i }),
      skip: d.skip ? { label: d.skip, onSkip: () => this.send({ k: 'pick', id: d.id, i: -1 }) } : undefined,
    });
  }

  /** Progress from the host's game goes into this device's own save. */
  private applyGrant(gr: Grant): void {
    const g = this.g;
    const s = g.save;
    if (gr.xp) g.gainXp(gr.xp);
    if (gr.ash) {
      s.ash += gr.ash;
      s.stats.totalAsh += gr.ash;
    }
    if (gr.loot && g.world) g.onLoot(g.world, gr.loot as Loot);
    if (gr.kill) {
      s.stats.kills++;
      s.bestiary[gr.kill] = (s.bestiary[gr.kill] ?? 0) + 1;
    }
    if (gr.boss) s.stats.bossesSlain++;
    if (gr.escape) s.stats.escapes++;
    if (gr.run === 'start') s.stats.runs++;
    if (gr.run === 'death') s.stats.deaths++;
    g.persist();
  }

  private showOver(victory: boolean, summary: RunSummary): void {
    const g = this.g;
    g.mode = 'over';
    this.lastMode = 'over';
    setTimeout(() => {
      if (g.net !== this || g.mode !== 'over') return;
      if (victory) screens.victory(g, summary);
      else screens.death(g, summary);
    }, victory ? 0 : 1800);
  }

  status(): string {
    const ping = this.link.rtt ? ` · ${Math.round(this.link.rtt)} ms` : '';
    return `In ${this.hostName || 'a game'} · code ${this.code}${this.hostAway ? ' · host reconnecting' : ''}${ping}`;
  }

  /** Leaves the game and returns to this device's own Hall. */
  leave(): void {
    this.send({ k: 'bye' });
    this.link.send({ t: 'leave' });
    this.end('');
  }

  private end(text: string): void {
    const g = this.g;
    if (g.net !== this) return;
    this.link.close();
    g.net = null;
    g.run = null;
    g.soloParty();
    g.ui.closeAll();
    g.enterHub(true);
    if (text) g.ui.toast(text, 4500);
  }
}

/** Lets tests and menus check the input bits match. */
export const ACTIONS_SENT = INPUT_ACTIONS;
