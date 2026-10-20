import { clamp, TAU } from '../engine/math';
import { drawBeam } from './artifacts';
import { GODS } from './boons';
import type { Projectile, Zone } from './entities';
import { DOOR_W, LEDGE_H, levelAt, TRAP_SIZE, WALL_H, type Obstacle, type RoomLayout } from './rooms';
import type { RewardSpec, Shape } from './types';
import { REVIVE_RANGE, REVIVE_TIME, type Interactable, type World } from './world';
import { prefs } from './prefs';
import { GEAR_RARITY, MATERIALS, SLOT_PATH, type GearSlot } from './gear';
import { isSpear, WEAPON_INFO } from './weapons';

const PAD = 90;

/** Presentation switches set by the game each frame. */
export const renderOpts: { touch: boolean; textScale: number; mouse: { x: number; y: number } | null; shopSeen: readonly string[] } = {
  touch: false,
  textScale: 1,
  mouse: null,
  shopSeen: [],
};

/** What each of Charon's wares does; shown once you've bought that kind before. */
export const SHOP_INFO: Partial<Record<RewardSpec['kind'], string>> = {
  boon: "Choose 1 of 3 of this god's boons.",
  pom: 'Level up one of your boons.',
  fountain: 'Restore half of your health.',
  heart: '+25 max health for this escape.',
  enchant: 'Choose an enchantment for your weapon.',
  artifact: 'Choose an artifact for this escape.',
  hammer: 'Choose an upgrade for your weapon.',
  hermes: "Choose 1 of Hermes' speed boons.",
};

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

/** Raised ground: a lit top a level up, a stone face along its south edge, and a glowing rim. */
function drawLedges(g: CanvasRenderingContext2D, l: RoomLayout, b: World['biome']): void {
  const ledges = [...(l.ledges ?? [])].sort((a, c) => a.lv - c.lv || a.y + a.h - (c.y + c.h));
  for (const e of ledges) {
    const top = e.lv * LEDGE_H;
    const base = (e.lv - 1) * LEDGE_H;
    // Shadow cast to the south.
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(e.x + 6, e.y + e.h - base, e.w, 16);
    // Face along the south edge.
    const face = g.createLinearGradient(0, e.y + e.h - top, 0, e.y + e.h - base);
    face.addColorStop(0, b.wallTop);
    face.addColorStop(1, b.wall);
    g.fillStyle = face;
    g.fillRect(e.x, e.y + e.h - top, e.w, LEDGE_H);
    for (let x = e.x + 20; x < e.x + e.w; x += 40) {
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, e.y + e.h - top, 2, LEDGE_H);
    }
    // Top: the floor tiles, a shade brighter.
    for (let ty = e.y; ty < e.y + e.h; ty += 80) {
      for (let tx = e.x; tx < e.x + e.w; tx += 80) {
        const r = hash(tx, ty, l.seed + e.lv);
        g.fillStyle = r < 0.5 ? b.floorA : b.floorB;
        g.fillRect(tx, ty - top, Math.min(80, e.x + e.w - tx), Math.min(80, e.y + e.h - ty));
      }
    }
    g.fillStyle = `rgba(255,255,255,${0.05 + e.lv * 0.03})`;
    g.fillRect(e.x, e.y - top, e.w, e.h);
    g.strokeStyle = b.grout;
    g.lineWidth = 2;
    for (let tx = e.x + 80; tx < e.x + e.w; tx += 80) {
      g.beginPath();
      g.moveTo(tx, e.y - top);
      g.lineTo(tx, e.y + e.h - top);
      g.stroke();
    }
    // Rim: a lit lip and a glowing edge so the drop is easy to read.
    g.strokeStyle = b.wallTop;
    g.lineWidth = 5;
    g.strokeRect(e.x + 2.5, e.y - top + 2.5, e.w - 5, e.h - 5);
    g.fillStyle = b.trim;
    g.fillRect(e.x, e.y + e.h - top - 3, e.w, 3);
    g.fillStyle = `${b.trim}88`;
    g.fillRect(e.x, e.y - top, e.w, 2);
  }
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

  drawLedges(g, l, b);

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

