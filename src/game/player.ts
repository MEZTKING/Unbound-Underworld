import { audio } from '../engine/audio';
import { angleDiff, angleOf, clamp, damp, fromAngle, fx, len, TAU } from '../engine/math';
import { Actor } from './actor';
import { useArtifact } from './artifacts';
import { GODS } from './boons';
import { CHARACTER_BY_ID, type CharacterDef, type CharacterId, type Palette } from './characters';
import type { HeroLook } from './meta';
import { castLanded, damageEnemy, dashTriggered, deflect, deflectProjectiles } from './combat';
import type { Enemy } from './enemies/enemy';
import { Pickup, Projectile } from './entities';
import { prefs } from './prefs';
import { WRATH_MAX } from './progression';
import type { PlayerStats } from './stats';
import type { World } from './world';
import { createWeapon, WEAPON_INFO, type ActionDef, type Weapon } from './weapons';
import type { WeaponId } from './types';

export const MOVE_SPEED = 290;
const DASH_SPEED = 1080;
const DASH_TIME = 0.16;
const JUMP_TIME = 0.52;
const JUMP_HEIGHT = 58;
/** Share of walking speed kept while acting (see the action state). */
const BASIC_MOVE = 0.85;
const CAST_MOVE = 0.7;
const SKILL_MOVE = 0.45;
const HOLD_MOVE = 0.6;
const BUFFER = 0.2;
/** Guard: meter, refill per second (after a short pause), front arc (half-angle). */
export const GUARD_MAX = 100;
const GUARD_REGEN = 35;
const GUARD_ARC = 1.22;
const GUARD_BREAK = 0.8;
/** Parry timing: the window opened by pressing Guard, and the lock after a miss. */
const PARRY_WINDOW = 0.15;
const PARRY_LOCK = 0.35;
const RIPOSTE_TIME = 1;
/** Evasive sidestep (ranged classes): length, and the Perfect Dodge window. */
const SIDESTEP_TIME = 0.11;
const PERFECT_DODGE = 0.15;
/** Holding Attack this long after a chain hit starts the powered attack. */
const POWER_HOLD = 0.22;
/** Seconds without landing a hit before the combo meter drops. */
const COMBO_TIMEOUT = 2.5;

type PlayerState = 'free' | 'dash' | 'action' | 'slam' | 'falling' | 'dead';

interface ActionRun {
  def: ActionDef;
  t: number;
  fired: boolean;
  aim: number;
  holdT: number;
  released: boolean;
  /** The attack right after a parry: all its hits are critical. */
  riposte?: boolean;
}

let heroLooks: Partial<Record<CharacterId, HeroLook>> = {};

