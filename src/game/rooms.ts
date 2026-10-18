import { circleCircle, circleRect, type Circle, type Rect } from '../engine/collision';
import type { Rng } from '../engine/math';
import { CHEST, eliteChance as eliteOdds } from './odds';
import { PARTY_FOES } from './party';
import type { BiomeId, BossKind, EliteMod, EnemyKind, RoomKind } from './types';

export interface BiomeInfo {
  id: BiomeId;
  name: string;
  subtitle: string;
  floorA: string;
  floorB: string;
  grout: string;
  wall: string;
  wallTop: string;
  trim: string;
  accent: string;
  /** Ambient light colour multiplied over the scene. */
  ambient: string;
  hazard: 'spikes' | 'lava' | 'pits' | 'none';
  pool: [EnemyKind, number][];
  hpScale: number;
  dmgScale: number;
  boss: BossKind;
  combatRooms: number;
}

export const BIOMES: BiomeInfo[] = [
  {
    id: 'tartarus',
    name: 'The Shackled Deep',
    subtitle: 'Where the Damned Are Chained',
    floorA: '#3a1d22',
    floorB: '#32181d',
    grout: '#1c0c10',
    wall: '#22101a',
    wallTop: '#4a2430',
    trim: '#a8283c',
    accent: '#ff4a5a',
    ambient: '#7a5a68',
    hazard: 'spikes',
    pool: [
      ['grunt', 5],
      ['skitter', 4],
      ['caster', 2],
      ['hissling', 2],
      ['brute', 1],
    ],
    hpScale: 1,
    dmgScale: 1,
    boss: 'fury',
    combatRooms: 5,
  },
  {
    id: 'asphodel',
    name: 'The Ember Fields',
    subtitle: 'Meadows of Cinder and Ash',
    floorA: '#2b2320',
    floorB: '#241d1a',
    grout: '#120c0a',
    wall: '#1c1412',
    wallTop: '#3e2e26',
    trim: '#ff7a2a',
    accent: '#ff9a3a',
    ambient: '#8a6a58',
    hazard: 'lava',
    pool: [
      ['skitter', 3],
      ['bomber', 3],
      ['spinner', 2],
      ['brute', 2],
      ['hissling', 3],
      ['caster', 2],
      ['weaver', 2],
    ],
    hpScale: 1.35,
    dmgScale: 1.2,
    boss: 'hydra',
    combatRooms: 5,
  },
  {
    id: 'elysium',
    name: 'The Gilded Groves',
    subtitle: 'Gardens of the Honored Dead',
    floorA: '#1f3a33',
    floorB: '#1a322c',
    grout: '#0e1f1a',
    wall: '#142620',
    wallTop: '#2f5446',
    trim: '#e8c860',
    accent: '#9dffcf',
    ambient: '#7a9a8e',
    hazard: 'pits',
    pool: [
      ['shield', 3],
      ['charger', 3],
      ['caster', 2],
      ['spinner', 2],
      ['bonecaller', 1],
      ['weaver', 2],
      ['grunt', 2],
    ],
    hpScale: 1.75,
    dmgScale: 1.4,
    boss: 'talos',
    combatRooms: 5,
  },
  {
    id: 'styx',
    name: 'The Last Gate',
    subtitle: 'Where the Hound Keeps Watch',
    floorA: '#1d1a2e',
    floorB: '#181628',
    grout: '#0a0914',
    wall: '#100e1c',
    wallTop: '#2c2848',
    trim: '#7a6aff',
    accent: '#b0a0ff',
    ambient: '#6e6a90',
    hazard: 'none',
    pool: [
      ['grunt', 1],
      ['caster', 1],
    ],
    hpScale: 2,
    dmgScale: 1.6,
    boss: 'cerberus',
    combatRooms: 0,
  },
];

export const ENEMY_COST: Record<EnemyKind, number> = {
  grunt: 2,
  skitter: 1,
  brute: 5,
  caster: 3,
  bomber: 3,
  spinner: 4,
  charger: 4,
  shield: 4,
  hissling: 2,
  weaver: 3,
  bonecaller: 6,
  mimic: 6,
  dummy: 0,
};

