import { describe, expect, it } from 'vitest';
import { Camera } from '../src/engine/camera';
import { Particles } from '../src/engine/particles';
import { createBoss } from '../src/game/enemies';
import type { BossKind } from '../src/game/types';
import { Player } from '../src/game/player';
import { BIOMES, type Obstacle, type RoomLayout } from '../src/game/rooms';
import { World, type WorldHost } from '../src/game/world';

// A host that answers everything with nothing: the hero stands still and can't die.
const host = new Proxy({ godMode: true, artifacts: [], tryDeathDefiance: () => true } as unknown as WorldHost, {
  get(t, k) {
    if (k in t) return (t as unknown as Record<string | symbol, unknown>)[k];
    if (k === 'stats' || k === 'input') return new Proxy({}, { get: () => () => false });
    if (k === 'viewPlayers' || k === 'canInteract' || k === 'setActive') return undefined;
    return () => undefined;
  },
});

function room(obstacles: Obstacle[]): RoomLayout {
  return { kind: 'boss', biome: BIOMES[3].id, w: 1600, h: 1200, obstacles, hazards: [], traps: [], pots: [], chests: [], braziers: [], entrance: { x: 800, y: 1000 }, seed: 7 } as RoomLayout;
}

/**
 * Puts a guardian on the far side of an obstacle from a hero who stands still,
 * and returns how many of `secs` seconds it spent pressed against something,
 * barely moving, without being next to the hero.
 */
function wedged(kind: BossKind, obstacles: Obstacle[], from: { x: number; y: number }, hero: { x: number; y: number }, secs = 20): number {
  const p = new Player('sword');
  const w = new World(host, room(obstacles), BIOMES[3], new Camera(), new Particles(), p);
  p.x = hero.x;
  p.y = hero.y;
  const b = createBoss(kind, from.x, from.y);
  b.spawnT = 0;
  w.addEnemy(b);
  const dt = 1 / 60;
  let pinned = 0;
  for (let i = 0; i < secs / dt; i++) {
    p.x = hero.x;
    p.y = hero.y;
    p.hp = p.maxHp;
    const was = { x: b.x, y: b.y };
    w.update(dt);
    const near = Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r + 120;
    const crawl = Math.hypot(b.x - was.x, b.y - was.y) < b.speed * 0.2 * dt;
    // Only while it is trying to move (it stands still on purpose to attack).
    if (b.state === 'idle' && b.lastHit && crawl && !near) pinned += dt;
  }
  return pinned;
}

describe('guardians round obstacles', () => {
  const pillar: Obstacle = { type: 'rect', x: 700, y: 500, w: 200, h: 200, style: 'block' };
  const column: Obstacle = { type: 'circle', x: 800, y: 600, r: 90, style: 'pillar' };
  for (const kind of ['cerberus', 'fury', 'talos'] as BossKind[]) {
    it(`${kind} doesn't stay wedged on a block`, () => {
      expect(wedged(kind, [pillar], { x: 800, y: 300 }, { x: 800, y: 900 })).toBeLessThan(1.5);
      expect(wedged(kind, [pillar], { x: 640, y: 420 }, { x: 960, y: 780 })).toBeLessThan(1.5);
    });
    it(`${kind} doesn't stay wedged on a column`, () => {
      expect(wedged(kind, [column], { x: 800, y: 340 }, { x: 800, y: 860 })).toBeLessThan(1.5);
    });
  }
});
