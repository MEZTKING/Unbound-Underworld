import { audio } from '../engine/audio';
import { distToSegment2 } from '../engine/collision';
import { angleTo, clamp, fromAngle, TAU } from '../engine/math';
import { damageEnemy, playerBlast } from './combat';
import type { Enemy } from './enemies/enemy';
import { Projectile } from './entities';
import type { Player } from './player';
import { Gauntlets, Scythe } from './arsenal';
import type { DamageSource, WeaponId } from './types';
import type { World } from './world';

export interface ActionDef {
  name: string;
  slot: 'attack' | 'special' | 'cast' | 'other';
  windup: number;
  active: number;
  recover: number;
  /** Fraction of movement allowed while acting. */
  moveMult: number;
  /** Distance travelled forward during windup + active. */
  lunge?: number;
  /** Recovery may be cancelled straight into the next attack. */
  combo?: boolean;
  lockAim?: boolean;
  fire?: (p: Player, w: World, aim: number) => void;
  update?: (p: Player, w: World, dt: number, t: number) => void;
  /** Charge-and-release actions (bow draw, spear spin). */
  hold?: {
    max: number;
    moveMult: number;
    button: 'attack' | 'special';
    overhold?: number;
    release: (p: Player, w: World, charge: number, holdT: number) => void;
  };
}

export interface Weapon {
  readonly id: WeaponId;
  readonly name: string;
  attack(p: Player, w: World, dashStrike: boolean): ActionDef | null;
  /** Attack button held while idle (auto-attack / charge). */
  held(p: Player, w: World): ActionDef | null;
  special(p: Player, w: World): ActionDef | null;
  /** Landing effect of the jump attack. */
  slam(p: Player, w: World): void;
  update(p: Player, w: World, dt: number): void;
  cancel(p: Player, w: World): void;
  draw(ctx: CanvasRenderingContext2D, p: Player, w: World, front: boolean): void;
  /** Called when entering a new room. */
  reset(): void;
}

export const WEAPON_INFO: Record<WeaponId, { name: string; blurb: string; color: string; cost: number }> = {
  sword: {
    name: 'Nightblade',
    blurb: 'A balanced blade. Three-hit combo; Special: Nova Smash knocks back everything nearby.',
    color: '#ff5a6a',
    cost: 0,
  },
  spear: {
    name: 'Thornspear',
    blurb: 'Long reach thrusts. Hold Attack to charge a spin. Special: throw the spear, press again to recall it.',
    color: '#ffb14a',
    cost: 40,
  },
  bow: {
    name: 'Moonbow',
    blurb: 'Hold Attack to draw; release as it flashes for a Power Shot. Special: a wide volley.',
    color: '#8ad0ff',
    cost: 60,
  },
  fists: {
    name: 'Titan Gauntlets',
    blurb: 'A blur of punches with a crushing fifth blow. Special: Meteor Fist rockets you forward into a shockwave.',
    color: '#c8ff5a',
    cost: 90,
  },
  scythe: {
    name: "Reaper's Crescent",
    blurb: 'Wide, heavy sweeps that end in a full spin. Special: Soul Reap sends a spectral scythe whirling around you.',
    color: '#b48cff',
    cost: 140,
  },
};

export function createWeapon(id: WeaponId): Weapon {
  switch (id) {
    case 'spear':
      return new Spear();
    case 'bow':
      return new Bow();
    case 'fists':
      return new Gauntlets();
    case 'scythe':
      return new Scythe();
    default:
      return new Sword();
  }
}

// ---------------------------------------------------------------- shared helpers

/** Gravity enchant: pulls foes toward a point before an impact lands. */
export function gravityPull(w: World, x: number, y: number, r: number): void {
  const tier = w.stats.ench.gravity ?? 0;
  if (!tier) return;
  const reach = r + 60 + tier * 40;
  for (const e of w.enemiesInRadius(x, y, reach)) {
    if (e.isBoss) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < 20) continue;
    e.knock(x - e.x, y - e.y, Math.min(900, d * 6));
  }
  w.particles.ring(x, y, '#9b7bff', reach, 0.35, 3);
}

