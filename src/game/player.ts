import { audio } from '../engine/audio';
import { angleOf, clamp, damp, fromAngle, fx, len, TAU } from '../engine/math';
import { Actor } from './actor';
import { useArtifact } from './artifacts';
import { GODS } from './boons';
import { castLanded, damageEnemy, dashTriggered, deflectProjectiles } from './combat';
import type { Enemy } from './enemies/enemy';
import { Pickup, Projectile } from './entities';
import type { PlayerStats } from './stats';
import type { World } from './world';
import { createWeapon, type ActionDef, type Weapon } from './weapons';
import type { WeaponId } from './types';

export const MOVE_SPEED = 290;
const DASH_SPEED = 1080;
const DASH_TIME = 0.16;
const JUMP_TIME = 0.52;
const JUMP_HEIGHT = 58;
const BUFFER = 0.2;

type PlayerState = 'free' | 'dash' | 'action' | 'slam' | 'falling' | 'dead';

interface ActionRun {
  def: ActionDef;
  t: number;
  fired: boolean;
  aim: number;
  holdT: number;
  released: boolean;
}

export class Player extends Actor {
  team = 'player' as const;
  state: PlayerState = 'free';
  weapon: Weapon;
  aim = -Math.PI / 2;
  moveDir = { x: 0, y: 0 };
  /** Height above the ground while jumping. */
  z = 0;
  jumpT = -1;
  jumpCd = 0;
  dashT = 0;
  dashDir = { x: 0, y: 1 };
  dashCharges = 1;
  dashRechargeT = 0;
  sinceDash = 99;
  iframes = 0;
  action: ActionRun | null = null;
  buf = { attack: 0, special: 0, cast: 0, dash: 0, jump: 0 };
  castAmmo = 1;
  castRegenT = 0;
  holyShield = true;
  recoverPool = 0;
  recoverT = 0;
  slamT = 0;
  slamFromZ = 0;
  fallT = 0;
  safe = { x: 0, y: 0 };
  safeT = 0;
  lavaT = 0;
  walk = 0;
  t = 0;
  potionCd = 0;
  souls = 0;
  artifactCd = [0, 0, 0];
  /** Rampaging (attack speed) and other timed self-buffs. */
  rampageT = 0;
  hasteT = 0;
  ironHideT = 0;
  hurtT = 0;
  /** Void Prism channel time remaining. */
  beamT = 0;
  beamTick = 0;
  /** Slowed by webs while > 0. */
  webT = 0;
  private noAmmoMsgT = -10;

  constructor(weapon: WeaponId) {
    super();
    this.r = 15;
    this.height = 50;
    this.weapon = createWeapon(weapon);
  }

  /** Re-syncs derived values after the build changes. */
  applyStats(s: PlayerStats, fullHeal = false): void {
    const oldMax = this.maxHp;
    this.maxHp = s.maxHp;
    if (fullHeal) this.hp = this.maxHp;
    else if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
    this.hp = Math.min(this.hp, this.maxHp);
    this.dashCharges = Math.min(this.dashCharges, s.dashCharges);
    this.castAmmo = Math.min(this.castAmmo, s.castAmmo);
  }

  get airborne(): boolean {
    return this.z > 6;
  }

  get invuln(): boolean {
    return this.state === 'dash' || this.iframes > 0 || this.state === 'dead' || this.state === 'falling';
  }

  get attackSpeed(): number {
    return 1;
  }

  speedMult(s: PlayerStats): number {
    return s.moveSpeed * (this.hasteT > 0 ? 1.4 : 1) * (this.webT > 0 ? 0.45 : 1) * (this.beamT > 0 ? 0.5 : 1);
  }

  actionSpeed(s: PlayerStats): number {
    return s.attackSpeed + (this.rampageT > 0 ? 0.5 : 0) + (this.hasteT > 0 ? 0.4 : 0);
  }

