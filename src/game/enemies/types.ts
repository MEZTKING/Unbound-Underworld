import { audio } from '../../engine/audio';
import { angleDiff, angleTo, clamp, fromAngle, fx, TAU } from '../../engine/math';
import { bulletRing, hostileBlast } from '../combat';
import { Projectile, Zone } from '../entities';
import type { World } from '../world';
import { Enemy } from './enemy';

const RED = 'rgba(255,60,40,1)';

function shoot(w: World, e: Enemy, angle: number, speed: number, dmg: number, color = '#ff5a3c', r = 9): Projectile {
  const pr = new Projectile(e.x + Math.cos(angle) * e.r, e.y + Math.sin(angle) * e.r, Math.cos(angle) * speed, Math.sin(angle) * speed, 'enemy', dmg, 'enemy');
  pr.owner = e;
  pr.color = color;
  pr.r = r;
  pr.ttl = 4;
  pr.z = e.height * 0.5;
  w.projectiles.push(pr);
  audio.play('shoot');
  return pr;
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, color: string, size = 2.5): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - gap, y, size, 0, TAU);
  ctx.arc(x + gap, y, size, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- Ghoul (melee grunt)

export class Grunt extends Enemy {
  readonly name = 'Ghoul';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 40, speed: 135, r: 18, height: 44, damage: 10, gold: [1, 3] }, s);
  }
  protected think(w: World, dt: number): void {
    const d = this.distToPlayer(w);
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.chase(w, this.speed, dt);
        if (d < 80 && this.cd <= 0) {
          this.setState('windup');
          this.facing = this.angleToPlayer(w);
          const a = this.facing;
          this.telegraph(w, { type: 'arc', x: this.x, y: this.y, r: 85, angle: a, half: 0.9 }, 0.5 / this.haste, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'arc', x: this.x, y: this.y, r: 85, angle: a, half: 0.9 }, damage: this.dmg, source: 'enemy', knock: 200, ttl: 0.1, hit: new Set(), owner: this });
            audio.play('swing');
          });
        }
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.5) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.55) {
          this.cd = 1 + Math.random() * 0.6;
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const wind = this.state === 'windup' ? Math.min(1, this.stateT / 0.5) : 0;
    const bob = Math.sin(this.t * 8) * 1.5;
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    ctx.fillStyle = this.c('#4a2a4e');
    ctx.beginPath();
    ctx.ellipse(0, -20 + bob, 17, 21, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#6a3a6e');
    ctx.beginPath();
    ctx.ellipse(dir * 4, -34 + bob, 11, 10, 0, 0, TAU);
    ctx.fill();
    // arms
    ctx.strokeStyle = this.c('#3a1e3e');
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dir * 12, -26 + bob);
    ctx.lineTo(dir * (22 + wind * 6), -12 - wind * 26 + bob);
    ctx.stroke();
    eyes(ctx, dir * 6, -35 + bob, 4, this.flash ? '#fff' : '#ffcf4a');
  }
}

// ---------------------------------------------------------------- Numbling (fast lunger)

export class Skitter extends Enemy {
  readonly name = 'Numbling';
  private lunge = { x: 0, y: 0 };
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 18, speed: 210, r: 12, height: 26, damage: 6, gold: [0, 2] }, s);
  }
  protected think(w: World, dt: number): void {
    const d = this.distToPlayer(w);
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.chase(w, this.speed, dt);
        if (d < 170 && this.cd <= 0 && w.lineOfSight(this.x, this.y, w.player.x, w.player.y)) {
          this.setState('windup');
          this.lunge = fromAngle(this.angleToPlayer(w));
          audio.play('telegraph');
        }
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.35) {
          this.setState('lunge');
          w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.x, y: this.y, r: this.r + 6 }, damage: this.dmg, source: 'enemy', knock: 120, ttl: 0.3, hit: new Set(), owner: this, follow: true });
        }
        break;
      case 'lunge':
        this.vx = this.lunge.x * 560;
        this.vy = this.lunge.y * 560;
        if (this.stateT > 0.28) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.5) {
          this.cd = 0.8 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const shake = this.state === 'windup' ? fx.range(-1.5, 1.5) : 0;
    const legs = Math.sin(this.t * 22) * 4;
    ctx.strokeStyle = this.c('#5a3a30');
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6, -10);
      ctx.lineTo(s * 14, -2 + legs * s);
      ctx.moveTo(s * 4, -10);
      ctx.lineTo(s * 10, 0 - legs * s);
      ctx.stroke();
    }
    ctx.fillStyle = this.c('#d8c8b0');
    ctx.beginPath();
    ctx.arc(shake, -15, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#2a1418');
    ctx.beginPath();
    ctx.arc(shake - 4, -16, 3, 0, TAU);
    ctx.arc(shake + 4, -16, 3, 0, TAU);
    ctx.fill();
    if (!this.flash) eyes(ctx, shake, -16, 4, '#ff4a3a', 1.5);
  }
}

