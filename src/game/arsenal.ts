// Weapons unlocked later in the game: the Titan Gauntlets and Reaper's Crescent.
import { audio } from '../engine/audio';
import { clamp, fromAngle, TAU } from '../engine/math';
import { applyDoom, damageEnemy, playerBlast } from './combat';
import type { Enemy } from './enemies/enemy';
import type { Player } from './player';
import { gravityPull, meleeHit, slamCommon, swirl, thrust, WEAPON_INFO, type ActionDef, type Weapon } from './weapons';
import type { World } from './world';

// ---------------------------------------------------------------- Titan Gauntlets

const FIST_COMBO = [
  { dmg: 12, windup: 0.03, active: 0.05, recover: 0.09, lunge: 14, knock: 70 },
  { dmg: 12, windup: 0.03, active: 0.05, recover: 0.09, lunge: 14, knock: 70 },
  { dmg: 14, windup: 0.03, active: 0.05, recover: 0.09, lunge: 16, knock: 80 },
  { dmg: 14, windup: 0.03, active: 0.05, recover: 0.09, lunge: 16, knock: 80 },
  { dmg: 34, windup: 0.1, active: 0.08, recover: 0.24, lunge: 46, knock: 460 },
];

export class Gauntlets implements Weapon {
  readonly id = 'fists' as const;
  readonly name = WEAPON_INFO.fists.name;
  private combo = -1;
  private lastFire = -10;
  private punchT = 0;
  private punchAim = 0;
  private hand = 1;
  private rushT = 0;

