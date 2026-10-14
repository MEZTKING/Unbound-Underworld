import { clamp, TAU } from '../engine/math';
import { drawBeam } from './artifacts';
import { GODS } from './boons';
import type { Projectile, Zone } from './entities';
import { DOOR_W, TRAP_SIZE, WALL_H, type Obstacle } from './rooms';
import type { RewardSpec, Shape } from './types';
import type { Interactable, World } from './world';
import { isSpear } from './weapons';

const PAD = 90;

interface RoomCache {
  canvas: HTMLCanvasElement;
  scale: number;
}

const cache = new WeakMap<World, RoomCache>();
let lightCanvas: HTMLCanvasElement | null = null;

// ---------------------------------------------------------------- static room art

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function buildRoomCanvas(w: World, dpr: number): RoomCache {
  const l = w.room;
  const b = w.biome;
  const W = l.w + PAD * 2;
  const H = l.h + PAD + WALL_H + PAD;
  let scale = clamp(w.camera.zoom * dpr, 1, 2);
  while (W * H * scale * scale > 9e6) scale *= 0.9;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * scale);
  c.height = Math.ceil(H * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  g.translate(PAD, PAD + WALL_H);

  // Void beyond the walls
  g.fillStyle = '#07050a';
  g.fillRect(-PAD, -PAD - WALL_H, W, H);

  // Floor tiles
  const T = 80;
  for (let ty = 0; ty < l.h; ty += T) {
    for (let tx = 0; tx < l.w; tx += T) {
      const r = hash(tx, ty, l.seed);
      g.fillStyle = r < 0.5 ? b.floorA : b.floorB;
      g.fillRect(tx, ty, T, T);
      g.fillStyle = `rgba(255,255,255,${0.015 + r * 0.03})`;
      g.fillRect(tx + 3, ty + 3, T - 6, T - 6);
      if (r > 0.82) {
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(tx + 10 + r * 30, ty + 8);
        g.lineTo(tx + 30 + r * 10, ty + 40);
        g.lineTo(tx + 20 + r * 40, ty + 70);
        g.stroke();
      }
    }
  }
  g.strokeStyle = b.grout;
  g.lineWidth = 3;
  for (let tx = 0; tx <= l.w; tx += T) {
    g.beginPath();
    g.moveTo(tx, 0);
    g.lineTo(tx, l.h);
    g.stroke();
  }
  for (let ty = 0; ty <= l.h; ty += T) {
    g.beginPath();
    g.moveTo(0, ty);
    g.lineTo(l.w, ty);
    g.stroke();
  }

  // Biome decals
  for (let i = 0; i < 40; i++) {
    const x = hash(i, 1, l.seed) * l.w;
    const y = hash(i, 2, l.seed) * l.h;
    if (b.id === 'elysium') {
      g.strokeStyle = 'rgba(120,200,140,0.35)';
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(x + k * 4, y);
        g.quadraticCurveTo(x + k * 4 - 4, y - 8, x + k * 4 - 2, y - 14);
        g.stroke();
      }
      if (i % 3 === 0) {
        g.fillStyle = 'rgba(240,230,160,0.6)';
        g.beginPath();
        g.arc(x + 6, y - 14, 2.5, 0, TAU);
        g.fill();
      }
    } else if (b.id === 'asphodel') {
      g.strokeStyle = 'rgba(255,110,40,0.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 20, y + 8);
      g.lineTo(x + 34, y + 2);
      g.stroke();
      if (i % 4 === 0) {
        g.fillStyle = 'rgba(200,220,180,0.4)';
        g.beginPath();
        g.arc(x, y, 3, 0, TAU);
        g.fill();
      }
    } else if (b.id === 'tartarus') {
      if (i % 2 === 0) {
        g.fillStyle = 'rgba(120,10,30,0.18)';
        g.beginPath();
        g.ellipse(x, y, 30 + hash(i, 3, l.seed) * 30, 14, 0, 0, TAU);
        g.fill();
      }
    } else {
      g.fillStyle = 'rgba(140,120,255,0.08)';
      g.beginPath();
      g.arc(x, y, 20, 0, TAU);
      g.fill();
    }
  }

  // Centre seal / glyph
  g.strokeStyle = `${b.trim}33`;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(l.w / 2, l.h / 2 + 40, 160, 0, TAU);
  g.stroke();
  g.beginPath();
  g.arc(l.w / 2, l.h / 2 + 40, 120, 0, TAU);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    g.beginPath();
    g.moveTo(l.w / 2 + Math.cos(a) * 120, l.h / 2 + 40 + Math.sin(a) * 120);
    g.lineTo(l.w / 2 + Math.cos(a) * 160, l.h / 2 + 40 + Math.sin(a) * 160);
    g.stroke();
  }

  // Pits
  for (const h of l.hazards) {
    if (h.kind !== 'pit') continue;
    const s = h.shape;
    g.save();
    g.beginPath();
    if (s.type === 'rect') g.rect(s.x, s.y, s.w, s.h);
    else g.arc(s.x, s.y, s.r, 0, TAU);
    g.fillStyle = '#020104';
    g.fill();
    g.clip();
    if (s.type === 'rect') {
      const gr = g.createLinearGradient(0, s.y, 0, s.y + 40);
      gr.addColorStop(0, b.wall);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(s.x, s.y, s.w, 40);
    }
    g.restore();
    g.strokeStyle = b.wallTop;
    g.lineWidth = 4;
    g.beginPath();
    if (s.type === 'rect') g.rect(s.x, s.y, s.w, s.h);
    else g.arc(s.x, s.y, s.r, 0, TAU);
    g.stroke();
  }

  // Walls: tall back wall, side walls and a low front ledge.
  g.fillStyle = b.wall;
  g.fillRect(-PAD, -WALL_H - PAD, W, PAD);
  const wallGrad = g.createLinearGradient(0, -WALL_H, 0, 0);
  wallGrad.addColorStop(0, b.wallTop);
  wallGrad.addColorStop(1, b.wall);
  g.fillStyle = wallGrad;
  g.fillRect(-PAD, -WALL_H, W, WALL_H);
  for (let x = 40; x < l.w; x += 160) {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x - 14, -WALL_H, 28, WALL_H);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x - 14, -WALL_H, 4, WALL_H);
  }
  g.fillStyle = b.trim;
  g.fillRect(-PAD, -8, W, 6);
  g.fillStyle = b.wallTop;
  g.fillRect(-PAD, -WALL_H - 12, W, 12);
  // floor shadow under back wall
  const sh = g.createLinearGradient(0, 0, 0, 70);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, l.w, 70);
  // side walls
  for (const sx of [-PAD, l.w]) {
    g.fillStyle = b.wall;
    g.fillRect(sx, -WALL_H, PAD, l.h + WALL_H + PAD);
    g.fillStyle = b.wallTop;
    g.fillRect(sx === -PAD ? -14 : l.w, -WALL_H, 14, l.h + WALL_H);
  }
  g.fillStyle = b.trim;
  g.fillRect(-4, 0, 4, l.h);
  g.fillRect(l.w, 0, 4, l.h);
  // front ledge
  g.fillStyle = b.wall;
  g.fillRect(-PAD, l.h, W, PAD);
  g.fillStyle = b.wallTop;
  g.fillRect(-PAD, l.h, W, 14);
  g.fillStyle = b.trim;
  g.fillRect(0, l.h, l.w, 3);
  // entrance gap
  g.fillStyle = '#050307';
  g.fillRect(l.entrance.x - 50, l.h, 100, PAD);
  return { canvas: c, scale };
}

