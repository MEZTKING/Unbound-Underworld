// Hosting an online game: this device runs the room for everyone. Players
// who join send their controls; every 50 ms they get what changed, plus the
// effects and sounds to play. Their rewards, loot and experience go to their
// own saves on their own devices.
import { audio, type Sfx } from '../engine/audio';
import type { Action, AimSource, Control } from '../engine/input';
import type { Vec } from '../engine/math';
import { CHARACTER_BY_ID, characterUnlocked, type CharacterId } from '../game/characters';
import type { Game, Grant, RunSummary } from '../game/game';
import { normalizeSave } from '../game/meta';
import { MEMBER_COLORS, type Member } from '../game/party';
import type { Player } from '../game/player';
import { levelFromXp } from '../game/progression';
import type { World } from '../game/world';
import type { ChoiceOpts } from '../ui/overlay';
import { APP_VERSION } from '../updates';
import { RelayLink, type FromMsg, type RelayMsg } from './link';
import { SNAP_RATE, unpackActions, type MemberInfo, type SnapMsg, type ToHost, type ToPlayer } from './protocol';
import type { NetSession } from './session';
import { encode, diff, Ids, Track, value, type Fields } from './sync';

const ZERO: Vec = { x: 0, y: 0 };

/** Fields left out of each kind of object: links to other objects, and inner timers nobody draws. */
const SKIP = {
  enemy: new Set(['lastHit', 'retargetT', 'cd', 'slamArmed', 'lavaT', 'summoner', 'target']),
  hero: new Set(['control', 'weapon', 'hero', 'buf', 'safe', 'safeT', 'castRegenT', 'recoverT', 'jumpCd']),
  ally: new Set(['owner', 'atkCd']),
  shot: new Set(['hit', 'owner', 'onHit', 'damage', 'knock', 'crit', 'pierce', 'source', 'deflectable', 'hitsWalls', 'homing']),
  zone: new Set(['owner', 'onTick', 'onActor', 'damage', 'source', 'interval', 'tickT', 'crit']),
  pickup: new Set(['attached', 'owner']),
  telegraph: new Set(['owner', 'onDone']),
  swipe: new Set(['owner']),
  run: new Set(['rng', 'builds', 'used', 'spoils', 'activeId']),
};

/** A remote player's controls, fed by their messages. */
export class RemoteControl implements Control {
  held = new Set<Action>();
  private queued = new Set<Action>();
  private move: Vec = ZERO;
  private aim = 0;
  private src: AimSource = 'move';
  touching = false;
  /** Their last input message used (for their movement prediction). */
  seq = 0;
  /** Disconnected: the hero stands still. */
  away = false;

  feed(m: Extract<ToHost, { k: 'in' }>): void {
    if (m.s <= this.seq) return;
    this.seq = m.s;
    this.held = unpackActions(m.h) as Set<Action>;
    for (const a of unpackActions(m.p)) this.queued.add(a as Action);
    const l = Math.hypot(m.mx, m.my);
    this.move = l > 1 ? { x: m.mx / l, y: m.my / l } : { x: m.mx || 0, y: m.my || 0 };
    this.aim = Number.isFinite(m.a) ? m.a : 0;
    this.src = m.as === 'auto' ? 'auto' : m.as === 'move' ? 'move' : 'angle';
    this.touching = m.t === 1;
  }

  down(a: Action): boolean {
    return !this.away && (this.held.has(a) || this.queued.has(a));
  }
  pressed(a: Action): boolean {
    return !this.away && this.queued.has(a);
  }
  consume(a: Action): boolean {
    const had = this.queued.has(a);
    this.queued.delete(a);
    return had && !this.away;
  }
  worldMove(): Vec {
    return this.away ? ZERO : this.move;
  }
  aimSource(): AimSource {
    return this.src;
  }
  aimAngle(): number {
    return this.aim;
  }
  /** After each game step: presses are used once. */
  endStep(): void {
    this.queued.clear();
  }
  release(): void {
    this.held.clear();
    this.queued.clear();
    this.move = ZERO;
  }
}