export type Obstacle =
  | { type: 'rect'; x: number; y: number; w: number; h: number; style: 'block' | 'wall' | 'rock' }
  | { type: 'circle'; x: number; y: number; r: number; style: 'pillar' | 'urn' };

export interface Hazard {
  kind: 'pit' | 'lava';
  shape: { type: 'rect'; x: number; y: number; w: number; h: number } | { type: 'circle'; x: number; y: number; r: number };
}

export interface RoomLayout {
  kind: RoomKind;
  biome: BiomeId;
  w: number;
  h: number;
  obstacles: Obstacle[];
  hazards: Hazard[];
  traps: { x: number; y: number }[];
  pots: { x: number; y: number }[];
  chests: { x: number; y: number }[];
  braziers: { x: number; y: number }[];
  entrance: { x: number; y: number };
  seed: number;
  /** The shape the chamber was cut into (see ROOM_SHAPES); 'hall' is a plain rectangle. */
  shape?: RoomShape;
  /** The stretch of the north wall the exit doors sit along (default: all of it). */
  doorSpan?: [number, number];
  /** Raised ground (harder chambers): heroes jump up onto it. */
  ledges?: Ledge[];
}

/** A raised block of floor; `lv` 2 sits on a level-1 ledge. */
export interface Ledge {
  x: number;
  y: number;
  w: number;
  h: number;
  lv: 1 | 2;
}

/** How high one level of ledge rises (a jump clears one level, not two). */
export const LEDGE_H = 32;

/** The ground level at a point: 0 on the floor, 1 or 2 on a ledge. */
export function levelAt(l: Pick<RoomLayout, 'ledges'>, x: number, y: number): number {
  let lv = 0;
  if (!l.ledges) return 0;
  for (const g of l.ledges) if (g.lv > lv && x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h) lv = g.lv;
  return lv;
}

/**
 * Chamber shapes: solid rock fills part of the rectangle, so rooms come as
 * L, T, cross, hourglass or ring shapes, wide galleries and tall towers, and
 * their doors and entrance sit in different places.
 */
export const ROOM_SHAPES = ['hall', 'ell', 'tee', 'cross', 'hourglass', 'ring', 'nook', 'gallery', 'tower'] as const;
export type RoomShape = (typeof ROOM_SHAPES)[number];

export const WALL_H = 130;
export const DOOR_W = 120;
export const TRAP_SIZE = 56;
export const CELL = 40;

/** Where the exit doors sit along the top wall (within the room's door span). */
export function doorPositions(l: Pick<RoomLayout, 'w' | 'doorSpan'>, n: number): number[] {
  if (n <= 0) return [];
  const [a, b] = l.doorSpan ?? [0, l.w];
  const mid = (a + b) / 2;
  if (n === 1) return [mid];
  const spacing = Math.max(140, Math.min(360, (b - a - 300) / (n - 1)));
  const start = mid - (spacing * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => start + spacing * i);
}

function obstacleCircle(o: Obstacle): Circle | null {
  return o.type === 'circle' ? { x: o.x, y: o.y, r: o.r } : null;
}

function overlapsObstacle(c: Circle, obs: readonly Obstacle[], margin: number): boolean {
  const cc = { x: c.x, y: c.y, r: c.r + margin };
  for (const o of obs) {
    if (o.type === 'rect' ? circleRect(cc, o) : circleCircle(cc, obstacleCircle(o)!)) return true;
  }
  return false;
}

export function hazardContains(h: Hazard, x: number, y: number, pad = 0): boolean {
  const s = h.shape;
  if (s.type === 'rect') return x > s.x - pad && x < s.x + s.w + pad && y > s.y - pad && y < s.y + s.h + pad;
  return (x - s.x) ** 2 + (y - s.y) ** 2 < (s.r + pad) ** 2;
}

