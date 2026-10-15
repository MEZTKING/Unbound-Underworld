// Class weapons added with classes in v0.7: the Starsplitter (a katana, for
// the Duelist), the Thunderbuss (a blunderbuss, for the Gunner) and the
// Riptide Chains (nunchaku, for the Monk). Each follows the combat grammar:
// a chain on taps, a powered attack when Attack is held after a chain hit,
// a special, a dash-strike and a slam.
import { audio } from '../engine/audio';
import { clamp, fromAngle, TAU } from '../engine/math';
import { damageEnemy, deflectProjectiles, playerBlast } from './combat';
import type { Enemy } from './enemies/enemy';
import { Projectile } from './entities';
import type { Player } from './player';
import { gravityPull, meleeHit, poweredAttack, powerLevel, slamCommon, swirl, thrust, WEAPON_INFO, type ActionDef, type Weapon } from './weapons';
import type { World } from './world';

// ---------------------------------------------------------------- Starsplitter (katana)

const KATANA_COMBO = [
  { dmg: 18, windup: 0.04, active: 0.07, recover: 0.12, r: 105, half: 1.0, knock: 90 },
  { dmg: 20, windup: 0.04, active: 0.07, recover: 0.12, r: 105, half: 1.0, knock: 90 },
  { dmg: 32, windup: 0.08, active: 0.08, recover: 0.24, r: 120, half: 1.3, knock: 300 },
];

export class Katana implements Weapon {
  readonly id = 'katana' as const;
  readonly name = WEAPON_INFO.katana.name;
  private combo = -1;
  private lastFire = -10;
  private swingT = 0;
  private swingAim = 0;
  private swingDir = 1;
  private stance = false;

