import { describe, expect, it } from 'vitest';
import { circleArc, resolveCircleRect, segmentCircle, segmentRect } from '../src/engine/collision';
import { Camera } from '../src/engine/camera';
import { angleDiff, Rng } from '../src/engine/math';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('int stays within inclusive bounds and hits both ends', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted never picks zero-weight entries', () => {
    const r = new Rng(3);
    for (let i = 0; i < 300; i++) expect(r.weighted([['a', 0], ['b', 1], ['c', 0]])).toBe('b');
  });
});

describe('collision', () => {
  it('pushes a circle out of a rect along the shortest axis', () => {
    const c = { x: 12, y: 50, r: 10 };
    const n = resolveCircleRect(c, { x: 0, y: 0, w: 100, h: 100 });
    expect(n).toEqual({ x: -1, y: 0 });
    expect(c.x).toBe(-10);
  });

  it('detects circles inside an arc only on the facing side', () => {
    const o = { x: 0, y: 0 };
    expect(circleArc({ x: 50, y: 0, r: 10 }, o, 80, 0, 0.5)).toBe(true);
    expect(circleArc({ x: -50, y: 0, r: 10 }, o, 80, 0, 0.5)).toBe(false);
    expect(circleArc({ x: 200, y: 0, r: 10 }, o, 80, 0, 0.5)).toBe(false);
  });

  it('intersects segments with rects and circles', () => {
    expect(segmentRect({ x: -10, y: 5 }, { x: 20, y: 5 }, { x: 0, y: 0, w: 10, h: 10 })).toBeCloseTo(1 / 3);
    expect(segmentRect({ x: -10, y: 50 }, { x: 20, y: 50 }, { x: 0, y: 0, w: 10, h: 10 })).toBeNull();
    expect(segmentCircle({ x: -20, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0, r: 5 })).toBeCloseTo(15 / 40);
  });

  it('angleDiff wraps around', () => {
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
  });
});

describe('Camera', () => {
  it('maps world and screen points both ways in the flat and turned views', () => {
    for (const [yaw, pitch] of [
      [0, null],
      [Math.PI / 4, 0.7],
    ] as const) {
      const c = new Camera();
      c.setAngle(yaw, pitch);
      c.resize(1280, 720);
      c.snap({ x: 600, y: 400 });
      const back = c.screenToWorld(c.worldToScreen({ x: 650, y: 480 }));
      expect(back.x).toBeCloseTo(650);
      expect(back.y).toBeCloseTo(480);
      // Height lifts a point straight up on screen, by cos(pitch).
      const up = c.lift;
      const a = c.worldToScreen({ x: 650, y: 480 });
      const b = c.worldToScreen({ x: 650 + up.x * 100, y: 480 + up.y * 100 });
      expect(b.x - a.x).toBeCloseTo(0);
      expect(a.y - b.y).toBeCloseTo(100 * c.zoom * c.zScale);
      // Screen-up on the stick walks the way that looks up on screen.
      const d = c.screenDirToWorld({ x: 0, y: -1 });
      const s = c.worldToScreen({ x: 600 + d.x * 10, y: 400 + d.y * 10 });
      expect(s.x - 640).toBeCloseTo(0);
      expect(s.y).toBeLessThan(360);
    }
  });
});