/** Grid of walkable cells (no obstacles, no pits). Lava is walkable but costly. */
export function buildGrid(l: RoomLayout, pad = 14): { cols: number; rows: number; block: Uint8Array } {
  const cols = Math.ceil(l.w / CELL);
  const rows = Math.ceil(l.h / CELL);
  const block = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * CELL + CELL / 2;
      const y = cy * CELL + CELL / 2;
      const c = { x, y, r: pad };
      let b = 0;
      if (overlapsObstacle(c, l.obstacles, 0)) b = 1;
      else if (l.hazards.some((h) => h.kind === 'pit' && hazardContains(h, x, y, pad))) b = 1;
      else if (l.hazards.some((h) => h.kind === 'lava' && hazardContains(h, x, y, 0))) b = 2;
      block[cy * cols + cx] = b;
    }
  }
  return { cols, rows, block };
}

/** True when every door and most of the floor are reachable from the entrance on foot. */
export function isConnected(l: RoomLayout, doorCount = 3): boolean {
  const g = buildGrid(l);
  const idx = (x: number, y: number) => Math.floor(y / CELL) * g.cols + Math.floor(x / CELL);
  const start = idx(l.entrance.x, l.entrance.y - 20);
  if (g.block[start] === 1) return false;
  const seen = new Uint8Array(g.block.length);
  const q = [start];
  seen[start] = 1;
  let open = 0;
  for (let i = 0; i < g.block.length; i++) if (g.block[i] !== 1) open++;
  let reached = 0;
  while (q.length) {
    const c = q.pop()!;
    reached++;
    const cx = c % g.cols;
    const cy = Math.floor(c / g.cols);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const n = ny * g.cols + nx;
      if (seen[n] || g.block[n] === 1) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  for (const dx of doorPositions(l, doorCount)) {
    if (!seen[idx(dx, 30)]) return false;
  }
  // Pits may isolate small islands (reachable by jumping) but most floor must be connected.
  return reached >= open * 0.8;
}

function baseLayout(kind: RoomKind, biome: BiomeId, w: number, h: number, seed: number): RoomLayout {
  return {
    kind,
    biome,
    w,
    h,
    obstacles: [],
    hazards: [],
    traps: [],
    pots: [],
    chests: [],
    braziers: [],
    entrance: { x: w / 2, y: h - 50 },
    seed,
  };
}

function keepClear(l: RoomLayout, x: number, y: number, r: number): boolean {
  if (Math.hypot(x - l.entrance.x, y - l.entrance.y) < 190 + r) return false;
  if (y - r < 170) return false;
  if (x - r < 70 || x + r > l.w - 70 || y + r > l.h - 70) return false;
  return true;
}

function addPillars(rng: Rng, l: RoomLayout): void {
  const pattern = rng.int(0, 4);
  const cx = l.w / 2;
  const cy = l.h / 2 + 40;
  const push = (o: Obstacle) => {
    const c = o.type === 'circle' ? { x: o.x, y: o.y, r: o.r } : { x: o.x + o.w / 2, y: o.y + o.h / 2, r: Math.max(o.w, o.h) / 2 };
    if (!keepClear(l, c.x, c.y, c.r)) return;
    if (overlapsObstacle(c, l.obstacles, 70)) return;
    l.obstacles.push(o);
  };
  switch (pattern) {
    case 0: {
      const n = rng.int(3, 6);
      for (let i = 0; i < n * 3 && l.obstacles.length < n; i++) {
        push({ type: 'circle', x: rng.range(150, l.w - 150), y: rng.range(260, l.h - 200), r: rng.range(26, 40), style: 'pillar' });
      }
      break;
    }
    case 1: {
      const dx = l.w * 0.24;
      const dy = l.h * 0.2;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) push({ type: 'rect', x: cx + sx * dx - 45, y: cy + sy * dy - 45, w: 90, h: 90, style: 'block' });
      break;
    }
    case 2: {
      push({ type: 'rect', x: cx - 110, y: cy - 40, w: 220, h: 80, style: 'wall' });
      push({ type: 'circle', x: cx - l.w * 0.32, y: cy, r: 34, style: 'pillar' });
      push({ type: 'circle', x: cx + l.w * 0.32, y: cy, r: 34, style: 'pillar' });
      break;
    }
    case 3: {
      push({ type: 'rect', x: cx - l.w * 0.3, y: cy - 150, w: 50, h: 200, style: 'wall' });
      push({ type: 'rect', x: cx + l.w * 0.3 - 50, y: cy - 150, w: 50, h: 200, style: 'wall' });
      push({ type: 'circle', x: cx, y: cy - 60, r: 40, style: 'pillar' });
      break;
    }
    default: {
      // Mostly open arena with a ring of urns.
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(0, 0.4);
        push({ type: 'circle', x: cx + Math.cos(a) * l.w * 0.3, y: cy + Math.sin(a) * l.h * 0.26, r: 24, style: 'urn' });
      }
    }
  }
}