  update(w: World, dt: number): void {
    const s = w.stats;
    const inp = w.input;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    this.potionCd = Math.max(0, this.potionCd - dt);
    this.rampageT = Math.max(0, this.rampageT - dt);
    this.hasteT = Math.max(0, this.hasteT - dt);
    this.ironHideT = Math.max(0, this.ironHideT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.webT = Math.max(0, this.webT - dt);
    this.sinceDash += dt;
    for (let i = 0; i < 3; i++) this.artifactCd[i] = Math.max(0, this.artifactCd[i] - dt);
    if (this.recoverT > 0) {
      this.recoverT -= dt;
      if (this.recoverT <= 0) this.recoverPool = 0;
    }
    for (const k of Object.keys(this.buf) as (keyof Player['buf'])[]) this.buf[k] = Math.max(0, this.buf[k] - dt);

    if (this.state === 'dead') {
      this.vx = this.vy = 0;
      return;
    }
    if (this.state === 'falling') {
      this.fallT -= dt;
      if (this.fallT <= 0) {
        this.state = 'free';
        this.x = this.safe.x;
        this.y = this.safe.y;
        this.z = 0;
        this.iframes = 1;
        w.hurtPlayer(Math.max(5, Math.round(this.maxHp * 0.08)), null, true);
      }
      return;
    }

    // Dash recharge
    if (this.dashCharges < s.dashCharges) {
      this.dashRechargeT -= dt;
      if (this.dashRechargeT <= 0) {
        this.dashCharges++;
        this.dashRechargeT = s.dashRecharge;
      }
    }
    // Cast regeneration (Auto Reload)
    if (s.castRegen > 0 && this.castAmmo < s.castAmmo) {
      this.castRegenT += dt;
      if (this.castRegenT >= s.castRegen) {
        this.castRegenT = 0;
        this.castAmmo++;
      }
    }

    // ---- input
    const mv = inp.moveVector();
    this.moveDir = mv;
    this.updateAim(w);
    if (inp.pressed('attack')) this.buf.attack = BUFFER;
    if (inp.pressed('special')) this.buf.special = BUFFER;
    if (inp.pressed('cast')) this.buf.cast = BUFFER;
    if (inp.pressed('dash')) this.buf.dash = 0.15;
    if (inp.pressed('jump')) this.buf.jump = 0.15;
    if (inp.pressed('potion')) this.drinkPotion(w);
    if (inp.pressed('artifact1')) useArtifact(w, 0);
    if (inp.pressed('artifact2')) useArtifact(w, 1);
    if (inp.pressed('artifact3')) useArtifact(w, 2);

    this.weapon.update(this, w, dt);

    // ---- dash
    if (this.buf.dash > 0 && this.dashCharges > 0 && this.state !== 'slam' && (this.state !== 'dash' || this.dashT < 0.05)) {
      this.startDash(w);
    }
    // ---- jump
    if (this.buf.jump > 0 && this.z <= 0 && this.jumpT < 0 && this.jumpCd <= 0 && (this.state === 'free' || this.state === 'dash' || this.actionCancelable())) {
      this.buf.jump = 0;
      if (this.state === 'action') this.endAction();
      this.jumpT = 0;
      audio.play('dash');
      w.particles.burst(this.x, this.y, '#8a7a90', 8, 120, { kind: 'smoke', size: 8, gravity: 0, life: 0.5, additive: false });
    }

    let vx = 0;
    let vy = 0;
    const speed = MOVE_SPEED * this.speedMult(s);
    switch (this.state) {
      case 'dash': {
        vx = this.dashDir.x * DASH_SPEED;
        vy = this.dashDir.y * DASH_SPEED;
        this.dashT -= dt;
        if (s.dashPower?.god === 'athena') deflectProjectiles(w, this.x, this.y, this.r + 40, 'player');
        if (Math.random() < 0.8) {
          w.particles.spawn({
            kind: 'dot',
            x: this.x + fx.range(-6, 6),
            y: this.y - fx.range(5, 40) - this.z,
            size: fx.range(2, 4),
            color: s.dashPower ? GODS[s.dashPower.god].color : '#ff7a5c',
            life: 0.3,
            drag: 6,
          });
        }
        if (this.dashT <= 0) this.endDash(w);
        break;
      }
      case 'slam': {
        this.slamT -= dt;
        const k = clamp(this.slamT / 0.12, 0, 1);
        this.z = this.slamFromZ * k;
        if (this.slamT <= 0) {
          this.z = 0;
          this.jumpT = -1;
          this.jumpCd = 0.2;
          this.state = 'free';
          this.weapon.slam(this, w);
          this.iframes = Math.max(this.iframes, 0.12);
        }
        break;
      }
      case 'action': {
        const a = this.action!;
        const def = a.def;
        const sp = this.actionSpeed(s);
        if (def.hold && !a.released) {
          a.holdT += dt * sp;
          const held = def.hold.button === 'attack' ? inp.down('attack') : inp.down('special');
          if (!held || a.holdT >= def.hold.max + (def.hold.overhold ?? 0.6)) {
            a.released = true;
            a.aim = this.aim;
            def.hold.release(this, w, clamp(a.holdT / def.hold.max, 0, 1), a.holdT);
            a.t = def.windup + def.active;
            a.fired = true;
          }
          vx = mv.x * speed * def.hold.moveMult;
          vy = mv.y * speed * def.hold.moveMult;
          if (!def.lockAim) a.aim = this.aim;
          break;
        }
        a.t += dt * sp;
        if (!a.fired && a.t >= def.windup) {
          a.fired = true;
          def.fire?.(this, w, a.aim);
        }
        def.update?.(this, w, dt, a.t);
        const total = def.windup + def.active + def.recover;
        let move = def.moveMult;
        if (def.lunge && a.t < def.windup + def.active) {
          const lv = def.lunge / Math.max(0.05, def.windup + def.active);
          vx += Math.cos(a.aim) * lv;
          vy += Math.sin(a.aim) * lv;
          move *= 0.3;
        }
        vx += mv.x * speed * move;
        vy += mv.y * speed * move;
        const inRecover = a.t >= def.windup + def.active;
        if (inRecover && (this.buf.special > 0 || this.buf.cast > 0 || (def.combo && this.buf.attack > 0))) {
          this.endAction();
          this.tryStartAction(w);
        } else if (a.t >= total) {
          this.endAction();
        }
        break;
      }
      case 'free': {
        if (this.buf.attack > 0 && this.airborne) {
          this.buf.attack = 0;
          this.state = 'slam';
          this.slamT = 0.12;
          this.slamFromZ = this.z;
          audio.play('heavySwing');
        } else if (!this.airborne) this.tryStartAction(w);
        else if (this.buf.cast > 0 || this.buf.special > 0) this.tryStartAction(w);
        if (this.state === 'free') {
          vx = mv.x * speed;
          vy = mv.y * speed;
        }
        break;
      }
    }

    // ---- jump arc
    if (this.jumpT >= 0 && this.state !== 'slam') {
      this.jumpT += dt;
      const k = this.jumpT / JUMP_TIME;
      this.z = 4 * JUMP_HEIGHT * k * (1 - k);
      if (k >= 1) {
        this.z = 0;
        this.jumpT = -1;
        this.jumpCd = 0.12;
        w.particles.burst(this.x, this.y, '#8a7a90', 6, 100, { kind: 'smoke', size: 7, gravity: 0, life: 0.4, additive: false });
      }
    }

    if (this.state !== 'dash') {
      // Smooth acceleration feels better than instant velocity changes.
      const rate = this.state === 'free' ? 22 : 30;
      this.vx = damp(this.vx, vx, rate, dt);
      this.vy = damp(this.vy, vy, rate, dt);
    } else {
      this.vx = vx;
      this.vy = vy;
    }
    if (len(mv) > 0.1 && this.state === 'free') this.walk += dt * 10;
    w.moveActor(this, dt);

    // ---- ground hazards
    if (this.z <= 0 && this.state !== 'dash' && this.state !== 'slam') {
      const g = w.groundAt(this.x, this.y);
      if (g === 'pit') {
        this.state = 'falling';
        this.fallT = 0.55;
        this.action = null;
        audio.play('death', 0.5);
        return;
      }
      if (g === 'lava') {
        this.lavaT -= dt;
        if (this.lavaT <= 0) {
          this.lavaT = 0.45;
          w.hurtPlayer(4, null, true);
          w.particles.burst(this.x, this.y, '#ff8a2a', 10, 160);
        }
      } else {
        this.lavaT = 0;
        this.safeT -= dt;
        if (this.safeT <= 0 && w.groundAt(this.x + 24, this.y) === 'floor' && w.groundAt(this.x - 24, this.y) === 'floor' && w.groundAt(this.x, this.y + 24) === 'floor' && w.groundAt(this.x, this.y - 24) === 'floor') {
          this.safe = { x: this.x, y: this.y };
          this.safeT = 0.25;
        }
      }
    }

    // Facing follows aim while acting, otherwise movement.
    if (this.state === 'action' || this.state === 'slam' || w.input.aimSource() !== 'move') this.facing = this.action?.aim ?? this.aim;
    else if (len(mv) > 0.1) this.facing = angleOf(mv);
  }

  private updateAim(w: World): void {
    const inp = w.input;
    const src = inp.aimSource();
    if (src === 'mouse') {
      const m = w.camera.screenToWorld(inp.mouse);
      this.aim = Math.atan2(m.y - (this.y - 24), m.x - this.x);
    } else if (src === 'stick') {
      const v = inp.stickAim();
      this.aim = Math.atan2(v.y, v.x);
    } else if (src === 'auto') {
      // Touch play: lock onto the nearest foe, otherwise face where you move.
      if (len(this.moveDir) > 0.2) this.aim = angleOf(this.moveDir);
      const target = w.nearestEnemy(this.x, this.y, 600);
      if (target) this.aim = Math.atan2(target.y - this.y, target.x - this.x);
    } else {
      if (len(this.moveDir) > 0.2) this.aim = angleOf(this.moveDir);
      // Gentle auto-aim toward a nearby foe in front when not using a mouse.
      const target = w.nearestEnemy(this.x, this.y, 420, (e) => Math.abs(((Math.atan2(e.y - this.y, e.x - this.x) - this.aim + Math.PI * 3) % TAU) - Math.PI) < 0.6);
      if (target) this.aim = Math.atan2(target.y - this.y, target.x - this.x);
    }
  }

  private actionCancelable(): boolean {
    return this.state === 'action' && !!this.action && this.action.t >= this.action.def.windup + this.action.def.active;
  }

  private tryStartAction(w: World): void {
    let def: ActionDef | null = null;
    if (this.buf.cast > 0) {
      this.buf.cast = 0;
      if (this.castAmmo > 0) def = this.castAction();
      else if (this.t - this.noAmmoMsgT > 0.8) {
        this.noAmmoMsgT = this.t;
        audio.play('deny');
        w.particles.text(this.x, this.y - 70, 'No shards', '#ff8080', 14);
      }
    } else if (this.buf.special > 0) {
      this.buf.special = 0;
      def = this.weapon.special(this, w);
    } else if (this.buf.attack > 0) {
      this.buf.attack = 0;
      def = this.weapon.attack(this, w, this.sinceDash < 0.2);
    } else if (w.input.down('attack') && this.state === 'free') {
      def = this.weapon.held(this, w);
    }
    if (!def) return;
    this.state = 'action';
    this.action = { def, t: 0, fired: false, aim: this.aim, holdT: 0, released: false };
    if (def.windup <= 0 && !def.hold) {
      this.action.fired = true;
      def.fire?.(this, w, this.aim);
    }
  }

  private endAction(): void {
    this.action = null;
    this.state = 'free';
  }

  private startDash(w: World): void {
    this.buf.dash = 0;
    const s = w.stats;
    if (this.state === 'action') {
      this.weapon.cancel(this, w);
      this.action = null;
    }
    const mv = this.moveDir;
    this.dashDir = len(mv) > 0.1 ? { x: mv.x / len(mv), y: mv.y / len(mv) } : fromAngle(this.facing);
    if (this.dashCharges >= s.dashCharges) this.dashRechargeT = s.dashRecharge;
    this.dashCharges--;
    this.state = 'dash';
    this.dashT = DASH_TIME;
    audio.play('dash');
    if (this.recoverPool > 0) {
      w.healPlayer(this.recoverPool, true);
      this.recoverPool = 0;
      this.recoverT = 0;
    }
    dashTriggered(w, 'start');
  }

  private endDash(w: World): void {
    this.state = 'free';
    this.sinceDash = 0;
    this.iframes = Math.max(this.iframes, 0.05);
    dashTriggered(w, 'end');
  }

  private castAction(): ActionDef {
    return {
      name: 'cast',
      slot: 'cast',
      windup: 0.05,
      active: 0.02,
      recover: 0.18,
      moveMult: 0.55,
      fire: (p, w, aim) => fireShard(p, w, aim),
    };
  }

  drinkPotion(w: World): void {
    const s = w.stats;
    if (this.potionCd > 0 || this.state === 'dead') {
      audio.play('deny');
      return;
    }
    if (this.hp >= this.maxHp) {
      audio.play('deny');
      w.particles.text(this.x, this.y - 70, 'Full health', '#a0ffa0', 14);
      return;
    }
    this.potionCd = s.potionCooldown;
    w.healPlayer(this.maxHp * s.potionHeal, true);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      w.particles.spawn({ kind: 'dot', x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 14, z: 10, vz: fx.range(60, 160), color: '#7dff8a', size: 3, life: 0.8, drag: 2 });
    }
  }