/** Swirling enchant: spinning blade strike around the player. */
export function swirl(p: Player, w: World): void {
  const tier = w.stats.ench.swirling ?? 0;
  if (!tier) return;
  const dmg = 10 + tier * 15;
  w.addHitbox({ team: 'player', shape: { type: 'circle', x: p.x, y: p.y, r: 110 }, damage: dmg, source: 'effect', knock: 200, ttl: 0.1, hit: new Set(), owner: p, follow: true });
  w.addSwipe(p.x, p.y, 110, 0, Math.PI, 0.3, '#c9b8ff', 14, true);
}

export function meleeHit(
  p: Player,
  w: World,
  aim: number,
  o: { dmg: number; r: number; half: number; knock: number; ttl: number; source: DamageSource; hitstop?: number; tag?: string },
): void {
  const s = w.stats;
  const h = s.hammers;
  w.addHitbox({
    team: 'player',
    shape: { type: 'arc', x: p.x, y: p.y, r: o.r, angle: aim, half: o.half },
    damage: o.dmg,
    source: o.source,
    knock: o.knock,
    ttl: o.ttl,
    hit: new Set(),
    owner: p,
    follow: true,
    tag: o.tag,
    armorMult: o.source === 'attack' && h.has('sword_breach') ? 4 : 1,
    backstabMult: o.source === 'attack' && h.has('sword_shadow') ? 3 : undefined,
    lifesteal: o.source === 'attack' && h.has('sword_cursed') ? 1 : undefined,
    hitstop: o.hitstop,
  });
}

export function thrust(
  p: Player,
  w: World,
  aim: number,
  o: { dmg: number; len: number; width: number; knock: number; ttl: number; source: DamageSource; armorMult?: number; hitstop?: number },
): void {
  const x2 = p.x + Math.cos(aim) * o.len;
  const y2 = p.y + Math.sin(aim) * o.len;
  w.addHitbox({
    team: 'player',
    shape: { type: 'capsule', x1: p.x, y1: p.y, x2, y2, r: o.width },
    damage: o.dmg,
    source: o.source,
    knock: o.knock,
    ttl: o.ttl,
    hit: new Set(),
    owner: p,
    follow: true,
    offset: { x: Math.cos(aim) * o.len, y: Math.sin(aim) * o.len },
    armorMult: o.armorMult,
    hitstop: o.hitstop,
  });
}

export function slamCommon(p: Player, w: World, dmg: number, color: string, r = 120): void {
  gravityPull(w, p.x, p.y, r);
  w.addHitbox({ team: 'player', shape: { type: 'circle', x: p.x, y: p.y, r }, damage: dmg, source: 'attack', knock: 480, ttl: 0.08, hit: new Set(), owner: p, hitstop: 0.06 });
  w.camera.shake(0.35);
  w.particles.ring(p.x, p.y, color, r, 0.4, 8);
  w.particles.ring(p.x, p.y, '#ffffff', r * 0.6, 0.25, 4);
  w.particles.burst(p.x, p.y, '#9a8a90', 14, 260, { kind: 'smoke', size: 10, gravity: 0, life: 0.6, additive: false });
  w.particles.burst(p.x, p.y, color, 18, 360);
  w.flashLight(p.x, p.y, r * 2, color, 0.3);
  audio.play('explode');
  swirl(p, w);
}

export function playerArrow(
  p: Player,
  w: World,
  x: number,
  y: number,
  aim: number,
  o: { speed: number; dmg: number; range: number; source: DamageSource; pierce?: number; knock?: number; color?: string; crit?: number },
): Projectile {
  const pr = new Projectile(x, y, Math.cos(aim) * o.speed, Math.sin(aim) * o.speed, 'player', o.dmg, o.source);
  pr.style = 'arrow';
  pr.r = 7;
  pr.ttl = o.range / o.speed;
  pr.pierce = o.pierce ?? 0;
  pr.knock = o.knock ?? 90;
  pr.color = o.color ?? '#cfe8ff';
  pr.deflectable = false;
  pr.crit = o.crit ?? 0;
  pr.z = 28;
  pr.owner = p;
  w.projectiles.push(pr);
  return pr;
}

// ---------------------------------------------------------------- Sword

