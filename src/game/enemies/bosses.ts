import { audio } from '../../engine/audio';
import { angleTo, clamp, fromAngle, fx, TAU } from '../../engine/math';
import { bulletRing, hostileBlast } from '../combat';
import { Projectile, Zone } from '../entities';
import type { World } from '../world';
import { Enemy } from './enemy';

export abstract class Boss extends Enemy {
  isBoss = true;
  abstract readonly title: string;
  phase = 1;
  /** Seconds of invulnerable transition between phases. */
  transition = 0;
  protected queue: string[] = [];
  protected last = '';

  constructor(x: number, y: number, hp: number, r: number, height: number, speed: number, damage: number, scale: number) {
    super(x, y, { hp, speed, r, height, damage, knockResist: 1, gold: [60, 80] }, scale);
    this.spawnT = 1.2;
    this.cd = 1.5;
  }

  /** Picks the next attack, avoiding immediate repeats. */
  protected choose(options: [string, number][]): string {
    const filtered = options.filter(([k]) => k !== this.last || options.length === 1);
    const total = filtered.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of filtered) {
      r -= w;
      if (r <= 0) {
        this.last = k;
        return k;
      }
    }
    this.last = filtered[0][0];
    return this.last;
  }

  protected enterPhase2(w: World): void {
    this.phase = 2;
    this.transition = 1.4;
    this.invulnerable = true;
    this.haste = 1.3;
    this.cancelTelegraphs(w);
    for (const h of w.hitboxes) if (h.owner === this) h.ttl = 0;
    this.setState('idle');
    this.cd = 1.6;
    audio.play('roar');
    w.camera.shake(0.5);
    w.particles.ring(this.x, this.y, '#ff4060', 300, 0.8, 10);
    w.showBanner(this.name.toUpperCase(), 'grows furious!');
  }

  update(w: World, dt: number): void {
    if (this.transition > 0) {
      this.transition -= dt;
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt);
      this.vx = this.vy = 0;
      if (this.transition <= 0) this.invulnerable = false;
      return;
    }
    super.update(w, dt);
  }

  onDamaged(w: World, dmg: number, source: Parameters<Enemy['onDamaged']>[2]): void {
    super.onDamaged(w, dmg, source);
    if (this.phase === 1 && this.hp < this.maxHp * 0.5 && this.hp > 0) this.enterPhase2(w);
  }

  onDeath(w: World): void {
    w.slowMotion(0.2, 1.6);
    w.camera.shake(1);
    audio.play('roar');
    for (const e of w.enemies) if (e !== this && !e.dead) w.killEnemy(e);
    for (let i = 0; i < 5; i++) {
      w.later(i * 0.12, () => {
        w.particles.ring(this.x + fx.range(-40, 40), this.y + fx.range(-30, 30), '#ffd890', 120 + i * 40, 0.6, 8);
        w.particles.burst(this.x, this.y - this.height / 2, '#ffd890', 30, 500);
      });
    }
  }

  /** Moves around the player at a preferred distance. */
  protected circle(w: World, want: number, dt: number, speed = this.speed): void {
    const p = w.player;
    const a = angleTo(p, this) + 0.6 * dt * 4;
    const tx = clamp(p.x + Math.cos(a) * want, 80, w.room.w - 80);
    const ty = clamp(p.y + Math.sin(a) * want, 120, w.room.h - 80);
    this.moveToward(w, tx, ty, speed, dt, 5);
    this.facing = this.angleToPlayer(w);
  }
}

// ================================================================ Campe, Jailer of Tartarus

export class Campe extends Boss {
  readonly name = 'Campe';
  readonly title = 'Jailer of Tartarus';
  private dashDir = { x: 0, y: 0 };
  private lashes = 0;
  private aim = 0;
  private summoned = false;

  constructor(x: number, y: number, s = 1) {
    super(x, y, 2400, 26, 74, 170, 13, s);
  }