interface Peer {
  peer: number;
  name: string;
  member: Member | null;
  ctl: RemoteControl;
  online: boolean;
  /** Card choices waiting on their answer. */
  choices: Map<number, ChoiceOpts>;
  /** Last profile text, so unchanged ones are ignored. */
  profile: string;
}

export class NetHost implements NetSession {
  readonly role = 'host' as const;
  readonly link: RelayLink;
  code = '';
  private token = '';
  private g: Game;
  private name: string;
  private peers = new Map<number, Peer>();
  private ids = new Ids();
  private tr = { E: new Track(), H: new Track(), A: new Track(), R: new Track(), Z: new Track(), K: new Track(), T: new Track() };
  private sent = new WeakSet<object>();
  private lastW: Fields | undefined;
  private lastM = new Map<number, { S?: Fields; B?: Fields }>();
  private lastU: Fields | null = null;
  private fx: unknown[] = [];
  private recording = false;
  private world: World | null = null;
  private wid = 0;
  private snapT = 0;
  private seq = 0;
  private choiceId = 0;
  private undo: (() => void)[] = [];
  /** Tells the menus something happened ("Ann joined"). */
  onEvent: ((text: string) => void) | null = null;

  private constructor(g: Game, url: string, name: string) {
    this.g = g;
    this.name = name;
    this.link = new RelayLink(url);
  }

  /** Opens a room on the relay at `url` and starts hosting. */
  static async start(g: Game, url: string, name: string): Promise<NetHost> {
    const h = new NetHost(g, url, name);
    const link = h.link;
    link.seat = () => (h.token ? { t: 'host', code: h.code, token: h.token, name, version: APP_VERSION } : { t: 'host', name, version: APP_VERSION, max: 4 });
    const hosted = link.once('hosted', 8000);
    await link.connect();
    const m = await hosted;
    h.code = String(m.code);
    h.token = String(m.token);
    h.install();
    return h;
  }

  private install(): void {
    const g = this.g;
    g.net = this;
    g.remoteControl = (m) => this.peerOf(m)?.ctl ?? new RemoteControl();
    g.remoteChoice = (m, opts) => this.sendChoice(m, opts);
    g.grant = (m, grant) => this.sendGrant(m, grant);
    const link = this.link;
    this.undo.push(
      link.on('hosted', (m) => {
        // Back after a drop: the relay kept our room and the seats.
        if (!m.rejoin) return;
        this.onEvent?.('Reconnected');
        this.resetTracks();
      }),
      link.on('peer', (m) => this.onPeer(Number(m.peer), String(m.name ?? 'Player'), !!m.rejoin)),
      link.on('left', (m) => this.onLeft(Number(m.peer), !!m.gone)),
      link.on('from', (m) => this.onFrom(m as unknown as FromMsg)),
    );
    link.onDown = () => {
      this.onEvent?.('Lost the connection to the server: the online game has ended.');
      this.leave();
    };
    this.patchEffects();
  }

  /** Records the particles, sounds and shakes made during each world update, to replay on the others' screens. */
  private patchEffects(): void {
    const g = this.g;
    const parts = g.particles as unknown as Record<string, (...a: unknown[]) => unknown>;
    let depth = 0;
    for (const name of ['burst', 'directional', 'ring', 'text', 'spawn']) {
      const orig = parts[name];
      parts[name] = (...args: unknown[]) => {
        if (this.recording && depth === 0 && !(name === 'spawn' && (args[0] as { kind?: string })?.kind === 'ember')) {
          this.fx.push([name, ...args.map((a) => value(a, 1) ?? null)]);
        }
        depth++;
        try {
          return orig.apply(g.particles, args);
        } finally {
          depth--;
        }
      };
      this.undo.push(() => delete parts[name]);
    }
    const play = audio.play;
    audio.play = (name: Sfx, intensity = 1) => {
      if (this.recording) this.fx.push(['a', name, value(intensity, 1)]);
      play.call(audio, name, intensity);
    };
    this.undo.push(() => {
      audio.play = play;
    });
    const cam = g.camera;
    const shake = cam.shake;
    cam.shake = (k: number) => {
      if (this.recording) this.fx.push(['k', value(k, 1)]);
      shake.call(cam, k);
    };
    this.undo.push(() => {
      cam.shake = shake;
    });
  }

