import { audio } from '../engine/audio';
import { angleDiff, angleTo, fx, TAU } from '../engine/math';
import type { Actor } from './actor';
import { GODS } from './boons';
import { committedBonus, onAbilityHit } from './enchants';
import type { Enemy } from './enemies/enemy';
import { Projectile, Zone } from './entities';
import type { AbilitySlot, DamageSource, GodId, HitEffect, Team } from './types';
import type { World } from './world';

const ABILITY: ReadonlySet<DamageSource> = new Set(['attack', 'special', 'cast', 'dash']);

export const CHILL_MAX = 10;
export const DOOM_DELAY = 1.1;
export const WEAK_TIME = 4;
export const HANGOVER_TIME = 4;

export interface DamageOpts {
  source: DamageSource;
  /** Extra crit chance on top of build stats. */
  crit?: number;
  knock?: number;
  /** Where the hit came from (knockback direction, backstab test). */
  from?: { x: number; y: number };
  armorMult?: number;
  backstabMult?: number;
  /** Effect damage (lightning, doom…) never re-triggers on-hit effects. */
  noEffects?: boolean;
  lightning?: boolean;
  doom?: boolean;
  color?: string;
  hitstop?: number;
  silent?: boolean;
  lifesteal?: number;
  /** Set on Echo repeats so they don't echo again. */
  echo?: boolean;
}

/** Applies the player's damage modifiers and deals damage to an enemy. Returns damage dealt. */
export function damageEnemy(w: World, e: Enemy, base: number, o: DamageOpts): number {
  if (e.dead || e.invulnerable || base <= 0) return 0;
  const s = w.stats;
  const p = w.player;
  let mult = 1 + s.globalDmg;
  if (ABILITY.has(o.source)) mult += s.dmgBonus[o.source as AbilitySlot];
  if (s.bloodFrenzy > 0) mult += s.bloodFrenzy * (1 - p.hp / p.maxHp);
  if (s.duos.has('longing') && e.status.weak) mult += 0.4;
  if (o.lightning) mult += s.lightningBonus;
  if (o.doom) mult += s.doomBonus;
  mult += committedBonus(s, e);
  let dmg = base * mult;

  const guard = e.guard(o.from);
  dmg *= guard;
  if (guard < 1) {
    if (guard < 0.5) {
      w.particles.text(e.x, e.y - e.height - 20, 'BLOCK', '#d8c070', 14);
      w.particles.burst(e.x, e.y - e.height * 0.5, '#ffe0a0', 6, 200);
    }
  }

  if (o.backstabMult && o.from) {
    const toAttacker = angleTo(e, o.from);
    if (Math.abs(angleDiff(e.facing, toAttacker)) > Math.PI * 0.55) dmg *= o.backstabMult;
  }

  let critChance = o.crit ?? 0;
  if (ABILITY.has(o.source)) critChance += s.critChance[o.source as AbilitySlot];
  if (o.source === 'attack' || o.source === 'special') {
    const eff = s.hitEffects[o.source];
    if (eff?.kind === 'crit') critChance += eff.chance;
  }
  const crit = critChance > 0 && Math.random() < critChance;
  if (crit) dmg *= s.critMult;
  dmg = Math.max(1, Math.round(dmg));

  // Armour soaks damage first; breaking it staggers the foe.
  let shown = dmg;
  if (e.armor > 0) {
    const am = (o.armorMult ?? 1) * (1 + s.armorBonus);
    const toArmor = dmg * am;
    if (toArmor >= e.armor) {
      const overflow = (toArmor - e.armor) / am;
      e.armor = 0;
      e.hp -= overflow;
      e.onArmorBreak(w);
      audio.play('armorBreak');
      w.particles.burst(e.x, e.y - e.height / 2, '#c9d4e8', 24, 320);
      w.particles.text(e.x, e.y - e.height - 20, 'BREAK', '#c9d4e8', 22);
    } else {
      e.armor -= toArmor;
    }
    shown = Math.round(toArmor);
  } else {
    e.hp -= dmg;
  }

  e.flash = 0.12;
  e.onDamaged(w, dmg, o.source);

  const color = o.color ?? (crit ? '#ffd54a' : e.armor > 0 ? '#aab8d0' : '#ffffff');
  w.particles.text(e.x, e.y - e.height - 8, crit ? `${shown}!` : `${shown}`, color, crit ? 26 : o.source === 'effect' ? 15 : 19);
  if (!o.silent) audio.play(crit ? 'crit' : dmg >= 40 ? 'heavyHit' : 'hit');
  const from = o.from ?? p;
  const ang = angleTo(from, e);
  w.particles.directional(e.x, e.y - e.height * 0.45, ang, 0.7, crit ? '#ffd54a' : '#ffefe0', crit ? 14 : 7, crit ? 420 : 300);
  if (crit) w.particles.ring(e.x, e.y, '#ffd54a', 60, 0.3, 3);
  if (o.knock) e.knock(e.x - from.x, e.y - from.y, o.knock);
  if (o.hitstop) w.hitstop(o.hitstop * (crit ? 1.5 : 1));
  if (o.lifesteal && !e.isDummy) w.healPlayer(o.lifesteal, false);

  if (!o.noEffects && (o.source === 'attack' || o.source === 'special')) {
    const eff = s.hitEffects[o.source];
    if (eff) applyHitEffect(w, e, eff, from);
  }
  if (!o.noEffects && ABILITY.has(o.source)) onAbilityHit(w, e, base, o);

  if (e.hp <= 0 && !e.dead) w.killEnemy(e);
  return dmg;
}