export const REWARD_INFO: Record<RewardSpec['kind'], { glyph: string; color: string; label: string; desc: string }> = {
  boon: { glyph: '✦', color: '#ffd890', label: 'Boon', desc: 'Fight, then choose 1 of 3 boons' },
  pom: { glyph: '❂', color: '#ff4a5a', label: 'Pomegranate', desc: 'Fight, then level up a boon' },
  gold: { glyph: '◎', color: '#ffd04a', label: 'Obols', desc: "Fight for coins to spend at Charon's shop" },
  heart: { glyph: '♥', color: '#ff3a4a', label: 'Titan Heart', desc: 'Fight for +25 max Health this run' },
  ash: { glyph: '◆', color: '#c8a8ff', label: 'Ash', desc: 'Fight for Ash, kept after death' },
  hammer: { glyph: '⚒', color: '#d8d8e8', label: "Hephaestus' Anvil", desc: 'Enchanted foes · upgrade your weapon' },
  hermes: { glyph: '➶', color: '#e8e8ff', label: 'Hermes', desc: 'Fight, then pick a speed boon' },
  shop: { glyph: '⚖', color: '#ffd890', label: "Charon's Wares", desc: 'No fight · buy with obols' },
  fountain: { glyph: '♒', color: '#7fd8ff', label: 'Fountain', desc: 'No fight · restore health' },
  boss: { glyph: '☠', color: '#ff3a4a', label: 'Guardian', desc: "This region's guardian" },
  antechamber: { glyph: '⌂', color: '#ffd890', label: 'Antechamber', desc: 'Shop and fountain before the guardian' },
  enchant: { glyph: '✧', color: '#c98bff', label: 'Enchanting Tome', desc: 'Fight, then add an enchantment' },
  artifact: { glyph: '⚱', color: '#7fe8ff', label: 'Artifact Cache', desc: 'Enchanted foes · find an artifact' },
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
  } else if (o.style === 'rock') {
    // Solid rock the chamber is cut from: a tall face along its south edge, a dark top.
    const H = 76;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(o.x - 6, o.y + o.h, o.w + 12, 18);
    ctx.fillStyle = '#07050a';
    ctx.fillRect(o.x, o.y - H, o.w, o.h);
    // Rough stone top: the dark void of solid rock with faint cracks.
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = o.y - H + 30; y < o.y + o.h - H - 10; y += 46) {
      for (let x = o.x + ((y / 46) % 2 ? 20 : 50); x < o.x + o.w - 30; x += 90) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 26, y + 8);
        ctx.lineTo(x + 40, y - 4);
      }
    }
    ctx.stroke();
    const face = ctx.createLinearGradient(0, o.y + o.h - H, 0, o.y + o.h);
    face.addColorStop(0, b.wallTop);
    face.addColorStop(1, b.wall);
    ctx.fillStyle = face;
    ctx.fillRect(o.x, o.y + o.h - H, o.w, H);
    for (let x = o.x + 40; x < o.x + o.w - 20; x += 160) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - 12, o.y + o.h - H, 24, H);
    }
    ctx.strokeStyle = b.wallTop;
    ctx.lineWidth = 8;
    ctx.strokeRect(o.x + 4, o.y - H + 4, o.w - 8, o.h - 8);
    ctx.strokeStyle = `${b.trim}66`;
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 9, o.y - H + 9, o.w - 18, o.h - 18);
    ctx.fillStyle = b.trim;
    ctx.fillRect(o.x, o.y + o.h - 5, o.w, 3);
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

let overlayDpr = 1;

/**
 * Draws `fn` unturned and unsquashed, at the UI text size, so labels, icons
 * and health bars stay upright and readable. `fn` draws as if in the flat view
 * around the point (x, y - z); that point lands where the view shows height z
 * above the ground point (x, y).
 */
function upright(ctx: CanvasRenderingContext2D, w: World, x: number, y: number, z: number, fn: () => void): void {
  const cam = w.camera;
  const up = cam.lift;
  const s = cam.worldToScreen({ x: x + up.x * z, y: y + up.y * z });
  const k = renderOpts.textScale * overlayDpr;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, s.x * overlayDpr - x * k, s.y * overlayDpr - (y - z) * k);
  fn();
  ctx.restore();
}

/** The ground point under height z at (x, y), for 2D drawing. */
function lifted(w: World, x: number, y: number, z: number): { x: number; y: number } {
  const up = w.camera.lift;
  return { x: x + up.x * z, y: y + up.y * z };
}

function drawDoorIcons(ctx: CanvasRenderingContext2D, w: World): void {
  const view = w.viewers;
  const mouse = renderOpts.mouse;
  for (const d of w.doors) {
    if (!d.reward) continue;
    const reward = d.reward;
    const bob = Math.sin(w.time * 2 + d.x) * 4;
    const iconZ = 150 - bob;
    upright(ctx, w, d.x, 0, iconZ, () => drawRewardIcon(ctx, reward, d.x, -iconZ, 22, w.time));
    if (!d.open) continue;
    const info = REWARD_INFO[reward.kind];
    const title = `${reward.painted ? 'Painted · ' : ''}${reward.kind === 'boon' && reward.god ? `${GODS[reward.god].name}'s Boon` : info.label}`;
    const dist = Math.min(...view.map((p) => Math.hypot(p.x - d.x, p.y)));
    const near = dist < 460;
    if (!renderOpts.touch) {
      // Mouse play: the description pops up beside the icon when you point at it
      // (or walk right up to the door).
      const up = w.camera.lift;
      const at = w.camera.worldToScreen({ x: d.x + up.x * iconZ, y: up.y * iconZ });
      const hover = !!mouse && Math.hypot(mouse.x - at.x, mouse.y - at.y) < 26 * renderOpts.textScale;
      if (hover || dist < 170) upright(ctx, w, d.x, 0, iconZ, () => doorCard(ctx, w, reward, title, info.desc, d.x, -iconZ + 52, 1));
      continue;
    }
    // Touch: on the floor just in front of the door, so it's on screen even on
    // phones (the wall above the door can be out of view). Always (setting) or
    // when you walk up to it; fades when you stand on it.
    if (!(prefs.doorInfo || near)) continue;
    const y = 84;
    const onIt = view.some((p) => Math.abs(p.x - d.x) < 110 && Math.abs(p.y - y) < 50);
    upright(ctx, w, d.x, y, 0, () => doorCard(ctx, w, reward, title, info.desc, d.x, y, onIt ? 0.35 : near ? 1 : 0.85));
  }
}