/** True when a point is on or within `pad` of a ledge. */
function nearLedge(l: RoomLayout, x: number, y: number, pad: number): boolean {
  return (l.ledges ?? []).some((g) => x > g.x - pad && x < g.x + g.w + pad && y > g.y - pad && y < g.y + g.h + pad);
}

function addHazards(rng: Rng, l: RoomLayout, hazard: BiomeInfo['hazard']): void {
  if (hazard === 'spikes') {
    const n = rng.int(3, 7);
    for (let i = 0; i < n * 4 && l.traps.length < n; i++) {
      const x = rng.range(160, l.w - 160);
      const y = rng.range(240, l.h - 180);
      if (!keepClear(l, x, y, 40) || overlapsObstacle({ x, y, r: 45 }, l.obstacles, 10) || nearLedge(l, x, y, 50)) continue;
      if (l.traps.some((t) => Math.hypot(t.x - x, t.y - y) < 90)) continue;
      l.traps.push({ x, y });
    }
  } else if (hazard === 'lava') {
    const n = rng.int(2, 4);
    for (let i = 0; i < n * 5 && l.hazards.length < n; i++) {
      const r = rng.range(60, 120);
      const x = rng.range(160 + r, l.w - 160 - r);
      const y = rng.range(260 + r * 0.5, l.h - 160 - r);
      if (!keepClear(l, x, y, r) || overlapsObstacle({ x, y, r }, l.obstacles, 30) || nearLedge(l, x, y, r * 1.4 + 30)) continue;
      if (l.hazards.some((h) => h.shape.type === 'circle' && Math.hypot(h.shape.x - x, h.shape.y - y) < h.shape.r + r + 60)) continue;
      const shape: Hazard['shape'] = rng.chance(0.65)
        ? { type: 'circle', x, y, r }
        : { type: 'rect', x: x - r * 1.4, y: y - r * 0.6, w: r * 2.8, h: r * 1.2 };
      l.hazards.push({ kind: 'lava', shape });
    }
  } else if (hazard === 'pits') {
    // Chasms the player must jump or dash across.
    const n = rng.int(1, 3);
    for (let i = 0; i < n * 6 && l.hazards.length < n; i++) {
      const horizontal = rng.chance(0.5);
      const gw = horizontal ? rng.range(240, l.w * 0.45) : rng.range(90, 140);
      const gh = horizontal ? rng.range(90, 130) : rng.range(200, l.h * 0.4);
      const x = rng.range(130, l.w - 130 - gw);
      const y = rng.range(260, l.h - 200 - gh);
      const shape = { type: 'rect' as const, x, y, w: gw, h: gh };
      if (!keepClear(l, x + gw / 2, y + gh / 2, Math.max(gw, gh) / 2 - 40)) continue;
      const c = { x: x + gw / 2, y: y + gh / 2, r: Math.max(gw, gh) / 2 };
      if (overlapsObstacle(c, l.obstacles, 30) || (l.ledges ?? []).some((g) => x - 40 < g.x + g.w && x + gw + 40 > g.x && y - 40 < g.y + g.h && y + gh + 40 > g.y)) continue;
      if (l.hazards.some((h) => h.shape.type === 'rect' && !(x > h.shape.x + h.shape.w + 80 || x + gw < h.shape.x - 80 || y > h.shape.y + h.shape.h + 80 || y + gh < h.shape.y - 80))) continue;
      l.hazards.push({ kind: 'pit', shape });
      if (!isConnected(l)) l.hazards.pop();
    }
  }
}

