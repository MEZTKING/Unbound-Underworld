import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math';
import { Player } from '../src/game/player';
import { BIOMES, doorPositions, generateLayout, inRock, isConnected, LEDGE_H, levelAt, ROOM_SHAPES } from '../src/game/rooms';

const rooms = (n: number, heights = 0) =>
  Array.from({ length: n }, (_, i) => generateLayout(new Rng(i * 17 + 3), BIOMES[i % 3], 'combat', { depth: 1 + (i % 4), heights }));

describe('chamber shapes', () => {
  it('come in every shape, always connected, with the way in and out open', () => {
    const seen = new Set<string>();
    for (const l of rooms(400)) {
      seen.add(l.shape!);
      expect(isConnected(l), l.shape).toBe(true);
      expect(inRock(l, l.entrance.x, l.entrance.y - 20, 10), `${l.shape} entrance`).toBe(false);
      for (const x of doorPositions(l, 3)) expect(inRock(l, x, 30, 60), `${l.shape} door`).toBe(false);
    }
    for (const s of ROOM_SHAPES) expect(seen.has(s), s).toBe(true);
  });

  it('keep doors apart and inside their span', () => {
    for (const l of rooms(200)) {
      const [a, b] = l.doorSpan ?? [0, l.w];
      const xs = doorPositions(l, 3);
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(a);
        expect(x).toBeLessThanOrEqual(b);
      }
      expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(130);
    }
  });

  it('vary in size', () => {
    const widths = rooms(200).map((l) => l.w);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(900);
  });
});

describe('ledges', () => {
  it('only appear when asked for, clear of hazards, rock and the entrance', () => {
    expect(rooms(100).some((l) => l.ledges?.length)).toBe(false);
    const raised = rooms(200, 1);
    expect(raised.filter((l) => l.ledges?.length).length).toBeGreaterThan(180);
    for (const l of raised) {
      expect(isConnected(l)).toBe(true);
      expect(levelAt(l, l.entrance.x, l.entrance.y)).toBe(0);
      for (const g of l.ledges ?? []) {
        for (const [x, y] of [
          [g.x + 5, g.y + 5],
          [g.x + g.w / 2, g.y + g.h / 2],
          [g.x + g.w - 5, g.y + g.h - 5],
        ]) {
          expect(inRock(l, x, y), 'ledge in rock').toBe(false);
          expect(l.traps.some((t) => Math.hypot(t.x - x, t.y - y) < 30), 'trap on ledge').toBe(false);
        }
        // A second tier always stands on a first one, so it can be climbed in two jumps.
        if (g.lv === 2) expect(levelAt(l, g.x - 20, g.y + g.h / 2)).toBe(1);
      }
    }
  });

  it('are low enough to jump onto one level at a time', () => {
    const p = new Player('sword', 'kael');
    // A jump's peak clears one level but not two.
    p.lv = 0;
    p.z = 58;
    expect(p.reach).toBe(1);
    expect(LEDGE_H * 2).toBeGreaterThan(58);
  });

  it('dropping off a ledge continues as a fall from the same height', () => {
    const p = new Player('sword', 'kael');
    p.lv = 2;
    p.z = 0;
    p.dropTo(0);
    expect(p.lv).toBe(0);
    expect(p.z).toBeGreaterThan(LEDGE_H);
    expect(p.jumpT).toBeGreaterThan(0);
  });
});