  onHurt(dmg: number): void {
    this.flash = 0.15;
    this.hurtT = 0.4;
    this.iframes = 0.75;
    if (this.state === 'action') {
      this.action = null;
      this.state = 'free';
    }
    this.recoverPool += dmg;
    this.recoverT = 1.6;
  }

  // ---------------------------------------------------------------- drawing

  draw(ctx: CanvasRenderingContext2D, w: World): void {
    const blink = this.iframes > 0 && this.state !== 'dash' && Math.floor(this.t * 20) % 2 === 0;
    const falling = this.state === 'falling';
    ctx.save();
    ctx.translate(this.x, this.y);
    // Shadow shrinks while airborne.
    const sh = 1 - Math.min(0.5, this.z / 120);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17 * sh, 7 * sh, 0, 0, TAU);
    ctx.fill();
    if (falling) {
      const k = this.fallT / 0.55;
      ctx.scale(k, k);
      ctx.globalAlpha = k;
    }
    ctx.translate(0, -this.z);
    if (blink) ctx.globalAlpha = 0.45;

    const face = this.facing;
    const fxDir = Math.cos(face);
    const back = Math.sin(face) < -0.2;
    const bob = this.state === 'free' && len(this.moveDir) > 0.1 ? Math.sin(this.walk) * 2 : Math.sin(this.t * 3) * 0.8;
    const lean = this.state === 'dash' ? 0.25 * Math.sign(this.dashDir.x || 1) : 0;
    const white = this.flash > 0;