/** A door's "what lies beyond" plate, centred at (x, y). */
function doorCard(ctx: CanvasRenderingContext2D, w: World, reward: RewardSpec, title: string, desc: string, x: number, y: number, alpha: number): void {
  ctx.font = '700 15px "Cinzel", Georgia, serif';
  const tw = ctx.measureText(title).width;
  ctx.font = 'italic 13px "EB Garamond", Georgia, serif';
  const dw = ctx.measureText(desc).width;
  const bw = Math.max(tw + 30, dw) + 24;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(8,4,12,0.88)';
  ctx.fillRect(x - bw / 2, y - 16, bw, 42);
  ctx.strokeStyle = rewardColor(reward);
  ctx.lineWidth = 1;
  ctx.strokeRect(x - bw / 2, y - 16, bw, 42);
  drawRewardIcon(ctx, reward, x - tw / 2 - 6, y - 4, 9, w.time);
  ctx.textAlign = 'center';
  ctx.fillStyle = rewardColor(reward);
  ctx.font = '700 15px "Cinzel", Georgia, serif';
  ctx.fillText(title, x + 10, y + 1);
  ctx.fillStyle = '#d8c8c0';
  ctx.font = 'italic 13px "EB Garamond", Georgia, serif';
  ctx.fillText(desc, x, y + 18);
  ctx.globalAlpha = 1;
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
    case 'loot': {
      const l = pk.loot;
      if (!l) break;
      const color = l.gear ? GEAR_RARITY[l.gear.rarity].color : MATERIALS[l.material ?? 'bone'].color;
      const glyph = MATERIALS[l.material ?? 'bone'].glyph;
      const size = l.gear ? 15 : 10;
      const hover = y - 10 + Math.sin(w.time * 4 + pk.x) * 3;
      // A soft beam marks gear so it isn't missed.
      if (l.gear) {
        // Legendary, Unique and Ghost pieces throw up a taller, pulsing beam.
        const top = l.gear.rarity === 'ghost' || l.gear.rarity === 'unique' || l.gear.rarity === 'legendary';
        const bh = top ? 140 : 60;
        const bw = top ? 10 : 6;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, hover - bh, 0, hover);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, color);
        ctx.globalAlpha = top ? 0.4 + Math.sin(w.time * 5) * 0.15 : 0.35;
        ctx.fillStyle = g;
        ctx.fillRect(pk.x - bw, hover - bh, bw * 2, bh);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(10,6,14,0.85)';
      ctx.beginPath();
      ctx.arc(pk.x, hover, size, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Special frames: a gilded double ring for Legendary, a circling spectral ring for Ghost.
      if (l.gear?.rarity === 'legendary') {
        ctx.strokeStyle = '#fff2c0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(pk.x, hover, size + 4, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + w.time * 0.6;
          ctx.fillStyle = '#ffe08a';
          ctx.fillRect(pk.x + Math.cos(a) * (size + 4) - 2, hover + Math.sin(a) * (size + 4) - 2, 4, 4);
        }
      } else if (l.gear?.rarity === 'ghost') {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.5 + Math.sin(w.time * 6) * 0.3;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pk.x, hover, size + 5, w.time * 2, w.time * 2 + TAU * 0.6);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = color;
      if (l.gear) {
        // Gear shows its slot's icon: helm, breastplate, leggings or boots.
        const k = (size * 1.35) / 24;
        ctx.save();
        ctx.translate(pk.x - 12 * k, hover - 12 * k);
        ctx.scale(k, k);
        ctx.fill(slotPath(l.gear.slot), 'evenodd');
        ctx.restore();
        break;
      }
      ctx.font = `700 ${Math.round(size * 1.1)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, pk.x, hover + 1);
      ctx.textBaseline = 'alphabetic';
      break;
    }
  }
}

const slotPaths = new Map<GearSlot, Path2D>();
/** A gear slot's icon as a canvas path (built once). */
function slotPath(slot: GearSlot): Path2D {
  let p = slotPaths.get(slot);
  if (!p) slotPaths.set(slot, (p = new Path2D(SLOT_PATH[slot])));
  return p;
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
  if (it.id === 'smith') {
    // The Blacksmith's corner: a furnace glowing behind, an anvil, and the smith.
    ctx.fillStyle = '#2a1e1a';
    ctx.fillRect(-58, -92, 48, 92);
    ctx.fillStyle = '#3a2a24';
    ctx.fillRect(-62, -98, 56, 10);
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(-34, -30, 2, -34, -30, 34);
    glow.addColorStop(0, `rgba(255,160,70,${0.75 + Math.sin(t * 6) * 0.15})`);
    glow.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-70, -66, 72, 72);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ff9a4a';
    ctx.fillRect(-46, -40, 24, 18);
    // Anvil
    ctx.fillStyle = '#4a4a56';
    ctx.fillRect(4, -30, 44, 10);
    ctx.fillRect(16, -20, 20, 14);
    ctx.fillRect(8, -6, 36, 6);
    ctx.beginPath();
    ctx.moveTo(48, -30);
    ctx.lineTo(60, -26);
    ctx.lineTo(48, -22);
    ctx.fill();
    // The smith
    ctx.fillStyle = '#5a3a2a';
    ctx.fillRect(48, -62, 22, 34);
    ctx.fillStyle = '#d8a888';
    ctx.fillRect(52, -78, 14, 14);
    ctx.fillStyle = '#8a8a96';
    ctx.save();
    ctx.translate(46, -56);
    ctx.rotate(-0.6 + Math.max(0, Math.sin(t * 3)) * 0.9);
    ctx.fillRect(-2, -16, 4, 18);
    ctx.fillRect(-6, -20, 12, 6);
    ctx.restore();
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
  if (it.id === 'heroes') {
    // A plinth with a ghostly hero silhouette.
    ctx.fillStyle = '#3a2a30';
    ctx.fillRect(-30, -22, 60, 22);
    ctx.fillStyle = '#4a3840';
    ctx.fillRect(-34, -28, 68, 8);
    ctx.globalCompositeOperation = 'lighter';
    const a = 0.45 + Math.sin(t * 2) * 0.12;
    ctx.fillStyle = `rgba(255,140,110,${a})`;
    ctx.beginPath();
    ctx.moveTo(-14, -30);
    ctx.quadraticCurveTo(-17, -56, -9, -70);
    ctx.lineTo(9, -70);
    ctx.quadraticCurveTo(17, -56, 14, -30);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -80, 9, 0, TAU);
    ctx.fill();
    return;
  }
  if (it.id === 'ascension') {
    // A standing stone etched with a glowing constellation.
    ctx.fillStyle = '#2a2630';
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-20, -84);
    ctx.quadraticCurveTo(0, -100, 20, -84);
    ctx.lineTo(26, 0);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const stars = [
      [-10, -70],
      [6, -78],
      [12, -56],
      [-4, -46],
      [-12, -28],
      [8, -24],
    ];
    ctx.strokeStyle = `rgba(255,230,140,${0.35 + Math.sin(t * 1.5) * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    stars.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    stars.forEach(([x, y], i) => {
      ctx.fillStyle = `rgba(255,236,160,${0.6 + Math.sin(t * 3 + i) * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, TAU);
      ctx.fill();
    });
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

function drawProjectile(ctx: CanvasRenderingContext2D, pr: Projectile, t: number, up: { x: number; y: number }): void {
  const px = pr.x + up.x * pr.z;
  const y = pr.y + up.y * pr.z;
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
      ctx.moveTo(px - Math.cos(a) * 26, y - Math.sin(a) * 26);
      ctx.lineTo(px, y);
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
      ctx.translate(px, y);
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
      ctx.translate(px, y);
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
    case 'crescent': {
      // Awakened-weapon wave: a glowing arc facing its flight direction.
      ctx.save();
      ctx.translate(px, y);
      ctx.rotate(a);
      ctx.globalCompositeOperation = 'lighter';
      const fade = Math.min(1, pr.ttl * 5);
      ctx.globalAlpha = fade;
      ctx.strokeStyle = pr.color;
      ctx.lineWidth = pr.r * 0.5;
      ctx.beginPath();
      ctx.arc(-pr.r * 0.6, 0, pr.r * 1.4, -1.1, 1.1);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = pr.r * 0.18;
      ctx.beginPath();
      ctx.arc(-pr.r * 0.6, 0, pr.r * 1.4, -0.9, 0.9);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'bomb': {
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(px, y, pr.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = Math.floor(t * 16) % 2 ? '#ffd04a' : pr.color;
      ctx.beginPath();
      ctx.arc(px + 4, y - pr.r, 3, 0, TAU);
      ctx.fill();
      break;
    }
    default: {
      ctx.globalCompositeOperation = 'lighter';
      const r = pr.r * (pr.style === 'fire' ? 1.4 : 1.2);
      const g = ctx.createRadialGradient(px, y, 1, px, y, r * 1.6);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, pr.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, y, r * 1.6, 0, TAU);
      ctx.fill();
      if (pr.charged) {
        ctx.strokeStyle = GODS.zeus.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, y, r + 3 + Math.sin(t * 40) * 2, 0, TAU);
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
  for (const p of w.players) light(p.x, p.y - 30, p.state === 'dead' ? 260 : 420, 'rgba(255,190,150,0.55)');
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
  for (const f of w.flashes) light(f.x, f.y, f.r, f.color, (1 - f.t / f.dur) * (0.25 + 0.75 * prefs.flashes));
  for (const pk of w.pickups) if (pk.kind === 'reward') light(pk.x, pk.y - 30, 200, 'rgba(255,220,150,0.6)');
  for (const d of w.doors) if (d.open && d.reward) light(d.x, -40, 220, rewardColor(d.reward), 0.5);
  for (const z of w.zones) if (z.kind === 'heal' || z.kind === 'storm' || z.kind === 'fire') light(z.x, z.y, z.r * 1.4, z.kind === 'heal' ? 'rgba(125,255,138,0.5)' : 'rgba(255,200,90,0.5)');
  for (const it of w.interactables) {
    if (it.kind === 'station' || it.kind === 'fountain') light(it.x, it.y - 40, 220, it.color ?? 'rgba(200,160,255,0.5)', 0.5);
  }
  for (const p of w.players) if (p.beamT > 0) light(p.x + Math.cos(p.aim) * 200, p.y + Math.sin(p.aim) * 200, 360, 'rgba(200,107,255,0.7)');
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

/** High-contrast foes (accessibility): a bright two-tone ring under every foe. */
function drawFoeMarks(ctx: CanvasRenderingContext2D, w: World): void {
  if (!prefs.foeOutline) return;
  for (const e of w.enemies) {
    if (e.dead || e.spawning || e.isDummy) continue;
    const r = e.r + 8;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r, r * 0.75, 0, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = e.isBoss ? '#ff3df0' : '#ffe600';
    ctx.stroke();
  }
}

/** Painted Chambers: the room is a fresco, so it gets a parchment wash and a gilded frame. */
function drawFresco(ctx: CanvasRenderingContext2D, w: World, dpr: number): void {
  if (!w.painted) return;
  const cam = w.camera;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(255, 228, 182)';
  ctx.fillRect(0, 0, cam.vw, cam.vh);
  ctx.globalCompositeOperation = 'source-over';
  const b = Math.max(10, Math.min(cam.vw, cam.vh) * 0.022);
  ctx.strokeStyle = '#c9a24a';
  ctx.lineWidth = b;
  ctx.strokeRect(b / 2, b / 2, cam.vw - b, cam.vh - b);
  ctx.strokeStyle = 'rgba(80, 50, 10, 0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(b + 3, b + 3, cam.vw - 2 * b - 6, cam.vh - 2 * b - 6);
}

export function renderWorld(w: World, ctx: CanvasRenderingContext2D, dpr: number): void {
  overlayDpr = dpr;
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
  drawFoeMarks(ctx, w);

  // ---- y-sorted props & actors
  type Item = { y: number; draw: () => void };
  const items: Item[] = [];
  for (const o of w.room.obstacles) items.push({ y: o.type === 'rect' ? o.y + o.h : o.y, draw: () => drawObstacle(ctx, o, w) });
  // Anything standing on a ledge is drawn raised with it.
  const raised = (lift: number, fn: () => void) => () => {
    if (!lift) return fn();
    ctx.save();
    ctx.translate(0, -lift);
    fn();
    ctx.restore();
  };
  const groundLift = (x: number, y: number) => (w.room.ledges ? levelAt(w.room, x, y) * LEDGE_H : 0);
  for (const b of w.breakables) if (!b.dead) items.push({ y: b.y, draw: raised(groundLift(b.x, b.y), () => drawBreakable(ctx, b)) });
  for (const it of w.interactables) items.push({ y: it.y, draw: raised(groundLift(it.x, it.y), () => drawInteractable(ctx, w, it)) });
  for (const pk of w.pickups) items.push({ y: pk.y, draw: raised(groundLift(pk.x, pk.y), () => drawPickup(ctx, w, pk)) });
  for (const e of w.enemies) {
    items.push({
      y: e.y,
      draw: raised(e.lift, () => {
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
      }),
    });
  }
  for (const a of w.allies) items.push({ y: a.y, draw: raised(a.lift, () => a.draw(ctx)) });
  for (const p of w.players) {
    items.push({ y: p.y, draw: raised(p.lift, () => w.as(p, () => p.draw(ctx, w))) });
    const weapon = p.weapon;
    if (isSpear(weapon)) items.push({ y: (weapon.thrown?.y ?? p.y) - 1, draw: () => w.as(p, () => weapon.drawWorld(ctx, w)) });
  }
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();

  renderLights(w, ctx, dpr);
  drawFresco(ctx, w, dpr);

  // ---- emissive & UI-in-world
  cam.apply(ctx, dpr);
  drawEffects(ctx, w);
  w.particles.draw(ctx, 'air');
  for (const e of w.enemies) {
    if (e.dead || e.spawning) continue;
    ctx.save();
    ctx.translate(0, -e.lift);
    e.drawStatus(ctx);
    ctx.restore();
  }
  w.eachHero(() => drawChargeMeter(ctx, w, false), w.viewers);
  drawPartyMarks(ctx, w);
  drawDoorIcons(ctx, w);

  drawPrompt(ctx, w);
  drawScreenOverlays(ctx, w, dpr);
}

/** "[E] Open: Treasure Chest" above whatever you can interact with. */
function drawPrompt(ctx: CanvasRenderingContext2D, w: World): void {
  const f = w.focus;
  if (!f) return;
  const label = f.kind === 'shop' && f.price !== undefined ? `${f.label} — ${f.price} ◎` : f.label;
  const y = f.y - (f.kind === 'shop' ? 120 : 110);
  upright(ctx, w, f.x, f.y, f.y - y, () => {
    ctx.font = '600 15px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(`${label}`).width;
    ctx.fillStyle = 'rgba(8,4,12,0.85)';
    ctx.fillRect(f.x - tw / 2 - 40, y - 20, tw + 80, 30);
    ctx.strokeStyle = 'rgba(255,216,144,0.6)';
    ctx.strokeRect(f.x - tw / 2 - 40, y - 20, tw + 80, 30);
    ctx.fillStyle = '#ffd890';
    ctx.fillText(renderOpts.touch ? `${f.prompt}: ${label}` : `[E] ${f.prompt}: ${label}`, f.x, y);
    if (f.kind === 'shop' && !f.used) drawWareInfo(ctx, f, y + 12);
  });
}

/** What a ware does, under its prompt; blurred until you've bought that kind once. */
function drawWareInfo(ctx: CanvasRenderingContext2D, f: Interactable, top: number): void {
  const kind = f.id.split(':')[1] as RewardSpec['kind'];
  const desc = SHOP_INFO[kind];
  if (!desc) return;
  const known = renderOpts.shopSeen.includes(kind);
  ctx.font = 'italic 14px "EB Garamond", Georgia, serif';
  const dw = Math.max(ctx.measureText(desc).width, 200);
  ctx.fillStyle = 'rgba(8,4,12,0.85)';
  ctx.fillRect(f.x - dw / 2 - 12, top, dw + 24, known ? 26 : 42);
  ctx.save();
  if (!known) ctx.filter = 'blur(4px)';
  ctx.fillStyle = '#e0d4cc';
  ctx.fillText(desc, f.x, top + 18);
  ctx.restore();
  if (!known) {
    ctx.fillStyle = '#b8a8a8';
    ctx.font = '600 11px "Cinzel", Georgia, serif';
    ctx.fillText('Buy one to learn what it does', f.x, top + 36);
  }
}

/** Vignette, low-health pulse and Eclipse darkness, in screen space. */
function drawScreenOverlays(ctx: CanvasRenderingContext2D, w: World, dpr: number): void {
  const cam = w.camera;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.35, cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, cam.vw, cam.vh);
  const mine = w.viewers.filter((p) => p.state !== 'dead');
  const low = mine.length ? Math.min(...mine.map((p) => p.hp / p.maxHp)) : 1;
  if (w.hurtFlash > 0 || low < 0.3) {
    const a = Math.max(w.hurtFlash * 1.2 * (0.3 + 0.7 * prefs.flashes), low < 0.3 ? (0.3 - low) * 1.2 * (0.6 + Math.sin(w.time * 5) * 0.4) : 0);
    const hg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.3, cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.7);
    hg.addColorStop(0, 'rgba(255,0,0,0)');
    hg.addColorStop(1, `rgba(200,0,20,${Math.min(0.6, a)})`);
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, cam.vw, cam.vh);
  }
  if (w.eclipseT > 0) {
    // Erebos' Eclipse: the room sinks into violet darkness.
    ctx.fillStyle = `rgba(20,0,40,${Math.min(0.45, w.eclipseT * 0.3)})`;
    ctx.fillRect(0, 0, cam.vw, cam.vh);
  }
}


/** Telegraphs, shockwaves, zones, swipes, projectiles and lightning: everything flat or glowing. */
/** Seconds the attack outline stays after an attack, and its fade-out. */
const OUTLINE_HOLD = 2.2;
const OUTLINE_FADE = 0.6;

/**
 * Where the next attack lands: a faint dashed outline in the weapon colour
 * that appears when you attack and fades a couple of seconds after you stop.
 * A charging move shows its full reach instead, filling as it powers up and
 * turning gold in the Perfect window.
 */
function drawAttackPreview(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;
  if (!prefs.attackPreview || p.state === 'dead' || p.state === 'falling') return;
  const run = p.state === 'action' ? p.action : null;
  const charging = run?.def.hold && !run.released ? run : null;
  let shapes: Shape[] | undefined;
  let k = 0;
  let perfect = false;
  let fade = 1;
  if (charging) {
    const h = charging.def.hold!;
    shapes = charging.def.preview?.(p, p.aim);
    k = clamp(charging.holdT / h.max, 0, 1);
    perfect = !!h.perfect && charging.holdT >= h.max && charging.holdT <= h.max + h.perfect;
  } else if (p.state === 'free' || (run && run.fired)) {
    fade = clamp((OUTLINE_HOLD - (p.t - p.lastAttackT)) / OUTLINE_FADE, 0, 1);
    if (fade > 0) shapes = p.weapon.preview?.(p, w);
  }
  if (!shapes?.length) return;
  const color = perfect ? '#fff0b0' : WEAPON_INFO[p.weapon.id].color;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  for (const s of shapes) {
    ctx.globalAlpha = charging ? 0.06 + 0.16 * k : 0.05 * fade;
    pathShape(ctx, s);
    ctx.fill();
    if (charging) {
      ctx.globalAlpha = 0.18;
      pathShape(ctx, s, k);
      ctx.fill();
    }
    ctx.globalAlpha = charging ? 0.45 + 0.45 * k : 0.3 * fade;
    ctx.lineWidth = charging ? 2.5 : 1.5;
    ctx.setLineDash(charging ? [] : [7, 6]);
    pathShape(ctx, s);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The charge meter over the hero while a move charges: how far it has
 * powered up, the Perfect window (gold), the chain level it carries (pips)
 * and the damage a release would deal now.
 */
function drawChargeMeter(ctx: CanvasRenderingContext2D, w: World, view3d: boolean): void {
  const p = w.player;
  const run = p.state === 'action' ? p.action : null;
  const def = run?.def;
  if (!prefs.attackPreview || !run || !def?.hold || !def.power || run.released || run.holdT < 0.1) return;
  const lift = p.height + 34 + p.z;
  const draw = () => {
    const h = def.hold!;
    const pw = def.power!;
    const perfectLen = h.perfect ?? 0;
    const total = h.max + perfectLen + 0.12;
    const W = 76;
    const H = 7;
    const x = p.x - W / 2;
    const y = p.y - lift;
    const k = Math.min(run.holdT, total) / total;
    const full = run.holdT >= h.max;
    const perfect = perfectLen > 0 && full && run.holdT <= h.max + perfectLen;
    const color = WEAPON_INFO[p.weapon.id].color;
    ctx.save();
    ctx.fillStyle = 'rgba(8,4,10,0.78)';
    ctx.fillRect(x - 2, y - 2, W + 4, H + 4);
    if (perfectLen > 0) {
      ctx.fillStyle = 'rgba(255,220,120,0.35)';
      ctx.fillRect(x + (W * h.max) / total, y, (W * perfectLen) / total, H);
    }
    ctx.fillStyle = perfect ? '#fff0b0' : full && perfectLen > 0 ? '#9a8a90' : color;
    ctx.fillRect(x, y, W * k, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + (W * h.max) / total - 1, y - 3, 2, H + 6);
    // Chain level pips: a longer chain before it powers the move up further.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < pw.level ? color : 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      const px = p.x - 12 + i * 12;
      ctx.moveTo(px, y + H + 4);
      ctx.lineTo(px + 4, y + H + 8);
      ctx.lineTo(px, y + H + 12);
      ctx.lineTo(px - 4, y + H + 8);
      ctx.fill();
    }
    const amount = pw.mult ? `×${pw.mult(run.holdT).toFixed(2)}` : `${Math.round(clamp(run.holdT / h.max, 0, 1) * 100)}%`;
    ctx.font = '700 12px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const text = perfect ? `PERFECT ${amount}` : `${pw.label} ${amount}`;
    ctx.strokeText(text, p.x, y - 5);
    ctx.fillStyle = perfect ? '#fff0b0' : '#f0e6d8';
    ctx.fillText(text, p.x, y - 5);
    ctx.restore();
  };
  if (view3d) upright(ctx, w, p.x, p.y, lift, draw);
  else draw();
}

function drawEffects(ctx: CanvasRenderingContext2D, w: World): void {
  w.eachHero(() => drawAttackPreview(ctx, w), w.viewers);
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
    const c = lifted(w, s.owner ? s.owner.x : s.x, s.owner ? s.owner.y : s.y, 22);
    const x = c.x;
    const y = c.y;
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

  for (const pr of w.projectiles) drawProjectile(ctx, pr, w.time, w.camera.lift);
  w.eachHero(() => drawBeam(ctx, w));

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

}

/**
 * The voxel view's 2D layer: everything the 3D scene doesn't model (effects,
 * floating text, health bars, icons, prompts), drawn over it with the camera's
 * 45° squash so it lines up.
 */
export function renderOverlay(w: World, ctx: CanvasRenderingContext2D, dpr: number): void {
  overlayDpr = dpr;
  const cam = w.camera;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, cam.vw * dpr, cam.vh * dpr);
  cam.apply(ctx, dpr);
  for (const z of w.zones) if (z.kind === 'web' || z.kind === 'fog') drawZone(ctx, z, w.time);
  // Brief light bursts (hits, explosions) as soft additive glows.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const f of w.flashes) {
    const a = (1 - f.t / f.dur) * 0.3 * (0.25 + 0.75 * prefs.flashes);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 0.6);
    g.addColorStop(0, f.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  w.eachHero(() => drawPlayerRings(ctx, w));
  drawFoeMarks(ctx, w);
  for (const it of w.interactables) {
    if (it.kind !== 'shop') continue;
    const y = it.y - 68 + Math.sin(w.time * 2 + it.x) * 4;
    upright(ctx, w, it.x, it.y, it.y - y, () => {
      ctx.textAlign = 'center';
      if (it.used) {
        ctx.fillStyle = '#8a7a8a';
        ctx.font = '600 12px Georgia, serif';
        ctx.fillText('SOLD', it.x, it.y - 50);
        return;
      }
      drawRewardIcon(ctx, shopIconSpec(it), it.x, y, 18, w.time);
      ctx.fillStyle = '#ffd04a';
      ctx.font = '700 14px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${it.price ?? 0} ◎`, it.x, y + 40);
    });
  }
  for (const pk of w.pickups) upright(ctx, w, pk.x, pk.y, levelAt(w.room, pk.x, pk.y) * LEDGE_H, () => drawPickup(ctx, w, pk));
  w.eachHero((p) => {
    if (isSpear(p.weapon)) p.weapon.drawWorld(ctx, w);
  });
  for (const e of w.enemies) {
    if (e.dead || e.spawning) continue;
    ctx.save();
    ctx.translate(e.x, e.y);
    e.drawFx(ctx, w);
    ctx.restore();
  }
  drawEffects(ctx, w);
  w.particles.draw(ctx, 'air');
  for (const e of w.enemies) if (!e.dead && !e.spawning) upright(ctx, w, e.x, e.y, e.height + e.lift, () => e.drawStatus(ctx));
  w.eachHero(() => drawChargeMeter(ctx, w, true), w.viewers);
  drawPartyMarks(ctx, w);
  drawDoorIcons(ctx, w);
  drawPrompt(ctx, w);
  drawScreenOverlays(ctx, w, dpr);
}