// ---------------------------------------------------------------- Brute (heavy slammer)

export class Brute extends Enemy {
  readonly name = 'Brute';
  private aim = 0;
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 140, speed: 90, r: 28, height: 66, damage: 20, knockResist: 0.65, gold: [3, 6] }, s);
  }
  protected think(w: World, dt: number): void {
    const d = this.distToPlayer(w);
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.chase(w, this.speed, dt);
        if (d < 150 && this.cd <= 0) {
          this.setState('windup');
          this.aim = this.angleToPlayer(w);
          this.facing = this.aim;
          const cx = this.x + Math.cos(this.aim) * 70;
          const cy = this.y + Math.sin(this.aim) * 70;
          this.telegraph(w, { type: 'circle', x: cx, y: cy, r: 110 }, 0.9 / this.haste, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: cx, y: cy, r: 110 }, damage: this.dmg, source: 'enemy', knock: 380, ttl: 0.1, hit: new Set(), owner: this, tag: 'ground' });
            w.particles.ring(cx, cy, '#c8a080', 110, 0.4, 8);
            w.particles.burst(cx, cy, '#8a7060', 14, 260, { kind: 'smoke', size: 10, gravity: 0, life: 0.6, additive: false });
            w.camera.shake(0.25);
            audio.play('explode');
          });
        }
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.9) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 1) {
          this.cd = 1.2 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const wind = this.state === 'windup' ? Math.min(1, this.stateT / 0.9) : 0;
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    const step = Math.sin(this.t * 5) * 2;
    ctx.fillStyle = this.c('#3e2a28');
    ctx.fillRect(-16, -16 + step, 10, 16);
    ctx.fillRect(6, -16 - step, 10, 16);
    ctx.fillStyle = this.c('#5a3a34');
    ctx.beginPath();
    ctx.ellipse(0, -36, 28, 26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#7a4e44');
    ctx.beginPath();
    ctx.ellipse(dir * 6, -58, 13, 11, 0, 0, TAU);
    ctx.fill();
    // horns
    ctx.fillStyle = this.c('#d8c8a8');
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * 6 + s * 8, -64);
      ctx.quadraticCurveTo(dir * 6 + s * 20, -72, dir * 6 + s * 16, -82);
      ctx.lineTo(dir * 6 + s * 5, -66);
      ctx.fill();
    }
    // club
    ctx.save();
    ctx.translate(dir * 26, -40);
    ctx.rotate(dir * (-0.4 - wind * 1.8));
    ctx.fillStyle = this.c('#6a4a30');
    ctx.fillRect(-4, -36, 8, 40);
    ctx.fillStyle = this.c('#8a6a50');
    ctx.beginPath();
    ctx.ellipse(0, -40, 10, 14, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    eyes(ctx, dir * 10, -59, 4, this.flash ? '#fff' : '#ff6a3a', 2.5);
  }
}

// ---------------------------------------------------------------- Wisp (ranged caster)

