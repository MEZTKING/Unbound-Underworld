import { audio } from '../engine/audio';
import { distToSegment2 } from '../engine/collision';
import { angleTo, damp, fx, TAU } from '../engine/math';
import { Actor } from './actor';
import { applyChill, applyWeak, damageEnemy, deflectProjectiles, lightningBolt, playerBlast } from './combat';
import { Projectile, Zone } from './entities';
import type { World } from './world';

/**
 * Artifacts: cooldown-based active items in three hotbar slots (keys 1–3).
 * Soul artifacts instead spend souls gathered from slain foes.
 */
export interface ArtifactDef {
  id: string;
  name: string;
  glyph: string;
  color: string;
  desc: string;
  cooldown: number;
  souls?: number;
  /** Ash cost to unlock as a starting artifact in the hub. */
  unlock: number;
  use: (w: World) => boolean;
}

export const ARTIFACTS: ArtifactDef[] = [
  {
    id: 'mending_totem',
    name: 'Mending Totem',
    glyph: '♣',
    color: '#7dff8a',
    desc: 'Plants a totem that heals you while you stand near it.',
    cooldown: 26,
    unlock: 0,
    use: (w) => {
      const p = w.player;
      const z = new Zone('heal', p.x, p.y, 130, 6, 'player', 0, 'effect');
      z.interval = 0.5;
      z.onTick = (ww, zone) => {
        const pl = ww.player;
        if (Math.hypot(pl.x - zone.x, pl.y - zone.y) < zone.r) ww.healPlayer(2, false);
      };
      w.zones.push(z);
      audio.play('heal');
      return true;
    },
  },
  {
    id: 'thunder_rod',
    name: 'Thunder Rod',
    glyph: 'ϟ',
    color: '#ffe45c',
    desc: 'Calls lightning down on up to four nearby foes for 60 damage each.',
    cooldown: 14,
    unlock: 0,
    use: (w) => {
      const targets = w.enemiesInRadius(w.player.x, w.player.y, 520).slice(0, 4);
      if (targets.length === 0) return false;
      for (const e of targets) lightningBolt(w, e, 60);
      w.camera.shake(0.2);
      return true;
    },
  },
  {
    id: 'gale_horn',
    name: 'Gale Horn',
    glyph: '❂',
    color: '#bfe6ff',
    desc: 'A mighty blast of wind hurls nearby foes away, slows them and scatters projectiles.',
    cooldown: 11,
    unlock: 15,
    use: (w) => {
      const p = w.player;
      deflectProjectiles(w, p.x, p.y, 260, 'player');
      for (const e of w.enemiesInRadius(p.x, p.y, 260)) {
        e.knock(e.x - p.x, e.y - p.y, 1100);
        e.slamArmed = 0.5;
        applyChill(w, e, 4);
      }
      w.particles.ring(p.x, p.y, '#bfe6ff', 260, 0.5, 10);
      w.particles.ring(p.x, p.y, '#ffffff', 180, 0.35, 4);
      audio.play('roar', 0.6);
      return true;
    },
  },
  {
    id: 'bone_whistle',
    name: 'Bone Whistle',
    glyph: '♞',
    color: '#d8d0ff',
    desc: 'Summons a shade-wolf companion that hunts foes for 25 seconds.',
    cooldown: 32,
    unlock: 25,
    use: (w) => {
      const p = w.player;
      w.allies.push(new Ally('wolf', p.x - 30, p.y + 10, 25));
      w.particles.burst(p.x - 30, p.y, '#b8a8ff', 24, 260);
      audio.play('spawn');
      return true;
    },
  },
  {
    id: 'iron_hide',
    name: 'Stoneskin Charm',
    glyph: '⛨',
    color: '#c8d0e0',
    desc: 'For 6 seconds you take 50% less damage.',
    cooldown: 24,
    unlock: 20,
    use: (w) => {
      w.player.ironHideT = 6;
      audio.play('armorBreak');
      return true;
    },
  },
  {
    id: 'ember_volley',
    name: 'Ember Volley',
    glyph: '✷',
    color: '#ff8a3a',
    desc: 'Launches three seeking ember rockets that explode for 45 damage.',
    cooldown: 13,
    unlock: 20,
    use: (w) => {
      const p = w.player;
      for (let i = 0; i < 3; i++) {
        const a = p.aim + (i - 1) * 0.5;
        const pr = new Projectile(p.x, p.y - 4, Math.cos(a) * 520, Math.sin(a) * 520, 'player', 0, 'effect');
        pr.style = 'fire';
        pr.color = '#ff8a3a';
        pr.homing = 5;
        pr.ttl = 2.2;
        pr.r = 10;
        pr.deflectable = false;
        pr.onEnd = (ww) => {
          audio.play('explode');
          playerBlast(ww, pr.x, pr.y, 90, 45, { color: '#ff8a3a', knock: 250 });
        };
        w.projectiles.push(pr);
      }
      audio.play('cast');
      return true;
    },
  },
  {
    id: 'shock_powder',
    name: 'Thunder Dust',
    glyph: '✦',
    color: '#ffe680',
    desc: 'Stuns every nearby foe for 2.5 seconds.',
    cooldown: 16,
    unlock: 30,
    use: (w) => {
      const p = w.player;
      for (const e of w.enemiesInRadius(p.x, p.y, 230)) e.status.stun = Math.max(e.status.stun ?? 0, e.isBoss ? 0.6 : 2.5);
      w.particles.burst(p.x, p.y, '#ffe680', 40, 380);
      w.particles.ring(p.x, p.y, '#ffe680', 230, 0.4, 5);
      audio.play('lightning');
      return true;
    },
  },
  {
    id: 'ruin_gong',
    name: 'Bell of Ruin',
    glyph: '◉',
    color: '#ff6fcf',
    desc: 'A resounding gong deals 30 damage and Weakens every foe nearby.',
    cooldown: 18,
    unlock: 30,
    use: (w) => {
      const p = w.player;
      playerBlast(w, p.x, p.y, 280, 30, { color: '#ff6fcf', onEnemy: (e) => applyWeak(w, e) });
      audio.play('roar', 0.5);
      return true;
    },
  },
  {
    id: 'fury_draught',
    name: 'Fury Draught',
    glyph: '⚗',
    color: '#ffb04a',
    desc: 'For 8 seconds you move and strike 40% faster.',
    cooldown: 26,
    unlock: 25,
    use: (w) => {
      w.player.hasteT = 8;
      audio.play('heal');
      return true;
    },
  },
  {
    id: 'soul_lantern',
    name: 'Spirit Lantern',
    glyph: '♁',
    color: '#7fe8ff',
    desc: 'Spend 30 souls: a lantern spirit fights at your side for 14 seconds.',
    cooldown: 4,
    souls: 30,
    unlock: 35,
    use: (w) => {
      const p = w.player;
      w.allies.push(new Ally('lantern', p.x, p.y - 40, 14));
      audio.play('spawn');
      return true;
    },
  },
  {
    id: 'soul_reaper',
    name: 'Soul Reaper',
    glyph: '☽',
    color: '#7fe8ff',
    desc: 'Spend 40 souls: unleash a soul burst dealing 120 damage around you.',
    cooldown: 2,
    souls: 40,
    unlock: 35,
    use: (w) => {
      const p = w.player;
      audio.play('explode');
      playerBlast(w, p.x, p.y, 220, 120, { color: '#7fe8ff', knock: 400 });
      w.camera.shake(0.4);
      w.hitstop(0.06);
      return true;
    },
  },
  {
    id: 'void_beacon',
    name: 'Void Prism',
    glyph: '⌖',
    color: '#c86bff',
    desc: 'Channel a searing soul beam toward your aim. Drains souls while active.',
    cooldown: 1,
    souls: 10,
    unlock: 50,
    use: (w) => {
      w.player.beamT = 3.5;
      audio.play('cast');
      return true;
    },
  },
];