function addDecor(rng: Rng, l: RoomLayout, chestChance: number): void {
  const nPots = rng.int(3, 8);
  for (let i = 0; i < nPots * 4 && l.pots.length < nPots; i++) {
    const side = rng.int(0, 2);
    const x = side === 0 ? rng.range(70, 140) : side === 1 ? rng.range(l.w - 140, l.w - 70) : rng.range(120, l.w - 120);
    const y = side === 2 ? rng.range(l.h - 120, l.h - 70) : rng.range(200, l.h - 100);
    const c = { x, y, r: 16 };
    if (overlapsObstacle(c, l.obstacles, 10)) continue;
    if (l.hazards.some((h) => hazardContains(h, x, y, 30))) continue;
    if (Math.hypot(x - l.entrance.x, y - l.entrance.y) < 120) continue;
    l.pots.push({ x, y });
  }
  if (rng.chance(chestChance)) {
    for (let i = 0; i < 20; i++) {
      const x = rng.range(160, l.w - 160);
      const y = rng.range(260, l.h - 160);
      if (!keepClear(l, x, y, 30) || overlapsObstacle({ x, y, r: 30 }, l.obstacles, 20)) continue;
      if (l.hazards.some((h) => hazardContains(h, x, y, 40))) continue;
      l.chests.push({ x, y });
      break;
    }
  }
  const lights = [
    { x: 60, y: 40 },
    { x: l.w - 60, y: 40 },
  ];
  if (l.h > 950) lights.push({ x: 40, y: l.h * 0.6 }, { x: l.w - 40, y: l.h * 0.6 });
  // Rock corners get their own braziers where the room turns.
  for (const o of l.obstacles) {
    if (o.type !== 'rect' || o.style !== 'rock') continue;
    for (const [x, y] of [
      [o.x - 30, o.y + o.h + 30],
      [o.x + o.w + 30, o.y + o.h + 30],
    ]) if (x > 40 && x < l.w - 40 && y < l.h - 40 && !inRock(l, x, y, 20)) lights.push({ x, y });
  }
  for (const b of lights) if (!inRock(l, b.x, b.y, 20) && !overlapsObstacle({ x: b.x, y: b.y, r: 20 }, l.obstacles, 0) && !l.braziers.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < 80)) l.braziers.push(b);
}

const snap = (v: number) => Math.round(v / CELL) * CELL;

/** Size of a chamber of this shape. */
function shapeSize(rng: Rng, shape: RoomShape): { w: number; h: number } {
  switch (shape) {
    case 'gallery':
      return { w: snap(rng.range(1950, 2350)), h: snap(rng.range(820, 920)) };
    case 'tower':
      return { w: snap(rng.range(1000, 1160)), h: snap(rng.range(1450, 1750)) };
    case 'cross':
    case 'hourglass':
    case 'ring':
      return { w: snap(rng.range(1500, 1850)), h: snap(rng.range(1100, 1350)) };
    case 'ell':
    case 'tee':
    case 'nook':
      return { w: snap(rng.range(1400, 1800)), h: snap(rng.range(1050, 1300)) };
    default:
      return { w: snap(rng.range(1250, 1700)), h: snap(rng.range(950, 1250)) };
  }
}