  private peerOf(m: Member): Peer | undefined {
    return m.peer === undefined ? undefined : this.peers.get(m.peer);
  }

  private send(peer: number, d: ToPlayer): void {
    this.link.send({ t: 'to', peer, d });
  }

  private broadcast(d: ToPlayer): void {
    this.link.send({ t: 'all', d });
  }

  // ---------------------------------------------------------------- players coming and going

  private onPeer(peer: number, name: string, rejoin: boolean): void {
    let p = this.peers.get(peer);
    if (p && rejoin) {
      p.online = true;
      p.ctl.away = false;
      if (p.member) p.member.player.tag = p.member.name;
      this.onEvent?.(`${p.name} is back`);
      if (p.member) this.welcome(p);
      return;
    }
    if (!p) {
      p = { peer, name, member: null, ctl: new RemoteControl(), online: true, choices: new Map(), profile: '' };
      this.peers.set(peer, p);
    }
    // Their hero is made when their hello (with their save) arrives.
  }

  private onLeft(peer: number, gone: boolean): void {
    const p = this.peers.get(peer);
    if (!p) return;
    if (!gone) {
      p.online = false;
      p.ctl.away = true;
      p.ctl.release();
      if (p.member) p.member.player.tag = `${p.member.name} (reconnecting)`;
      this.onEvent?.(`${p.name} lost their connection…`);
      return;
    }
    this.peers.delete(peer);
    // Their open choices resolve on their behalf so the party isn't kept waiting.
    for (const opts of p.choices.values()) (opts.skip ? opts.skip.onSkip : () => opts.onPick(0))();
    p.choices.clear();
    if (p.member) this.g.removeMember(p.member);
    this.onEvent?.(`${p.name} left the game`);
    this.resetTracks();
  }

  private onFrom(m: FromMsg): void {
    const p = this.peers.get(m.peer);
    const d = m.d as ToHost;
    if (!p || !d || typeof d !== 'object') return;
    switch (d.k) {
      case 'hello':
        return this.onHello(p, d.name, d.character, d.profile);
      case 'in':
        p.ctl.feed(d);
        return;
      case 'pick': {
        const opts = p.choices.get(d.id);
        if (!opts) return;
        p.choices.delete(d.id);
        if (d.i < 0 || !opts.cards[d.i]) opts.skip?.onSkip();
        else opts.onPick(d.i);
        return;
      }
      case 'profile':
        return this.onProfile(p, d.character, d.profile);
      case 'bye':
        return this.onLeft(p.peer, true);
    }
  }

  private parseProfile(text: string) {
    try {
      return normalizeSave(JSON.parse(text));
    } catch {
      return normalizeSave(null);
    }
  }

  /** The hero they asked for, if their save has it (Kael otherwise). */
  private heroFor(character: CharacterId, profile: ReturnType<typeof normalizeSave>): CharacterId {
    const def = CHARACTER_BY_ID[character];
    return def && characterUnlocked(def, profile, levelFromXp(profile.xp).level) ? def.id : 'kael';
  }

  private onHello(p: Peer, name: string, character: CharacterId, text: string): void {
    if (p.member) {
      this.welcome(p);
      return;
    }
    const profile = this.parseProfile(String(text ?? ''));
    p.profile = String(text ?? '');
    p.name = String(name || p.name).slice(0, 24);
    const m = this.g.addMember('remote', profile, this.heroFor(character, profile), p.name, { peer: p.peer });
    if (!m) {
      this.link.send({ t: 'kick', peer: p.peer, text: 'The party is full.' });
      this.peers.delete(p.peer);
      return;
    }
    p.member = m;
    this.onEvent?.(`${p.name} joined the game`);
    this.g.ui.toast(`${p.name} joined the game`);
    this.welcome(p);
  }

  private onProfile(p: Peer, character: CharacterId, text: string): void {
    const m = p.member;
    if (!m || typeof text !== 'string' || text === p.profile) return;
    p.profile = text;
    m.profile = this.parseProfile(text);
    const hero = this.heroFor(character, m.profile);
    // Heroes change in the Hall; mid-escape only the save's upgrades apply.
    if (this.g.mode === 'hub' && hero !== m.character) this.g.setHero(m, hero);
    else this.g.withMember(m, () => this.g.recomputeStats());
    m.player.look = m.profile.looks[m.character] ?? null;
  }