  protected think(w: World, dt: number): void {
    const p = w.player;
    switch (this.state) {
      case 'idle':
        this.circle(w, 230, dt);
        if (this.cd <= 0) {
          if (this.phase === 2 && !this.summoned) {
            this.summoned = true;
            this.setState('summon');
            break;
          }
          const atk = this.choose([
            ['lash', 3],
            ['dash', 2],
            ['ring', 2],
          ]);
          this.setState(atk);
          this.lashes = this.phase === 2 ? 3 : 2;
        }
        break;
      case 'lash': {
        this.stop(dt);
        if (this.stateT < 0.02) {
          this.aim = angleTo(this, p);
          this.facing = this.aim;
          const len = 330;
          const shape = { type: 'capsule' as const, x1: this.x, y1: this.y, x2: this.x + Math.cos(this.aim) * len, y2: this.y + Math.sin(this.aim) * len, r: 26 };
          this.telegraph(w, shape, 0.5, () => {
            w.addHitbox({ team: 'enemy', shape: { ...shape }, damage: this.dmg, source: 'enemy', knock: 260, ttl: 0.1, hit: new Set(), owner: this });
            w.particles.directional(this.x, this.y - 30, this.aim, 0.1, '#ff6a8a', 20, 700);
            audio.play('heavySwing');
          });
        }
        if (this.stateT > 0.75) {
          this.lashes--;
          if (this.lashes > 0) this.setState('lash');
          else {
            this.cd = 0.9;
            this.setState('idle');
          }
        }
        break;
      }
      case 'dash': {
        if (this.stateT < 0.02) {
          this.aim = angleTo(this, p);
          this.facing = this.aim;
          this.dashDir = fromAngle(this.aim);
          const len = 700;
          this.telegraph(w, { type: 'capsule', x1: this.x, y1: this.y, x2: this.x + this.dashDir.x * len, y2: this.y + this.dashDir.y * len, r: this.r + 10 }, 0.7, () => {});
          audio.play('telegraph');
        }
        if (this.stateT < 0.7) this.stop(dt);
        else if (this.stateT < 1.25) {
          if (this.stateT - dt < 0.7) {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.x, y: this.y, r: this.r + 14 }, damage: this.dmg * 1.3, source: 'enemy', knock: 400, ttl: 0.55, hit: new Set(), owner: this, follow: true });
            audio.play('dash');
          }
          this.vx = this.dashDir.x * 1150;
          this.vy = this.dashDir.y * 1150;
          if (Math.random() < 0.8) w.particles.spawn({ kind: 'dot', x: this.x, y: this.y - 40, color: '#ff4060', size: 4, life: 0.4 });
          if (this.lastHit) this.stateT = 1.25;
        } else {
          this.stop(dt);
          if (this.stateT > 1.7) {
            this.cd = 1;
            this.setState('idle');
          }
        }
        break;
      }
      case 'ring': {
        this.stop(dt);
        const bursts = this.phase === 2 ? 3 : 2;
        const k = Math.floor((this.stateT - 0.6) / 0.45);
        if (this.stateT >= 0.6 && k < bursts && this.lashes !== -10 - k) {
          this.lashes = -10 - k;
          bulletRing(w, this.x, this.y - 10, 18, 250, this.dmg * 0.8, this, k * 0.17, '#ff4a7a', 10);
          audio.play('shoot');
        }
        if (this.stateT > 0.6 + bursts * 0.45 + 0.4) {
          this.cd = 1;
          this.setState('idle');
        }
        break;
      }
      case 'summon': {
        this.stop(dt);
        if (this.stateT > 0.8 && this.lashes !== -99) {
          this.lashes = -99;
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU;
            w.spawn('grunt', clamp(this.x + Math.cos(a) * 140, 60, w.room.w - 60), clamp(this.y + Math.sin(a) * 140, 160, w.room.h - 60), null, 1.5, this.dmg / 13);
          }
          audio.play('spawn');
        }
        if (this.stateT > 1.4) {
          this.cd = 0.8;
          this.setState('idle');
        }
        break;
      }
    }
  }

  protected drawBody(ctx: CanvasRenderingContext2D): void {
    const bob = Math.sin(this.t * 3) * 4;
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    const wing = Math.sin(this.t * 6) * 0.25;
    ctx.translate(0, -18 + bob);
    // wings
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.rotate(wing);
      ctx.fillStyle = this.c('#2a0e1c');
      ctx.beginPath();
      ctx.moveTo(6, -46);
      ctx.quadraticCurveTo(50, -90, 78, -50);
      ctx.lineTo(60, -44);
      ctx.lineTo(66, -26);
      ctx.lineTo(46, -28);
      ctx.lineTo(40, -12);
      ctx.quadraticCurveTo(24, -24, 6, -30);
      ctx.fill();
      ctx.restore();
    }
    // body
    ctx.fillStyle = this.c('#5a1a2e');
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.quadraticCurveTo(-20, -40, -10, -54);
    ctx.lineTo(10, -54);
    ctx.quadraticCurveTo(20, -40, 16, 0);
    ctx.fill();
    ctx.fillStyle = this.c('#c8a0a8');
    ctx.beginPath();
    ctx.arc(dir * 2, -62, 10, 0, TAU);
    ctx.fill();
    // serpent hair
    ctx.strokeStyle = this.c(this.phase === 2 ? '#ff2a4a' : '#7a2a4a');
    ctx.lineWidth = 3;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 4 + dir * 2, -68);
      ctx.quadraticCurveTo(i * 9 + Math.sin(this.t * 5 + i) * 5, -82, i * 12, -76 + Math.cos(this.t * 4 + i) * 4);
      ctx.stroke();
    }
    ctx.fillStyle = this.flash ? '#fff' : '#ff3a5a';
    ctx.fillRect(dir * 5 - 4, -64, 3, 2);
    ctx.fillRect(dir * 5 + 1, -64, 3, 2);
    // whip
    ctx.strokeStyle = this.c('#ff6a8a');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dir * 14, -36);
    ctx.quadraticCurveTo(dir * 40, -10 + Math.sin(this.t * 7) * 10, dir * 30, 14);
    ctx.stroke();
  }
}