/** Cuts the chamber into its shape: rock masses, where the doors go and where you come in. */
function carveShape(rng: Rng, l: RoomLayout, shape: RoomShape): void {
  const { w, h } = l;
  const rock = (x: number, y: number, rw: number, rh: number) => l.obstacles.push({ type: 'rect', x: snap(x), y: snap(y), w: snap(rw), h: snap(rh), style: 'rock' });
  const flip = rng.chance(0.5);
  l.shape = shape;
  switch (shape) {
    case 'ell': {
      // One back corner of the hall is solid: come in on the open side.
      const cw = w * rng.range(0.36, 0.46);
      const top = h * rng.range(0.48, 0.58);
      rock(flip ? w - cw : 0, top, cw, h - top);
      l.entrance.x = snap(flip ? (w - cw) / 2 : cw + (w - cw) / 2);
      break;
    }
    case 'tee': {
      // A wide hall reached up a narrow stem.
      const stem = w * rng.range(0.3, 0.4);
      const top = h * rng.range(0.45, 0.55);
      rock(0, top, (w - stem) / 2, h - top);
      rock(w - snap((w - stem) / 2), top, (w - stem) / 2, h - top);
      break;
    }
    case 'cross': {
      const cw = w * rng.range(0.22, 0.28);
      const ch = h * rng.range(0.24, 0.3);
      for (const x of [0, w - snap(cw)]) for (const y of [0, h - snap(ch)]) rock(x, y, cw, ch);
      l.doorSpan = [snap(cw), w - snap(cw)];
      break;
    }
    case 'hourglass': {
      // Rock juts in from both sides: a narrow waist splits the fight.
      const cw = w * rng.range(0.28, 0.34);
      const y = h * rng.range(0.38, 0.46);
      const ch = h * rng.range(0.14, 0.2);
      rock(0, y, cw, ch);
      rock(w - snap(cw), y, cw, ch);
      break;
    }
    case 'ring': {
      // A rock island in the middle: two ways round it.
      const cw = w * rng.range(0.26, 0.34);
      const ch = h * rng.range(0.2, 0.26);
      rock((w - cw) / 2, h * 0.42 - ch / 2, cw, ch);
      break;
    }
    case 'nook': {
      // A back corner is solid: the doors sit off to one side, and you come in on the other.
      const cw = w * rng.range(0.38, 0.48);
      const ch = h * rng.range(0.3, 0.4);
      rock(flip ? w - cw : 0, 0, cw, ch);
      l.doorSpan = flip ? [0, w - snap(cw)] : [snap(cw), w];
      l.entrance.x = snap(flip ? w * 0.72 : w * 0.28);
      break;
    }
    case 'gallery':
    case 'tower': {
      // Long rooms with their doors and entrance off-centre.
      if (rng.chance(0.6)) {
        const side = rng.chance(0.5) ? -1 : 1;
        l.entrance.x = snap(w / 2 + side * w * rng.range(0.15, 0.3));
        if (shape === 'gallery') l.doorSpan = side < 0 ? [w * 0.35, w] : [0, w * 0.65];
      }
      break;
    }
    default:
      break;
  }
  if (l.doorSpan) l.doorSpan = [Math.max(0, l.doorSpan[0]), Math.min(w, l.doorSpan[1])];
}

/** Picks a chamber shape: deeper chambers favour the stranger ones. */
export function pickShape(rng: Rng, depth: number): RoomShape {
  if (depth === 0) return rng.pick(['hall', 'hall', 'ring', 'tee'] as const);
  return rng.weighted<RoomShape>([
    ['hall', 3],
    ['ell', 2],
    ['tee', 2],
    ['cross', 2],
    ['hourglass', 2],
    ['ring', 2],
    ['nook', 2],
    ['gallery', 1.5],
    ['tower', 1.5],
  ]);
}

export interface LayoutOptions {
  chestChance?: number;
  /** How deep in its region the chamber is (shapes vary more later). */
  depth?: number;
  /** 0–1: how much raised ground the chamber gets (0 = none; needs every hero able to jump). */
  heights?: number;
  /** A set shape (campaign chambers); otherwise one is picked. */
  shape?: RoomShape;
}