/** The hero's Wrath-ready ring and shields, drawn on the floor around them. */
function drawPlayerRings(ctx: CanvasRenderingContext2D, w: World): void {
  const p = w.player;
  if (p.state === 'dead') return;
  ctx.save();
  ctx.translate(p.x, p.y);
  const up0 = w.camera.lift;
  ctx.translate(up0.x * p.lift, up0.y * p.lift);
  p.drawGuard(ctx, false);
  if (p.wrathReady && w.stats.canWrath) {
    ctx.strokeStyle = `rgba(255,208,74,${0.45 + Math.sin(p.t * 8) * 0.25})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 26, 0, 0, TAU);
    ctx.stroke();
  }
  const up = w.camera.lift;
  ctx.translate(up.x * (p.z + 30), up.y * (p.z + 30));
  if (p.ironHideT > 0) {
    ctx.strokeStyle = `rgba(190,200,220,${0.4 + Math.sin(p.t * 8) * 0.2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, TAU);
    ctx.stroke();
  }
  if (p.holyShield && w.stats.holyShield) {
    ctx.strokeStyle = `rgba(242,211,138,${0.35 + Math.sin(p.t * 4) * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 28, 40, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Party play: each hero's name over their head in their party colour, and
 * a ring filling around a downed hero while a partner stands by them.
 */
function drawPartyMarks(ctx: CanvasRenderingContext2D, w: World): void {
  if (w.players.length < 2) return;
  // Heroes standing together: stack their names instead of overprinting them.
  const placed: { x: number; y: number }[] = [];
  for (const p of w.players) {
    const color = p.tagColor;
    if (p.state === 'dead') {
      const k = clamp(p.reviveT / REVIVE_TIME, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(0, 0, REVIVE_RANGE, REVIVE_RANGE * 0.9, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.35 + Math.sin(w.time * 4) * 0.15;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (k > 0) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, REVIVE_RANGE, REVIVE_RANGE * 0.9, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (!p.tag) continue;
    let lift = p.height + 24 + p.z;
    while (placed.some((q) => Math.abs(q.x - p.x) < 80 && Math.abs(q.y - (p.y - lift)) < 15)) lift += 16;
    placed.push({ x: p.x, y: p.y - lift });
    upright(ctx, w, p.x, p.y, lift, () => {
      const y = p.y - lift;
      ctx.font = '700 13px "Cinzel", Georgia, serif';
      ctx.textAlign = 'center';
      const label = p.state === 'dead' ? `${p.tag} — DOWN` : p.tag;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(label, p.x, y);
      ctx.fillStyle = p.state === 'dead' ? '#ff8a8a' : color;
      ctx.fillText(label, p.x, y);
      // A small health bar under the name for partners (yours is on the HUD).
      if (p.state !== 'dead' && !w.viewers.includes(p)) {
        const W = 44;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(p.x - W / 2 - 1, y + 5, W + 2, 5);
        ctx.fillStyle = color;
        ctx.fillRect(p.x - W / 2, y + 6, W * clamp(p.hp / p.maxHp, 0, 1), 3);
      }
    });
  }
}

export function invalidateRoomCache(w: World): void {
  cache.delete(w);
}