    if (!back) this.weapon.draw(ctx, this, w, true);
    ctx.save();
    ctx.rotate(lean);
    // Cloak
    const cloak = white ? '#fff' : '#2b1830';
    const trim = white ? '#fff' : '#c2263a';
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(-17, -24 + bob, -10, -38 + bob);
    ctx.lineTo(10, -38 + bob);
    ctx.quadraticCurveTo(17, -24 + bob, 14, -2);
    ctx.quadraticCurveTo(0, 3, -14, -2);
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(0, 3, 14, -2);
    ctx.stroke();
    // Tunic / chest
    ctx.fillStyle = white ? '#fff' : '#5b1a26';
    ctx.beginPath();
    ctx.moveTo(-7, -36 + bob);
    ctx.lineTo(7, -36 + bob);
    ctx.lineTo(5, -14 + bob);
    ctx.lineTo(-5, -14 + bob);
    ctx.fill();
    // Head
    ctx.fillStyle = white ? '#fff' : '#e8c7a8';
    ctx.beginPath();
    ctx.arc(fxDir * 2, -45 + bob, 8, 0, TAU);
    ctx.fill();
    // Hair of embers
    ctx.fillStyle = white ? '#fff' : '#1a0d14';
    ctx.beginPath();
    ctx.arc(fxDir * 1, -48 + bob, 8.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    if (!back) {
      ctx.fillStyle = '#ffd1a0';
      ctx.fillRect(fxDir * 4 - 1.5, -46 + bob, 2, 2);
      ctx.fillRect(fxDir * 4 + 2.5 * Math.sign(fxDir || 1), -46 + bob, 2, 2);
    }
    // Flame laurel
    const fl = 0.6 + Math.sin(this.t * 14) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,${90 + Math.floor(fl * 80)},40,0.9)`;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      const hx = i * 4 + fxDir;
      ctx.moveTo(hx - 2.5, -52 + bob);
      ctx.quadraticCurveTo(hx, -60 - fl * 6 - (2 - Math.abs(i)) * 3 + bob, hx + 2.5, -52 + bob);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    if (back) this.weapon.draw(ctx, this, w, false);

    if (this.ironHideT > 0) {
      ctx.strokeStyle = `rgba(190,200,220,${0.4 + Math.sin(this.t * 8) * 0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -25, 30, 0, TAU);
      ctx.stroke();
    }
    if (this.holyShield && w.stats.holyShield) {
      ctx.strokeStyle = `rgba(242,211,138,${0.35 + Math.sin(this.t * 4) * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -24, 26, 34, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Fires a cast shard from the player along `aim`. */
export function fireShard(p: Player, w: World, aim: number): void {
  const s = w.stats;
  if (p.castAmmo <= 0) return;
  p.castAmmo--;
  const god = s.castPower?.god ?? null;
  const artemis = god === 'artemis';
  const range = god === 'aphrodite' ? 280 : artemis ? 720 : 480;
  const speed = artemis ? 1250 : 1050;
  const dmg = artemis ? s.castPower!.power : 50;
  const sx = p.x + Math.cos(aim) * 20;
  const sy = p.y + Math.sin(aim) * 20 - 6;
  const pr = new Projectile(sx, sy, Math.cos(aim) * speed, Math.sin(aim) * speed, 'player', dmg, 'cast');
  pr.style = 'shard';
  pr.r = 10;
  pr.color = god ? GODS[god].color : '#ff3050';
  pr.ttl = range / speed;
  pr.deflectable = false;
  pr.god = god;
  pr.z = 26;
  if (artemis) {
    pr.homing = 7;
    pr.pierce = 3;
  }
  let lodged = false;
  pr.onHit = (ww, target) => {
    damageEnemy(ww, target as Enemy, pr.damage, { source: 'cast', from: { x: pr.x - pr.vx * 0.05, y: pr.y - pr.vy * 0.05 }, knock: 160, hitstop: 0.04 });
    if (artemis) return;
    lodged = true;
    castLanded(ww, target.x, target.y, target as Enemy);
    if (!target.dead) {
      const pk = new Pickup('shard', target.x, target.y, 1);
      pk.attached = target;
      pk.t = 0;
      ww.pickups.push(pk);
    } else ww.dropShard(target.x, target.y);
  };
  pr.onEnd = (ww) => {
    if (lodged) return;
    castLanded(ww, pr.x, pr.y, null);
    ww.dropShard(pr.x, pr.y);
  };
  w.projectiles.push(pr);
  audio.play('cast');
  w.particles.directional(sx, sy, aim, 0.3, pr.color, 8, 400);
}