/** True when a rectangle is clear of rock, pits, lava, traps and the entrance. */
function ledgeFits(l: RoomLayout, x: number, y: number, w: number, h: number, nearDoors = false): boolean {
  if (x < 0 || y < 0 || x + w > l.w || y + h > l.h) return false;
  const pad = 30;
  for (const o of l.obstacles) {
    if (o.type === 'rect' && o.style === 'rock') {
      if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return false;
    }
  }
  for (const hz of l.hazards) {
    const s = hz.shape;
    const r = s.type === 'rect' ? s : { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
    if (x - pad < r.x + r.w && x + w + pad > r.x && y - pad < r.y + r.h && y + h + pad > r.y) return false;
  }
  for (const t of l.traps) if (t.x > x - 40 && t.x < x + w + 40 && t.y > y - 40 && t.y < y + h + 40) return false;
  if (l.entrance.x > x - 140 && l.entrance.x < x + w + 140 && l.entrance.y > y - 160 && l.entrance.y < y + h + 200) return false;
  if (!nearDoors && y < 150) return false;
  return true;
}

/**
 * Raised ground for harder chambers: a dais before the doors, a terrace across
 * the room, or scattered mesas (some with a second tier). Heroes jump up;
 * foes clamber.
 */
function addLedges(rng: Rng, l: RoomLayout, k: number): void {
  const ledges: Ledge[] = [];
  const put = (x: number, y: number, w: number, h: number, lv: 1 | 2, nearDoors = false): boolean => {
    x = snap(x);
    y = snap(y);
    w = snap(w);
    h = snap(h);
    if (w < CELL * 3 || h < CELL * 3 || !ledgeFits(l, x, y, w, h, nearDoors)) return false;
    if (lv === 1 && ledges.some((g) => x < g.x + g.w + 80 && x + w + 80 > g.x && y < g.y + g.h + 80 && y + h + 80 > g.y)) return false;
    ledges.push({ x, y, w, h, lv });
    return true;
  };
  // The way out is up: a dais in front of the doors.
  if (rng.chance(0.35 + k * 0.4)) {
    const [a, b] = l.doorSpan ?? [0, l.w];
    put(a + 40, 0, b - a - 80, rng.range(160, 220), 1, true);
  }
  // A terrace across the room (with a way round at one end, or none at all when harder).
  if (rng.chance(0.25 + k * 0.35)) {
    const y = l.h * rng.range(0.38, 0.5);
    const gap = k > 0.6 && rng.chance(0.5) ? 0 : rng.range(160, 240);
    const left = rng.chance(0.5);
    for (let tries = 0; tries < 3; tries++) {
      const x0 = left ? gap : 0;
      const w = l.w - gap - (tries * 120);
      if (put(left ? x0 : tries * 60, y, w, rng.range(160, 240), 1)) break;
    }
  }
  // Mesas: some with a second tier on top.
  const mesas = Math.round(rng.range(1, 2 + k * 3));
  for (let i = 0, tries = 0; i < mesas && tries < 30; tries++) {
    const w = rng.range(220, 360);
    const h = rng.range(200, 320);
    const x = rng.range(80, l.w - 80 - w);
    const y = rng.range(200, l.h - 200 - h);
    if (!put(x, y, w, h, 1)) continue;
    i++;
    const m = ledges[ledges.length - 1];
    if (m.w >= 240 && m.h >= 240 && rng.chance(0.3 + k * 0.45)) put(m.x + 80, m.y + 80, m.w - 160, m.h - 160, 2);
  }
  if (ledges.length) l.ledges = ledges;
}

export function generateLayout(rng: Rng, biome: BiomeInfo, kind: RoomKind, opts: LayoutOptions | number = {}): RoomLayout {
  const o: LayoutOptions = typeof opts === 'number' ? { chestChance: opts } : opts;
  const chestChance = o.chestChance ?? CHEST.spawn;
  const seed = Math.floor(rng.next() * 1e9);
  if (kind === 'boss') {
    const l = baseLayout(kind, biome.id, 1700, 1300, seed);
    l.braziers.push({ x: 60, y: 40 }, { x: l.w - 60, y: 40 }, { x: 40, y: l.h * 0.55 }, { x: l.w - 40, y: l.h * 0.55 });
    if (biome.id === 'asphodel') {
      l.hazards.push({ kind: 'lava', shape: { type: 'circle', x: 300, y: 950, r: 90 } });
      l.hazards.push({ kind: 'lava', shape: { type: 'circle', x: l.w - 300, y: 950, r: 90 } });
    }
    if (biome.id === 'styx' || biome.id === 'tartarus') {
      for (const [x, y] of [
        [380, 520],
        [l.w - 380, 520],
        [380, 1000],
        [l.w - 380, 1000],
      ]) l.obstacles.push({ type: 'circle', x, y, r: 38, style: 'pillar' });
    }
    return l;
  }
  if (kind === 'shop' || kind === 'fountain' || kind === 'antechamber' || kind === 'reward') {
    const l = baseLayout(kind, biome.id, 1150, 850, seed);
    l.braziers.push({ x: 60, y: 40 }, { x: l.w - 60, y: 40 });
    l.obstacles.push({ type: 'circle', x: 200, y: 330, r: 30, style: 'pillar' }, { type: 'circle', x: l.w - 200, y: 330, r: 30, style: 'pillar' });
    return l;
  }
  const shape = o.shape ?? pickShape(rng, o.depth ?? 1);
  const { w, h } = shapeSize(rng, shape);
  for (let attempt = 0; attempt < 8; attempt++) {
    const l = baseLayout(kind, biome.id, w, h, seed);
    carveShape(rng, l, attempt < 6 ? shape : 'hall');
    addPillars(rng, l);
    if (o.heights) addLedges(rng, l, o.heights);
    addHazards(rng, l, biome.hazard);
    if (!isConnected(l)) continue;
    addDecor(rng, l, chestChance);
    return l;
  }
  const l = baseLayout(kind, biome.id, w, h, seed);
  l.shape = 'hall';
  addDecor(rng, l, chestChance);
  return l;
}

/** True when a point is inside one of the chamber's rock masses (pad widens them). */
export function inRock(l: RoomLayout, x: number, y: number, pad = 0): boolean {
  return l.obstacles.some((o) => o.type === 'rect' && o.style === 'rock' && x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
}

export function hubLayout(): RoomLayout {
  const l = baseLayout('hub', 'styx', 1300, 900, 1);
  l.braziers.push({ x: 60, y: 40 }, { x: l.w - 60, y: 40 }, { x: 40, y: 600 }, { x: l.w - 40, y: 600 });
  l.obstacles.push(
    { type: 'circle', x: 330, y: 230, r: 30, style: 'pillar' },
    { type: 'circle', x: l.w - 330, y: 230, r: 30, style: 'pillar' },
  );
  return l;
}

// ---------------------------------------------------------------- encounters

export interface SpawnSpec {
  kind: EnemyKind;
  mod: EliteMod | null;
}

export type Wave = SpawnSpec[];

export function generateEncounter(rng: Rng, biome: BiomeInfo, biomeIndex: number, depth: number, elite = false, party = 1): Wave[] {
  const waves = depth === 0 ? 1 : depth < 3 ? 2 : 3;
  // Party play brings more foes: +35% per extra hero.
  const budget = (6 + depth * 2.2 + biomeIndex * 4 + (elite ? 6 : 0)) * (1 + PARTY_FOES * Math.max(0, party - 1));
  const perWave = budget / waves;
  const eliteChance = eliteOdds(depth, biomeIndex, elite);
  const mods: EliteMod[] = ['armored', 'swift', 'volatile', 'regenerating'];
  const out: Wave[] = [];
  for (let wv = 0; wv < waves; wv++) {
    const wave: Wave = [];
    let pts = perWave * (0.85 + wv * 0.15);
    let guard = 0;
    while (pts > 0.5 && guard++ < 40) {
      const options = biome.pool.filter(([k]) => ENEMY_COST[k] <= pts + 1);
      if (options.length === 0) break;
      const kind = rng.weighted(options);
      pts -= ENEMY_COST[kind];
      const mod = ENEMY_COST[kind] >= 2 && rng.chance(eliteChance) ? rng.pick(mods) : null;
      if (mod) pts -= 1.5;
      wave.push({ kind, mod });
    }
    if (wave.length === 0) wave.push({ kind: biome.pool[0][0], mod: null });
    out.push(wave);
  }
  return out;
}

export function rectOf(o: Extract<Obstacle, { type: 'rect' }>): Rect {
  return { x: o.x, y: o.y, w: o.w, h: o.h };
}