// ---------------------------------------------------------------- shape helpers

function pathShape(ctx: CanvasRenderingContext2D, s: Shape, k = 1): void {
  ctx.beginPath();
  switch (s.type) {
    case 'circle':
      ctx.ellipse(s.x, s.y, s.r * k, s.r * k, 0, 0, TAU);
      break;
    case 'arc':
      ctx.moveTo(s.x, s.y);
      ctx.arc(s.x, s.y, s.r * k, s.angle - s.half, s.angle + s.half);
      ctx.closePath();
      break;
    case 'capsule': {
      const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * k;
      ctx.save();
      ctx.translate(s.x1, s.y1);
      ctx.rotate(a);
      ctx.moveTo(0, -s.r);
      ctx.lineTo(len, -s.r);
      ctx.arc(len, 0, s.r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(0, s.r);
      ctx.arc(0, 0, s.r, Math.PI / 2, Math.PI * 1.5);
      ctx.restore();
      break;
    }
    case 'ring':
      ctx.arc(s.x, s.y, s.r2, 0, TAU);
      ctx.arc(s.x, s.y, s.r1, 0, TAU, true);
      break;
  }
}

// ---------------------------------------------------------------- reward icons

export const REWARD_INFO: Record<RewardSpec['kind'], { glyph: string; color: string; label: string }> = {
  boon: { glyph: '✦', color: '#ffd890', label: 'Boon' },
  pom: { glyph: '❂', color: '#ff4a5a', label: 'Pomegranate' },
  gold: { glyph: '◎', color: '#ffd04a', label: 'Obols' },
  heart: { glyph: '♥', color: '#ff3a4a', label: 'Titan Heart' },
  ash: { glyph: '◆', color: '#c8a8ff', label: 'Ash' },
  hammer: { glyph: '⚒', color: '#d8d8e8', label: "Hephaestus' Anvil" },
  hermes: { glyph: '➶', color: '#e8e8ff', label: 'Hermes' },
  shop: { glyph: '⚖', color: '#ffd890', label: "Charon's Wares" },
  fountain: { glyph: '♒', color: '#7fd8ff', label: 'Fountain' },
  boss: { glyph: '☠', color: '#ff3a4a', label: 'Guardian' },
  antechamber: { glyph: '⌂', color: '#ffd890', label: 'Antechamber' },
  enchant: { glyph: '✧', color: '#c98bff', label: 'Enchanting Tome' },
  artifact: { glyph: '⚱', color: '#7fe8ff', label: 'Artifact Cache' },
};

export function rewardColor(r: RewardSpec): string {
  return r.kind === 'boon' && r.god ? GODS[r.god].color : REWARD_INFO[r.kind].color;
}

export function drawRewardIcon(ctx: CanvasRenderingContext2D, r: RewardSpec, x: number, y: number, size: number, t: number): void {
  const color = rewardColor(r);
  const glyph = r.kind === 'boon' && r.god ? GODS[r.god].glyph : REWARD_INFO[r.kind].glyph;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.6);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.45 + Math.sin(t * 3) * 0.1;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(10,6,14,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(size * 1.1)}px "Cinzel", Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, size * 0.06);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ---------------------------------------------------------------- dynamic world pieces

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, w: World): void {
  const b = w.biome;
  if (o.type === 'circle') {
    const tall = o.style === 'pillar' ? 120 : 34;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(o.x + 8, o.y + 4, o.r * 1.2, o.r * 0.55, 0, 0, TAU);
    ctx.fill();
    if (o.style === 'urn') {
      ctx.fillStyle = '#6a4030';
      ctx.beginPath();
      ctx.ellipse(o.x, o.y - o.r * 0.7, o.r, o.r * 1.1, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#8a5a40';
      ctx.fillRect(o.x - o.r * 0.5, o.y - o.r * 2, o.r, o.r * 0.5);
      ctx.strokeStyle = b.trim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(o.x, o.y - o.r * 0.7, o.r * 0.95, o.r * 0.3, 0, 0, TAU);
      ctx.stroke();
      return;
    }
    const g = ctx.createLinearGradient(o.x - o.r, 0, o.x + o.r, 0);
    g.addColorStop(0, b.wall);
    g.addColorStop(0.4, b.wallTop);
    g.addColorStop(1, b.wall);
    ctx.fillStyle = g;
    ctx.fillRect(o.x - o.r, o.y - tall, o.r * 2, tall);
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, o.r, o.r * 0.45, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = b.wallTop;
    ctx.beginPath();
    ctx.ellipse(o.x, o.y - tall, o.r * 1.15, o.r * 0.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = b.trim;
    ctx.fillRect(o.x - o.r, o.y - tall + 10, o.r * 2, 3);
    ctx.fillRect(o.x - o.r, o.y - 14, o.r * 2, 3);
  } else {
    const H = o.style === 'block' ? 80 : 56;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(o.x + 10, o.y + 10, o.w, o.h);
    ctx.fillStyle = b.wall;
    ctx.fillRect(o.x, o.y + o.h - H, o.w, H);
    ctx.fillStyle = b.wallTop;
    ctx.fillRect(o.x, o.y - H, o.w, o.h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(o.x, o.y - H, o.w, 4);
    ctx.fillStyle = b.trim;
    ctx.fillRect(o.x, o.y + o.h - H, o.w, 3);
  }
}

function drawLava(ctx: CanvasRenderingContext2D, w: World): void {
  for (const h of w.room.hazards) {
    if (h.kind !== 'lava') continue;
    const s = h.shape;
    ctx.save();
    ctx.beginPath();
    if (s.type === 'rect') ctx.roundRect(s.x, s.y, s.w, s.h, 30);
    else ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fillStyle = '#3a0a04';
    ctx.fill();
    ctx.clip();
    const cx = s.type === 'rect' ? s.x + s.w / 2 : s.x;
    const cy = s.type === 'rect' ? s.y + s.h / 2 : s.y;
    const R = s.type === 'rect' ? Math.max(s.w, s.h) : s.r;
    const g = ctx.createRadialGradient(cx, cy, 5, cx, cy, R);
    g.addColorStop(0, '#ffd04a');
    g.addColorStop(0.5, '#ff6a1a');
    g.addColorStop(1, '#8a1a08');
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.85 + Math.sin(w.time * 2) * 0.1;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#4a1206';
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7 + w.time * 0.15;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a * 1.3) * R * 0.4, R * 0.18, R * 0.1, a, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffb04a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (s.type === 'rect') ctx.roundRect(s.x, s.y, s.w, s.h, 30);
    else ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.stroke();
  }
}

function drawTraps(ctx: CanvasRenderingContext2D, w: World): void {
  const half = TRAP_SIZE / 2;
  for (const tr of w.traps) {
    ctx.fillStyle = '#2a2024';
    ctx.fillRect(tr.x - half, tr.y - half, TRAP_SIZE, TRAP_SIZE);
    ctx.strokeStyle = tr.state === 'armed' ? '#ff4a3a' : '#5a4a50';
    ctx.lineWidth = 2;
    ctx.strokeRect(tr.x - half, tr.y - half, TRAP_SIZE, TRAP_SIZE);
    const up = tr.state === 'up' ? 1 : tr.state === 'armed' ? 0.15 : 0;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = tr.x - half + 10 + i * 18;
        const y = tr.y - half + 12 + j * 16;
        if (up > 0) {
          ctx.fillStyle = '#d8d0d0';
          ctx.beginPath();
          ctx.moveTo(x - 4, y + 4);
          ctx.lineTo(x, y + 4 - 20 * up);
          ctx.lineTo(x + 4, y + 4);
          ctx.fill();
        } else {
          ctx.fillStyle = '#100a0c';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
}

function drawDoors(ctx: CanvasRenderingContext2D, w: World): void {
  for (const d of w.doors) {
    const x = d.x;
    ctx.fillStyle = '#050307';
    ctx.beginPath();
    ctx.moveTo(x - DOOR_W / 2, 0);
    ctx.lineTo(x - DOOR_W / 2, -80);
    ctx.quadraticCurveTo(x, -125, x + DOOR_W / 2, -80);
    ctx.lineTo(x + DOOR_W / 2, 0);
    ctx.fill();
    ctx.strokeStyle = w.biome.trim;
    ctx.lineWidth = 5;
    ctx.stroke();
    if (d.open && d.reward) {
      const col = rewardColor(d.reward);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, 0, -110);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.35 + Math.sin(w.time * 3 + x) * 0.1;
      ctx.fillStyle = g;
      ctx.fillRect(x - DOOR_W / 2 + 6, -110, DOOR_W - 12, 110);
      ctx.restore();
    } else if (!d.open) {
      ctx.strokeStyle = '#5a4a50';
      ctx.lineWidth = 4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 20, 0);
        ctx.lineTo(x + i * 20, -95 + Math.abs(i) * 6);
        ctx.stroke();
      }
    }
  }
}

function drawDoorIcons(ctx: CanvasRenderingContext2D, w: World): void {
  for (const d of w.doors) {
    if (!d.reward) continue;
    const bob = Math.sin(w.time * 2 + d.x) * 4;
    drawRewardIcon(ctx, d.reward, d.x, -150 + bob, 22, w.time);
  }
}

function drawPickup(ctx: CanvasRenderingContext2D, w: World, pk: World['pickups'][number]): void {
  if (pk.attached) return;
  const bob = pk.kind === 'reward' ? Math.sin(w.time * 3) * 5 + 30 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(pk.x, pk.y, pk.r * 0.8, pk.r * 0.35, 0, 0, TAU);
  ctx.fill();
  const y = pk.y - pk.z - bob - (pk.kind === 'reward' ? 0 : 6);
  switch (pk.kind) {
    case 'gold':
      ctx.fillStyle = '#ffd04a';
      ctx.beginPath();
      ctx.ellipse(pk.x, y, 7, 7 * Math.abs(Math.cos(pk.t * 6)) + 1, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#a07010';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    case 'heal':
      ctx.fillStyle = '#ff4a5a';
      ctx.font = '700 22px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('♥', pk.x, y + 8);
      break;
    case 'shard':
      ctx.save();
      ctx.translate(pk.x, y - 6);
      ctx.rotate(Math.sin(w.time * 3) * 0.3);
      ctx.fillStyle = '#ff3050';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(7, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-7, 0);
      ctx.fill();
      ctx.restore();
      break;
    case 'soul':
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(127,232,255,0.8)';
      ctx.beginPath();
      ctx.arc(pk.x, y - 10, 5 + Math.sin(pk.t * 10) * 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    case 'ash':
      ctx.fillStyle = '#c8a8ff';
      ctx.beginPath();
      ctx.moveTo(pk.x, y - 18);
      ctx.lineTo(pk.x + 9, y - 6);
      ctx.lineTo(pk.x, y + 4);
      ctx.lineTo(pk.x - 9, y - 6);
      ctx.fill();
      break;
    case 'reward':
      if (pk.reward) drawRewardIcon(ctx, pk.reward, pk.x, y, 24, w.time);
      break;
  }
}

function drawBreakable(ctx: CanvasRenderingContext2D, b: World['breakables'][number]): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(b.x, b.y, 15, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#7a4a34';
  ctx.beginPath();
  ctx.ellipse(b.x, b.y - 14, 13, 15, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#9a6a4a';
  ctx.fillRect(b.x - 6, b.y - 34, 12, 8);
  ctx.strokeStyle = '#3a2018';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(b.x - 12, b.y - 16);
  ctx.lineTo(b.x + 12, b.y - 16);
  ctx.stroke();
}

function drawInteractable(ctx: CanvasRenderingContext2D, w: World, it: Interactable): void {
  const t = w.time;
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 34, 12, 0, 0, TAU);
  ctx.fill();
  switch (it.kind) {
    case 'chest': {
      const open = it.used;
      ctx.fillStyle = '#6a4020';
      ctx.fillRect(-26, -28, 52, 28);
      ctx.fillStyle = '#d8a040';
      ctx.fillRect(-26, -16, 52, 4);
      ctx.fillRect(-4, -22, 8, 10);
      ctx.save();
      ctx.translate(-26, -28);
      ctx.rotate(open ? -1.2 : 0);
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(0, -16, 52, 16);
      ctx.fillStyle = '#d8a040';
      ctx.fillRect(0, -16, 52, 3);
      ctx.restore();
      if (!open) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,210,100,${0.15 + Math.sin(t * 3) * 0.08})`;
        ctx.beginPath();
        ctx.arc(0, -20, 40, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'fountain': {
      ctx.fillStyle = '#4a4a5a';
      ctx.beginPath();
      ctx.ellipse(0, -10, 50, 22, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = it.used ? '#2a3a4a' : '#3ab8ff';
      ctx.beginPath();
      ctx.ellipse(0, -14, 40, 15, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(-8, -60, 16, 46);
      if (!it.used) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(120,220,255,0.6)';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(Math.sin(t * 4 + i * 2) * 10, -62 + ((t * 40 + i * 12) % 40), 3, 0, TAU);
          ctx.fill();
        }
      }
      break;
    }
    case 'shop': {
      ctx.fillStyle = '#2a2230';
      ctx.fillRect(-26, -34, 52, 34);
      ctx.fillStyle = '#4a3a50';
      ctx.fillRect(-30, -40, 60, 8);
      if (!it.used) {
        ctx.translate(0, -68 + Math.sin(t * 2 + it.x) * 4);
        const spec = shopIconSpec(it);
        drawRewardIcon(ctx, spec, 0, 0, 18, t);
        ctx.fillStyle = '#ffd04a';
        ctx.font = '700 14px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${it.price ?? 0} ◎`, 0, 40);
      } else {
        ctx.fillStyle = '#8a7a8a';
        ctx.font = '600 12px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText('SOLD', 0, -50);
      }
      break;
    }
    case 'npc': {
      ctx.fillStyle = '#1a1420';
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-12, -70);
      ctx.lineTo(12, -70);
      ctx.lineTo(18, 0);
      ctx.fill();
      ctx.fillStyle = '#0a0810';
      ctx.beginPath();
      ctx.arc(0, -76, 13, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd04a';
      ctx.fillRect(-6, -78, 3, 3);
      ctx.fillRect(3, -78, 3, 3);
      ctx.strokeStyle = '#6a5a40';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(24, 0);
      ctx.lineTo(24, -96);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,255,160,0.5)';
      ctx.beginPath();
      ctx.arc(24, -100, 8 + Math.sin(t * 5) * 2, 0, TAU);
      ctx.fill();
      break;
    }
    case 'station':
      drawStation(ctx, it, t);
      break;
  }
  ctx.restore();
}