  reset(): void {
    this.combo = -1;
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) return this.uppercut(w);
    this.combo = w.time - this.lastFire < 0.45 && this.combo < FIST_COMBO.length - 1 ? this.combo + 1 : 0;
    const i = this.combo;
    const c = FIST_COMBO[i];
    const last = i === FIST_COMBO.length - 1;
    const heavy = w.stats.hammers.has('fists_heavy') ? 1.4 : 1;
    return {
      name: `punch${i}`,
      slot: 'attack',
      windup: c.windup,
      active: c.active,
      recover: c.recover,
      moveMult: 0.35,
      lunge: c.lunge,
      combo: true,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.punchT = last ? 0.16 : 0.09;
        this.punchAim = aim;
        this.hand = -this.hand;
        meleeHit(pp, ww, aim, { dmg: c.dmg * heavy, r: last ? 95 : 78, half: last ? 0.9 : 0.6, knock: c.knock, ttl: c.active, source: 'attack', hitstop: last ? 0.07 : 0.015 });
        ww.addSwipe(pp.x, pp.y, last ? 95 : 76, aim, last ? 0.5 : 0.25, 0.1, last ? '#f0ffb0' : '#c8ff5a', last ? 18 : 9, false, this.hand);
        if (last) {
          ww.camera.kick(fromAngle(aim), 8);
          ww.particles.ring(pp.x + Math.cos(aim) * 70, pp.y + Math.sin(aim) * 70, '#c8ff5a', 60, 0.25, 5);
          if (ww.stats.hammers.has('fists_vamp')) ww.healPlayer(3, false);
        }
        audio.play(last ? 'heavySwing' : 'swing');
      },
    };
  }

  held(p: Player, w: World): ActionDef {
    return this.attack(p, w, false);
  }

  private uppercut(w: World): ActionDef {
    const dmg = 40 * (1 + w.stats.dashStrikeBonus);
    return {
      name: 'uppercut',
      slot: 'attack',
      windup: 0.02,
      active: 0.1,
      recover: 0.22,
      moveMult: 0.2,
      lunge: 60,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.punchT = 0.16;
        this.punchAim = aim;
        meleeHit(pp, ww, aim, { dmg, r: 100, half: 0.8, knock: 520, ttl: 0.1, source: 'attack', hitstop: 0.06 });
        ww.addSwipe(pp.x, pp.y, 100, aim, 0.7, 0.16, '#f0ffb0', 20, false, 1);
        if (ww.stats.hammers.has('fists_quake')) playerBlast(ww, pp.x, pp.y, 110, 30, { color: '#c8ff5a', knock: 300, source: 'attack' });
        audio.play('heavySwing');
        swirl(pp, ww);
      },
    };
  }

  special(_p: Player, w: World): ActionDef {
    const big = w.stats.hammers.has('fists_meteor');
    return {
      name: 'meteorFist',
      slot: 'special',
      windup: 0.08,
      active: 0.14,
      recover: 0.26,
      moveMult: 0.1,
      lunge: 190,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.rushT = 0.14;
        this.punchAim = aim;
        thrust(pp, ww, aim, { dmg: 20, len: 70, width: 30, knock: 200, ttl: 0.14, source: 'special' });
        audio.play('dash');
        ww.later(0.14, () => {
          const r = big ? 175 : 110;
          const x = pp.x + Math.cos(aim) * 40;
          const y = pp.y + Math.sin(aim) * 40;
          gravityPull(ww, x, y, r);
          playerBlast(ww, x, y, r, big ? 90 : 45, { color: '#c8ff5a', knock: 520, source: 'special', noEffects: false });
          ww.particles.burst(x, y, '#8a9a70', 18, 300, { kind: 'smoke', size: 12, gravity: 0, life: 0.6, additive: false });
          ww.camera.shake(0.35);
          audio.play('explode');
        });
      },
    };
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 45, '#c8ff5a', 130);
    w.later(0.12, () => w.particles.ring(p.x, p.y, '#f0ffb0', 190, 0.35, 5));
  }

  update(p: Player, w: World, dt: number): void {
    this.punchT = Math.max(0, this.punchT - dt);
    if (this.rushT > 0) {
      this.rushT -= dt;
      if (Math.random() < 0.9) w.particles.spawn({ kind: 'dot', x: p.x, y: p.y - 24, color: '#c8ff5a', size: 4, life: 0.3, drag: 4 });
    }
  }

  cancel(): void {
    this.punchT = 0;
    this.rushT = 0;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player): void {
    const punching = this.punchT > 0;
    const ext = punching ? Math.sin((1 - this.punchT / 0.16) * Math.PI) * 26 : 0;
    const aim = punching || this.rushT > 0 ? this.punchAim : p.facing;
    for (const side of [-1, 1]) {
      const forward = side === this.hand ? ext : 0;
      const px = Math.cos(aim) * (12 + forward) + Math.cos(aim + Math.PI / 2) * side * 9;
      const py = -24 + Math.sin(aim) * (12 + forward) * 0.6 + Math.sin(aim + Math.PI / 2) * side * 5;
      ctx.fillStyle = '#4a5030';
      ctx.beginPath();
      ctx.arc(px, py, 7.5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#c8ff5a';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (forward > 4) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(200,255,90,0.45)';
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
}

// ---------------------------------------------------------------- Reaper's Crescent

const SCYTHE_COMBO = [
  { dmg: 32, windup: 0.12, active: 0.1, recover: 0.22, r: 135, half: 2.2, lunge: 24, knock: 220 },
  { dmg: 38, windup: 0.12, active: 0.1, recover: 0.22, r: 135, half: 2.2, lunge: 24, knock: 220 },
  { dmg: 52, windup: 0.18, active: 0.14, recover: 0.34, r: 150, half: Math.PI, lunge: 10, knock: 480 },
];

export class Scythe implements Weapon {
  readonly id = 'scythe' as const;
  readonly name = WEAPON_INFO.scythe.name;
  private combo = -1;
  private lastFire = -10;
  private swingT = 0;
  private swingDur = 0.2;
  private swingAim = 0;
  private swingDir = 1;
  private spin = false;
  /** Spectral scythes orbiting the player (Soul Reap). */
  private orbitT = 0;
  private orbitA = 0;
  private orbitHits = new Map<number, number>();

  reset(): void {
    this.combo = -1;
    this.orbitT = 0;
    this.orbitHits.clear();
  }

  private reach(w: World): number {
    return w.stats.hammers.has('scythe_wide') ? 1.3 : 1;
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) return this.reap(w, 45 * (1 + w.stats.dashStrikeBonus), 130, 0.04, 'dashSpin');
    this.combo = w.time - this.lastFire < 0.7 && this.combo < 2 ? this.combo + 1 : 0;
    const i = this.combo;
    const c = SCYTHE_COMBO[i];
    if (i === 2) return this.reap(w, c.dmg, c.r, c.windup, 'reap');
    return {
      name: `sweep${i}`,
      slot: 'attack',
      windup: c.windup,
      active: c.active,
      recover: c.recover,
      moveMult: 0.25,
      lunge: c.lunge,
      combo: true,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.swing(aim, i === 1 ? -1 : 1, 0.2, false);
        const r = c.r * this.reach(ww);
        meleeHit(pp, ww, aim, { dmg: c.dmg, r, half: c.half / 2, knock: c.knock, ttl: c.active, source: 'attack', hitstop: 0.04 });
        if (ww.stats.hammers.has('scythe_doom')) this.markDoom(ww, pp, aim, r, c.half / 2);
        ww.addSwipe(pp.x, pp.y, r, aim, c.half / 2, 0.24, '#b48cff', 20, false, this.swingDir);
        audio.play('heavySwing');
      },
    };
  }

  private markDoom(w: World, p: Player, aim: number, r: number, half: number): void {
    for (const e of w.enemiesInRadius(p.x, p.y, r)) {
      const d = Math.abs(((Math.atan2(e.y - p.y, e.x - p.x) - aim + Math.PI * 3) % TAU) - Math.PI);
      if (d <= half + 0.2) applyDoom(e as Enemy, 60);
    }
  }

  private reap(_w: World, dmg: number, r0: number, windup: number, name: string): ActionDef {
    return {
      name,
      slot: 'attack',
      windup,
      active: 0.14,
      recover: 0.32,
      moveMult: 0.2,
      combo: name === 'reap',
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.swing(aim, 1, 0.3, true);
        const r = r0 * this.reach(ww);
        ww.addHitbox({ team: 'player', shape: { type: 'circle', x: pp.x, y: pp.y, r }, damage: dmg, source: 'attack', knock: 480, ttl: 0.14, hit: new Set(), owner: pp, follow: true, hitstop: 0.06 });
        if (ww.stats.hammers.has('scythe_doom')) this.markDoom(ww, pp, aim, r, Math.PI);
        ww.addSwipe(pp.x, pp.y, r, aim, Math.PI, 0.32, '#d8c0ff', 24, true);
        ww.particles.ring(pp.x, pp.y, '#b48cff', r, 0.3, 5);
        ww.camera.shake(0.2);
        audio.play('heavySwing');
        if (name === 'dashSpin') swirl(pp, ww);
      },
    };
  }

  private swing(aim: number, dir: number, dur: number, spin: boolean): void {
    this.swingAim = aim;
    this.swingDir = dir;
    this.swingDur = dur;
    this.swingT = dur;
    this.spin = spin;
  }

  held(p: Player, w: World): ActionDef {
    return this.attack(p, w, false);
  }

  special(_p: Player, w: World): ActionDef | null {
    if (this.orbitT > 0) return null;
    const dur = w.stats.hammers.has('scythe_long') ? 4 : 2.2;
    return {
      name: 'soulReap',
      slot: 'special',
      windup: 0.12,
      active: 0.04,
      recover: 0.2,
      moveMult: 0.4,
      fire: (pp, ww) => {
        this.orbitT = dur;
        this.orbitHits.clear();
        ww.particles.ring(pp.x, pp.y, '#b48cff', 120, 0.4, 6);
        ww.flashLight(pp.x, pp.y, 260, '#b48cff', 0.3);
        audio.play('cast');
      },
    };
  }

  private blades(w: World): number {
    return w.stats.hammers.has('scythe_orbit') ? 2 : 1;
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 40, '#b48cff', 140);
  }

  update(p: Player, w: World, dt: number): void {
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.orbitT <= 0) return;
    this.orbitT -= dt;
    this.orbitA += dt * 7;
    const n = this.blades(w);
    for (const [id, t] of this.orbitHits) {
      if (t - dt <= 0) this.orbitHits.delete(id);
      else this.orbitHits.set(id, t - dt);
    }
    for (let k = 0; k < n; k++) {
      const a = this.orbitA + (k * TAU) / n;
      const x = p.x + Math.cos(a) * 110;
      const y = p.y + Math.sin(a) * 80;
      if (Math.random() < 0.6) w.particles.spawn({ kind: 'dot', x, y: y - 24, color: '#d8c0ff', size: 3, life: 0.3 });
      for (const e of w.enemies) {
        if (e.dead || e.spawning || this.orbitHits.has(e.id)) continue;
        if (Math.hypot(e.x - x, e.y - y) < e.r + 28) {
          this.orbitHits.set(e.id, 0.3);
          damageEnemy(w, e as Enemy, 20, { source: 'special', from: p, knock: 160, hitstop: 0.02 });
        }
      }
    }
  }

  cancel(): void {
    this.swingT = 0;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player, w: World): void {
    const swinging = this.swingT > 0;
    const k = swinging ? 1 - this.swingT / this.swingDur : 0;
    const arc = this.spin ? TAU : 2.4;
    const ang = swinging ? this.swingAim + this.swingDir * (-arc / 2 + k * arc) : p.facing + 1.1;
    ctx.save();
    ctx.translate(Math.cos(p.facing) * 6, -26);
    ctx.rotate(ang);
    ctx.strokeStyle = '#3a2a40';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(50, 0);
    ctx.stroke();
    ctx.fillStyle = '#d8c8f0';
    ctx.beginPath();
    ctx.moveTo(48, -2);
    ctx.quadraticCurveTo(70, 10, 44, 34);
    ctx.quadraticCurveTo(58, 10, 44, 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b48cff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    if (this.orbitT > 0) {
      // Spectral scythes circling the hero (drawn in the player's local space).
      const n = this.blades(w);
      const fade = clamp(this.orbitT * 3, 0, 1);
      for (let i = 0; i < n; i++) {
        const a = this.orbitA + (i * TAU) / n;
        ctx.save();
        ctx.globalAlpha = fade * 0.9;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(Math.cos(a) * 110, Math.sin(a) * 80 - 24 + p.z);
        ctx.rotate(a * 2);
        ctx.strokeStyle = '#d8c0ff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 1.3);
        ctx.stroke();
        ctx.fillStyle = 'rgba(180,140,255,0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}