export function applyHitEffect(w: World, e: Enemy, eff: HitEffect, from: { x: number; y: number }): void {
  switch (eff.kind) {
    case 'bolt':
      lightningBolt(w, e, eff.dmg);
      break;
    case 'chain':
      chainLightning(w, e, eff.dmg, eff.bounces);
      break;
    case 'knock':
      poseidonKnock(w, e, from, eff.force);
      break;
    case 'doom':
      applyDoom(e, eff.dmg);
      break;
    case 'weak':
      applyWeak(w, e);
      break;
    case 'hangover':
      applyHangover(w, e, eff.dps);
      break;
    case 'chill':
      applyChill(w, e, 1);
      break;
    case 'crit':
    case 'deflect':
      break;
  }
}

export function poseidonKnock(w: World, e: Enemy, from: { x: number; y: number }, force: number): void {
  if (e.dead) return;
  e.knock(e.x - from.x, e.y - from.y, force);
  e.slamArmed = 0.45;
  w.particles.burst(e.x, e.y, GODS.poseidon.color, 8, 200);
  if (w.stats.duos.has('seastorm')) lightningBolt(w, e, 30);
  if (w.stats.duos.has('coldcurrent')) applyChill(w, e, CHILL_MAX);
}

export function applyDoom(e: Enemy, dmg: number): void {
  if (e.dead || e.status.doom) return;
  e.status.doom = { t: DOOM_DELAY, dmg };
}

export function applyWeak(w: World, e: Enemy): void {
  if (e.dead) return;
  if (!e.status.weak) w.particles.text(e.x, e.y - e.height - 30, 'WEAK', GODS.aphrodite.color, 14);
  e.status.weak = { t: WEAK_TIME };
}

export function applyHangover(w: World, e: Enemy, dps: number): void {
  if (e.dead) return;
  const h = e.status.hangover;
  const max = w.stats.hangoverStacks;
  if (h) {
    h.stacks = Math.min(max, h.stacks + 1);
    h.dps = Math.max(h.dps, dps);
    h.t = HANGOVER_TIME;
  } else e.status.hangover = { t: HANGOVER_TIME, stacks: 1, dps, tick: 0.5 };
}