// ================================================================ The Hydra of Lerna

export class HydraHead extends Enemy {
  readonly name = 'Hydra Head';
  constructor(x: number, y: number, s = 1) {
    super(x, y, { hp: 260, speed: 0, r: 26, height: 70, damage: 9, knockResist: 1, gold: [0, 0] }, s);
    this.cd = 1.5;
    this.passive = true;
  }
  protected think(w: World, dt: number): void {
    this.stop(dt);
    this.facing = this.angleToPlayer(w);
    if (this.cd <= 0) {
      this.cd = 2;
      const a = this.angleToPlayer(w);
      for (const off of [-0.15, 0.15]) {
        const pr = new Projectile(this.x, this.y - 20, Math.cos(a + off) * 330, Math.sin(a + off) * 330, 'enemy', this.dmg, 'enemy');
        pr.owner = this;
        pr.color = '#ff8a2a';
        pr.style = 'fire';
        pr.r = 10;
        pr.ttl = 4;
        w.projectiles.push(pr);
      }
      audio.play('shoot');
    }
  }
  protected drawBody(ctx: CanvasRenderingContext2D): void {
    drawSerpentHead(ctx, this.t, this.facing, 0.6, this.flash > 0, '#6a3a1a', '#ff8a2a');
  }
}

function drawSerpentHead(ctx: CanvasRenderingContext2D, t: number, facing: number, scale: number, white: boolean, body: string, eye: string, lunge = 0): void {
  ctx.save();
  ctx.scale(scale, scale);
  const sway = Math.sin(t * 1.5) * 8;
  // neck
  ctx.strokeStyle = white ? '#fff' : body;
  ctx.lineWidth = 34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.quadraticCurveTo(sway + 30, -80, sway + Math.cos(facing) * (20 + lunge * 120), -150 + Math.sin(facing) * lunge * 120);
  ctx.stroke();
  ctx.translate(sway + Math.cos(facing) * (20 + lunge * 120), -150 + Math.sin(facing) * lunge * 120);
  const dir = Math.cos(facing) >= 0 ? 1 : -1;
  ctx.scale(dir, 1);
  ctx.fillStyle = white ? '#fff' : body;
  ctx.beginPath();
  ctx.ellipse(10, 0, 40, 26, 0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = white ? '#fff' : '#3a1a0a';
  ctx.beginPath();
  ctx.moveTo(30, 6);
  ctx.lineTo(56, 14 + lunge * 10);
  ctx.lineTo(24, 22);
  ctx.fill();
  // crest
  ctx.fillStyle = white ? '#fff' : '#ffb04a';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-20 + i * 10, -20);
    ctx.lineTo(-26 + i * 10, -44 + (i % 2) * 8);
    ctx.lineTo(-12 + i * 10, -22);
    ctx.fill();
  }
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.ellipse(26, -8, 6, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export class Hydra extends Boss {
  readonly name = 'The Hydra';
  readonly title = 'Many-Headed Terror of Lerna';
  private heads = 0;
  private bite = { x: 0, y: 0 };
  private lunge = 0;
  private volleys = 0;

  constructor(x: number, y: number, s = 1) {
    super(x, y, 3400, 60, 120, 0, 18, s);
  }

  protected think(w: World, dt: number): void {
    const p = w.player;
    this.stop(dt);
    this.facing = angleTo(this, p);
    this.lunge = Math.max(0, this.lunge - dt * 2.5);
    const thresholds = [0.7, 0.35];
    if (this.heads < thresholds.length && this.hp < this.maxHp * thresholds[this.heads]) {
      this.heads++;
      for (const side of [-1, 1]) {
        const h = new HydraHead(this.x + side * (260 + this.heads * 60), this.y + 120 + this.heads * 60, this.maxHp / 3400);
        h.dmg = this.dmg * 0.55;
        w.addEnemy(h);
      }
      audio.play('roar');
      w.camera.shake(0.4);
    }
    switch (this.state) {
      case 'idle':
        if (this.cd <= 0) this.setState(this.choose([
          ['bite', 3],
          ['spit', 2],
          ['fan', 2],
        ]));
        break;
      case 'bite':
        if (this.stateT < 0.02) {
          this.bite = { x: clamp(p.x, 40, w.room.w - 40), y: clamp(p.y, 40, w.room.h - 40) };
          this.telegraph(w, { type: 'circle', x: this.bite.x, y: this.bite.y, r: 115 }, 0.85, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.bite.x, y: this.bite.y, r: 115 }, damage: this.dmg * 1.3, source: 'enemy', knock: 420, ttl: 0.12, hit: new Set(), owner: this });
            w.particles.ring(this.bite.x, this.bite.y, '#ff8a2a', 115, 0.35, 8);
            w.camera.shake(0.3);
            audio.play('heavyHit');
            this.lunge = 1;
          });
        }
        if (this.stateT > 1.4) {
          this.volleys++;
          if (this.phase === 2 && this.volleys % 2 === 1) this.setState('bite');
          else {
            this.cd = 0.8;
            this.setState('idle');
          }
        }
        break;
      case 'spit':
        if (this.stateT < 0.02) {
          const n = this.phase === 2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const tx = clamp(p.x + fx.range(-220, 220), 40, w.room.w - 40);
            const ty = clamp(p.y + fx.range(-180, 180), 160, w.room.h - 40);
            const pr = new Projectile(this.x, this.y - 100, 0, 0, 'enemy', this.dmg, 'enemy');
            const dur = 1.1 + i * 0.12;
            pr.lob = { sx: this.x, sy: this.y - 60, tx, ty, t: 0, dur, h: 260 };
            pr.style = 'glob';
            pr.color = '#ff8a2a';
            pr.r = 12;
            pr.deflectable = false;
            const dmg = this.dmg;
            pr.onEnd = (ww) => {
              hostileBlast(ww, tx, ty, 70, dmg, '#ff8a2a', null);
              const z = new Zone('fire', tx, ty, 60, 2.5, 'enemy', 3, 'enemy');
              z.interval = 0.4;
              ww.zones.push(z);
            };
            w.projectiles.push(pr);
            w.telegraphs.push({ shape: { type: 'circle', x: tx, y: ty, r: 70 }, t: 0, dur, color: 'rgba(255,120,40,1)', owner: null, onDone: null });
          }
          audio.play('roar', 0.4);
        }
        if (this.stateT > 2) {
          this.cd = 0.8;
          this.setState('idle');
        }
        break;
      case 'fan': {
        const shots = this.phase === 2 ? 4 : 3;
        const k = Math.floor((this.stateT - 0.5) / 0.4);
        if (this.stateT >= 0.5 && k < shots && this.volleys !== -1 - k) {
          this.volleys = -1 - k;
          const a = angleTo(this, p);
          for (let i = -3; i <= 3; i++) {
            const pr = new Projectile(this.x, this.y - 60, Math.cos(a + i * 0.16) * 300, Math.sin(a + i * 0.16) * 300, 'enemy', this.dmg * 0.6, 'enemy');
            pr.owner = this;
            pr.color = '#ffb04a';
            pr.style = 'fire';
            pr.r = 11;
            pr.ttl = 5;
            w.projectiles.push(pr);
          }
          this.lunge = 0.4;
          audio.play('shoot');
        }
        if (this.stateT > 0.5 + shots * 0.4 + 0.5) {
          this.volleys = 0;
          this.cd = 1;
          this.setState('idle');
        }
        break;
      }
    }
  }

  onDeath(w: World): void {
    super.onDeath(w);
  }

  protected drawBody(ctx: CanvasRenderingContext2D): void {
    // lava pool
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 120);
    g.addColorStop(0, 'rgba(255,140,40,0.6)');
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, 130, 60, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    drawSerpentHead(ctx, this.t, this.facing, 1, this.flash > 0, this.phase === 2 ? '#7a2a1a' : '#5a3a20', '#ffe04a', this.lunge);
  }
}