  /** Sends a (re)joined player who they are and the whole room. */
  private welcome(p: Peer): void {
    if (!p.member) return;
    this.send(p.peer, { k: 'welcome', you: p.member.id, name: this.name });
    this.world = null;
    // Choices they hadn't answered yet come back up.
    for (const [id, opts] of p.choices) this.send(p.peer, this.choiceMsg(id, opts));
  }

  // ---------------------------------------------------------------- choices and rewards

  private choiceMsg(id: number, o: ChoiceOpts): ToPlayer {
    return { k: 'choice', id, title: o.title, subtitle: o.subtitle, color: o.color, cards: o.cards, quote: o.quote, skip: o.skip?.label, who: o.who };
  }

  private sendChoice(m: Member, opts: ChoiceOpts): void {
    const p = this.peerOf(m);
    if (!p) {
      (opts.skip ? opts.skip.onSkip : () => opts.onPick(0))();
      return;
    }
    const id = ++this.choiceId;
    p.choices.set(id, opts);
    if (p.online) this.send(p.peer, this.choiceMsg(id, opts));
  }

  private sendGrant(m: Member, grant: Grant): void {
    const p = this.peerOf(m);
    if (p) this.send(p.peer, { k: 'grant', g: grant });
  }

  over(victory: boolean, summary: RunSummary): void {
    this.broadcast({ k: 'over', victory, summary });
  }

  // ---------------------------------------------------------------- the room, 20 times a second

  beginStep(): void {
    this.recording = true;
  }

  afterStep(dt: number): void {
    this.recording = false;
    for (const p of this.peers.values()) p.ctl.endStep();
    const w = this.g.world;
    if (!w || !this.peers.size) {
      this.fx = [];
      return;
    }
    if (w !== this.world) this.sendWorld(w);
    this.snapT += dt;
    if (this.snapT < 1 / SNAP_RATE) return;
    this.snapT = 0;
    // A slow connection backs up: skip a beat rather than pile on.
    if (this.link.backlog > 256 * 1024) return;
    this.broadcast(this.snapshot(w));
    this.fx = [];
  }

  private resetTracks(): void {
    for (const t of Object.values(this.tr)) t.reset();
    this.lastW = undefined;
    this.lastM.clear();
    this.lastU = null;
    this.sent = new WeakSet();
  }

  private memberInfo(): MemberInfo[] {
    return this.g.members.map((m) => ({ id: m.id, name: m.kind === 'local' && m.name === 'You' ? this.name : m.name, color: MEMBER_COLORS[m.id % MEMBER_COLORS.length], peer: m.peer ?? -1, kind: m.kind === 'remote' ? 'remote' : m.kind === 'pad' ? 'pad' : 'host' }));
  }

  private sendWorld(w: World): void {
    this.world = w;
    this.wid++;
    this.resetTracks();
    this.broadcast({ k: 'world', wid: this.wid, mode: this.g.mode, layout: w.room, biome: w.biome.id, members: this.memberInfo() });
  }

  private memberIdOf = (p: Player): number => this.g.memberOf(p)?.id ?? -1;

  private heroFields = (p: Player): Fields => ({ ...encode(p, SKIP.hero), wid: p.weapon.id, hid: p.hero.id, W: encode(p.weapon) });