const SWORD_COMBO = [
  { dmg: 20, windup: 0.07, active: 0.09, recover: 0.17, r: 100, half: 1.2, lunge: 28, knock: 120 },
  { dmg: 25, windup: 0.07, active: 0.09, recover: 0.17, r: 100, half: 1.2, lunge: 28, knock: 120 },
  { dmg: 40, windup: 0.15, active: 0.1, recover: 0.3, r: 118, half: 1.5, lunge: 55, knock: 380 },
];

class Sword implements Weapon {
  readonly id = 'sword' as const;
  readonly name = WEAPON_INFO.sword.name;
  private combo = -1;
  private lastFire = -10;
  private swingT = 0;
  private swingDir = 1;
  private swingAim = 0;

  reset(): void {
    this.combo = -1;
  }

  private nextCombo(w: World): number {
    this.combo = w.time - this.lastFire < 0.6 && this.combo < 2 ? this.combo + 1 : 0;
    return this.combo;
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) return this.dashStrike(w);
    const i = this.nextCombo(w);
    const c = SWORD_COMBO[i];
    return {
      name: `slash${i}`,
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
        this.swingT = 0.16;
        this.swingDir = i === 1 ? -1 : 1;
        this.swingAim = aim;
        meleeHit(pp, ww, aim, { dmg: c.dmg, r: c.r, half: c.half, knock: c.knock, ttl: c.active, source: 'attack', hitstop: i === 2 ? 0.06 : 0.025 });
        ww.addSwipe(pp.x, pp.y, c.r, aim, c.half, 0.18, i === 2 ? '#ffd0d6' : '#ff8a9a', i === 2 ? 22 : 15, false, this.swingDir);
        audio.play(i === 2 ? 'heavySwing' : 'swing');
        if (i === 2) ww.camera.kick(fromAngle(aim), 6);
      },
    };
  }

  held(p: Player, w: World): ActionDef {
    return this.attack(p, w, false);
  }

  private dashStrike(w: World): ActionDef {
    const s = w.stats;
    if (s.hammers.has('sword_dashnova')) return this.nova(true);
    const dmg = 35 * (1 + s.dashStrikeBonus);
    return {
      name: 'dashStrike',
      slot: 'attack',
      windup: 0.02,
      active: 0.08,
      recover: 0.2,
      moveMult: 0.2,
      lunge: 40,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.swingT = 0.12;
        this.swingAim = aim;
        thrust(pp, ww, aim, { dmg, len: 125, width: 26, knock: 260, ttl: 0.08, source: 'attack', hitstop: 0.04 });
        ww.addSwipe(pp.x, pp.y, 125, aim, 0.25, 0.15, '#ffe0e6', 18, false, 1);
        audio.play('heavySwing');
        swirl(pp, ww);
      },
    };
  }

  private nova(fromDash = false): ActionDef {
    return {
      name: 'nova',
      slot: 'special',
      windup: fromDash ? 0.05 : 0.2,
      active: 0.08,
      recover: 0.3,
      moveMult: 0.1,
      fire: (pp, ww) => {
        const smash = () => {
          const r = 135;
          gravityPull(ww, pp.x, pp.y, r);
          ww.addHitbox({ team: 'player', shape: { type: 'circle', x: pp.x, y: pp.y, r }, damage: 35, source: 'special', knock: 720, ttl: 0.08, hit: new Set(), owner: pp, follow: true, hitstop: 0.07 });
          ww.particles.ring(pp.x, pp.y, '#ff6a7a', r, 0.35, 10);
          ww.particles.ring(pp.x, pp.y, '#ffffff', r * 0.7, 0.25, 4);
          ww.particles.burst(pp.x, pp.y, '#ff8a9a', 24, 420);
          ww.flashLight(pp.x, pp.y, 300, '#ff5060', 0.25);
          ww.camera.shake(0.3);
          audio.play('explode');
        };
        smash();
        if (ww.stats.hammers.has('sword_double')) ww.later(0.28, smash);
      },
    };
  }

  special(): ActionDef {
    return this.nova(false);
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 40, '#ff6a7a');
  }

  update(_p: Player, _w: World, dt: number): void {
    this.swingT = Math.max(0, this.swingT - dt);
  }

  cancel(): void {
    this.swingT = 0;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player, _w: World): void {
    const swinging = this.swingT > 0;
    const k = swinging ? 1 - this.swingT / 0.16 : 0;
    const ang = swinging ? this.swingAim + this.swingDir * (-1.3 + k * 2.6) : p.facing + 0.9;
    const hx = Math.cos(p.facing) * 8;
    const hy = -24;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.fillStyle = '#3a2228';
    ctx.fillRect(-2, -2, 10, 4);
    ctx.fillStyle = '#c9a050';
    ctx.fillRect(8, -5, 3, 10);
    const g = ctx.createLinearGradient(10, 0, 52, 0);
    g.addColorStop(0, '#e8e0f0');
    g.addColorStop(1, '#ff6a7a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(11, -3);
    ctx.lineTo(48, -2);
    ctx.lineTo(54, 0);
    ctx.lineTo(48, 2);
    ctx.lineTo(11, 3);
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- Spear

const SPEAR_COMBO = [
  { dmg: 25, windup: 0.05, active: 0.08, recover: 0.15, len: 150, lunge: 16 },
  { dmg: 25, windup: 0.05, active: 0.08, recover: 0.15, len: 150, lunge: 16 },
  { dmg: 35, windup: 0.1, active: 0.1, recover: 0.26, len: 170, lunge: 40 },
];

class Spear implements Weapon {
  readonly id = 'spear' as const;
  readonly name = WEAPON_INFO.spear.name;
  private combo = -1;
  private lastFire = -10;
  private thrustT = 0;
  private thrustAim = 0;
  private spinT = 0;
  /** Where the thrown spear is stuck, if thrown. */
  thrown: { x: number; y: number; flying: boolean } | null = null;
  private recalling: { x: number; y: number; hit: Set<number> } | null = null;
  private flyProj: Projectile | null = null;
  charging = 0;

  reset(): void {
    this.combo = -1;
    this.thrown = null;
    this.recalling = null;
    this.flyProj = null;
  }

  private reach(w: World): number {
    return w.stats.hammers.has('spear_reach') ? 1.4 : 1;
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    const armorMult = w.stats.hammers.has('spear_breach') ? 5 : 1;
    if (dashStrike) {
      const dmg = 40 * (1 + w.stats.dashStrikeBonus);
      return {
        name: 'dashStrike',
        slot: 'attack',
        windup: 0.02,
        active: 0.1,
        recover: 0.2,
        moveMult: 0.2,
        lunge: 50,
        lockAim: true,
        fire: (pp, ww, aim) => {
          this.thrustT = 0.14;
          this.thrustAim = aim;
          thrust(pp, ww, aim, { dmg, len: 200 * this.reach(ww), width: 22, knock: 240, ttl: 0.1, source: 'attack', armorMult, hitstop: 0.04 });
          ww.addSwipe(pp.x, pp.y, 200 * this.reach(ww), aim, 0.08, 0.15, '#ffd08a', 12, false, 1);
          audio.play('heavySwing');
          swirl(pp, ww);
        },
      };
    }
    this.combo = w.time - this.lastFire < 0.55 && this.combo < 2 ? this.combo + 1 : 0;
    const c = SPEAR_COMBO[this.combo];
    const i = this.combo;
    return {
      name: `thrust${i}`,
      slot: 'attack',
      windup: c.windup,
      active: c.active,
      recover: c.recover,
      moveMult: 0.3,
      lunge: c.lunge,
      combo: true,
      lockAim: true,
      fire: (pp, ww, aim) => {
        this.lastFire = ww.time;
        this.thrustT = 0.13;
        this.thrustAim = aim;
        const len = c.len * this.reach(ww);
        thrust(pp, ww, aim, { dmg: c.dmg, len, width: 20, knock: i === 2 ? 300 : 110, ttl: c.active, source: 'attack', armorMult, hitstop: i === 2 ? 0.05 : 0.02 });
        ww.addSwipe(pp.x, pp.y, len, aim, 0.06, 0.12, '#ffc070', i === 2 ? 14 : 9, false, 1);
        audio.play(i === 2 ? 'heavySwing' : 'swing');
      },
    };
  }

  held(_p: Player, w: World): ActionDef {
    const vicious = w.stats.hammers.has('spear_spin');
    return {
      name: 'spinCharge',
      slot: 'attack',
      windup: 0,
      active: 0.12,
      recover: 0.25,
      moveMult: 0.2,
      hold: {
        max: vicious ? 0.3 : 0.6,
        moveMult: 0.45,
        button: 'attack',
        overhold: 1.5,
        release: (pp, ww, charge) => {
          this.charging = 0;
          const dmg = (30 + 30 * charge) * (vicious ? 2 : 1);
          const r = 140;
          this.spinT = 0.3;
          ww.addHitbox({ team: 'player', shape: { type: 'circle', x: pp.x, y: pp.y, r }, damage: dmg, source: 'attack', knock: 450, ttl: 0.12, hit: new Set(), owner: pp, follow: true, hitstop: 0.05 });
          ww.addSwipe(pp.x, pp.y, r, 0, Math.PI, 0.3, '#ffc070', 18, true);
          audio.play('heavySwing');
        },
      },
      update: (_pp, _ww, dt) => {
        this.charging += dt;
      },
    };
  }

  special(): ActionDef | null {
    if (this.recalling) return null;
    if (this.thrown) {
      if (this.thrown.flying) return null;
      this.recalling = { x: this.thrown.x, y: this.thrown.y, hit: new Set() };
      this.thrown = null;
      audio.play('cast');
      return null;
    }
    return {
      name: 'throw',
      slot: 'special',
      windup: 0.1,
      active: 0.05,
      recover: 0.2,
      moveMult: 0.3,
      lockAim: true,
      fire: (pp, ww, aim) => {
        const speed = 1400;
        const pr = new Projectile(pp.x + Math.cos(aim) * 20, pp.y + Math.sin(aim) * 20, Math.cos(aim) * speed, Math.sin(aim) * speed, 'player', 50, 'special');
        pr.style = 'spear';
        pr.r = 12;
        pr.ttl = 640 / speed;
        pr.pierce = 99;
        pr.knock = 200;
        pr.color = '#ffc070';
        pr.deflectable = false;
        pr.z = 26;
        const explode = ww.stats.hammers.has('spear_explode');
        pr.onEnd = (www) => {
          this.thrown = { x: pr.x, y: pr.y, flying: false };
          this.flyProj = null;
          gravityPull(www, pr.x, pr.y, 110);
          if (explode) {
            audio.play('explode');
            playerBlast(www, pr.x, pr.y, 115, 50, { color: '#ffa040', knock: 300, source: 'special', noEffects: false });
          }
        };
        this.thrown = { x: pr.x, y: pr.y, flying: true };
        this.flyProj = pr;
        ww.projectiles.push(pr);
        audio.play('heavySwing');
      },
    };
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 35, '#ffb14a', 125);
  }

  update(p: Player, w: World, dt: number): void {
    this.thrustT = Math.max(0, this.thrustT - dt);
    this.spinT = Math.max(0, this.spinT - dt);
    if (p.state !== 'action') this.charging = 0;
    if (this.thrown?.flying && this.flyProj) {
      this.thrown.x = this.flyProj.x;
      this.thrown.y = this.flyProj.y;
    }
    // Walk over a stuck spear to pick it up.
    if (this.thrown && !this.thrown.flying && Math.hypot(p.x - this.thrown.x, p.y - this.thrown.y) < 34) {
      this.thrown = null;
      audio.play('pickup');
    }
    if (this.recalling) {
      const rc = this.recalling;
      const a = angleTo(rc, p);
      const step = 1700 * dt;
      const nx = rc.x + Math.cos(a) * step;
      const ny = rc.y + Math.sin(a) * step;
      const dmg = 30 * (w.stats.hammers.has('spear_recall') ? 3 : 1);
      for (const e of w.enemies) {
        if (e.dead || e.spawning || rc.hit.has(e.id)) continue;
        if (distToSegment2(e, rc, { x: nx, y: ny }) < (e.r + 16) ** 2) {
          rc.hit.add(e.id);
          damageEnemy(w, e as Enemy, dmg, { source: 'special', from: rc, knock: 150, hitstop: 0.03 });
        }
      }
      rc.x = nx;
      rc.y = ny;
      if (Math.random() < 0.7) w.particles.spawn({ kind: 'dot', x: nx, y: ny - 26, color: '#ffc070', size: 3, life: 0.25 });
      if (Math.hypot(p.x - nx, p.y - ny) < 30) {
        this.recalling = null;
        audio.play('pickup');
      }
    }
  }

  cancel(): void {
    this.charging = 0;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player): void {
    // While thrown, the spear is drawn in world space by drawWorld().
    if (this.thrown || this.recalling) return;
    const k = this.thrustT > 0 ? Math.sin((1 - this.thrustT / 0.13) * Math.PI) : 0;
    const ang = this.spinT > 0 ? p.facing + (1 - this.spinT / 0.3) * TAU * 1.5 : this.thrustT > 0 ? this.thrustAim : p.facing + 0.5;
    const charge = clamp(this.charging / 0.6, 0, 1);
    ctx.save();
    ctx.translate(0, -24);
    ctx.rotate(ang);
    ctx.translate(-20 + k * 34, 0);
    ctx.strokeStyle = '#6a4630';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(56, 0);
    ctx.stroke();
    ctx.fillStyle = charge > 0.95 ? '#fff4c0' : '#ffc070';
    ctx.beginPath();
    ctx.moveTo(54, -5);
    ctx.lineTo(74, 0);
    ctx.lineTo(54, 5);
    ctx.fill();
    if (charge > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,190,90,${charge * 0.6})`;
      ctx.beginPath();
      ctx.arc(64, 0, 6 + charge * 8, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /** Draws the stuck or returning spear (world space). */
  drawWorld(ctx: CanvasRenderingContext2D, w: World): void {
    const at = this.recalling ?? (this.thrown && !this.thrown.flying ? this.thrown : null);
    if (!at) return;
    const ang = this.recalling ? angleTo(at, w.player) + Math.PI : -1.2;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 5, 0, 0, TAU);
    ctx.fill();
    ctx.translate(0, -18);
    ctx.rotate(ang);
    ctx.strokeStyle = '#6a4630';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.fillStyle = '#ffc070';
    ctx.beginPath();
    ctx.moveTo(22, -5);
    ctx.lineTo(42, 0);
    ctx.lineTo(22, 5);
    ctx.fill();
    ctx.restore();
    const pulse = 0.5 + Math.sin(w.time * 6) * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,180,80,${pulse * 0.4})`;
    ctx.beginPath();
    ctx.arc(at.x, at.y - 10, 22, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- Bow

class Bow implements Weapon {
  readonly id = 'bow' as const;
  readonly name = WEAPON_INFO.bow.name;
  drawT = 0;
  drawing = false;
  private maxT = 0.55;

  reset(): void {
    this.drawing = false;
    this.drawT = 0;
  }

  private chargeAction(w: World): ActionDef {
    const max = w.stats.hammers.has('bow_draw') ? 0.55 * 0.65 : 0.55;
    this.maxT = max;
    return {
      name: 'draw',
      slot: 'attack',
      windup: 0,
      active: 0.02,
      recover: 0.14,
      moveMult: 0.5,
      hold: {
        max,
        moveMult: 0.45,
        button: 'attack',
        overhold: 2,
        release: (pp, ww, charge, holdT) => {
          this.drawing = false;
          this.drawT = 0;
          const power = holdT >= max && holdT <= max + 0.2;
          let dmg = 20 + 40 * charge;
          if (power) dmg *= ww.stats.hammers.has('bow_power') ? 2.5 : 1.5;
          const speed = 1100 + 900 * charge;
          const aim = pp.aim;
          const shots = ww.stats.hammers.has('bow_twin') ? [-9, 9] : [0];
          for (const off of shots) {
            const ox = Math.cos(aim + Math.PI / 2) * off;
            const oy = Math.sin(aim + Math.PI / 2) * off;
            playerArrow(pp, ww, pp.x + ox + Math.cos(aim) * 20, pp.y + oy + Math.sin(aim) * 20, aim, {
              speed,
              dmg,
              range: 950,
              source: 'attack',
              pierce: power ? 2 : 0,
              color: power ? '#fff0a0' : '#cfe8ff',
              knock: power ? 220 : 90,
            });
          }
          if (power) {
            ww.particles.ring(pp.x, pp.y - 24, '#fff0a0', 50, 0.3, 4);
            ww.particles.text(pp.x, pp.y - 80, 'POWER SHOT', '#fff0a0', 14);
          }
          audio.play('bow');
        },
      },
      update: (_pp, _ww, dt) => {
        this.drawing = true;
        this.drawT += dt;
      },
    };
  }

  attack(_p: Player, w: World, dashStrike: boolean): ActionDef {
    if (dashStrike) {
      const dmg = 40 * (1 + w.stats.dashStrikeBonus);
      return {
        name: 'dashShot',
        slot: 'attack',
        windup: 0.02,
        active: 0.02,
        recover: 0.18,
        moveMult: 0.4,
        fire: (pp, ww, aim) => {
          playerArrow(pp, ww, pp.x + Math.cos(aim) * 20, pp.y + Math.sin(aim) * 20, aim, { speed: 1900, dmg, range: 900, source: 'attack', pierce: 1, color: '#fff0a0', knock: 200 });
          audio.play('bow');
          swirl(pp, ww);
        },
      };
    }
    return this.chargeAction(w);
  }

  held(_p: Player, w: World): ActionDef {
    return this.chargeAction(w);
  }

  special(_p: Player, w: World): ActionDef {
    const wide = w.stats.hammers.has('bow_triple');
    const pierce = w.stats.hammers.has('bow_pierce') ? 3 : 0;
    const n = wide ? 9 : 5;
    const spread = wide ? 0.62 : 0.42;
    return {
      name: 'volley',
      slot: 'special',
      windup: 0.12,
      active: 0.04,
      recover: 0.28,
      moveMult: 0.3,
      lockAim: true,
      fire: (pp, ww, aim) => {
        gravityPull(ww, pp.x + Math.cos(aim) * 220, pp.y + Math.sin(aim) * 220, 80);
        for (let i = 0; i < n; i++) {
          const a = aim - spread + (2 * spread * i) / (n - 1);
          playerArrow(pp, ww, pp.x + Math.cos(a) * 20, pp.y + Math.sin(a) * 20, a, { speed: 1300, dmg: 15, range: 620, source: 'special', pierce, color: '#a8dcff' });
        }
        audio.play('bow');
        audio.play('swing');
      },
    };
  }

  slam(p: Player, w: World): void {
    slamCommon(p, w, 30, '#8ad0ff', 110);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      playerArrow(p, w, p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, a, { speed: 1100, dmg: 12, range: 420, source: 'attack', color: '#a8dcff' });
    }
  }

  update(p: Player): void {
    if (p.state !== 'action') {
      this.drawing = false;
      this.drawT = 0;
    }
  }

  cancel(): void {
    this.drawing = false;
    this.drawT = 0;
  }

  draw(ctx: CanvasRenderingContext2D, p: Player, w: World): void {
    const charge = this.drawing ? clamp(this.drawT / this.maxT, 0, 1) : 0;
    const perfect = this.drawing && this.drawT >= this.maxT && this.drawT <= this.maxT + 0.2;
    ctx.save();
    ctx.translate(Math.cos(p.facing) * 10, -26);
    ctx.rotate(this.drawing ? p.aim : p.facing);
    ctx.strokeStyle = '#4a6a8a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 22, -1.2, 1.2);
    ctx.stroke();
    const pull = -charge * 14;
    ctx.strokeStyle = perfect ? '#fff7c0' : '#dfe8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(-1.2) * 22, Math.sin(-1.2) * 22);
    ctx.lineTo(pull, 0);
    ctx.lineTo(Math.cos(1.2) * 22, Math.sin(1.2) * 22);
    ctx.stroke();
    if (this.drawing) {
      ctx.strokeStyle = perfect ? '#fff7c0' : '#cfe8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pull, 0);
      ctx.lineTo(pull + 34, 0);
      ctx.stroke();
      if (perfect) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,240,160,0.8)';
        ctx.beginPath();
        ctx.arc(pull + 34, 0, 7 + Math.sin(w.time * 40) * 2, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
    if (this.drawing && charge > 0) {
      // Charge meter under the player.
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-20, 10, 40, 5);
      ctx.fillStyle = perfect ? '#fff0a0' : '#8ad0ff';
      ctx.fillRect(-20, 10, 40 * charge, 5);
    }
  }
}

export function isSpear(w: Weapon): w is Spear {
  return w.id === 'spear';
}