export const ARTIFACT_BY_ID: Record<string, ArtifactDef> = Object.fromEntries(ARTIFACTS.map((a) => [a.id, a]));

export function useArtifact(w: World, slot: number): void {
  const id = w.artifacts[slot];
  const p = w.player;
  if (!id) return;
  const def = ARTIFACT_BY_ID[id];
  if (!def || p.state === 'dead') return;
  if (id === 'void_beacon' && p.beamT > 0) {
    p.beamT = 0;
    return;
  }
  if (p.artifactCd[slot] > 0) {
    audio.play('deny');
    return;
  }
  if (def.souls && p.souls < def.souls) {
    audio.play('deny');
    w.particles.text(p.x, p.y - 80, 'Not enough souls', '#7fe8ff', 14);
    return;
  }
  if (!def.use(w)) {
    audio.play('deny');
    return;
  }
  if (def.souls) p.souls -= def.souls;
  p.artifactCd[slot] = def.cooldown * w.stats.artifactCdMult;
}

/** Per-frame artifact upkeep (channelled beam). */
export function updateArtifacts(w: World, dt: number): void {
  const p = w.player;
  if (p.beamT <= 0) return;
  p.beamT -= dt;
  p.souls -= 22 * dt;
  if (p.souls <= 0 || p.state === 'dead') {
    p.souls = Math.max(0, p.souls);
    p.beamT = 0;
    return;
  }
  p.beamTick -= dt;
  const len = 560;
  const x1 = p.x + Math.cos(p.aim) * 20;
  const y1 = p.y + Math.sin(p.aim) * 20;
  const x2 = p.x + Math.cos(p.aim) * len;
  const y2 = p.y + Math.sin(p.aim) * len;
  if (p.beamTick <= 0) {
    p.beamTick = 0.1;
    for (const e of w.enemies) {
      if (e.dead || e.spawning) continue;
      if (distToSegment2(e, { x: x1, y: y1 }, { x: x2, y: y2 }) < (e.r + 24) ** 2) {
        damageEnemy(w, e, 16, { source: 'effect', noEffects: true, silent: true, color: '#e0a8ff' });
      }
    }
    w.camera.shake(0.04);
  }
  if (Math.random() < 0.6) {
    const k = Math.random();
    w.particles.spawn({ kind: 'dot', x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k, z: 26, vz: fx.range(20, 80), color: '#e0a8ff', size: 3, life: 0.4 });
  }
}