  private snapshot(w: World): SnapMsg {
    const g = this.g;
    const tr = this.tr;
    const snap: SnapMsg = { k: 's', wid: this.wid, n: ++this.seq, t: Math.round(w.time * 100) / 100 };
    const ack: Record<number, number> = {};
    for (const p of this.peers.values()) ack[p.peer] = p.ctl.seq;
    snap.ack = ack;
    const put = (key: 'E' | 'H' | 'A' | 'R' | 'Z' | 'K' | 'T', v: unknown) => {
      if (v) snap[key] = v;
    };
    put('E', tr.E.step(w.enemies, (e) => e.id, (e) => encode(e, SKIP.enemy), (e) => ({ $n: e.name })));
    put('H', tr.H.step(w.players, this.memberIdOf, this.heroFields));
    put('A', tr.A.step(w.allies, (a) => a.id, (a) => encode(a, SKIP.ally), (a) => ({ $k: a.kind })));
    put('R', tr.R.step(w.projectiles.filter((r) => !r.dead), (r) => this.ids.of(r), (r) => encode(r, SKIP.shot)));
    put('Z', tr.Z.step(w.zones.filter((z) => !z.dead), (z) => this.ids.of(z), (z) => encode(z, SKIP.zone)));
    put('K', tr.K.step(w.pickups.filter((k) => !k.collected), (k) => this.ids.of(k), (k) => encode(k, SKIP.pickup)));
    put('T', tr.T.step(w.telegraphs, (t) => this.ids.of(t), (t) => encode(t, SKIP.telegraph)));
    // Slashes, lightning and flashes only need sending once: they fade on their own.
    const fresh = <T extends object>(list: T[], skip?: ReadonlySet<string>): Fields[] | undefined => {
      const out: Fields[] = [];
      for (const x of list) {
        if (this.sent.has(x)) continue;
        this.sent.add(x);
        out.push(encode(x, skip));
      }
      return out.length ? out : undefined;
    };
    const s = fresh(w.swipes, SKIP.swipe);
    const b = fresh(w.bolts);
    const f = fresh(w.flashes);
    if (s || b || f) snap.N = { ...(s && { s }), ...(b && { b }), ...(f && { f }) };
    const room: Fields = {
      mode: g.mode,
      cleared: w.cleared,
      eclipseT: Math.round(w.eclipseT * 10) / 10,
      slowmo: w.slowmo,
      boss: w.boss?.id ?? 0,
      bn: w.banner ? [this.ids.of(w.banner), w.banner.title, w.banner.sub] : 0,
      doors: value(w.doors, 1) ?? [],
      inter: value(w.interactables, 1) ?? [],
      brk: w.breakables.map((x) => (x.dead ? 1 : 0)),
      traps: w.traps.map((t) => [t.state, Math.round(t.t * 100) / 100]),
    };
    const dw = diff(this.lastW, room);
    this.lastW = room;
    if (dw) snap.W = dw;
    const M: NonNullable<SnapMsg['M']> = {};
    for (const m of g.members) {
      const last = this.lastM.get(m.id) ?? {};
      const S = encode(m.stats);
      const build = g.run?.builds.get(m.id);
      const B = build ? encode(build) : undefined;
      const dS = diff(last.S, S);
      const dB = B ? diff(last.B, B) : null;
      if (dS || dB) M[m.id] = { ...(dS && { S: dS }), ...(dB && { B: dB }) };
      this.lastM.set(m.id, { S, B });
    }
    if (Object.keys(M).length) snap.M = M;
    if (g.run) {
      const U = encode(g.run, SKIP.run);
      const dU = diff(this.lastU ?? undefined, U);
      if (dU) snap.U = dU;
      this.lastU = U;
    } else if (this.lastU) {
      snap.U = null;
      this.lastU = null;
    }
    if (this.fx.length) snap.X = this.fx;
    return snap;
  }

  status(): string {
    const others = [...this.peers.values()].filter((p) => p.member);
    const names = others.map((p) => `${p.name}${p.online ? '' : ' (reconnecting)'}`);
    return `Hosting · code ${this.code} · ${names.length ? names.join(', ') : 'waiting for players'}`;
  }

  /** The players connected right now. */
  get players(): { name: string; online: boolean; member: Member | null }[] {
    return [...this.peers.values()].map((p) => ({ name: p.name, online: p.online, member: p.member }));
  }

  kick(m: Member): void {
    const p = this.peerOf(m);
    if (!p) return;
    this.link.send({ t: 'kick', peer: p.peer, text: 'The host removed you from the game.' });
    this.onLeft(p.peer, true);
  }

  leave(): void {
    const g = this.g;
    if (g.net !== this) return;
    this.link.send({ t: 'leave' } as RelayMsg);
    this.link.close();
    for (const f of this.undo) f();
    this.undo = [];
    for (const p of this.peers.values()) if (p.member) g.removeMember(p.member);
    this.peers.clear();
    g.remoteControl = null;
    g.remoteChoice = null;
    g.grant = null;
    g.net = null;
  }
}