// ================================================================ Talos, the Bronze Colossus

export class Talos extends Boss {
  readonly name = 'Talos';
  readonly title = 'the Bronze Colossus';
  private aim = 0;
  private sweep = 0;
  private tick = 0;
  private armorRegen = 0;
  private slams = 0;
  private laserOn = false;

  constructor(x: number, y: number, s = 1) {
    super(x, y, 4200, 42, 130, 75, 20, s);
    this.maxArmor = this.armor = Math.round(800 * s);
  }

  onArmorBreak(w: World): void {
    // Overheats: vents steam and stays stunned, taking extra punishment.
    this.status.stun = 3.2;
    this.cancelTelegraphs(w);
    this.laserOn = false;
    this.setState('idle');
    this.armorRegen = 9;
    w.showBanner('OVERHEATED', 'Strike now!');
    audio.play('roar', 0.6);
  }

  guard(): number {
    return this.status.stun !== undefined ? 1.5 : 1;
  }

  protected think(w: World, dt: number): void {
    const p = w.player;
    if (this.armorRegen > 0) {
      this.armorRegen -= dt;
      if (this.armorRegen <= 0) {
        this.armor = this.maxArmor;
        w.particles.ring(this.x, this.y, '#e8a860', 120, 0.5, 6);
      }
    }
    switch (this.state) {
      case 'idle':
        this.facing = angleTo(this, p);
        this.chase(w, this.speed, dt);
        if (this.cd <= 0) {
          this.setState(this.choose([
            ['slam', 3],
            ['laser', 2],
            ['barrage', 2],
          ]));
          this.slams = this.phase === 2 ? 2 : 1;
        }
        break;
      case 'slam': {
        this.stop(dt);
        if (this.stateT < 0.02) {
          this.aim = angleTo(this, p);
          this.facing = this.aim;
          const cx = this.x + Math.cos(this.aim) * 90;
          const cy = this.y + Math.sin(this.aim) * 90;
          this.telegraph(w, { type: 'circle', x: cx, y: cy, r: 150 }, 1 / this.haste, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: cx, y: cy, r: 150 }, damage: this.dmg * 1.2, source: 'enemy', knock: 500, ttl: 0.1, hit: new Set(), owner: this, tag: 'ground' });
            // Expanding shockwave: jump over it!
            w.addHitbox({ team: 'enemy', shape: { type: 'ring', x: cx, y: cy, r1: 140, r2: 170 }, damage: this.dmg * 0.8, source: 'enemy', knock: 300, ttl: 1.6, hit: new Set(), owner: this, tag: 'ground', grow: 430 });
            w.particles.burst(cx, cy, '#e8a860', 30, 420);
            w.particles.burst(cx, cy, '#8a7a70', 14, 260, { kind: 'smoke', size: 14, gravity: 0, life: 0.8, additive: false });
            w.camera.shake(0.5);
            audio.play('explode');
          });
        }
        if (this.stateT > 1.5 / this.haste) {
          this.slams--;
          if (this.slams > 0) this.setState('slam');
          else {
            this.cd = 1;
            this.setState('idle');
          }
        }
        break;
      }
      case 'laser': {
        this.stop(dt);
        const charge = 1;
        if (this.stateT < 0.02) {
          this.aim = angleTo(this, p);
          this.sweep = Math.random() < 0.5 ? -1 : 1;
          this.facing = this.aim;
          const a0 = this.aim - this.sweep * 0.5;
          this.telegraph(w, { type: 'capsule', x1: this.x, y1: this.y, x2: this.x + Math.cos(a0) * 800, y2: this.y + Math.sin(a0) * 800, r: 24 }, charge, () => {});
          audio.play('telegraph');
        }
        if (this.stateT >= charge && this.stateT < charge + 1.6) {
          this.laserOn = true;
          const k = (this.stateT - charge) / 1.6;
          const ang = this.aim - this.sweep * 0.5 + this.sweep * (this.phase === 2 ? 1.6 : 1.1) * k;
          this.facing = ang;
          this.tick -= dt;
          if (this.tick <= 0) {
            this.tick = 0.12;
            w.addHitbox({ team: 'enemy', shape: { type: 'capsule', x1: this.x, y1: this.y - 10, x2: this.x + Math.cos(ang) * 900, y2: this.y + Math.sin(ang) * 900, r: 22 }, damage: this.dmg * 0.7, source: 'enemy', knock: 200, ttl: 0.12, hit: new Set(), owner: this });
            w.camera.shake(0.06);
          }
        } else this.laserOn = false;
        if (this.stateT > charge + 2) {
          this.laserOn = false;
          this.cd = 1;
          this.setState('idle');
        }
        break;
      }
      case 'barrage': {
        this.stop(dt);
        if (this.stateT < 0.02) {
          const n = this.phase === 2 ? 9 : 6;
          for (let i = 0; i < n; i++) {
            const tx = clamp(p.x + fx.range(-260, 260), 40, w.room.w - 40);
            const ty = clamp(p.y + fx.range(-220, 220), 160, w.room.h - 40);
            const dur = 0.9 + i * 0.15;
            const pr = new Projectile(this.x, this.y - 100, 0, 0, 'enemy', this.dmg, 'enemy');
            pr.lob = { sx: this.x, sy: this.y - 80, tx, ty, t: 0, dur, h: 320 };
            pr.style = 'bomb';
            pr.color = '#e8a860';
            pr.r = 11;
            pr.deflectable = false;
            const dmg = this.dmg * 0.9;
            pr.onEnd = (ww) => hostileBlast(ww, tx, ty, 80, dmg, '#e8a860', null);
            w.projectiles.push(pr);
            w.telegraphs.push({ shape: { type: 'circle', x: tx, y: ty, r: 80 }, t: 0, dur, color: 'rgba(255,140,60,1)', owner: null, onDone: null });
          }
          audio.play('shoot');
        }
        if (this.stateT > 2.4) {
          this.cd = 0.8;
          this.setState('idle');
        }
        break;
      }
    }
  }

  protected drawBody(ctx: CanvasRenderingContext2D, w: World): void {
    const stunned = this.status.stun !== undefined;
    const step = this.state === 'idle' && !stunned ? Math.sin(this.t * 4) * 3 : 0;
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    const bronze = this.phase === 2 ? '#b8682a' : '#a8783a';
    // legs
    ctx.fillStyle = this.c('#6a4a2a');
    ctx.fillRect(-30, -40 + step, 20, 40);
    ctx.fillRect(10, -40 - step, 20, 40);
    // torso
    ctx.fillStyle = this.c(bronze);
    ctx.beginPath();
    ctx.moveTo(-46, -40);
    ctx.lineTo(-54, -100);
    ctx.lineTo(54, -100);
    ctx.lineTo(46, -40);
    ctx.fill();
    ctx.strokeStyle = this.c('#5a3a1a');
    ctx.lineWidth = 3;
    ctx.strokeRect(-30, -92, 60, 40);
    // furnace core
    const heat = stunned ? 1 : 0.5 + Math.sin(this.t * 3) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,${120 + heat * 80},40,${0.5 + heat * 0.5})`;
    ctx.beginPath();
    ctx.arc(0, -72, 14 + heat * 6, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // head
    ctx.fillStyle = this.c(bronze);
    ctx.fillRect(-20 + dir * 4, -130, 40, 30);
    ctx.fillStyle = this.c('#5a3a1a');
    ctx.fillRect(-20 + dir * 4, -112, 40, 4);
    const eyeGlow = this.state === 'laser' ? '#ff3a2a' : '#ffd04a';
    ctx.fillStyle = this.flash ? '#fff' : eyeGlow;
    ctx.fillRect(-6 + dir * 10, -124, 12, 6);
    // arms
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 56, -94);
      const raise = this.state === 'slam' && this.stateT < 1 ? -Math.min(1, this.stateT) * 1.8 : 0;
      ctx.rotate(s * 0.2 + raise * s * -1);
      ctx.fillStyle = this.c('#8a5a2a');
      ctx.fillRect(-10, 0, 20, 56);
      ctx.fillStyle = this.c(bronze);
      ctx.fillRect(-14, 52, 28, 22);
      ctx.restore();
    }
    if (stunned && Math.random() < 0.5) {
      w.particles.spawn({ kind: 'smoke', x: this.x + fx.range(-40, 40), y: this.y, z: 100, vz: 80, size: 12, color: '#d8d0d0', life: 1, additive: false, drag: 1 });
    }
    this.drawFx(ctx);
  }

  drawFx(ctx: CanvasRenderingContext2D, w?: World): void {
    if (this.laserOn) {
      // From the eye, 121 up (wherever the view puts height).
      const up = w?.camera.lift ?? { x: 0, y: -1 };
      const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
      ctx.save();
      ctx.translate((w ? 0 : dir * 4) + up.x * 121, up.y * 121);
      ctx.rotate(this.facing);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,80,40,0.5)';
      ctx.lineWidth = 40;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(900, 0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,180,0.95)';
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ================================================================ Cerberus, Warden of the Gate

export class Cerberus extends Boss {
  readonly name = 'Cerberus';
  readonly title = 'Warden of the Gate';
  private dir = { x: 0, y: 0 };
  private leap = { sx: 0, sy: 0, tx: 0, ty: 0 };
  z = 0;
  private summons = 0;
  private breaths = 0;

  constructor(x: number, y: number, s = 1) {
    super(x, y, 5600, 50, 100, 190, 22, s);
  }

  protected think(w: World, dt: number): void {
    const p = w.player;
    const thresholds = [0.66, 0.33];
    if (this.summons < thresholds.length && this.hp < this.maxHp * thresholds[this.summons] && this.state === 'idle') {
      this.summons++;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * TAU;
        w.spawn('hissling', clamp(this.x + Math.cos(a) * 200, 60, w.room.w - 60), clamp(this.y + Math.sin(a) * 200, 160, w.room.h - 60), null, 1.6, this.dmg / 22);
      }
      audio.play('roar');
    }
    switch (this.state) {
      case 'idle':
        this.circle(w, 320, dt, this.speed * 0.6);
        if (this.cd <= 0) this.setState(this.choose([
          ['charge', 3],
          ['breath', 2],
          ['leap', 2],
        ]));
        this.breaths = 0;
        break;
      case 'charge': {
        if (this.stateT < 0.02) {
          const a = angleTo(this, p);
          this.facing = a;
          this.dir = fromAngle(a);
          this.telegraph(w, { type: 'capsule', x1: this.x, y1: this.y, x2: this.x + this.dir.x * 900, y2: this.y + this.dir.y * 900, r: this.r + 10 }, 0.8 / this.haste, () => {});
          audio.play('roar', 0.4);
        }
        if (this.stateT < 0.8 / this.haste) this.stop(dt);
        else if (this.stateT < 0.8 / this.haste + 1) {
          if (this.stateT - dt < 0.8 / this.haste) {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.x, y: this.y, r: this.r + 16 }, damage: this.dmg * 1.3, source: 'enemy', knock: 520, ttl: 1, hit: new Set(), owner: this, follow: true });
          }
          this.vx = this.dir.x * 980;
          this.vy = this.dir.y * 980;
          if (Math.random() < 0.7) w.particles.spawn({ kind: 'smoke', x: this.x, y: this.y, size: 14, color: '#5a4a6a', life: 0.6, additive: false, drag: 2 });
          if (this.lastHit) {
            for (const h of w.hitboxes) if (h.owner === this) h.ttl = 0;
            this.status.stun = 1.6;
            this.vx = this.vy = 0;
            w.camera.shake(0.6);
            audio.play('explode');
            w.particles.burst(this.x, this.y - 50, '#ffe680', 20, 300);
            this.cd = 1;
            this.setState('idle');
          }
        } else {
          for (const h of w.hitboxes) if (h.owner === this) h.ttl = 0;
          this.stop(dt);
          this.cd = 0.8;
          this.setState('idle');
        }
        break;
      }
      case 'breath': {
        this.stop(dt);
        if (this.stateT < 0.02) {
          const a = angleTo(this, p);
          this.facing = a;
          for (const off of [-0.55, 0, 0.55]) {
            this.telegraph(w, { type: 'arc', x: this.x, y: this.y, r: 420, angle: a + off, half: 0.16 }, 0.8, () => {
              for (let i = 0; i < 9; i++) {
                const pr = new Projectile(this.x, this.y - 30, 0, 0, 'enemy', this.dmg * 0.55, 'enemy');
                const sp = 360 + i * 30;
                const aa = a + off + fx.range(-0.1, 0.1);
                pr.vx = Math.cos(aa) * sp;
                pr.vy = Math.sin(aa) * sp;
                pr.owner = this;
                pr.style = 'fire';
                pr.color = '#b06bff';
                pr.r = 12;
                pr.ttl = 1.3;
                pr.hitsWalls = true;
                if (this.phase === 2) {
                  pr.onEnd = (ww) => {
                    const z = new Zone('fire', pr.x, pr.y, 40, 2, 'enemy', 3, 'enemy');
                    z.interval = 0.4;
                    ww.zones.push(z);
                  };
                }
                w.projectiles.push(pr);
              }
              audio.play('roar', 0.3);
            }, 'rgba(176,107,255,1)');
          }
        }
        if (this.stateT > 1.8) {
          this.breaths++;
          this.cd = 0.8;
          this.setState('idle');
        }
        break;
      }
      case 'leap': {
        if (this.stateT < 0.02) {
          this.leap = { sx: this.x, sy: this.y, tx: clamp(p.x, 80, w.room.w - 80), ty: clamp(p.y, 140, w.room.h - 80) };
          this.telegraph(w, { type: 'circle', x: this.leap.tx, y: this.leap.ty, r: 160 }, 1.1 / this.haste, () => {
            w.addHitbox({ team: 'enemy', shape: { type: 'circle', x: this.leap.tx, y: this.leap.ty, r: 160 }, damage: this.dmg * 1.2, source: 'enemy', knock: 600, ttl: 0.1, hit: new Set(), owner: this, tag: 'ground' });
            w.addHitbox({ team: 'enemy', shape: { type: 'ring', x: this.leap.tx, y: this.leap.ty, r1: 150, r2: 180 }, damage: this.dmg * 0.7, source: 'enemy', knock: 300, ttl: 1.4, hit: new Set(), owner: this, tag: 'ground', grow: 460 });
            w.camera.shake(0.7);
            audio.play('explode');
            w.particles.burst(this.leap.tx, this.leap.ty, '#8a7aaa', 20, 300, { kind: 'smoke', size: 16, gravity: 0, life: 0.8, additive: false });
          });
          this.invulnerable = false;
        }
        const dur = 1.1 / this.haste;
        const k = clamp(this.stateT / dur, 0, 1);
        this.x = this.leap.sx + (this.leap.tx - this.leap.sx) * k;
        this.y = this.leap.sy + (this.leap.ty - this.leap.sy) * k;
        this.z = Math.sin(k * Math.PI) * 220;
        this.vx = this.vy = 0;
        this.solid = this.z < 20;
        if (k >= 1) {
          this.z = 0;
          this.solid = true;
          if (this.stateT > dur + 0.5) {
            this.cd = 0.9;
            this.setState('idle');
          }
        }
        break;
      }
    }
  }

  protected drawBody(ctx: CanvasRenderingContext2D): void {
    ctx.translate(0, -this.z);
    const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
    const run = this.state === 'charge' ? Math.sin(this.t * 24) * 6 : Math.sin(this.t * 5) * 3;
    ctx.scale(dir, 1);
    // legs
    ctx.fillStyle = this.c('#241c30');
    ctx.fillRect(-46, -36 + run, 16, 36);
    ctx.fillRect(28, -36 - run, 16, 36);
    // body
    ctx.fillStyle = this.c('#3a2c4a');
    ctx.beginPath();
    ctx.ellipse(0, -56, 60, 34, 0, 0, TAU);
    ctx.fill();
    // three heads
    const heads = [
      [34, -96, 0.3],
      [54, -80, 0],
      [20, -78, -0.2],
    ];
    for (const [hx, hy, rot] of heads) {
      ctx.save();
      ctx.translate(hx, hy + Math.sin(this.t * 4 + hx) * 3);
      ctx.rotate(rot);
      ctx.fillStyle = this.c('#4a3a5e');
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 17, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -14);
      ctx.lineTo(-14, -30);
      ctx.lineTo(0, -16);
      ctx.fill();
      ctx.fillStyle = this.c('#2a2036');
      ctx.fillRect(10, 2, 18, 8);
      ctx.fillStyle = this.flash ? '#fff' : this.phase === 2 ? '#ff4a6a' : '#c88aff';
      ctx.beginPath();
      ctx.arc(10, -4, 3.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // mane flames
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const fx2 = -30 + i * 10;
      ctx.fillStyle = `rgba(176,107,255,${0.4 + Math.sin(this.t * 10 + i) * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(fx2 - 6, -84);
      ctx.quadraticCurveTo(fx2, -110 - Math.sin(this.t * 12 + i) * 8, fx2 + 6, -84);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // tail
    ctx.strokeStyle = this.c('#3a2c4a');
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-56, -60);
    ctx.quadraticCurveTo(-90, -90 + Math.sin(this.t * 3) * 10, -80, -120);
    ctx.stroke();
  }
}