export class Caster extends Enemy {
  readonly name = 'Wisp';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 30, speed: 120, r: 15, height: 56, damage: 8, gold: [1, 3] }, s);
    this.flying = true;
  }
  protected think(w: World, dt: number): void {
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.kite(w, 380, this.speed, dt);
        if (this.cd <= 0 && w.lineOfSight(this.x, this.y, w.player.x, w.player.y, 0, true)) {
          this.setState('windup');
          audio.play('telegraph');
        }
        break;
      case 'windup':
        this.stop(dt);
        this.facing = this.angleToPlayer(w);
        if (this.stateT > 0.6) {
          const a = this.angleToPlayer(w);
          for (const off of [-0.22, 0, 0.22]) shoot(w, this, a + off, 340, this.dmg, '#ff7a4a');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.4) {
          this.cd = 2 + Math.random() * 0.8;
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const glow = this.state === 'windup' ? Math.min(1, this.stateT / 0.6) : 0;
    const bob = Math.sin(this.t * 3) * 5;
    ctx.translate(0, -38 + bob);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26 + glow * 10);
    g.addColorStop(0, this.flash ? '#fff' : 'rgba(255,200,120,1)');
    g.addColorStop(0.5, `rgba(255,90,60,${0.6 + glow * 0.4})`);
    g.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + glow * 10, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = this.c('#3a1a24');
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 13, this.t * 2, this.t * 2 + 4.5);
    ctx.stroke();
    eyes(ctx, 0, -2, 4, '#2a0a10', 2);
  }
}

// ---------------------------------------------------------------- Lobber (bomb thrower)