export function applyChill(w: World, e: Enemy, stacks: number): void {
  if (e.dead) return;
  const c = e.status.chill ?? { t: 0, stacks: 0 };
  c.stacks = Math.min(CHILL_MAX, c.stacks + stacks);
  c.t = 4;
  e.status.chill = c;
  if (c.stacks >= CHILL_MAX && w.stats.chillShatter > 0) {
    e.status.chill = undefined;
    w.particles.burst(e.x, e.y - 20, GODS.demeter.color, 26, 380);
    w.particles.ring(e.x, e.y, GODS.demeter.color, 90, 0.4, 5);
    audio.play('armorBreak');
    damageEnemy(w, e, w.stats.chillShatter, { source: 'effect', noEffects: true, color: GODS.demeter.color });
  }
}

/** Ticks statuses on an enemy. Returns the movement-speed multiplier from chill. */
export function updateStatuses(w: World, e: Enemy, dt: number): number {
  const st = e.status;
  if (st.doom) {
    st.doom.t -= dt;
    if (st.doom.t <= 0) {
      const dmg = st.doom.dmg;
      st.doom = undefined;
      w.particles.ring(e.x, e.y, GODS.ares.color, 70, 0.35, 6);
      w.particles.burst(e.x, e.y - e.height / 2, GODS.ares.color, 16, 300);
      if (w.stats.duos.has('longing')) applyWeak(w, e);
      damageEnemy(w, e, dmg, {
        source: 'effect',
        doom: true,
        noEffects: true,
        crit: w.stats.duos.has('hunting') ? 0.25 : 0,
        color: GODS.ares.color,
      });
    }
  }
  if (st.weak) {
    st.weak.t -= dt;
    if (st.weak.t <= 0) st.weak = undefined;
  }
  if (st.hangover) {
    const h = st.hangover;
    h.t -= dt;
    h.tick -= dt;
    if (h.tick <= 0) {
      h.tick += 0.5;
      const bonus = st.chill && w.stats.duos.has('icewine') ? 1.3 : 1;
      damageEnemy(w, e, h.dps * h.stacks * 0.5 * bonus, {
        source: 'effect',
        noEffects: true,
        silent: true,
        color: GODS.dionysus.color,
      });
      if (w.stats.duos.has('icewine')) applyChill(w, e, 1);
    }
    if (h.t <= 0) st.hangover = undefined;
  }
  if (st.burn) {
    const b = st.burn;
    b.t -= dt;
    b.tick -= dt;
    if (b.tick <= 0) {
      b.tick += 0.5;
      w.particles.burst(e.x, e.y - e.height * 0.5, '#ff7a3a', 4, 120);
      damageEnemy(w, e, b.dps * 0.5, { source: 'effect', noEffects: true, silent: true, color: '#ff9a5a' });
    }
    if (b.t <= 0) st.burn = undefined;
  }
  let speed = 1;
  if (st.chill) {
    st.chill.t -= dt;
    speed = 1 - Math.min(0.5, st.chill.stacks * 0.05);
    if (st.chill.t <= 0) st.chill = undefined;
  }
  if (st.stun !== undefined) {
    st.stun -= dt;
    if (st.stun <= 0) st.stun = undefined;
  }
  return speed;
}

// ---------------------------------------------------------------- lightning

export function lightningBolt(w: World, e: Enemy, dmg: number): void {
  if (e.dead) return;
  w.addBolt(e.x + fx.range(-30, 30), e.y - 320, e.x, e.y - e.height * 0.4, GODS.zeus.color);
  w.particles.burst(e.x, e.y, GODS.zeus.color, 10, 240);
  audio.play('lightning');
  damageEnemy(w, e, dmg, { source: 'effect', lightning: true, noEffects: true, color: GODS.zeus.color, silent: true });
}

