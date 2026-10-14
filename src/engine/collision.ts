import { angleDiff, clamp, type Vec } from './math';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export const circleCircle = (a: Circle, b: Circle): boolean =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (a.r + b.r) ** 2;

export function circleRect(c: Circle, r: Rect): boolean {
  const cx = clamp(c.x, r.x, r.x + r.w);
  const cy = clamp(c.y, r.y, r.y + r.h);
  return (c.x - cx) ** 2 + (c.y - cy) ** 2 < c.r * c.r;
}

export const pointInRect = (p: Vec, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * Pushes a circle out of a rect. Returns the push normal if a collision
 * occurred (useful for wall-slam detection), otherwise null.
 */
export function resolveCircleRect(c: Circle, r: Rect): Vec | null {
  const cx = clamp(c.x, r.x, r.x + r.w);
  const cy = clamp(c.y, r.y, r.y + r.h);
  let dx = c.x - cx;
  let dy = c.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= c.r * c.r) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = c.r - d;
    dx /= d;
    dy /= d;
    c.x += dx * push;
    c.y += dy * push;
    return { x: dx, y: dy };
  }
  // Centre is inside the rect: push out along the axis of least penetration.
  const left = c.x - r.x;
  const right = r.x + r.w - c.x;
  const top = c.y - r.y;
  const bottom = r.y + r.h - c.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) {
    c.x = r.x - c.r;
    return { x: -1, y: 0 };
  }
  if (m === right) {
    c.x = r.x + r.w + c.r;
    return { x: 1, y: 0 };
  }
  if (m === top) {
    c.y = r.y - c.r;
    return { x: 0, y: -1 };
  }
  c.y = r.y + r.h + c.r;
  return { x: 0, y: 1 };
}

/** Pushes circle `c` out of a static circle `s`. */
export function resolveCircleCircle(c: Circle, s: Circle): Vec | null {
  const dx = c.x - s.x;
  const dy = c.y - s.y;
  const d2 = dx * dx + dy * dy;
  const rr = c.r + s.r;
  if (d2 >= rr * rr) return null;
  const d = Math.sqrt(d2) || 1e-6;
  const nx = d2 > 1e-12 ? dx / d : 1;
  const ny = d2 > 1e-12 ? dy / d : 0;
  c.x = s.x + nx * rr;
  c.y = s.y + ny * rr;
  return { x: nx, y: ny };
}

/** Squared distance from point p to segment ab. */
export function distToSegment2(p: Vec, a: Vec, b: Vec): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = a.x + abx * t - p.x;
  const y = a.y + aby * t - p.y;
  return x * x + y * y;
}

/** Whether a circle touches a capsule (segment ab with radius r). */
export const circleCapsule = (c: Circle, a: Vec, b: Vec, r: number): boolean =>
  distToSegment2(c, a, b) < (c.r + r) ** 2;

/** Whether a circle overlaps a pie slice centred at o, facing `angle`, half-width `half`. */
export function circleArc(c: Circle, o: Vec, radius: number, angle: number, half: number): boolean {
  const dx = c.x - o.x;
  const dy = c.y - o.y;
  const d = Math.hypot(dx, dy);
  if (d > radius + c.r) return false;
  if (d < c.r) return true;
  const diff = Math.abs(angleDiff(angle, Math.atan2(dy, dx)));
  // Allow the target's radius to widen the effective angle slightly.
  const slack = Math.asin(Math.min(1, c.r / d));
  return diff <= half + slack;
}

/** Segment vs rect intersection (Liang–Barsky). Returns entry t in [0,1] or null. */
export function segmentRect(a: Vec, b: Vec, r: Rect): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0;
}

/** Segment vs circle intersection. Returns first t in [0,1] or null. */
export function segmentCircle(a: Vec, b: Vec, c: Circle): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  const A = dx * dx + dy * dy;
  if (A === 0) return fx * fx + fy * fy <= c.r * c.r ? 0 : null;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - c.r * c.r;
  if (C <= 0) return 0;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = (-B - s) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}