export class Bomber extends Enemy {
  readonly name = 'Lobber';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 40, speed: 105, r: 18, height: 46, damage: 14, gold: [1, 4] }, s);
  }
  protected think(w: World, dt: number): void {
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.kite(w, 420, this.speed, dt);
        if (this.cd <= 0) this.setState('windup');
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.5) {
          const p = w.player;
          const tx = clamp(p.x + p.vx * 0.6 + fx.range(-30, 30), 30, w.room.w - 30);
          const ty = clamp(p.y + p.vy * 0.6 + fx.range(-30, 30), 30, w.room.h - 30);
          const pr = new Projectile(this.x, this.y, 0, 0, 'enemy', this.dmg, 'enemy');
          pr.lob = { sx: this.x, sy: this.y, tx, ty, t: 0, dur: 1, h: 160 };
          pr.style = 'bomb';
          pr.color = '#ff8a3a';
          pr.r = 10;
          pr.deflectable = false;
          pr.owner = this;
          const dmg = this.dmg;
          pr.onEnd = (ww) => hostileBlast(ww, tx, ty, 80, dmg, '#ff8a3a', null);
          w.projectiles.push(pr);
          w.telegraphs.push({ shape: { type: 'circle', x: tx, y: ty, r: 80 }, t: 0, dur: 1, color: RED, owner: null, onDone: null });
          audio.play('swing');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.6) {
          this.cd = 2.4 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const wind = this.state === 'windup' ? Math.min(1, this.stateT / 0.5) : 0;
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    ctx.fillStyle = this.c('#3a4a30');
    ctx.beginPath();
    ctx.ellipse(0, -20, 18, 18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#5a6a40');
    ctx.beginPath();
    ctx.arc(dir * 3, -38, 10, 0, TAU);
    ctx.fill();
    // bomb held overhead
    ctx.fillStyle = this.c('#2a2a2a');
    ctx.beginPath();
    ctx.arc(-dir * 8, -50 - wind * 10, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = Math.floor(this.t * 12) % 2 ? '#ffd04a' : '#ff6a2a';
    ctx.beginPath();
    ctx.arc(-dir * 8 + 4, -58 - wind * 10, 2.5, 0, TAU);
    ctx.fill();
    eyes(ctx, dir * 6, -39, 3, this.flash ? '#fff' : '#d8ff6a', 2);
  }
}

// ---------------------------------------------------------------- Sentinel (stationary turret)

export class Spinner extends Enemy {
  readonly name = 'Sentinel';
  private wave = 0;
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 70, speed: 0, r: 22, height: 50, damage: 8, knockResist: 1, gold: [2, 4] }, s);
    this.cd = 1.2 + Math.random();
  }
  protected think(w: World, dt: number): void {
    this.stop(dt);
    switch (this.state) {
      case 'idle':
      case 'chase':
        if (this.cd <= 0) {
          this.setState('windup');
          audio.play('telegraph');
        }
        break;
      case 'windup':
        if (this.stateT > 0.6) {
          const n = w.biome.id === 'elysium' ? 14 : 10;
          bulletRing(w, this.x, this.y, n, 230, this.dmg, this, this.wave * 0.3 + this.t * 0.1, '#ff6a8a', 9);
          this.wave++;
          if (this.wave % 3 !== 0) {
            this.setState('windup');
            this.stateT = 0.3;
          } else {
            this.setState('recover');
          }
        }
        break;
      case 'recover':
        if (this.stateT > 0.5) {
          this.cd = 2.6;
          this.setState('idle');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const glow = this.state === 'windup' ? Math.min(1, this.stateT / 0.6) : 0;
    ctx.fillStyle = this.c('#2a2238');
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-14, -24);
    ctx.lineTo(14, -24);
    ctx.lineTo(20, 0);
    ctx.fill();
    ctx.save();
    ctx.translate(0, -38);
    ctx.rotate(this.t * 0.8);
    ctx.fillStyle = this.c('#7a3a6a');
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
      ctx.lineTo(Math.cos(a + 0.5) * 9, Math.sin(a + 0.5) * 9);
    }
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,90,140,${0.4 + glow * 0.6})`;
    ctx.beginPath();
    ctx.arc(0, -38, 7 + glow * 4, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- Ram (line charger)

export class Charger extends Enemy {
  readonly name = 'Gorgehorn';
  private dir = { x: 0, y: 0 };
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 75, speed: 115, r: 22, height: 44, damage: 16, knockResist: 0.4, gold: [2, 5] }, s);
  }
  protected think(w: World, dt: number): void {
    const p = w.player;
    const d = this.distToPlayer(w);
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.chase(w, this.speed, dt);
        if (d < 520 && this.cd <= 0 && w.lineOfSight(this.x, this.y, p.x, p.y)) {
          this.setState('windup');
          const a = this.angleToPlayer(w);
          this.facing = a;
          this.dir = fromAngle(a);
          const len = 560;
          this.telegraph(w, { type: 'capsule', x1: this.x, y1: this.y, x2: this.x + this.dir.x * len, y2: this.y + this.dir.y * len, r: this.r + 4 }, 0.75 / this.haste, () => {});
          audio.play('telegraph');
        }
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.75) {
          this.setState('charge');
          w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.x, y: this.y, r: this.r + 8 }, damage: this.dmg, source: 'enemy', knock: 420, ttl: 0.7, hit: new Set(), owner: this, follow: true });
        }
        break;
      case 'charge': {
        this.vx = this.dir.x * 720;
        this.vy = this.dir.y * 720;
        if (Math.random() < 0.6) w.particles.spawn({ kind: 'smoke', x: this.x, y: this.y, size: 8, color: '#8a7a70', life: 0.5, additive: false, drag: 2 });
        const blocked = this.lastHit !== null && this.stateT > 0.05;
        if (blocked || this.stateT > 0.7) {
          this.vx = this.vy = 0;
          for (const h of w.hitboxes) if (h.owner === this) h.ttl = 0;
          if (blocked) {
            this.status.stun = 1.2;
            w.camera.shake(0.2);
            audio.play('heavyHit');
            w.particles.burst(this.x, this.y - 20, '#ffe680', 12, 220);
          }
          this.setState('recover');
        }
        break;
      }
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.6) {
          this.cd = 1.8 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    const run = this.state === 'charge' ? Math.sin(this.t * 30) * 4 : Math.sin(this.t * 8) * 2;
    ctx.scale(dir, 1);
    ctx.fillStyle = this.c('#3a3040');
    ctx.fillRect(-16, -12 + run, 6, 12);
    ctx.fillRect(10, -12 - run, 6, 12);
    ctx.fillStyle = this.c('#5a4a5a');
    ctx.beginPath();
    ctx.ellipse(0, -24, 24, 15, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#d8c8b8');
    ctx.beginPath();
    ctx.ellipse(22, -26, 11, 10, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = this.c('#e8dcc8');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(20, -36, 10, Math.PI, Math.PI * 1.9);
    ctx.stroke();
    ctx.fillStyle = this.state === 'windup' ? '#ff3a2a' : '#ffaa4a';
    ctx.beginPath();
    ctx.arc(26, -27, 2.5, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Hoplite (frontal shield)

export class Shield extends Enemy {
  readonly name = 'Gilded Hoplite';
  private aim = 0;
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 85, speed: 105, r: 20, height: 56, damage: 13, knockResist: 0.5, gold: [2, 5] }, s);
  }
  /** Blocks most damage from the front. */
  guard(from: { x: number; y: number } | undefined): number {
    if (!from || this.status.stun !== undefined || this.state === 'recover') return 1;
    const diff = Math.abs(angleDiff(this.facing, angleTo(this, from)));
    return diff < 1.1 ? 0.1 : 1;
  }
  protected think(w: World, dt: number): void {
    const want = this.angleToPlayer(w);
    const d = this.distToPlayer(w);
    switch (this.state) {
      case 'idle':
      case 'chase': {
        this.moveToward(w, w.player.x, w.player.y, this.speed, dt);
        this.facing += clamp(angleDiff(this.facing, want), -2.2 * dt, 2.2 * dt);
        if (d < 120 && this.cd <= 0) {
          this.setState('windup');
          this.aim = this.facing;
          const x2 = this.x + Math.cos(this.aim) * 120;
          const y2 = this.y + Math.sin(this.aim) * 120;
          this.telegraph(w, { type: 'capsule', x1: this.x, y1: this.y, x2, y2, r: 20 }, 0.55 / this.haste, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'capsule', x1: this.x, y1: this.y, x2: this.x + Math.cos(this.aim) * 120, y2: this.y + Math.sin(this.aim) * 120, r: 20 }, damage: this.dmg, source: 'enemy', knock: 260, ttl: 0.1, hit: new Set(), owner: this });
            audio.play('swing');
          });
        }
        break;
      }
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.55) this.setState('recover');
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.75) {
          this.cd = 1.2 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const f = this.facing;
    const front = Math.sin(f) > -0.3;
    const drawShield = () => {
      ctx.save();
      ctx.translate(Math.cos(f) * 18, -28 + Math.sin(f) * 8);
      ctx.fillStyle = this.c('#c8a040');
      ctx.beginPath();
      ctx.ellipse(0, 0, 9 + Math.abs(Math.sin(f)) * 9, 20, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.c('#7a5a20');
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    };
    if (!front) drawShield();
    ctx.fillStyle = this.c('#2e4a40');
    ctx.beginPath();
    ctx.ellipse(0, -24, 15, 22, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#d8c070');
    ctx.beginPath();
    ctx.arc(0, -48, 10, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#e04040');
    ctx.fillRect(-2, -64, 4, 10);
    eyes(ctx, Math.cos(f) * 3, -45, 3, this.flash ? '#fff' : '#9dffcf', 1.8);
    // spear
    ctx.strokeStyle = this.c('#8a7050');
    ctx.lineWidth = 3;
    const sa = this.state === 'windup' ? this.aim : f + 0.6;
    ctx.beginPath();
    ctx.moveTo(-Math.cos(sa) * 20, -28 - Math.sin(sa) * 10);
    ctx.lineTo(Math.cos(sa) * 50, -28 + Math.sin(sa) * 24);
    ctx.stroke();
    if (front) drawShield();
  }
}

// ---------------------------------------------------------------- Hissling (fused exploder)

export class Hissling extends Enemy {
  readonly name = 'Hissling';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 30, speed: 165, r: 16, height: 40, damage: 22, gold: [1, 2] }, s);
  }
  protected think(w: World, dt: number): void {
    const d = this.distToPlayer(w);
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.chase(w, this.speed, dt);
        if (d < 75) {
          this.setState('fuse');
          audio.play('telegraph');
          const r = 115;
          this.telegraph(w, { type: 'circle', x: this.x, y: this.y, r }, 1 / this.haste, () => {
            if (this.dead) return;
            hostileBlast(w, this.x, this.y, r, this.dmg, '#ff9a3a', this);
            for (const e of w.enemiesInRadius(this.x, this.y, r)) if (e !== this && !e.isBoss) e.knock(e.x - this.x, e.y - this.y, 500);
            w.killEnemy(this);
          }, 'rgba(255,140,40,1)');
        }
        break;
      case 'fuse':
        this.stop(dt * 0.5);
        for (const t of w.telegraphs) if (t.owner === this && t.shape.type === 'circle') {
          t.shape.x = this.x;
          t.shape.y = this.y;
        }
        // keep creeping
        this.moveToward(w, w.player.x, w.player.y, this.speed * 0.25, dt);
        // A stun snuffs the fuse; relight once it wears off.
        if (!w.telegraphs.some((t) => t.owner === this && !t.cancelled)) this.setState('chase');
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const fuse = this.state === 'fuse' ? this.stateT : 0;
    const swell = 1 + fuse * 0.25;
    const blink = fuse > 0 && Math.floor(fuse * (6 + fuse * 14)) % 2 === 0;
    ctx.scale(swell, swell);
    ctx.fillStyle = this.c(blink ? '#ffe0b0' : '#4a5a3a');
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.quadraticCurveTo(-18, -28, -8, -38);
    ctx.lineTo(8, -38);
    ctx.quadraticCurveTo(18, -28, 14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.c('#2a3020');
    ctx.fillRect(-10, -38, 20, 5);
    // cracked glowing seams
    ctx.strokeStyle = blink ? '#ffffff' : '#ff9a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -30);
    ctx.lineTo(-2, -22);
    ctx.lineTo(-6, -12);
    ctx.moveTo(6, -28);
    ctx.lineTo(2, -18);
    ctx.lineTo(8, -8);
    ctx.stroke();
    // fuse spark
    ctx.fillStyle = Math.floor(this.t * 14) % 2 ? '#ffd04a' : '#ff5a2a';
    ctx.beginPath();
    ctx.arc(0, -44 + Math.sin(this.t * 20), 3, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------- Weaver (web spitter)

export class Weaver extends Enemy {
  readonly name = 'Weaver';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 45, speed: 150, r: 18, height: 30, damage: 6, gold: [1, 3] }, s);
  }
  protected think(w: World, dt: number): void {
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.kite(w, 300, this.speed, dt);
        if (this.cd <= 0) this.setState('windup');
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.5) {
          const p = w.player;
          const tx = clamp(p.x + p.vx * 0.4, 30, w.room.w - 30);
          const ty = clamp(p.y + p.vy * 0.4, 30, w.room.h - 30);
          const pr = new Projectile(this.x, this.y, 0, 0, 'enemy', this.dmg, 'enemy');
          pr.lob = { sx: this.x, sy: this.y, tx, ty, t: 0, dur: 0.7, h: 90 };
          pr.style = 'glob';
          pr.color = '#e8e8f0';
          pr.r = 9;
          pr.deflectable = false;
          const dmg = this.dmg;
          pr.onEnd = (ww) => {
            const z = new Zone('web', tx, ty, 75, 5, 'enemy', 0, 'enemy');
            z.interval = 0.1;
            z.onActor = (www) => {
              www.player.webT = 0.25;
            };
            ww.zones.push(z);
            const pl = ww.player;
            if (Math.hypot(pl.x - tx, pl.y - ty) < 75 && !pl.airborne) ww.hurtPlayer(dmg, null);
            ww.particles.burst(tx, ty, '#e8e8f0', 12, 160);
          };
          w.projectiles.push(pr);
          w.telegraphs.push({ shape: { type: 'circle', x: tx, y: ty, r: 75 }, t: 0, dur: 0.7, color: 'rgba(220,220,240,1)', owner: null, onDone: null });
          audio.play('shoot');
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.5) {
          this.cd = 2.6 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const legs = Math.sin(this.t * 16) * 3;
    ctx.strokeStyle = this.c('#2a2030');
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 6, -14);
        ctx.quadraticCurveTo(s * (16 + i * 3), -26 + i * 4, s * (20 + i * 3), -2 + (i % 2 ? legs : -legs));
        ctx.stroke();
      }
    }
    ctx.fillStyle = this.c('#3a2a40');
    ctx.beginPath();
    ctx.ellipse(0, -16, 13, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#4a3a50');
    ctx.beginPath();
    ctx.ellipse(0, -10, 16, 10, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = this.flash ? '#fff' : '#ff3a5a';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(-6 + i * 4, -20 + (i % 2) * 2, 1.6, 0, TAU);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- Bonecaller (summoner)

export class Bonecaller extends Enemy {
  readonly name = 'Bonecaller';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 90, speed: 85, r: 20, height: 62, damage: 9, gold: [3, 6] }, s);
    this.cd = 1;
  }
  protected think(w: World, dt: number): void {
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.kite(w, 460, this.speed, dt);
        if (this.cd <= 0) this.setState('windup');
        break;
      case 'windup':
        this.stop(dt);
        if (this.stateT > 0.9) {
          const minions = w.enemies.filter((e) => !e.dead && e.summoner === this).length;
          if (minions < 5) {
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * TAU;
              const x = clamp(this.x + Math.cos(a) * 70, 40, w.room.w - 40);
              const y = clamp(this.y + Math.sin(a) * 70, 40, w.room.h - 40);
              if (w.groundAt(x, y) !== 'floor') continue;
              const m = w.spawn('skitter', x, y, null, w.encounter?.hpScale ?? 1, w.encounter?.dmgScale ?? 1);
              m.summoner = this;
              m.spawnT = 0.6;
            }
            audio.play('spawn');
          } else {
            const pr = shoot(w, this, this.angleToPlayer(w), 220, this.dmg, '#9dffcf', 11);
            pr.homing = 1.4;
            pr.ttl = 5;
          }
          this.setState('recover');
        }
        break;
      case 'recover':
        this.stop(dt);
        if (this.stateT > 0.6) {
          this.cd = 3.5 + Math.random();
          this.setState('chase');
        }
        break;
    }
  }
  onDeath(w: World): void {
    for (const e of w.enemies) if (e.summoner === this && !e.dead) w.killEnemy(e);
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const cast = this.state === 'windup' ? Math.min(1, this.stateT / 0.9) : 0;
    const bob = Math.sin(this.t * 2) * 2;
    ctx.fillStyle = this.c('#1e2a30');
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-10, -46 + bob);
    ctx.lineTo(10, -46 + bob);
    ctx.lineTo(16, 0);
    ctx.fill();
    ctx.fillStyle = this.c('#d8d0c0');
    ctx.beginPath();
    ctx.arc(0, -52 + bob, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.c('#1e2a30');
    ctx.beginPath();
    ctx.arc(0, -55 + bob, 11, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    eyes(ctx, 0, -52 + bob, 3.5, this.flash ? '#fff' : '#9dffcf', 2);
    // staff
    ctx.strokeStyle = this.c('#6a5a40');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(18, -70);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(150,255,210,${0.5 + cast * 0.5})`;
    ctx.beginPath();
    ctx.arc(18, -74, 6 + cast * 8, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- Mimic (treasure-chest ambusher)

export class Mimic extends Enemy {
  readonly name = 'Mimic';
  private hop = { sx: 0, sy: 0, tx: 0, ty: 0 };
  z = 0;
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 130, speed: 0, r: 26, height: 44, damage: 16, knockResist: 0.7, gold: [20, 35] }, s);
    this.cd = 0.6;
  }
  protected think(w: World, dt: number): void {
    switch (this.state) {
      case 'idle':
      case 'chase':
        this.stop(dt);
        if (this.cd <= 0) {
          this.setState('hop');
          const p = w.player;
          this.hop = { sx: this.x, sy: this.y, tx: clamp(p.x, 40, w.room.w - 40), ty: clamp(p.y, 40, w.room.h - 40) };
          const d = Math.hypot(this.hop.tx - this.x, this.hop.ty - this.y);
          if (d > 320) {
            this.hop.tx = this.x + ((this.hop.tx - this.x) / d) * 320;
            this.hop.ty = this.y + ((this.hop.ty - this.y) / d) * 320;
          }
          this.telegraph(w, { type: 'circle', x: this.hop.tx, y: this.hop.ty, r: 95 }, 0.75, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.hop.tx, y: this.hop.ty, r: 95 }, damage: this.dmg, source: 'enemy', knock: 380, ttl: 0.1, hit: new Set(), owner: this, tag: 'ground' });
            w.particles.ring(this.hop.tx, this.hop.ty, '#d8b060', 95, 0.35, 6);
            w.camera.shake(0.2);
            audio.play('heavyHit');
          });
        }
        break;
      case 'hop': {
        const k = clamp(this.stateT / 0.75, 0, 1);
        this.x = this.hop.sx + (this.hop.tx - this.hop.sx) * k;
        this.y = this.hop.sy + (this.hop.ty - this.hop.sy) * k;
        this.z = Math.sin(k * Math.PI) * 90;
        this.vx = this.vy = 0;
        if (k >= 1) {
          this.z = 0;
          this.cd = 0.7 + Math.random() * 0.5;
          this.setState('chase');
        }
        break;
      }
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    ctx.translate(0, -this.z);
    const open = this.state === 'hop' ? 0.5 + Math.sin(this.stateT * 20) * 0.2 : 0.15 + Math.sin(this.t * 6) * 0.1;
    ctx.fillStyle = this.c('#6a4020');
    ctx.fillRect(-26, -26, 52, 26);
    ctx.fillStyle = this.c('#d8a040');
    ctx.fillRect(-26, -14, 52, 4);
    // teeth
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-22 + i * 8, -26);
      ctx.lineTo(-18 + i * 8, -20);
      ctx.lineTo(-14 + i * 8, -26);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(-26, -26);
    ctx.rotate(-open);
    ctx.fillStyle = this.c('#7a4a26');
    ctx.fillRect(0, -18, 52, 18);
    ctx.fillStyle = this.c('#d8a040');
    ctx.fillRect(22, -10, 8, 8);
    ctx.restore();
    ctx.fillStyle = '#ff3a3a';
    ctx.fillRect(-10, -24, 20, 4);
    eyes(ctx, 0, -36 - open * 10, 6, this.flash ? '#fff' : '#ffd04a', 2.5);
  }
}