export function drawBeam(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;
  if (p.beamT <= 0) return;
  const len = 560;
  const x1 = p.x + Math.cos(p.aim) * 20;
  const y1 = p.y + Math.sin(p.aim) * 20 - 26 - p.z;
  const x2 = p.x + Math.cos(p.aim) * len;
  const y2 = p.y + Math.sin(p.aim) * len - 26;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const flick = 0.8 + Math.sin(w.time * 50) * 0.2;
  ctx.strokeStyle = `rgba(200,107,255,${0.35 * flick})`;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(240,200,255,${0.9 * flick})`;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- Allies

export type AllyKind = 'wolf' | 'lantern';

/** Friendly summons. They are invulnerable and fade after their lifetime. */
export class Ally extends Actor {
  team = 'player' as const;
  kind: AllyKind;
  ttl: number;
  atkCd = 0;
  t = 0;
  bite = 0;

  constructor(kind: AllyKind, x: number, y: number, ttl: number) {
    super();
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.ttl = ttl;
    this.r = kind === 'wolf' ? 14 : 10;
    this.height = kind === 'wolf' ? 26 : 60;
    this.solid = kind === 'wolf';
    this.flying = kind === 'lantern';
  }

  update(w: World, dt: number): void {
    this.t += dt;
    this.ttl -= dt;
    this.atkCd -= dt;
    this.bite = Math.max(0, this.bite - dt);
    if (this.ttl <= 0) {
      this.dead = true;
      w.particles.burst(this.x, this.y - 20, this.kind === 'wolf' ? '#b8a8ff' : '#7fe8ff', 20, 200);
      return;
    }
    const p = w.player;
    if (this.kind === 'wolf') {
      const target = w.nearestEnemy(this.x, this.y, 650);
      let tx = p.x - 40;
      let ty = p.y + 20;
      let speed = 360;
      if (target) {
        tx = target.x;
        ty = target.y;
        speed = 420;
        const d = Math.hypot(target.x - this.x, target.y - this.y);
        if (d < target.r + this.r + 18 && this.atkCd <= 0) {
          this.atkCd = 0.55;
          this.bite = 0.15;
          damageEnemy(w, target, 18, { source: 'effect', from: this, knock: 120, noEffects: true, color: '#d8d0ff' });
        }
      }
      const dx = tx - this.x;
      const dy = ty - this.y;
      const l = Math.hypot(dx, dy);
      const want = target ? 1 : l > 70 ? 1 : 0;
      this.vx = damp(this.vx, l > 1 ? (dx / l) * speed * want : 0, 8, dt);
      this.vy = damp(this.vy, l > 1 ? (dy / l) * speed * want : 0, 8, dt);
      if (Math.hypot(this.vx, this.vy) > 20) this.facing = Math.atan2(this.vy, this.vx);
      w.moveActor(this, dt);
    } else {
      const a = this.t * 1.6;
      this.x = damp(this.x, p.x + Math.cos(a) * 55, 6, dt);
      this.y = damp(this.y, p.y + Math.sin(a) * 30, 6, dt);
      const target = w.nearestEnemy(this.x, this.y, 520);
      if (target && this.atkCd <= 0) {
        this.atkCd = 0.45;
        const ang = angleTo({ x: this.x, y: this.y }, target);
        const pr = new Projectile(this.x, this.y, Math.cos(ang) * 700, Math.sin(ang) * 700, 'player', 12, 'effect');
        pr.color = '#7fe8ff';
        pr.homing = 4;
        pr.r = 7;
        pr.deflectable = false;
        pr.z = 50;
        w.projectiles.push(pr);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const fade = Math.min(1, this.ttl * 2);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = fade;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r * 1.2, this.r * 0.5, 0, 0, TAU);
    ctx.fill();
    if (this.kind === 'wolf') {
      const dir = Math.cos(this.facing) >= 0 ? 1 : -1;
      const run = Math.sin(this.t * 18) * 3;
      ctx.scale(dir, 1);
      ctx.fillStyle = '#5a4a8a';
      ctx.beginPath();
      ctx.ellipse(0, -16, 18, 9, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7a6aba';
      ctx.beginPath();
      ctx.ellipse(16, -22 - (this.bite > 0 ? 3 : 0), 9, 7, -0.3, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, -28);
      ctx.lineTo(18, -36);
      ctx.lineTo(20, -27);
      ctx.fill();
      ctx.strokeStyle = '#5a4a8a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -10);
      ctx.lineTo(-12 + run, 0);
      ctx.moveTo(10, -10);
      ctx.lineTo(12 - run, 0);
      ctx.moveTo(-16, -18);
      ctx.lineTo(-28, -26 + run);
      ctx.stroke();
      ctx.fillStyle = '#e0f0ff';
      ctx.fillRect(20, -25, 2, 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(160,140,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, -18, 26, 16, 0, 0, TAU);
      ctx.fill();
    } else {
      const bob = Math.sin(this.t * 4) * 4;
      ctx.translate(0, -50 + bob);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, 'rgba(200,250,255,1)');
      g.addColorStop(1, 'rgba(60,180,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#3a5a6a';
      ctx.lineWidth = 2;
      ctx.strokeRect(-7, -9, 14, 18);
    }
    ctx.restore();
  }
}