/** Points heroes at the save's customised looks (kept live: edits apply at once). */
export function useHeroLooks(looks: Partial<Record<CharacterId, HeroLook>>): void {
  heroLooks = looks;
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
  /** Ultimate gauge (0..WRATH_MAX). */
  wrath = 0;
  /** Attacks fired, for Awakened-weapon waves. */
  private attackCount = 0;
  hero: CharacterDef;
  private noAmmoMsgT = -10;
  /** Distance run since the last footstep puff. */
  private stride = 0;
  // ---- guard
  /** Guard meter (0..GUARD_MAX): blocking drains it; empty = Guard Break. */
  guardMeter = GUARD_MAX;
  /** Holding Guard and blocking. */
  blocking = false;
  /** Seconds left in the parry window opened by pressing Guard. */
  parryT = 0;
  /** A parry that catches nothing locks parries (not blocks) for a moment. */
  private parryLock = 0;
  /** After a parry: the next attack is a sure critical. */
  riposteT = 0;
  /** Staggered after the guard breaks. */
  guardBreakT = 0;
  /** The opening moments of a sidestep, when a hit becomes a Perfect Dodge. */
  evadeT = 0;
  private evadeCd = 0;
  private sinceBlock = 9;
  /** How long Attack has been held since it was last pressed (−1 = released or used). */
  private attackHold = -1;
  /** When the last chain hit ended, for combo specials. */
  private lastChainT = -10;
  // ---- combo meter
  /** Hits landed in a row without getting hurt. */
  combo = 0;
  comboT = 0;

  /** The hero's colours and headwear, with the player's customisation applied. */
  get palette(): Palette {
    const look = heroLooks[this.hero.id];
    return look ? { ...this.hero.palette, ...look } : this.hero.palette;
  }

  constructor(weapon: WeaponId, character: CharacterId = 'kael') {
    super();
    this.r = 15;
    this.height = 50;
    this.weapon = createWeapon(weapon);
    this.hero = CHARACTER_BY_ID[character] ?? CHARACTER_BY_ID.kael;
  }

  gainWrath(n: number): void {
    if (this.state === 'dead') return;
    const before = this.wrath;
    this.wrath = Math.min(WRATH_MAX, this.wrath + n);
    if (before < WRATH_MAX && this.wrath >= WRATH_MAX) audio.play('boon', 0.5);
  }

  get wrathReady(): boolean {
    return this.wrath >= WRATH_MAX;
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
    this.riposteT = Math.max(0, this.riposteT - dt);
    this.guardBreakT = Math.max(0, this.guardBreakT - dt);
    this.parryLock = Math.max(0, this.parryLock - dt);
    this.evadeT = Math.max(0, this.evadeT - dt);
    this.evadeCd = Math.max(0, this.evadeCd - dt);
    this.comboT += dt;
    if (this.combo > 0 && this.comboT > COMBO_TIMEOUT) this.combo = 0;
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
    // Input directions are on screen; the 3D view turns the room, so turn them too.
    const mv = w.camera.screenDirToWorld(inp.moveVector());
    this.moveDir = mv;
    this.updateAim(w);
    if (inp.pressed('attack')) {
      this.buf.attack = BUFFER;
      this.attackHold = 0;
    } else if (this.attackHold >= 0 && inp.down('attack')) this.attackHold += dt;
    else this.attackHold = -1;
    if (inp.pressed('special')) this.buf.special = BUFFER;
    // Mechanics you haven't unlocked yet simply don't respond.
    if (inp.pressed('cast') && s.canCast) this.buf.cast = BUFFER;
    if (inp.pressed('dash')) this.buf.dash = 0.15;
    if (inp.pressed('jump') && s.canJump) this.buf.jump = 0.15;
    if (inp.pressed('potion') && s.canPotion) this.drinkPotion(w);
    for (let i = 0; i < 3; i++) if (inp.pressed(`artifact${i + 1}` as 'artifact1') && i < s.artifactSlots) useArtifact(w, i);
    if (inp.pressed('wrath') && s.canWrath) this.unleashWrath(w);
    if (s.canGuard) this.updateGuard(w, dt);
    else this.blocking = false;

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
          if (!a.released) def.update?.(this, w, dt, a.holdT);
          // Drawing a bow or charging a spin: you can still walk.
          const holdMove = Math.max(def.hold.moveMult, HOLD_MOVE);
          vx = mv.x * speed * holdMove;
          vy = mv.y * speed * holdMove;
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
        // Attack held after a chain hit: the weapon's powered attack.
        if (def.chain !== undefined && a.fired && this.attackHold >= POWER_HOLD && this.weapon.powered) {
          const pw = this.weapon.powered(this, w, def.chain);
          if (pw) {
            this.attackHold = -1;
            this.weapon.cancel(this, w);
            this.endAction();
            this.startAction(w, pw);
            break;
          }
        }
        if (def.chain !== undefined) this.lastChainT = this.t;
        // Movement stays free while fighting: basic attack chains keep most of
        // your speed and never push you forward; only kit moves (dash-strikes,
        // specials like Meteor Fist) lunge.
        const basic = def.slot === 'attack' && !!def.combo;
        let move = basic ? Math.max(def.moveMult, BASIC_MOVE) : def.slot === 'cast' ? Math.max(def.moveMult, CAST_MOVE) : def.lunge ? def.moveMult : Math.max(def.moveMult, SKILL_MOVE);
        if (def.lunge && !basic && a.t < def.windup + def.active) {
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
        if (this.guardBreakT > 0) break;
        if (this.blocking) {
          // Guarding: a slow shuffle; a tower shield bashes on Attack.
          if (this.buf.attack > 0 && this.hero.guard === 'shield') {
            this.buf.attack = 0;
            this.startAction(w, this.shieldBash());
          } else {
            vx = mv.x * speed * 0.4;
            vy = mv.y * speed * 0.4;
          }
          break;
        }
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
    // The stride follows actual speed (so it also animates while attacking),
    // and running on the ground kicks up dust.
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 20 && this.state !== 'dash') this.walk += dt * Math.min(sp, 420) * 0.036;
    if (this.z <= 0 && sp > 150 && this.state !== 'dash') {
      this.stride += sp * dt;
      if (this.stride > 62) {
        this.stride = 0;
        w.particles.spawn({
          kind: 'smoke',
          x: this.x - (this.vx / sp) * 6 + fx.range(-4, 4),
          y: this.y - (this.vy / sp) * 6 + fx.range(-3, 3),
          vx: -this.vx * 0.08,
          vy: -this.vy * 0.08,
          vz: 18,
          size: fx.range(4, 6),
          size2: 11,
          color: '#8a7a80',
          life: 0.4,
          drag: 4,
          additive: false,
        });
      }
    } else this.stride = 40;
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
      // Aim from the chest (24 up), where the cursor is naturally compared.
      const m = w.camera.screenToWorld(inp.mouse);
      const up = w.camera.lift;
      this.aim = Math.atan2(m.y - (this.y + up.y * 24), m.x - (this.x + up.x * 24));
    } else if (src === 'stick') {
      const v = w.camera.screenDirToWorld(inp.stickAim());
      this.aim = Math.atan2(v.y, v.x);
    } else if (src === 'auto') {
      // Touch play. The joystick wins: while moving, aim where you move, only
      // nudged onto a foe roughly in that direction. Standing still, lock onto
      // the nearest foe.
      if (len(this.moveDir) > 0.2) {
        this.aim = angleOf(this.moveDir);
        const ahead = w.nearestEnemy(this.x, this.y, 520, (e) => Math.abs(angleDiff(Math.atan2(e.y - this.y, e.x - this.x), this.aim)) < 0.5);
        if (ahead) this.aim = Math.atan2(ahead.y - this.y, ahead.x - this.x);
      } else {
        const target = w.nearestEnemy(this.x, this.y, 600);
        if (target) this.aim = Math.atan2(target.y - this.y, target.x - this.x);
      }
    } else {
      if (len(this.moveDir) > 0.2) this.aim = angleOf(this.moveDir);
      // Gentle auto-aim toward a nearby foe in front when not using a mouse.
      const target = prefs.aimAssist && w.nearestEnemy(this.x, this.y, 420, (e) => Math.abs(((Math.atan2(e.y - this.y, e.x - this.x) - this.aim + Math.PI * 3) % TAU) - Math.PI) < 0.6);
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
        w.particles.text(this.x, this.y, 70, 'No shards', '#ff8080', 14);
      }
    } else if (this.buf.special > 0) {
      this.buf.special = 0;
      def = this.weapon.special(this, w);
      // Special straight out of a chain: faster and harder (a combo special).
      if (def && this.t - this.lastChainT < 0.6) {
        def = { ...def, windup: def.windup * 0.7, comboSpecial: true };
        w.particles.text(this.x, this.y, 84, 'COMBO', '#ffd890', 14);
      }
    } else if (this.buf.attack > 0) {
      this.buf.attack = 0;
      def = this.weapon.attack(this, w, this.sinceDash < 0.2);
    } else if (w.input.down('attack') && this.state === 'free') {
      def = this.weapon.held(this, w);
    }
    if (!def) return;
    if (def.slot === 'attack' && w.stats.forgeTier >= 3) def = this.awaken(def);
    this.startAction(w, def);
  }

  private startAction(w: World, def: ActionDef): void {
    this.state = 'action';
    // The first attack after a parry is a riposte: every hit it lands is a critical.
    const riposte = this.riposteT > 0 && (def.slot === 'attack' || def.slot === 'special');
    if (riposte) {
      this.riposteT = 0;
      w.particles.text(this.x, this.y, 80, 'RIPOSTE', '#fff0b0', 18);
    }
    const run: ActionRun = { def, t: 0, fired: false, aim: this.aim, holdT: 0, released: false, riposte };
    this.action = run;
    if (def.windup <= 0 && !def.hold) {
      run.fired = true;
      def.fire?.(this, w, this.aim);
    }
  }

  // ---------------------------------------------------------------- guard

  private updateGuard(w: World, dt: number): void {
    const inp = w.input;
    const style = this.hero.guard;
    if (inp.pressed('guard') && this.guardBreakT <= 0) {
      if (style === 'evade') this.sidestep(w);
      else {
        if (this.actionCancelable()) {
          this.weapon.cancel(this, w);
          this.endAction();
        }
        if (this.parryLock <= 0) this.parryT = this.parryWindow(w);
      }
    }
    if (this.parryT > 0) {
      this.parryT -= dt;
      if (this.parryT <= 0) this.parryLock = PARRY_LOCK;
    }
    const free = this.state === 'free' || this.actionCancelable();
    this.blocking = style !== 'evade' && inp.down('guard') && this.guardBreakT <= 0 && this.guardMeter > 0 && !this.airborne && free;
    if (this.blocking && this.state === 'action') {
      this.weapon.cancel(this, w);
      this.endAction();
    }
    this.sinceBlock = this.blocking ? 0 : this.sinceBlock + dt;
    if (this.sinceBlock > 0.8 && this.guardMeter < GUARD_MAX) this.guardMeter = Math.min(GUARD_MAX, this.guardMeter + GUARD_REGEN * dt);
  }

  /** The parry window: widest for blades and brawlers, a little wider on touch and with Assist. */
  private parryWindow(w: World): number {
    const style = this.hero.guard;
    const base = style === 'catch' ? 0.2 : style === 'parry' ? 0.18 : PARRY_WINDOW;
    return base + (w.input.lastTouchUse > w.input.lastMouseUse ? 0.03 : 0) + (prefs.assist ? 0.07 : 0);
  }

  /** Ranged classes guard with a quick sidestep. */
  private sidestep(w: World): void {
    if (this.evadeCd > 0 || this.airborne || this.state === 'dash' || this.state === 'slam') return;
    if (this.state === 'action') {
      this.weapon.cancel(this, w);
      this.action = null;
    }
    const mv = this.moveDir;
    this.dashDir = len(mv) > 0.1 ? { x: mv.x / len(mv), y: mv.y / len(mv) } : fromAngle(this.facing + Math.PI / 2);
    this.state = 'dash';
    this.dashT = SIDESTEP_TIME;
    this.evadeT = PERFECT_DODGE;
    this.evadeCd = 0.45;
    this.iframes = Math.max(this.iframes, 0.25);
    audio.play('dash');
  }

  /**
   * Guards, parries or dodges an incoming hit from `src`. Returns the share of
   * the damage that still lands (0 = none). Ground shockwaves can't be guarded.
   */
  defend(w: World, src: { x: number; y: number }, dmg: number, o: { proj?: Projectile; ground?: boolean } = {}): number {
    if (this.state === 'dead') return 1;
    if (this.evadeT > 0) {
      this.evadeT = 0;
      this.perfectDodge(w);
      return 0;
    }
    if (this.invuln || o.ground) return 1;
    if (this.parryT > 0) {
      this.parry(w, src, o.proj);
      return 0;
    }
    const from = o.proj ?? src;
    const front = Math.abs(angleDiff(this.facing, Math.atan2(from.y - this.y, from.x - this.x))) < GUARD_ARC;
    if (!this.blocking || !front) return 1;
    const style = this.hero.guard;
    this.guardMeter -= dmg * (style === 'shield' ? 1.2 : style === 'mist' ? 1 : 2);
    if (style === 'mist') w.gainSouls(Math.max(1, Math.round(dmg * 0.6)));
    const a = Math.atan2(from.y - this.y, from.x - this.x);
    w.particles.directional(this.x + Math.cos(a) * 20, this.y + Math.sin(a) * 20 - 24, a, 0.9, '#ffe0a0', 10, 300);
    audio.play('deflect');
    this.knock(-Math.cos(a), -Math.sin(a), 120);
    if (this.guardMeter <= 0) {
      this.guardMeter = 0;
      this.guardBreakT = GUARD_BREAK;
      this.blocking = false;
      w.particles.text(this.x, this.y, 80, 'GUARD BREAK', '#ff8a6a', 18);
      audio.play('armorBreak');
      return 0.5;
    }
    w.particles.text(this.x, this.y, 70, 'BLOCK', '#ffe0a0', 14);
    return style === 'shield' ? 0 : 0.2;
  }

  private parry(w: World, src: { x: number; y: number }, proj?: Projectile): void {
    this.parryT = 0;
    this.parryLock = 0;
    this.riposteT = RIPOSTE_TIME;
    this.iframes = Math.max(this.iframes, 0.25);
    this.guardMeter = Math.min(GUARD_MAX, this.guardMeter + 20);
    if (proj) deflect(w, proj, 'player');
    else if ('cancelTelegraphs' in src && !(src as Enemy).dead) {
      // Foes stagger; guardians only flinch.
      const e = src as Enemy;
      e.status.stun = Math.max(e.status.stun ?? 0, e.isBoss ? 0.4 : 1);
      e.cancelTelegraphs(w);
      e.knock(e.x - this.x, e.y - this.y, e.isBoss ? 120 : 320);
    }
    w.slowMotion(0.25, 0.15);
    w.camera.shake(0.2);
    w.flashLight(this.x, this.y, 260, '#fff0b0', 0.2);
    w.particles.ring(this.x, this.y, '#fff0b0', 70, 0.3, 6);
    w.particles.text(this.x, this.y, 90, 'PARRY!', '#fff0b0', 22);
    if (w.stats.canWrath) this.gainWrath(8);
    audio.play('deflect');
    audio.play('select');
  }

  private perfectDodge(w: World): void {
    this.iframes = Math.max(this.iframes, 0.4);
    this.riposteT = RIPOSTE_TIME;
    w.slowMotion(0.35, 0.6);
    w.particles.ring(this.x, this.y, '#bfe6ff', 60, 0.35, 5);
    w.particles.text(this.x, this.y, 90, 'PERFECT DODGE', '#bfe6ff', 20);
    if (w.stats.canWrath) this.gainWrath(6);
    audio.play('select');
  }

  /** The tower shield's bash: a short shove that staggers. */
  private shieldBash(): ActionDef {
    return {
      name: 'shieldBash',
      slot: 'attack',
      windup: 0.06,
      active: 0.08,
      recover: 0.28,
      moveMult: 0.3,
      lunge: 30,
      lockAim: true,
      fire: (p, w, aim) => {
        const x = p.x + Math.cos(aim) * 40;
        const y = p.y + Math.sin(aim) * 40;
        for (const e of w.enemiesInRadius(x, y, 60)) {
          damageEnemy(w, e, 15, { source: 'attack', from: p, knock: 520 });
          if (!e.isBoss) e.status.stun = Math.max(e.status.stun ?? 0, 0.6);
        }
        w.particles.burst(x, y - 20, '#ffd890', 10, 260);
        audio.play('heavySwing');
      },
    };
  }

  /** The guard meter as an arc at the hero's feet, the shield arc while blocking. `flat` = the 2D view's squashed ground. */
  drawGuard(ctx: CanvasRenderingContext2D, flat: boolean): void {
    const show = this.blocking || this.guardMeter < GUARD_MAX || this.guardBreakT > 0 || this.riposteT > 0;
    if (!show || this.state === 'dead') return;
    const sy = flat ? 0.45 : 1;
    ctx.save();
    ctx.scale(1, sy);
    const k = this.guardMeter / GUARD_MAX;
    ctx.lineWidth = 3 / Math.max(0.6, sy);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = this.guardBreakT > 0 ? '#ff6a5a' : k < 0.3 ? '#ffa04a' : '#ffd890';
    ctx.beginPath();
    ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    if (this.blocking) {
      ctx.strokeStyle = 'rgba(255,240,190,0.9)';
      ctx.lineWidth = 5 / Math.max(0.6, sy);
      ctx.beginPath();
      ctx.arc(0, 0, 38, this.facing - GUARD_ARC, this.facing + GUARD_ARC);
      ctx.stroke();
    }
    if (this.riposteT > 0) {
      ctx.strokeStyle = `rgba(255,240,176,${0.5 + Math.sin(this.t * 30) * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Awakened weapons (forge Tier III+) unleash an arcane wave every 4th Attack. */
  private awaken(def: ActionDef): ActionDef {
    const fireWave = (w: World, aim: number) => {
      this.attackCount++;
      if (this.attackCount % 4 !== 0) return;
      const tier = w.stats.forgeTier;
      const color = WEAPON_INFO[this.weapon.id].color;
      const angles = tier >= 5 ? [-0.22, 0, 0.22] : [0];
      for (const off of angles) {
        const a = aim + off;
        const pr = new Projectile(this.x + Math.cos(a) * 24, this.y + Math.sin(a) * 24, Math.cos(a) * 900, Math.sin(a) * 900, 'player', tier >= 4 ? 45 : 35, 'attack');
        pr.style = 'crescent';
        pr.r = tier >= 4 ? 26 : 20;
        pr.ttl = 0.55;
        pr.pierce = 99;
        pr.knock = 160;
        pr.color = color;
        pr.deflectable = false;
        pr.hitsWalls = false;
        pr.z = 24;
        pr.owner = this;
        w.projectiles.push(pr);
      }
      w.particles.directional(this.x, this.y - 24, aim, 0.4, color, 12, 420);
      audio.play('cast');
    };
    if (def.hold) {
      const release = def.hold.release;
      return { ...def, hold: { ...def.hold, release: (p, w, c, h) => (release(p, w, c, h), fireWave(w, p.aim)) } };
    }
    const fire = def.fire;
    return { ...def, fire: (p, w, aim) => (fire?.(p, w, aim), fireWave(w, aim)) };
  }

  /** Unleashes this hero's ultimate when the gauge is full. */
  unleashWrath(w: World): void {
    if (!this.wrathReady || this.state === 'dead' || this.state === 'falling') {
      audio.play('deny');
      return;
    }
    this.wrath = 0;
    this.hero.wrath.use(w);
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
      w.particles.text(this.x, this.y, 70, 'Full health', '#a0ffa0', 14);
      return;
    }
    this.potionCd = s.potionCooldown;
    w.healPlayer(this.maxHp * s.potionHeal, true);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      w.particles.spawn({ kind: 'dot', x: this.x + Math.cos(a) * 30, y: this.y + Math.sin(a) * 14, z: 10, vz: fx.range(60, 160), color: '#7dff8a', size: 3, life: 0.8, drag: 2 });
    }
  }

  /** A hit landed: the combo meter climbs (twice as fast for brawlers), with a cheer at 10, 25, 50 and 100. */
  comboHit(w: World): void {
    const before = this.combo;
    this.combo += this.hero.id === 'gorran' ? 2 : 1;
    this.comboT = 0;
    for (const m of [10, 25, 50, 100]) {
      if (before < m && this.combo >= m) {
        w.particles.text(this.x, this.y, 100, `${m} HITS!`, m >= 50 ? '#ff9aff' : '#ffd890', 18 + Math.min(8, m / 10));
        if (w.stats.canWrath) this.gainWrath(4);
      }
    }
  }

  onHurt(dmg: number): void {
    this.combo = 0;
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
    this.drawGuard(ctx, true);
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
    const spd = Math.hypot(this.vx, this.vy);
    const moving = spd > 30 && this.state !== 'dash' && !this.airborne;
    const run = Math.min(1, spd / 260);
    // Two bumps a stride while running; a slow breath when standing.
    const bob = moving ? -Math.abs(Math.cos(this.walk)) * (1 + run * 2) : Math.sin(this.t * 3) * 0.8;
    const lean = this.state === 'dash' ? 0.25 * Math.sign(this.dashDir.x || 1) : moving ? clamp(this.vx / MOVE_SPEED, -1, 1) * 0.1 : 0;
    const white = this.flash > 0;
    if (!back) this.weapon.draw(ctx, this, w, true);
    ctx.save();
    ctx.rotate(lean);
    const pal = this.palette;
    // Mythic weapons (forge Tier V) wreathe the hero in their colour.
    if (w.stats.forgeTier >= 5) {
      ctx.globalCompositeOperation = 'lighter';
      const col = WEAPON_INFO[this.weapon.id].color;
      const g = ctx.createRadialGradient(0, -24, 4, 0, -24, 44);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.25 + Math.sin(this.t * 5) * 0.08;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -24, 44, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = blink ? 0.45 : 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.wrathReady && w.stats.canWrath) {
      ctx.strokeStyle = `rgba(255,208,74,${0.45 + Math.sin(this.t * 8) * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 10, 0, 0, TAU);
      ctx.stroke();
    }
    // Cloak
    const cloak = white ? '#fff' : pal.cloak;
    const trim = white ? '#fff' : pal.trim;
    ctx.fillStyle = cloak;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(-17, -24 + bob, -10, -38 + bob);
    ctx.lineTo(10, -38 + bob);
    const sway = moving ? Math.sin(this.walk * 2) * 2.5 : 0;
    ctx.quadraticCurveTo(17, -24 + bob, 14, -2);
    ctx.quadraticCurveTo(sway, 3, -14, -2);
    ctx.fill();
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -2);
    ctx.quadraticCurveTo(sway, 3, 14, -2);
    ctx.stroke();
    // Feet peek out under the cloak and stride along the way you run.
    if (!falling) {
      const ux = spd > 1 ? this.vx / spd : 0;
      const uy = spd > 1 ? this.vy / spd : 0;
      ctx.fillStyle = white ? '#fff' : '#2a1e1a';
      for (const side of [-1, 1]) {
        const ph = this.walk + (side > 0 ? Math.PI : 0);
        const step = moving ? Math.sin(ph) * (5 + run * 4) : 0;
        const lift = moving ? Math.max(0, -Math.cos(ph)) * (2 + run * 3) : 0;
        const air = this.airborne ? (side > 0 ? 4 : 2) : 0;
        ctx.fillRect(side * 5 - ux * step - 3, -1 - uy * step * 0.5 - lift - air, 6, 5);
      }
    }

    // Tunic / chest
    ctx.fillStyle = white ? '#fff' : pal.tunic;
    ctx.beginPath();
    ctx.moveTo(-7, -36 + bob);
    ctx.lineTo(7, -36 + bob);
    ctx.lineTo(5, -14 + bob);
    ctx.lineTo(-5, -14 + bob);
    ctx.fill();
    // Head
    ctx.fillStyle = white ? '#fff' : pal.skin;
    ctx.beginPath();
    ctx.arc(fxDir * 2, -45 + bob, 8, 0, TAU);
    ctx.fill();
    // Hair
    ctx.fillStyle = white ? '#fff' : pal.hair;
    ctx.beginPath();
    ctx.arc(fxDir * 1, -48 + bob, 8.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    if (!back) {
      ctx.fillStyle = pal.crown === 'horns' ? '#d090ff' : '#ffd1a0';
      ctx.fillRect(fxDir * 4 - 1.5, -46 + bob, 2, 2);
      ctx.fillRect(fxDir * 4 + 2.5 * Math.sign(fxDir || 1), -46 + bob, 2, 2);
    }
    if (!white) drawCrown(ctx, pal, fxDir, bob, this.t);
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

/** Headwear that sets each hero apart. */
function drawCrown(ctx: CanvasRenderingContext2D, pal: CharacterDef['palette'], fxDir: number, bob: number, t: number): void {
  const glow = pal.glow;
  switch (pal.crown) {
    case 'flame': {
      const fl = 0.6 + Math.sin(t * 14) * 0.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${90 + Math.floor(fl * 80)},40,0.9)`;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        const hx = i * 4 + fxDir;
        ctx.moveTo(hx - 2.5, -52 + bob);
        ctx.quadraticCurveTo(hx, -60 - fl * 6 - (2 - Math.abs(i)) * 3 + bob, hx + 2.5, -52 + bob);
        ctx.fill();
      }
      break;
    }
    case 'hood': {
      ctx.fillStyle = pal.cloak;
      ctx.beginPath();
      ctx.moveTo(-11, -40 + bob);
      ctx.quadraticCurveTo(fxDir * 2, -66 + bob, 11, -40 + bob);
      ctx.quadraticCurveTo(fxDir * 2, -54 + bob, -11, -40 + bob);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fxDir * 2, -59 + bob, 3, 0.4, Math.PI * 1.6);
      ctx.fill();
      break;
    }
    case 'helm': {
      ctx.fillStyle = '#b07a30';
      ctx.beginPath();
      ctx.arc(fxDir * 1, -48 + bob, 9.5, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = '#c2263a';
      ctx.fillRect(-1.5 + fxDir, -66 + bob, 3, 12);
      ctx.beginPath();
      ctx.ellipse(fxDir - fxDir * 4, -64 + bob, 9, 3, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'circlet': {
      ctx.strokeStyle = glow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(fxDir, -51 + bob, 9, 3, 0, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fxDir * 3, -55 + bob - Math.abs(Math.sin(t * 3)) * 2, 2.5, 0, TAU);
      ctx.fill();
      break;
    }
    case 'horns': {
      ctx.fillStyle = '#2a2030';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 5 + fxDir, -53 + bob);
        ctx.quadraticCurveTo(side * 15, -58 + bob, side * 13, -68 + bob);
        ctx.quadraticCurveTo(side * 10, -58 + bob, side * 2 + fxDir, -54 + bob);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(200,107,255,${0.3 + Math.sin(t * 4) * 0.15})`;
      ctx.beginPath();
      ctx.arc(fxDir, -48 + bob, 14, 0, TAU);
      ctx.fill();
      break;
    }
    case 'halo': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = glow;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(fxDir, -61 + bob + Math.sin(t * 2) * 1.5, 10, 3.5, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = t * 2 + (i * TAU) / 3;
        ctx.fillStyle = glow;
        ctx.fillRect(fxDir + Math.cos(a) * 10 - 1, -61 + bob + Math.sin(a) * 3.5 - 1, 2, 2);
      }
      break;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
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