// ---------------------------------------------------------------- Training dummy (hub)

export class Dummy extends Enemy {
  readonly name = 'Old Bones';
  constructor(x: number, y: number) {
    super(x, y, { hp: 9999, speed: 0, r: 20, height: 56, damage: 0, knockResist: 1, gold: [0, 0] });
    this.isDummy = true;
    this.passive = true;
    this.spawnT = 0;
  }
  protected think(_w: World, dt: number): void {
    this.stop(dt);
    if (this.sinceHurt > 1.5) this.hp = this.maxHp;
  }
  onDamaged(w: World, dmg: number, source: Parameters<Enemy['onDamaged']>[2]): void {
    super.onDamaged(w, dmg, source);
    if (this.hp < 100) this.hp = this.maxHp;
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const wob = this.flash > 0 ? Math.sin(this.t * 60) * 0.08 : 0;
    ctx.rotate(wob);
    ctx.strokeStyle = this.c('#6a5040');
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -40);
    ctx.moveTo(-20, -34);
    ctx.lineTo(20, -34);
    ctx.stroke();
    ctx.fillStyle = this.c('#e8e0d0');
    ctx.beginPath();
    ctx.arc(0, -50, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a1a1a';
    ctx.beginPath();
    ctx.arc(-4, -51, 2.5, 0, TAU);
    ctx.arc(4, -51, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillRect(-4, -44, 8, 2);
  }
}
