import { circleCircle, circleRect, type Circle, type Rect } from '../engine/collision';
import type { Rng } from '../engine/math';
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
    name: 'Tartarus',
    subtitle: 'The Pit of the Damned',
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
    name: 'Asphodel',
    subtitle: 'The Burning Meadows',
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
    name: 'Elysium',
    subtitle: 'Fields of the Blessed',
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
    name: 'Gates of the Styx',
    subtitle: 'Where the Warden Waits',
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
  | { type: 'rect'; x: number; y: number; w: number; h: number; style: 'block' | 'wall' }
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
}

export const WALL_H = 130;
export const DOOR_W = 120;
export const TRAP_SIZE = 56;
export const CELL = 40;

/** Where the exit doors sit along the top wall. */
export function doorPositions(w: number, n: number): number[] {
  if (n <= 0) return [];
  const spacing = Math.min(360, (w - 300) / Math.max(1, n - 1));
  const start = w / 2 - (spacing * (n - 1)) / 2;
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
  for (const dx of doorPositions(l.w, doorCount)) {
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

function addHazards(rng: Rng, l: RoomLayout, hazard: BiomeInfo['hazard']): void {
  if (hazard === 'spikes') {
    const n = rng.int(3, 7);
    for (let i = 0; i < n * 4 && l.traps.length < n; i++) {
      const x = rng.range(160, l.w - 160);
      const y = rng.range(240, l.h - 180);
      if (!keepClear(l, x, y, 40) || overlapsObstacle({ x, y, r: 45 }, l.obstacles, 10)) continue;
      if (l.traps.some((t) => Math.hypot(t.x - x, t.y - y) < 90)) continue;
      l.traps.push({ x, y });
    }
  } else if (hazard === 'lava') {
    const n = rng.int(2, 4);
    for (let i = 0; i < n * 5 && l.hazards.length < n; i++) {
      const r = rng.range(60, 120);
      const x = rng.range(160 + r, l.w - 160 - r);
      const y = rng.range(260 + r * 0.5, l.h - 160 - r);
      if (!keepClear(l, x, y, r) || overlapsObstacle({ x, y, r }, l.obstacles, 30)) continue;
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
      if (overlapsObstacle(c, l.obstacles, 30)) continue;
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
  l.braziers.push({ x: 60, y: 40 }, { x: l.w - 60, y: 40 });
  if (l.h > 950) l.braziers.push({ x: 40, y: l.h * 0.6 }, { x: l.w - 40, y: l.h * 0.6 });
}

export function generateLayout(rng: Rng, biome: BiomeInfo, kind: RoomKind, chestChance = 0.25): RoomLayout {
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
  const w = Math.round(rng.range(1250, 1700) / CELL) * CELL;
  const h = Math.round(rng.range(950, 1250) / CELL) * CELL;
  for (let attempt = 0; attempt < 8; attempt++) {
    const l = baseLayout(kind, biome.id, w, h, seed);
    addPillars(rng, l);
    addHazards(rng, l, biome.hazard);
    if (!isConnected(l)) continue;
    addDecor(rng, l, chestChance);
    return l;
  }
  const l = baseLayout(kind, biome.id, w, h, seed);
  addDecor(rng, l, chestChance);
  return l;
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

export function generateEncounter(rng: Rng, biome: BiomeInfo, biomeIndex: number, depth: number, elite = false): Wave[] {
  const waves = depth === 0 ? 1 : depth < 3 ? 2 : 3;
  const budget = 6 + depth * 2.2 + biomeIndex * 4 + (elite ? 6 : 0);
  const perWave = budget / waves;
  const eliteChance = Math.min(0.45, 0.05 + depth * 0.04 + biomeIndex * 0.08 + (elite ? 0.3 : 0));
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