export function chainLightning(w: World, first: Enemy, dmg: number, bounces: number): void {
  const hit = new Set<number>();
  let cur: Enemy | null = first;
  let prev: { x: number; y: number } = { x: w.player.x, y: w.player.y - 30 };
  for (let i = 0; i <= bounces && cur; i++) {
    hit.add(cur.id);
    w.addBolt(prev.x, prev.y, cur.x, cur.y - cur.height * 0.4, GODS.zeus.color);
    damageEnemy(w, cur, dmg, { source: 'effect', lightning: true, noEffects: true, color: GODS.zeus.color, silent: i > 0 });
    prev = { x: cur.x, y: cur.y - cur.height * 0.4 };
    cur = w.nearestEnemy(cur.x, cur.y, 300, (o) => !hit.has(o.id));
  }
  audio.play('lightning');
}

// ---------------------------------------------------------------- area effects

export interface BlastOpts {
  color: string;
  knock?: number;
  source?: DamageSource;
  onEnemy?: (e: Enemy) => void;
  crit?: number;
  lightning?: boolean;
  noEffects?: boolean;
}

/** Player-side explosion that damages every enemy in radius. */
export function playerBlast(w: World, x: number, y: number, r: number, dmg: number, o: BlastOpts): void {
  w.particles.ring(x, y, o.color, r, 0.4, 7);
  w.particles.burst(x, y, o.color, 22, r * 2.4);
  w.flashLight(x, y, r * 2, o.color, 0.25);
  for (const e of w.enemiesInRadius(x, y, r)) {
    damageEnemy(w, e, dmg, {
      source: o.source ?? 'effect',
      from: { x, y },
      knock: o.knock ?? 0,
      noEffects: o.noEffects ?? true,
      crit: o.crit,
      lightning: o.lightning,
      color: o.source === 'effect' || !o.source ? o.color : undefined,
    });
    o.onEnemy?.(e);
  }
}

/** Damaging explosion from an enemy (or neutral hazard) hitting the player and other enemies optionally. */
export function hostileBlast(w: World, x: number, y: number, r: number, dmg: number, color: string, source: Actor | null): void {
  w.particles.ring(x, y, color, r, 0.45, 8);
  w.particles.burst(x, y, color, 26, r * 2.6);
  w.flashLight(x, y, r * 2.2, color, 0.3);
  audio.play('explode');
  w.camera.shake(0.25);
  const p = w.player;
  if (Math.hypot(p.x - x, p.y - y) < r + p.r) w.hurtPlayer(dmg, source ?? { x, y });
}

export function deflectProjectiles(w: World, x: number, y: number, r: number, team: Team): number {
  let n = 0;
  for (const pr of w.projectiles) {
    if (pr.dead || pr.team === team || !pr.deflectable || pr.lob) continue;
    if (Math.hypot(pr.x - x, pr.y - y) > r + pr.r) continue;
    deflect(w, pr, team);
    n++;
  }
  return n;
}

export function deflect(w: World, pr: Projectile, team: Team): void {
  const target = team === 'player' ? w.nearestEnemy(pr.x, pr.y, 900) : null;
  const speed = Math.max(500, Math.hypot(pr.vx, pr.vy) * 1.4);
  const a = target ? angleTo(pr, target) : Math.atan2(-pr.vy, -pr.vx);
  pr.vx = Math.cos(a) * speed;
  pr.vy = Math.sin(a) * speed;
  pr.team = team;
  pr.source = 'effect';
  pr.damage = Math.max(20, pr.damage * 2);
  pr.ttl = 2;
  pr.hit.clear();
  pr.color = GODS.athena.color;
  pr.charged = w.stats.duos.has('phalanx');
  w.particles.burst(pr.x, pr.y, GODS.athena.color, 10, 260);
  audio.play('deflect');
}