  reset(): void {
    this.combo = -1;
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) {
      const dmg = 40 * (1 + w.stats.dashStrikeBonus);
      return {
        name: 'drawCut',
        slot: 'attack',
        windup: 0.02,
        active: 0.08,
        recover: 0.2,
        moveMult: 0.2,
        lunge: 60,
        lockAim: true,
        fire: (pp, ww, aim) => {
          this.cut(aim, 1, 0.12);
          thrust(pp, ww, aim, { dmg, len: 150, width: 30, knock: 220, ttl: 0.08, source: 'attack', hitstop: 0.04 });
          ww.addSwipe(pp.x, pp.y, 150, aim, 0.15, 0.15, '#e8f0ff', 14, false, 1);
          audio.play('heavySwing');
          swirl(pp, ww);
        },
      };
    }
    this.combo = w.time - this.lastFire < 0.55 && this.combo < KATANA_COMBO.length - 1 ? this.combo + 1 : 0;
    const i = this.combo;
    const c = KATANA_COMBO[i];
    const edge = w.stats.hammers.has('katana_edge') ? 1.3 : 1;
    return {
      name: `cut${i}`,
      slot: 'attack',
      windup: c.windup,
      active: c.active,
      recover: c.recover,
      moveMult: 0.3,
      combo: true,
      chain: i,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.cut(aim, i === 1 ? -1 : 1, 0.12);
        meleeHit(pp, ww, aim, { dmg: c.dmg * edge, r: c.r, half: c.half, knock: c.knock, ttl: c.active, source: 'attack', hitstop: i === 2 ? 0.05 : 0.02 });
        ww.addSwipe(pp.x, pp.y, c.r, aim, c.half, 0.14, i === 2 ? '#ffffff' : '#cfe0ff', i === 2 ? 18 : 11, false, this.swingDir);
        audio.play(i === 2 ? 'heavySwing' : 'swing');
      },
    };
  }

  /** Ready stance: while held, any hit is parried (it drains the guard meter); release with a quick cut. */
  held(_p: Player, _w: World): ActionDef {
    return {
      name: 'stance',
      slot: 'attack',
      windup: 0,
      active: 0.08,
      recover: 0.2,
      moveMult: 0.2,
      hold: {
        max: 0.3,
        moveMult: 0.25,
        button: 'attack',
        overhold: 1.6,
        release: (pp, ww) => {
          this.stance = false;
          this.cut(pp.aim, 1, 0.12);
          meleeHit(pp, ww, pp.aim, { dmg: 26, r: 115, half: 1.1, knock: 200, ttl: 0.08, source: 'attack', hitstop: 0.04 });
          ww.addSwipe(pp.x, pp.y, 115, pp.aim, 1.1, 0.14, '#ffffff', 14, false, 1);
          audio.play('heavySwing');
        },
      },
      update: (pp, _ww, dt) => {
        this.stance = true;
        if (pp.guardMeter > 0) {
          pp.parryT = Math.max(pp.parryT, 0.05);
          pp.guardMeter = Math.max(0, pp.guardMeter - 25 * dt);
        }
      },
    };
  }

  /** Moonlit Iaido: blink through foes along your aim; delayed slashes follow. */
  powered(_p: Player, _w: World, step: number): ActionDef {
    return poweredAttack('iaido', '#e8f0ff', powerLevel(step, KATANA_COMBO.length), (pp, ww, power, aim) => {
      this.combo = -1;
      const sx = pp.x;
      const sy = pp.y;
      // Blink as far as the floor allows, up to 260 px.
      let d = 260;
      while (d > 40 && !ww.lineOfSight(sx, sy, sx + Math.cos(aim) * d, sy + Math.sin(aim) * d, pp.r)) d -= 30;
      const ex = clamp(sx + Math.cos(aim) * d, 30, ww.room.w - 30);
      const ey = clamp(sy + Math.sin(aim) * d, 30, ww.room.h - 30);
      ww.addHitbox({ team: 'player', shape: { type: 'capsule', x1: sx, y1: sy, x2: ex, y2: ey, r: 36 }, damage: 50 * power, source: 'attack', knock: 120, ttl: 0.06, hit: new Set(), owner: pp, hitstop: 0.06 });
      pp.x = ex;
      pp.y = ey;
      pp.iframes = Math.max(pp.iframes, 0.3);
      this.cut(aim, 1, 0.16);
      ww.addSwipe(sx, sy, d, aim, 0.05, 0.25, '#ffffff', 16, false, 1);
      ww.particles.directional(sx, sy - 24, aim, 0.05, '#e8f0ff', 24, d * 3);
      audio.play('dash');
      const follow = 25 * power * (ww.stats.hammers.has('katana_iaido') ? 2 : 1);
      ww.later(0.28, () => {
        for (const e of ww.enemiesInRadius((sx + ex) / 2, (sy + ey) / 2, d / 2 + 40)) {
          damageEnemy(ww, e, follow, { source: 'attack', from: pp, knock: 160 });
          ww.addSwipe(e.x, e.y, 60, Math.random() * TAU, 0.4, 0.15, '#ffffff', 10, false, 1);
        }
        audio.play('heavySwing');
      });
    });
  }

  /** Thousand Cuts: a flurry of slashes in a cone. */
  special(_p: Player, w: World): ActionDef {
    const n = w.stats.hammers.has('katana_flurry') ? 10 : 6;
    return {
      name: 'thousandCuts',
      slot: 'special',
      windup: 0.1,
      active: 0.05,
      recover: 0.3,
      moveMult: 0.3,
      lockAim: true,
      fire: (pp, ww, aim) => {
        for (let i = 0; i < n; i++) {
          ww.later(i * 0.06, () => {
            const a = aim + (Math.random() - 0.5) * 1.2;
            meleeHit(pp, ww, a, { dmg: 9, r: 150, half: 0.25, knock: 40, ttl: 0.05, source: 'special', hitstop: 0.01 });
            ww.addSwipe(pp.x, pp.y, 150, a, 0.25, 0.1, '#e8f0ff', 8, false, i % 2 ? 1 : -1);
            audio.play('swing', 0.6);
          });
        }
      },
    };
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 40, '#cfe0ff');
  }

  private cut(aim: number, dir: number, t: number): void {
    this.swingAim = aim;
    this.swingDir = dir;
    this.swingT = t;
  }

  update(p: Player, _w: World, dt: number): void {
    this.swingT = Math.max(0, this.swingT - dt);
    if (p.state !== 'action') this.stance = false;
  }

  cancel(): void {
    this.swingT = 0;
    this.stance = false;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player): void {
    const swinging = this.swingT > 0;
    const k = swinging ? 1 - this.swingT / 0.12 : 0;
    const ang = swinging ? this.swingAim + this.swingDir * (-1.4 + k * 2.8) : this.stance ? p.facing + 2.6 : p.facing + 0.8;
    ctx.save();
    ctx.translate(Math.cos(p.facing) * 8, -24);
    ctx.rotate(ang);
    ctx.fillStyle = '#20202a';
    ctx.fillRect(-4, -1.5, 13, 3);
    ctx.fillStyle = '#c8a050';
    ctx.fillRect(8, -4, 2.5, 8);
    // A long, faintly curved blade.
    ctx.fillStyle = '#e8f0ff';
    ctx.beginPath();
    ctx.moveTo(10, -1.8);
    ctx.quadraticCurveTo(36, -4.5, 62, -3);
    ctx.lineTo(60, 0.4);
    ctx.quadraticCurveTo(36, -1, 10, 1.8);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Thunderbuss (blunderbuss)

function pellet(p: Player, w: World, aim: number, dmg: number, speed: number, range: number, color: string, knock: number, pierce = 0): void {
  const pr = new Projectile(p.x + Math.cos(aim) * 26, p.y + Math.sin(aim) * 26, Math.cos(aim) * speed, Math.sin(aim) * speed, 'player', dmg, 'attack');
  pr.style = 'orb';
  pr.r = pierce > 0 ? 8 : 5;
  pr.ttl = range / speed;
  pr.pierce = pierce;
  pr.knock = knock;
  pr.color = color;
  pr.deflectable = false;
  pr.z = 24;
  pr.owner = p;
  w.projectiles.push(pr);
}

export class Thunderbuss implements Weapon {
  readonly id = 'blunderbuss' as const;
  readonly name = WEAPON_INFO.blunderbuss.name;
  private combo = -1;
  private lastFire = -10;
  private kickT = 0;
  private kickAim = 0;
  private keg: { x: number; y: number; t: number } | null = null;

  reset(): void {
    this.combo = -1;
    this.keg = null;
  }

  private blast(p: Player, w: World, aim: number, n: number, spread: number, dmg: number, range: number, knock: number): void {
    // Point-blank shots hit harder: pellets carry their damage best up close.
    for (let i = 0; i < n; i++) {
      const a = aim - spread + (2 * spread * (i + 0.5)) / n + (Math.random() - 0.5) * 0.05;
      pellet(p, w, a, dmg, 1300 + Math.random() * 200, range, '#ffc070', knock);
    }
    w.particles.directional(p.x + Math.cos(aim) * 30, p.y + Math.sin(aim) * 30 - 24, aim, spread, '#ffd090', 12, 500);
    w.particles.burst(p.x + Math.cos(aim) * 30, p.y + Math.sin(aim) * 30, '#8a7a70', 6, 140, { kind: 'smoke', size: 8, gravity: 0, life: 0.5, additive: false });
    w.flashLight(p.x + Math.cos(aim) * 30, p.y + Math.sin(aim) * 30, 160, '#ffb060', 0.12);
    this.kickT = 0.12;
    this.kickAim = aim;
    audio.play('explode', 0.5);
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) {
      const dmg = 38 * (1 + w.stats.dashStrikeBonus);
      return {
        name: 'bayonet',
        slot: 'attack',
        windup: 0.02,
        active: 0.08,
        recover: 0.2,
        moveMult: 0.2,
        lunge: 50,
        lockAim: true,
        fire: (pp, ww, aim) => {
          thrust(pp, ww, aim, { dmg, len: 120, width: 24, knock: 260, ttl: 0.08, source: 'attack', hitstop: 0.04 });
          ww.addSwipe(pp.x, pp.y, 120, aim, 0.1, 0.14, '#ffd090', 12, false, 1);
          audio.play('heavySwing');
          swirl(pp, ww);
        },
      };
    }
    this.combo = w.time - this.lastFire < 0.7 && this.combo < 2 ? this.combo + 1 : 0;
    const i = this.combo;
    const slug = i === 2;
    const extra = w.stats.hammers.has('buss_pellets') ? 3 : 0;
    const slugBoost = w.stats.hammers.has('buss_slug');
    return {
      name: slug ? 'slug' : `spread${i}`,
      slot: 'attack',
      windup: 0.06,
      active: 0.03,
      recover: slug ? 0.35 : 0.22,
      moveMult: 0.5,
      combo: true,
      chain: i,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        if (slug) {
          pellet(pp, ww, aim, 40 * (slugBoost ? 1.5 : 1), 1700, 700, '#fff0b0', 260, slugBoost ? 6 : 3);
          this.kickT = 0.14;
          this.kickAim = aim;
          ww.flashLight(pp.x + Math.cos(aim) * 30, pp.y + Math.sin(aim) * 30, 180, '#ffd090', 0.14);
          audio.play('explode', 0.6);
        } else this.blast(pp, ww, aim, 5 + extra, 0.32, 7, 380, 70);
        pp.knock(-Math.cos(aim), -Math.sin(aim), slug ? 160 : 90);
      },
    };
  }

  /** Aimed slug: hold to steady a long-range shot. */
  held(_p: Player, _w: World): ActionDef {
    return {
      name: 'aimedSlug',
      slot: 'attack',
      windup: 0,
      active: 0.04,
      recover: 0.3,
      moveMult: 0.4,
      hold: {
        max: 0.6,
        moveMult: 0.4,
        button: 'attack',
        overhold: 1.5,
        release: (pp, ww, charge) => {
          pellet(pp, ww, pp.aim, 30 + 40 * charge, 1900, 950, '#fff0b0', 240, 2);
          this.kickT = 0.14;
          this.kickAim = pp.aim;
          audio.play('explode', 0.6);
        },
      },
    };
  }

  /** Grapeshot Cannon: a huge cone blast that throws you back. */
  powered(_p: Player, _w: World, step: number): ActionDef {
    return poweredAttack('grapeshot', '#ffb060', powerLevel(step, 3), (pp, ww, power, aim) => {
      this.combo = -1;
      this.blast(pp, ww, aim, 14, 0.6, 10 * power, 460, 260);
      pp.knock(-Math.cos(aim), -Math.sin(aim), 520);
      ww.camera.kick(fromAngle(aim + Math.PI), 10);
      ww.camera.shake(0.35);
    });
  }

  /** Powder Keg: lob a keg that blows up after a short fuse. */
  special(_p: Player, w: World): ActionDef | null {
    if (this.keg) return null;
    const big = w.stats.hammers.has('buss_keg') ? 1.5 : 1;
    return {
      name: 'powderKeg',
      slot: 'special',
      windup: 0.1,
      active: 0.04,
      recover: 0.24,
      moveMult: 0.4,
      lockAim: true,
      fire: (pp, ww, aim) => {
        const tx = clamp(pp.x + Math.cos(aim) * 260, 40, ww.room.w - 40);
        const ty = clamp(pp.y + Math.sin(aim) * 260, 40, ww.room.h - 40);
        const pr = new Projectile(pp.x, pp.y, 0, 0, 'player', 0, 'special');
        pr.lob = { sx: pp.x, sy: pp.y, tx, ty, t: 0, dur: 0.5, h: 90 };
        pr.style = 'bomb';
        pr.color = '#ffb060';
        pr.r = 11;
        pr.deflectable = false;
        pr.owner = pp;
        pr.onEnd = (www) => {
          this.keg = { x: tx, y: ty, t: 0.9 };
          www.particles.ring(tx, ty, '#ffb060', 140 * big, 0.9, 3);
        };
        ww.projectiles.push(pr);
        audio.play('swing');
      },
    };
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 38, '#ffb060');
  }

  update(p: Player, w: World, dt: number): void {
    this.kickT = Math.max(0, this.kickT - dt);
    if (this.keg) {
      this.keg.t -= dt;
      if (Math.random() < 0.5) w.particles.spawn({ kind: 'spark', x: this.keg.x, y: this.keg.y, z: 20, vz: 120, color: '#ffd090', size: 2, life: 0.3 });
      if (this.keg.t <= 0) {
        const r = 140 * (w.stats.hammers.has('buss_keg') ? 1.5 : 1);
        gravityPull(w, this.keg.x, this.keg.y, r);
        playerBlast(w, this.keg.x, this.keg.y, r, 70, { color: '#ffb060', knock: 520, source: 'special' });
        w.camera.shake(0.35);
        audio.play('explode');
        this.keg = null;
      }
    }
    void p;
  }

  cancel(): void {
    this.kickT = 0;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player, w: World): void {
    const aim = this.kickT > 0 ? this.kickAim : p.facing;
    const kick = this.kickT > 0 ? -this.kickT * 40 : 0;
    ctx.save();
    ctx.translate(Math.cos(aim) * (10 + kick), -22 + Math.sin(aim) * 4);
    ctx.rotate(aim);
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(-12, -3, 14, 7);
    ctx.fillStyle = '#b08a4a';
    ctx.fillRect(0, -3, 26, 5);
    ctx.beginPath();
    ctx.moveTo(26, -3);
    ctx.lineTo(32, -6);
    ctx.lineTo(32, 5);
    ctx.lineTo(26, 2);
    ctx.fill();
    ctx.restore();
    if (this.keg) {
      ctx.save();
      ctx.translate(this.keg.x - p.x, this.keg.y - p.y);
      ctx.fillStyle = '#6a4024';
      ctx.fillRect(-9, -18, 18, 18);
      ctx.fillStyle = Math.floor(w.time * 10) % 2 ? '#ffd090' : '#ff6a3a';
      ctx.fillRect(-2, -24, 4, 6);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- Riptide Chains (nunchaku)

const CHAIN_COMBO = [
  { dmg: 9, r: 85, half: 0.8 },
  { dmg: 9, r: 85, half: 0.8 },
  { dmg: 10, r: 88, half: 0.8 },
  { dmg: 10, r: 88, half: 0.8 },
  { dmg: 11, r: 90, half: 0.9 },
  { dmg: 26, r: 110, half: Math.PI },
];

export class RiptideChains implements Weapon {
  readonly id = 'nunchaku' as const;
  readonly name = WEAPON_INFO.nunchaku.name;
  private combo = -1;
  private lastFire = -10;
  private swingT = 0;
  private swingAim = 0;
  private swingDir = 1;
  private spinning = false;
  private tick = 0;

  reset(): void {
    this.combo = -1;
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) {
      const dmg = 36 * (1 + w.stats.dashStrikeBonus);
      return {
        name: 'flyingKick',
        slot: 'attack',
        windup: 0.02,
        active: 0.1,
        recover: 0.2,
        moveMult: 0.2,
        lunge: 60,
        lockAim: true,
        fire: (pp, ww, aim) => {
          thrust(pp, ww, aim, { dmg, len: 110, width: 30, knock: 300, ttl: 0.1, source: 'attack', hitstop: 0.04 });
          ww.addSwipe(pp.x, pp.y, 110, aim, 0.2, 0.15, '#bfe8ff', 14, false, 1);
          audio.play('heavySwing');
          swirl(pp, ww);
        },
      };
    }
    this.combo = w.time - this.lastFire < 0.45 && this.combo < CHAIN_COMBO.length - 1 ? this.combo + 1 : 0;
    const i = this.combo;
    const c = CHAIN_COMBO[i];
    const last = i === CHAIN_COMBO.length - 1;
    const flow = w.stats.hammers.has('chain_flow') ? 1.25 : 1;
    return {
      name: `strike${i}`,
      slot: 'attack',
      windup: 0.025,
      active: 0.05,
      recover: last ? 0.22 : 0.07,
      moveMult: 0.4,
      combo: true,
      chain: i,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.whip(aim, i % 2 ? -1 : 1, last ? 0.2 : 0.08, last);
        meleeHit(pp, ww, aim, { dmg: c.dmg * flow, r: c.r, half: c.half, knock: last ? 260 : 50, ttl: 0.05, source: 'attack', hitstop: last ? 0.05 : 0.012 });
        ww.addSwipe(pp.x, pp.y, c.r, aim, c.half, last ? 0.24 : 0.1, last ? '#e0f6ff' : '#5ac8ff', last ? 18 : 8, last, this.swingDir);
        audio.play(last ? 'heavySwing' : 'swing', last ? 1 : 0.7);
      },
    };
  }

  /** Windmill: spin the chains to bat away shots and pepper anything close. */
  held(_p: Player, _w: World): ActionDef {
    return {
      name: 'windmill',
      slot: 'attack',
      windup: 0,
      active: 0.05,
      recover: 0.15,
      moveMult: 0.4,
      hold: { max: 0.3, moveMult: 0.45, button: 'attack', overhold: 2.5, release: () => (this.spinning = false) },
      update: (pp, ww, dt) => {
        this.spinning = true;
        this.whip(this.swingAim + dt * 20, 1, 0.08, true);
        deflectProjectiles(ww, pp.x, pp.y, 70, 'player');
        this.tick -= dt;
        if (this.tick <= 0) {
          this.tick = 0.15;
          ww.addHitbox({ team: 'player', shape: { type: 'circle', x: pp.x, y: pp.y, r: 80 }, damage: 6, source: 'attack', knock: 60, ttl: 0.05, hit: new Set(), owner: pp, follow: true });
        }
      },
    };
  }

  /** Whirlpool: pull foes in and strike them over and over. */
  powered(_p: Player, w: World, step: number): ActionDef {
    const strong = w.stats.hammers.has('chain_whirl');
    return poweredAttack('whirlpool', '#5ac8ff', powerLevel(step, CHAIN_COMBO.length), (pp, ww, power) => {
      this.combo = -1;
      const r = strong ? 330 : 220;
      gravityPull(ww, pp.x, pp.y, r);
      for (const e of ww.enemiesInRadius(pp.x, pp.y, r)) if (!e.isBoss) e.knock(pp.x - e.x, pp.y - e.y, 380);
      ww.particles.ring(pp.x, pp.y, '#5ac8ff', r, 0.4, 5);
      const hits = strong ? 8 : 5;
      for (let i = 0; i < hits; i++) {
        ww.later(0.08 + i * 0.1, () => {
          this.whip(Math.random() * TAU, 1, 0.1, true);
          ww.addHitbox({ team: 'player', shape: { type: 'circle', x: pp.x, y: pp.y, r: 120 }, damage: 12 * power, source: 'attack', knock: 40, ttl: 0.05, hit: new Set(), owner: pp, follow: true, hitstop: 0.015 });
          ww.addSwipe(pp.x, pp.y, 120, Math.random() * TAU, Math.PI, 0.12, '#5ac8ff', 12, true);
          audio.play('swing', 0.7);
        });
      }
    });
  }

  /** Tidal Snap: a long lash that drags the first foe it hits to you. */
  special(_p: Player, w: World): ActionDef {
    const stun = w.stats.hammers.has('chain_snap');
    return {
      name: 'tidalSnap',
      slot: 'special',
      windup: 0.1,
      active: 0.08,
      recover: 0.26,
      moveMult: 0.3,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.whip(aim, 1, 0.16, false);
        const len = 260;
        let best: Enemy | null = null;
        let bestD = Infinity;
        for (const e of ww.enemiesInRadius(pp.x + Math.cos(aim) * len * 0.5, pp.y + Math.sin(aim) * len * 0.5, len * 0.6)) {
          const along = (e.x - pp.x) * Math.cos(aim) + (e.y - pp.y) * Math.sin(aim);
          const side = Math.abs(-(e.x - pp.x) * Math.sin(aim) + (e.y - pp.y) * Math.cos(aim));
          if (along > 0 && along < len && side < 40 + e.r && along < bestD) {
            best = e;
            bestD = along;
          }
        }
        ww.addSwipe(pp.x, pp.y, len, aim, 0.05, 0.18, '#5ac8ff', 10, false, 1);
        if (best) {
          damageEnemy(ww, best, 30, { source: 'special', from: pp, knock: 0 });
          if (!best.isBoss) {
            best.knock(pp.x - best.x, pp.y - best.y, 760);
            if (stun) best.status.stun = Math.max(best.status.stun ?? 0, 1.5);
          }
          ww.particles.burst(best.x, best.y - 20, '#5ac8ff', 12, 260);
        }
        audio.play('heavySwing');
      },
    };
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 38, '#5ac8ff');
  }

  private whip(aim: number, dir: number, t: number, spin: boolean): void {
    this.swingAim = aim;
    this.swingDir = dir;
    this.swingT = t;
    this.spinning = spin || this.spinning;
  }

  update(p: Player, _w: World, dt: number): void {
    this.swingT = Math.max(0, this.swingT - dt);
    if (p.state !== 'action') this.spinning = false;
  }

  cancel(): void {
    this.swingT = 0;
    this.spinning = false;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player, w: World): void {
    const active = this.swingT > 0 || this.spinning;
    const ang = this.spinning ? w.time * 24 : active ? this.swingAim + this.swingDir * (1 - this.swingT / 0.1) * 1.5 : p.facing + 1.2;
    const hx = Math.cos(p.facing) * 8;
    const hy = -24;
    const mx = hx + Math.cos(ang) * 14;
    const my = hy + Math.sin(ang) * 14 * 0.7;
    const ex = mx + Math.cos(ang + (active ? 0.3 : 1.2)) * 16;
    const ey = my + Math.sin(ang + (active ? 0.3 : 1.2)) * 16 * 0.7 + (active ? 0 : 6);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.strokeStyle = '#8ad8ff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + (ex - mx) * 0.3, my + (ey - my) * 0.3);
    ctx.stroke();
    ctx.strokeStyle = '#3a2a20';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mx + (ex - mx) * 0.3, my + (ey - my) * 0.3);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (this.spinning) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(90,200,255,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(hx, hy, 30, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