function shopIconSpec(it: Interactable): RewardSpec {
  const kind = it.id.split(':')[1] as RewardSpec['kind'];
  const god = it.id.split(':')[2] as RewardSpec['god'];
  return { kind: kind in REWARD_INFO ? kind : 'boon', god };
}

function drawStation(ctx: CanvasRenderingContext2D, it: Interactable, t: number): void {
  const col = it.color ?? '#ffd890';
  if (it.id === 'mirror') {
    ctx.fillStyle = '#1a1024';
    ctx.beginPath();
    ctx.ellipse(0, -70, 34, 60, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#c8a050';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -70, 4, 0, -70, 50);
    g.addColorStop(0, `rgba(200,140,255,${0.5 + Math.sin(t * 2) * 0.15})`);
    g.addColorStop(1, 'rgba(80,40,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -70, 30, 55, 0, 0, TAU);
    ctx.fill();
    return;
  }
  if (it.id === 'weapons') {
    ctx.fillStyle = '#3a2a24';
    ctx.fillRect(-46, -70, 92, 10);
    ctx.fillRect(-46, -20, 92, 8);
    ctx.fillRect(-46, -76, 6, 76);
    ctx.fillRect(40, -76, 6, 76);
    const colors = ['#ff5a6a', '#ffb14a', '#8ad0ff'];
    colors.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-26 + i * 26, -12);
      ctx.lineTo(-26 + i * 26, -90);
      ctx.stroke();
    });
    return;
  }
  if (it.id === 'artifacts') {
    ctx.fillStyle = '#2a3238';
    ctx.fillRect(-50, -60, 100, 60);
    ctx.fillStyle = '#3a4a52';
    ctx.fillRect(-50, -64, 100, 6);
    ['#7dff8a', '#ffe45c', '#7fe8ff'].forEach((c, i) => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.7 + Math.sin(t * 3 + i) * 0.2;
      ctx.beginPath();
      ctx.arc(-30 + i * 30, -34, 8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    });
    return;
  }
  if (it.id === 'chronicle') {
    ctx.fillStyle = '#3a2a24';
    ctx.fillRect(-8, -50, 16, 50);
    ctx.fillStyle = '#5a4030';
    ctx.beginPath();
    ctx.moveTo(-34, -50);
    ctx.lineTo(34, -50);
    ctx.lineTo(28, -66);
    ctx.lineTo(-28, -66);
    ctx.fill();
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(-26, -64, 24, 12);
    ctx.fillRect(2, -64, 24, 12);
    return;
  }
  if (it.id === 'pact') {
    ctx.fillStyle = '#2a0e14';
    ctx.fillRect(-30, -56, 60, 56);
    ctx.strokeStyle = '#ff4a5a';
    ctx.lineWidth = 3;
    ctx.strokeRect(-30, -56, 60, 56);
    ctx.fillStyle = '#ff4a5a';
    ctx.font = '700 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('☠', 0, -18);
    return;
  }
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(0, -30, 16, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------- emissive

function drawProjectile(ctx: CanvasRenderingContext2D, pr: Projectile, t: number): void {
  const y = pr.y - pr.z;
  if (pr.lob || pr.style === 'glob' || pr.style === 'bomb') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(pr.x, pr.y, pr.r, pr.r * 0.4, 0, 0, TAU);
    ctx.fill();
  }
  const a = pr.angle;
  switch (pr.style) {
    case 'arrow':
    case 'needle': {
      ctx.strokeStyle = pr.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pr.x - Math.cos(a) * 26, y - Math.sin(a) * 26);
      ctx.lineTo(pr.x, y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      break;
    }
    case 'spear': {
      ctx.save();
      ctx.translate(pr.x, y);
      ctx.rotate(a);
      ctx.strokeStyle = '#6a4630';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-60, 0);
      ctx.lineTo(10, 0);
      ctx.stroke();
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.moveTo(8, -6);
      ctx.lineTo(30, 0);
      ctx.lineTo(8, 6);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'shard': {
      ctx.save();
      ctx.translate(pr.x, y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pr.color;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(0, -7);
      ctx.lineTo(-16, 0);
      ctx.lineTo(0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(pr.x, y, pr.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = Math.floor(t * 16) % 2 ? '#ffd04a' : pr.color;
      ctx.beginPath();
      ctx.arc(pr.x + 4, y - pr.r, 3, 0, TAU);
      ctx.fill();
      break;
    }
    default: {
      ctx.globalCompositeOperation = 'lighter';
      const r = pr.r * (pr.style === 'fire' ? 1.4 : 1.2);
      const g = ctx.createRadialGradient(pr.x, y, 1, pr.x, y, r * 1.6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, pr.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pr.x, y, r * 1.6, 0, TAU);
      ctx.fill();
      if (pr.charged) {
        ctx.strokeStyle = GODS.zeus.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pr.x, y, r + 3 + Math.sin(t * 40) * 2, 0, TAU);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, t: number): void {
  const fade = Math.min(1, z.ttl * 3, z.age * 6);
  ctx.save();
  ctx.globalAlpha = fade;
  switch (z.kind) {
    case 'bladeRift': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = GODS.ares.color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = t * 9 + (i / 6) * TAU;
        ctx.beginPath();
        ctx.arc(z.x, z.y - 10, z.r * 0.8, a, a + 0.5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,60,60,0.15)';
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case 'fog': {
      for (let i = 0; i < 5; i++) {
        const a = t * 0.6 + i * 1.3;
        ctx.fillStyle = 'rgba(160,90,230,0.18)';
        ctx.beginPath();
        ctx.arc(z.x + Math.cos(a) * z.r * 0.4, z.y + Math.sin(a) * z.r * 0.25 - 10, z.r * 0.6, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'storm': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,228,92,${0.4 + Math.sin(t * 30) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y - 30, 14 + Math.sin(t * 20) * 3, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'heal': {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(125,255,138,0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r, z.r * 0.55, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(125,255,138,0.1)';
      ctx.fill();
      ctx.fillStyle = 'rgba(160,255,170,0.8)';
      ctx.font = '700 16px Georgia, serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.8 + i / 3) % 1;
        ctx.globalAlpha = fade * (1 - k);
        ctx.fillText('+', z.x + Math.cos(i * 2.1) * z.r * 0.5, z.y - k * 50);
      }
      if (z.r > 120) {
        // Mending totem pole
        ctx.globalAlpha = fade;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#4a6a3a';
        ctx.fillRect(z.x - 6, z.y - 60, 12, 60);
        ctx.fillStyle = '#7dff8a';
        ctx.beginPath();
        ctx.arc(z.x, z.y - 66, 9, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'fire': {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const a = t * 3 + i * 1.6;
        ctx.fillStyle = 'rgba(255,120,40,0.35)';
        ctx.beginPath();
        ctx.ellipse(z.x + Math.cos(a) * z.r * 0.3, z.y + Math.sin(a) * z.r * 0.2, z.r * 0.6, z.r * 0.35, 0, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'web': {
      ctx.strokeStyle = 'rgba(230,230,240,0.55)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(z.x, z.y);
        ctx.lineTo(z.x + Math.cos(a) * z.r, z.y + Math.sin(a) * z.r * 0.6);
        ctx.stroke();
      }
      for (const k of [0.35, 0.7, 1]) {
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, z.r * k, z.r * k * 0.6, 0, 0, TAU);
        ctx.stroke();
      }
      break;
    }
    default:
      ctx.fillStyle = 'rgba(200,230,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, TAU);
      ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- lighting

function renderLights(w: World, ctx: CanvasRenderingContext2D, dpr: number): void {
  const cam = w.camera;
  const lw = Math.max(1, Math.ceil((cam.vw * dpr) / 2));
  const lh = Math.max(1, Math.ceil((cam.vh * dpr) / 2));
  if (!lightCanvas) lightCanvas = document.createElement('canvas');
  if (lightCanvas.width !== lw || lightCanvas.height !== lh) {
    lightCanvas.width = lw;
    lightCanvas.height = lh;
  }
  const g = lightCanvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = w.biome.ambient;
  g.fillRect(0, 0, lw, lh);
  cam.apply(g, dpr / 2);
  g.globalCompositeOperation = 'lighter';
  const light = (x: number, y: number, r: number, color: string, a = 1) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const p = w.player;
  light(p.x, p.y - 30, 420, 'rgba(255,190,150,0.55)');
  for (const b of w.room.braziers) light(b.x, b.y, 300 + Math.sin(w.time * 7 + b.x) * 15, 'rgba(255,140,70,0.6)');
  for (const h of w.room.hazards) {
    if (h.kind !== 'lava') continue;
    const s = h.shape;
    const cx = s.type === 'rect' ? s.x + s.w / 2 : s.x;
    const cy = s.type === 'rect' ? s.y + s.h / 2 : s.y;
    const r = s.type === 'rect' ? Math.max(s.w, s.h) : s.r * 2.2;
    light(cx, cy, r, 'rgba(255,110,40,0.55)');
  }
  for (const pr of w.projectiles) light(pr.x, pr.y - pr.z, 70, pr.color, 0.45);
  for (const f of w.flashes) light(f.x, f.y, f.r, f.color, 1 - f.t / f.dur);
  for (const pk of w.pickups) if (pk.kind === 'reward') light(pk.x, pk.y - 30, 200, 'rgba(255,220,150,0.6)');
  for (const d of w.doors) if (d.open && d.reward) light(d.x, -40, 220, rewardColor(d.reward), 0.5);
  for (const z of w.zones) if (z.kind === 'heal' || z.kind === 'storm' || z.kind === 'fire') light(z.x, z.y, z.r * 1.4, z.kind === 'heal' ? 'rgba(125,255,138,0.5)' : 'rgba(255,200,90,0.5)');
  for (const it of w.interactables) {
    if (it.kind === 'station' || it.kind === 'fountain') light(it.x, it.y - 40, 220, it.color ?? 'rgba(200,160,255,0.5)', 0.5);
  }
  if (p.beamT > 0) light(p.x + Math.cos(p.aim) * 200, p.y + Math.sin(p.aim) * 200, 360, 'rgba(200,107,255,0.7)');
  for (const e of w.enemies) if (e.isBoss && !e.dead) light(e.x, e.y - e.height / 2, 260, 'rgba(255,90,90,0.3)');
  g.globalAlpha = 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCanvas, 0, 0, cam.vw * dpr, cam.vh * dpr);
  ctx.restore();
}

// ---------------------------------------------------------------- main entry

export function renderWorld(w: World, ctx: CanvasRenderingContext2D, dpr: number): void {
  const cam = w.camera;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#07050a';
  ctx.fillRect(0, 0, cam.vw * dpr, cam.vh * dpr);
  cam.apply(ctx, dpr);

  let rc = cache.get(w);
  if (!rc) {
    rc = buildRoomCanvas(w, dpr);
    cache.set(w, rc);
  }
  ctx.drawImage(rc.canvas, -PAD, -PAD - WALL_H, rc.canvas.width / rc.scale, rc.canvas.height / rc.scale);

  drawLava(ctx, w);
  drawTraps(ctx, w);
  drawDoors(ctx, w);
  for (const z of w.zones) if (z.kind === 'web' || z.kind === 'fog') drawZone(ctx, z, w.time);

  // ---- y-sorted props & actors
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const o of w.room.obstacles) items.push({ y: o.type === 'rect' ? o.y + o.h : o.y, draw: () => drawObstacle(ctx, o, w) });
  for (const b of w.breakables) if (!b.dead) items.push({ y: b.y, draw: () => drawBreakable(ctx, b) });
  for (const it of w.interactables) items.push({ y: it.y, draw: () => drawInteractable(ctx, w, it) });
  for (const pk of w.pickups) items.push({ y: pk.y, draw: () => drawPickup(ctx, w, pk) });
  for (const e of w.enemies) {
    items.push({
      y: e.y,
      draw: () => {
        if (e.dead) {
          ctx.globalAlpha = Math.max(0, 1 - e.deathT / 0.6);
          ctx.save();
          ctx.translate(e.x, e.y);
          ctx.scale(1 + e.deathT, 1 - e.deathT * 0.8);
          ctx.translate(-e.x, -e.y);
          e.draw(ctx, w);
          ctx.restore();
          ctx.globalAlpha = 1;
        } else e.draw(ctx, w);
      },
    });
  }
  for (const a of w.allies) items.push({ y: a.y, draw: () => a.draw(ctx) });
  items.push({ y: w.player.y, draw: () => w.player.draw(ctx, w) });
  const weapon = w.player.weapon;
  if (isSpear(weapon)) items.push({ y: (weapon.thrown?.y ?? w.player.y) - 1, draw: () => weapon.drawWorld(ctx, w) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  renderLights(w, ctx, dpr);

  // ---- emissive & UI-in-world
  cam.apply(ctx, dpr);
  for (const tg of w.telegraphs) {
    const k = clamp(tg.t / tg.dur, 0, 1);
    const fade = tg.cancelled ? Math.max(0, 1 - (tg.t - tg.dur) / 0.15) : 1;
    ctx.save();
    ctx.globalAlpha = 0.18 * fade;
    ctx.fillStyle = tg.color;
    pathShape(ctx, tg.shape);
    ctx.fill();
    ctx.globalAlpha = 0.35 * fade;
    pathShape(ctx, tg.shape, k);
    ctx.fill();
    ctx.globalAlpha = 0.8 * fade;
    ctx.strokeStyle = tg.color;
    ctx.lineWidth = 2;
    pathShape(ctx, tg.shape);
    ctx.stroke();
    ctx.restore();
  }
  // Shockwaves (growing ring hitboxes)
  for (const hb of w.hitboxes) {
    if (hb.shape.type !== 'ring' || hb.team !== 'enemy') continue;
    const s = hb.shape;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,170,90,0.85)';
    ctx.lineWidth = s.r2 - s.r1;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, (s.r1 + s.r2) / 2, ((s.r1 + s.r2) / 2) * 0.92, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,220,0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  for (const z of w.zones) if (z.kind !== 'web' && z.kind !== 'fog') drawZone(ctx, z, w.time);
  w.particles.draw(ctx, 'ground');

  for (const s of w.swipes) {
    const k = s.t / s.dur;
    const x = s.owner ? s.owner.x : s.x;
    const y = (s.owner ? s.owner.y : s.y) - 22;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = s.color;
    ctx.lineCap = 'round';
    ctx.lineWidth = s.width * (1 - k * 0.6);
    ctx.beginPath();
    if (s.full) ctx.ellipse(x, y + 10, s.r * 0.85, s.r * 0.6, 0, 0, TAU);
    else if (s.half < 0.3) {
      ctx.moveTo(x + Math.cos(s.angle) * 20, y + Math.sin(s.angle) * 20);
      ctx.lineTo(x + Math.cos(s.angle) * s.r, y + Math.sin(s.angle) * s.r);
    } else {
      const sweep = s.half * 2 * Math.min(1, k * 2.5);
      const start = s.dir > 0 ? s.angle - s.half : s.angle + s.half;
      ctx.arc(x, y, s.r * 0.8, start, start + sweep * s.dir, s.dir < 0);
    }
    ctx.stroke();
    ctx.restore();
  }

  for (const pr of w.projectiles) drawProjectile(ctx, pr, w.time);
  drawBeam(ctx, w);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  for (const b of w.bolts) {
    const a = 1 - b.t / b.dur;
    ctx.globalAlpha = a;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 8;
    ctx.globalAlpha = a * 0.35;
    ctx.beginPath();
    b.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.restore();

  w.particles.draw(ctx, 'air');
  for (const e of w.enemies) if (!e.dead && !e.spawning) e.drawStatus(ctx);
  drawDoorIcons(ctx, w);

  // Interact prompt
  const f = w.focus;
  if (f) {
    const label = f.kind === 'shop' && f.price !== undefined ? `${f.label} — ${f.price} ◎` : f.label;
    const y = f.y - (f.kind === 'shop' ? 120 : 110);
    ctx.font = '600 15px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(`${label}`).width;
    ctx.fillStyle = 'rgba(8,4,12,0.85)';
    ctx.fillRect(f.x - tw / 2 - 40, y - 20, tw + 80, 30);
    ctx.strokeStyle = 'rgba(255,216,144,0.6)';
    ctx.strokeRect(f.x - tw / 2 - 40, y - 20, tw + 80, 30);
    ctx.fillStyle = '#ffd890';
    ctx.fillText(`[E] ${f.prompt}: ${label}`, f.x, y);
  }

  // ---- screen-space overlays
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.35, cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cam.vw, cam.vh);
  const p = w.player;
  const low = p.hp / p.maxHp;
  if (w.hurtFlash > 0 || (low < 0.3 && p.state !== 'dead')) {
    const a = Math.max(w.hurtFlash * 1.2, low < 0.3 ? (0.3 - low) * 1.2 * (0.6 + Math.sin(w.time * 5) * 0.4) : 0);
    const hg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.3, cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.7);
    hg.addColorStop(0, 'rgba(255,0,0,0)');
    hg.addColorStop(1, `rgba(200,0,20,${Math.min(0.6, a)})`);
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, cam.vw, cam.vh);
  }
}

export function invalidateRoomCache(w: World): void {
  cache.delete(w);
}