/** Effects of a landed cast shard. `target` is set when it struck a foe. */
export function castLanded(w: World, x: number, y: number, target: Enemy | null): void {
  const cp = w.stats.castPower;
  if (!cp) return;
  const v = cp.power;
  const color = GODS[cp.god].color;
  switch (cp.god) {
    case 'zeus': {
      const z = new Zone('storm', x, y, 230, 3, 'player', v, 'cast');
      z.interval = 0.5;
      z.onTick = (ww, zone) => {
        const t = ww.nearestEnemy(zone.x, zone.y, zone.r);
        if (t) lightningBolt(ww, t, zone.damage);
      };
      if (target) w.attachZone(z, target);
      w.zones.push(z);
      break;
    }
    case 'poseidon':
      audio.play('explode');
      playerBlast(w, x, y, 130, v, { color, knock: 650, source: 'cast' });
      break;
    case 'athena':
      audio.play('deflect');
      deflectProjectiles(w, x, y, 220, 'player');
      playerBlast(w, x, y, 140, v, { color, source: 'cast' });
      break;
    case 'ares': {
      const z = new Zone('bladeRift', x, y, 75, 1.4, 'player', v, 'cast');
      z.interval = 0.18;
      z.crit = w.stats.duos.has('hunting') ? 0.25 : 0;
      w.zones.push(z);
      break;
    }
    case 'aphrodite':
      audio.play('explode');
      playerBlast(w, x, y, 150, v, { color, source: 'cast', onEnemy: (e) => applyWeak(w, e) });
      break;
    case 'artemis':
      break;
    case 'dionysus': {
      const z = new Zone('fog', x, y, 120, 3.5, 'player', v * 0.5, 'cast');
      z.interval = 0.5;
      z.onActor = (ww, a) => applyHangover(ww, a as Enemy, 4);
      w.zones.push(z);
      break;
    }
    case 'demeter':
      audio.play('explode');
      playerBlast(w, x, y, 150, v, { color, source: 'cast', onEnemy: (e) => applyChill(w, e, 5) });
      break;
    case 'hermes':
      break;
  }
}

/** Dash-boon effects. Called at the start and end of every dash. */
export function dashTriggered(w: World, phase: 'start' | 'end'): void {
  const dp = w.stats.dashPower;
  if (!dp) return;
  const p = w.player;
  const v = dp.power;
  const color = GODS[dp.god].color;
  const god: GodId = dp.god;
  if (phase === 'start') {
    switch (god) {
      case 'zeus': {
        const targets = w.enemiesInRadius(p.x, p.y, 200).slice(0, 3);
        for (const e of targets) lightningBolt(w, e, v);
        break;
      }
      case 'poseidon':
        playerBlast(w, p.x, p.y, 110, v, { color, knock: 600, source: 'dash', onEnemy: (e) => (e.slamArmed = 0.45) });
        break;
      case 'ares': {
        const z = new Zone('bladeRift', p.x, p.y, 55, 1.1, 'player', v, 'dash');
        z.interval = 0.18;
        z.crit = w.stats.duos.has('hunting') ? 0.25 : 0;
        w.zones.push(z);
        break;
      }
      case 'dionysus': {
        const z = new Zone('fog', p.x, p.y, 85, 2.5, 'player', v * 0.5, 'dash');
        z.interval = 0.5;
        z.onActor = (ww, a) => applyHangover(ww, a as Enemy, 3);
        w.zones.push(z);
        break;
      }
      default:
        break;
    }
  } else {
    switch (god) {
      case 'aphrodite':
        playerBlast(w, p.x, p.y, 100, v, { color, source: 'dash', onEnemy: (e) => applyWeak(w, e) });
        break;
      case 'demeter':
        playerBlast(w, p.x, p.y, 110, v, { color, source: 'dash', onEnemy: (e) => applyChill(w, e, 3) });
        break;
      default:
        break;
    }
  }
}

/** Spawns a shard-like enemy bullet ring (used by several foes and bosses). */
export function bulletRing(
  w: World,
  x: number,
  y: number,
  count: number,
  speed: number,
  dmg: number,
  owner: Actor | null,
  offset = 0,
  color = '#ff5a3c',
  r = 9,
): void {
  for (let i = 0; i < count; i++) {
    const a = offset + (i / count) * TAU;
    const pr = new Projectile(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 'enemy', dmg, 'enemy');
    pr.owner = owner;
    pr.color = color;
    pr.r = r;
    pr.ttl = 4;
    w.projectiles.push(pr);
  }
}
