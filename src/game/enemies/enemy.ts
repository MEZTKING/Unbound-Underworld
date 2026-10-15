import { angleDiff, angleTo, clamp, damp, dist, TAU } from '../../engine/math';
import { Actor } from '../actor';
import { CHILL_MAX, damageEnemy, updateStatuses } from '../combat';
import { GODS } from '../boons';
import type { DamageSource, EliteMod, Shape } from '../types';
import type { World } from '../world';

export interface EnemySpec {
  hp: number;
  armor?: number;
  speed: number;
  r: number;
  height: number;
  damage: number;
  knockResist?: number;
  gold?: [number, number];
}

const mixCache = new Map<string, string>();

/** Blends a #rrggbb colour toward white by k (0..1), quantised for caching. */
export function mixWhite(hex: string, k: number): string {
  if (hex[0] !== '#' || hex.length !== 7) return k > 0.5 ? '#ffffff' : hex;
  const q = Math.round(k * 8) / 8;
  const key = hex + q;
  let out = mixCache.get(key);
  if (!out) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => Math.round(v + (255 - v) * q);
    out = `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
    mixCache.set(key, out);
  }
  return out;
}

export const ELITE_NAMES: Record<EliteMod, string> = {
  armored: 'Armored',
  swift: 'Swift',
  volatile: 'Volatile',
  regenerating: 'Regenerating',
};

/** Base class for every hostile actor, including bosses. */
export abstract class Enemy extends Actor {
  team = 'enemy' as const;
  abstract readonly name: string;
  isBoss = false;
  isElite = false;
  isDummy = false;
  speed: number;
  dmg: number;
  state = 'idle';
  stateT = 0;
  spawnT = 0.9;
  /** While > 0, colliding with a wall triggers a Poseidon wall slam. */
  slamArmed = 0;
  t = Math.random() * 10;
  gold: [number, number];
  /** Cooldown before the next attack may start. */
  cd = 0.8 + Math.random() * 0.8;
  /** Telegraph currently owned by this foe (cancelled on stagger). */
  speedMult = 1;
  hpBarT = 0;
  /** Enchanted-foe modifier, if any. */
  eliteMod: EliteMod | null = null;
  /** Attack-rate multiplier (Swift foes). */
  haste = 1;
  /** Time since death (for the fade-out). */
  deathT = 0;
  fellT = 0;
  lavaT = 0;
  /** Doesn't count toward clearing the room (e.g. boss adds that despawn). */
  passive = false;
  sinceHurt = 99;
  /** Who summoned this foe (minions die with their summoner). */
  summoner: Enemy | null = null;
  /** Wall/obstacle normal from the last movement step. */
  lastHit: { x: number; y: number } | null = null;
  /** How fast this foe can turn, in radians per second: circle a slow one to get behind it. */
  turnRate = 5;
  /** Seconds left on the attack token this foe holds (see `canAttack`). */
  tokenT = 0;
  tokenKind: 'melee' | 'ranged' = 'melee';
  /** A short pause after spawning before it reacts. */
  reactT = 0.15 + Math.random() * 0.45;
  /** The side of the player this foe likes to come from, so groups surround you. */
  readonly slot = Math.random() * TAU;
  /** Seconds this foe has been stuck out of reach (see `World.unstick`). */
  stuckT = 0;
  lastPos = { x: 0, y: 0 };
  /** Party play: the hero this foe is after (see `World.targetFor`). */
  target: Actor | null = null;
  retargetT = 0;

  constructor(x: number, y: number, spec: EnemySpec, hpScale = 1) {
    super();
    this.x = x;
    this.y = y;
    this.r = spec.r;
    this.height = spec.height;
    this.maxHp = this.hp = Math.round(spec.hp * hpScale);
    this.maxArmor = this.armor = Math.round((spec.armor ?? 0) * hpScale);
    this.speed = spec.speed;
    this.dmg = spec.damage;
    this.knockResist = spec.knockResist ?? 0;
    this.gold = spec.gold ?? [0, 2];
  }

  /** Turns an ordinary foe into an armoured elite. */
  makeElite(): this {
    this.isElite = true;
    this.maxArmor = this.armor = Math.round(this.maxHp * 0.8 + 20);
    this.maxHp = this.hp = Math.round(this.maxHp * 1.3);
    this.gold = [this.gold[0] + 3, this.gold[1] + 6];
    return this;
  }

  setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  get spawning(): boolean {
    return this.spawnT > 0;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.hpBarT = Math.max(0, this.hpBarT - dt);
    if (this.spawnT > 0) {
      this.spawnT -= dt;
      this.invulnerable = true;
      if (this.spawnT <= 0) this.invulnerable = false;
      return;
    }
    this.speedMult = updateStatuses(w, this, dt);
    if (this.dead) return;
    this.sinceHurt += dt;
    if (this.eliteMod === 'regenerating' && this.sinceHurt > 2 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.04 * dt);
      if (Math.random() < 0.1) w.particles.spawn({ kind: 'dot', x: this.x + (Math.random() - 0.5) * 30, y: this.y - 10, z: 10, vz: 60, color: '#7dff8a', size: 2.5, life: 0.6 });
    }
    this.stateT += dt * this.speedMult * this.haste;
    this.cd -= dt * this.speedMult * this.haste;
    this.tokenT = Math.max(0, this.tokenT - dt);
    if (this.reactT > 0 && !this.isBoss) {
      this.reactT -= dt;
      this.stop(dt);
      this.turnTo(this.angleToPlayer(w), dt);
    } else if (this.status.stun !== undefined) {
      this.vx = damp(this.vx, 0, 12, dt);
      this.vy = damp(this.vy, 0, 12, dt);
    } else {
      this.think(w, dt * this.speedMult);
    }
    const kSpeed = Math.hypot(this.kx, this.ky);
    const hit = w.moveActor(this, dt);
    this.lastHit = hit;
    if (hit && this.slamArmed > 0 && kSpeed > 220 && w.stats.wallSlam > 0) {
      this.slamArmed = 0;
      const dmg = w.stats.wallSlam * (w.stats.duos.has('coldcurrent') ? 2 : 1);
      w.particles.burst(this.x, this.y, GODS.poseidon.color, 18, 320);
      w.camera.shake(0.15);
      damageEnemy(w, this, dmg, { source: 'effect', noEffects: true, color: GODS.poseidon.color });
      this.kx = this.ky = 0;
    }
    this.slamArmed = Math.max(0, this.slamArmed - dt);
  }

  /** Per-type AI. `dt` is already scaled by chill. */
  protected abstract think(w: World, dt: number): void;
  protected abstract drawBody(ctx: CanvasRenderingContext2D, w: World): void;

  onDamaged(_w: World, _dmg: number, _source: DamageSource): void {
    this.hpBarT = 3;
    this.sinceHurt = 0;
  }

  /** Damage multiplier based on where a hit came from (shields). */
  guard(_from: { x: number; y: number } | undefined): number {
    return 1;
  }

  onArmorBreak(w: World): void {
    this.status.stun = 0.8;
    this.cancelTelegraphs(w);
    if (this.state !== 'idle' && !this.isBoss) this.setState('chase');
  }

  onDeath(_w: World): void {}

  cancelTelegraphs(w: World): void {
    for (const t of w.telegraphs) if (t.owner === this) t.cancelled = true;
  }

  // ---------------------------------------------------------------- AI helpers

  distToPlayer(w: World): number {
    return dist(this, w.player);
  }

  angleToPlayer(w: World): number {
    return angleTo(this, w.player);
  }

  /** Turns toward an angle, no faster than `turnRate`. */
  turnTo(a: number, dt: number): void {
    const step = this.turnRate * dt;
    this.facing += clamp(angleDiff(this.facing, a), -step, step);
  }

  /**
   * The angle a committed attack goes at. Foes don't lock on: they swing
   * where they face, pulled toward you by at most `snap` radians, with up to
   * `spread` radians of error (less at higher Torment).
   */
  aimAtPlayer(w: World, spread = 0, snap = 0.5): number {
    const d = angleDiff(this.facing, this.angleToPlayer(w));
    const a = this.facing + clamp(d, -snap, snap) + (Math.random() * 2 - 1) * spread * w.foeAimError;
    this.facing = a;
    return a;
  }

  /**
   * Asks the room for an attack token. Only a few foes attack at once; the
   * rest wait their turn. Guardians and their summons always may.
   */
  canAttack(w: World, kind: 'melee' | 'ranged'): boolean {
    if (this.isBoss || this.passive || this.tokenT > 0) return true;
    if (this.tokensFull(w, kind)) return false;
    this.tokenT = kind === 'melee' ? 1.4 : 1.1;
    this.tokenKind = kind;
    return true;
  }

  tokensFull(w: World, kind: 'melee' | 'ranged'): boolean {
    let n = 0;
    for (const e of w.enemies) if (e !== this && !e.dead && e.tokenT > 0 && e.tokenKind === kind) n++;
    return n >= 2 + w.tokenBonus;
  }

  /** Steers toward a point using line of sight or the room's flow field. */
  moveToward(w: World, tx: number, ty: number, speed: number, dt: number, accel = 10): void {
    let dx = tx - this.x;
    let dy = ty - this.y;
    const toPlayer = tx === w.player.x && ty === w.player.y;
    if (toPlayer && !w.lineOfSight(this.x, this.y, tx, ty, this.r)) {
      const f = w.flowDir(this.x, this.y);
      if (f) {
        dx = f.x;
        dy = f.y;
      }
    }
    const l = Math.hypot(dx, dy);
    if (l < 1) {
      this.stop(dt);
      return;
    }
    this.vx = damp(this.vx, (dx / l) * speed, accel, dt);
    this.vy = damp(this.vy, (dy / l) * speed, accel, dt);
    this.turnTo(Math.atan2(this.vy, this.vx), dt);
  }

  /**
   * Closes in on the player. From afar each foe heads for its own side of
   * you, so groups surround rather than queue; up close, a foe without an
   * attack token circles at a distance and waits its turn.
   */
  chase(w: World, speed: number, dt: number): void {
    const p = w.player;
    const d = dist(this, p);
    if (!this.isBoss && this.tokenT <= 0 && d < 230 && this.tokensFull(w, 'melee')) {
      this.circleAround(w, 175, speed * 0.7, dt);
      return;
    }
    if (!this.isBoss && d > 150 && w.lineOfSight(this.x, this.y, p.x, p.y, this.r)) {
      const off = Math.min(110, d * 0.4);
      this.moveToward(w, p.x + Math.cos(this.slot) * off, p.y + Math.sin(this.slot) * off, speed, dt);
      return;
    }
    this.moveToward(w, p.x, p.y, speed, dt);
  }

  /** Strafes around the player at about `want` distance, facing them. */
  circleAround(w: World, want: number, speed: number, dt: number): void {
    const p = w.player;
    const a = angleTo(p, this) + (this.id % 2 ? 0.5 : -0.5);
    const tx = clamp(p.x + Math.cos(a) * want, 60, w.room.w - 60);
    const ty = clamp(p.y + Math.sin(a) * want, 60, w.room.h - 60);
    this.moveToward(w, tx, ty, speed, dt);
    this.turnTo(this.angleToPlayer(w), dt);
  }

  /** Keeps roughly `want` distance from the player, strafing. */
  kite(w: World, want: number, speed: number, dt: number): void {
    const p = w.player;
    const d = dist(this, p);
    const a = angleTo(p, this);
    const strafe = Math.sin(this.t * 0.7 + this.id) * 0.9;
    const tx = p.x + Math.cos(a + strafe * 0.6) * want;
    const ty = p.y + Math.sin(a + strafe * 0.6) * want;
    if (Math.abs(d - want) < 40 && Math.abs(strafe) < 0.2) this.stop(dt);
    else this.moveToward(w, clamp(tx, 60, w.room.w - 60), clamp(ty, 60, w.room.h - 60), speed, dt);
    this.turnTo(angleTo(this, p), dt);
  }

  stop(dt: number): void {
    this.vx = damp(this.vx, 0, 10, dt);
    this.vy = damp(this.vy, 0, 10, dt);
  }

  telegraph(w: World, shape: Shape, dur: number, onDone: () => void, color = 'rgba(255,60,40,1)'): void {
    w.telegraphs.push({ shape, t: 0, dur, color, owner: this, onDone });
  }

  // ---------------------------------------------------------------- drawing

  /** Colour helper that tints toward white while hit-flashing. */
  protected c(color: string): string {
    if (this.flash <= 0) return color;
    return mixWhite(color, Math.min(1, this.flash / 0.12) * (this.isBoss ? 0.45 : 0.75));
  }

  draw(ctx: CanvasRenderingContext2D, w: World): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.spawnT > 0) {
      const k = 1 - this.spawnT / 0.9;
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = this.isBoss ? '#ff4060' : '#c43050';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * 2.2 * (1 - k * 0.4), this.r * 1.1 * (1 - k * 0.4), 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.translate(0, (1 - k) * 20);
      ctx.scale(k, k);
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r * 1.15, this.r * 0.5, 0, 0, TAU);
    ctx.fill();
    if (this.status.chill) {
      ctx.fillStyle = `rgba(170,230,255,${0.12 + (this.status.chill.stacks / CHILL_MAX) * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * 1.5, this.r * 0.7, 0, 0, TAU);
      ctx.fill();
    }
    if (this.eliteMod) {
      // Enchanted foes shimmer with a violet aura.
      const pulse = 0.5 + Math.sin(this.t * 5) * 0.25;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(170,90,255,${0.18 * pulse + 0.08})`;
      ctx.beginPath();
      ctx.ellipse(0, -this.height * 0.45, this.r * 1.7, this.height * 0.75, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(200,140,255,${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * 1.35, this.r * 0.62, 0, 0, TAU);
      ctx.stroke();
    }
    this.drawBody(ctx, w);
    ctx.restore();
  }

  /** Attack effects drawn on top of the world (in both renderers). Body-relative, origin at the feet. */
  drawFx(_ctx: CanvasRenderingContext2D, _w: World): void {}

  drawStatus(ctx: CanvasRenderingContext2D): void {
    const top = this.y - this.height - 14;
    let ix = this.x - 18;
    const icon = (color: string, glyph: string) => {
      ctx.fillStyle = color;
      ctx.font = '700 13px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(glyph, ix, top - 12);
      ix += 14;
    };
    if (this.status.doom) icon(GODS.ares.color, '☠');
    if (this.status.weak) icon(GODS.aphrodite.color, '♥');
    if (this.status.hangover) icon(GODS.dionysus.color, `${this.status.hangover.stacks}`);
    if (this.status.chill) icon(GODS.demeter.color, '❄');
    if (this.status.stun !== undefined) icon('#ffe680', '✦');
    if (this.isBoss || this.isDummy) return;
    if (this.eliteMod) {
      ctx.font = '600 11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d8b0ff';
      ctx.fillText(ELITE_NAMES[this.eliteMod], this.x, top - 4);
    }
    if (this.hpBarT <= 0 && this.hp >= this.maxHp && this.armor >= this.maxArmor && !this.isElite) return;
    const w = Math.max(36, this.r * 2.4);
    const x = this.x - w / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, top - 1, w + 2, 7);
    ctx.fillStyle = '#d8283c';
    ctx.fillRect(x, top, w * Math.max(0, this.hp / this.maxHp), 5);
    if (this.maxArmor > 0 && this.armor > 0) {
      ctx.fillStyle = '#b8c8e0';
      ctx.fillRect(x, top, w * (this.armor / this.maxArmor), 5);
    }
  }
}
