// Turning live game objects into small JSON messages and back.
//
// The host encodes each thing in the room (foes, heroes, shots, zones…) as
// its plain data fields, and after the first time sends only the fields that
// changed. Players who joined keep a copy of every object and apply those
// changes to it, so the game's own drawing code shows them unchanged.

export type Fields = Record<string, unknown>;

const BIG = 1e9;

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function num(v: number): number {
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 0 : v > 0 ? BIG : -BIG;
  // Two decimals is plenty for drawing, and keeps messages short.
  return Math.round(v * 100) / 100;
}

/** One value, encoded: numbers rounded, plain objects and arrays recursively, everything else left out (undefined). */
export function value(v: unknown, depth: number): unknown {
  switch (typeof v) {
    case 'number':
      return num(v);
    case 'string':
    case 'boolean':
      return v;
    case 'object': {
      if (v === null) return null;
      if (depth >= 4) return undefined;
      if (Array.isArray(v)) {
        // Arrays of other objects (heads, segments…) can't be rebuilt from data: leave them out whole.
        if (v.length > 64) return undefined;
        const out: unknown[] = [];
        for (const x of v) {
          if (x === undefined) {
            out.push(null);
            continue;
          }
          const e = value(x, depth + 1);
          if (e === undefined) return undefined;
          out.push(e);
        }
        return out;
      }
      if (isPlain(v)) return encode(v, undefined, depth + 1);
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * An object's own data fields: numbers, strings, booleans, and plain objects
 * or arrays of them. Class instances (other actors, weapons, sets), functions
 * and the keys in `skip` are left out.
 */
export function encode(o: object, skip?: ReadonlySet<string>, depth = 0): Fields {
  const out: Fields = {};
  for (const k of Object.keys(o)) {
    if (skip?.has(k)) continue;
    const e = value((o as Record<string, unknown>)[k], depth);
    if (e !== undefined) out[k] = e;
  }
  return out;
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The fields of `next` that differ from `prev` (all of them when there is no `prev`); null when nothing changed. */
export function diff(prev: Fields | undefined, next: Fields): Fields | null {
  if (!prev) return next;
  let out: Fields | null = null;
  for (const k of Object.keys(next)) {
    if (!same(prev[k], next[k])) (out ??= {})[k] = next[k];
  }
  return out;
}

/**
 * Applies encoded fields to a live object: plain values are assigned, plain
 * sub-objects are merged (or created), and keys holding class instances or
 * functions on the target are never overwritten.
 */
export function apply(target: object, data: Fields): void {
  const t = target as Record<string, unknown>;
  for (const k of Object.keys(data)) {
    const v = data[k];
    const cur = t[k];
    if (typeof cur === 'function') continue;
    if (cur !== null && typeof cur === 'object' && !isPlain(cur) && !Array.isArray(cur)) continue;
    if (isPlain(v) && isPlain(cur)) {
      // Replace rather than merge when the object's shape changed (a new action, say).
      const keys = Object.keys(v);
      if (keys.length === Object.keys(cur).length && keys.every((x) => x in cur)) apply(cur, v);
      else t[k] = v;
    } else t[k] = v;
  }
}

/** Hands out stable ids to objects that have none of their own (shots, zones, pickups). */
export class Ids {
  private map = new WeakMap<object, number>();
  private next = 1;

  of(o: object): number {
    let id = this.map.get(o);
    if (id === undefined) {
      id = this.next++;
      this.map.set(o, id);
    }
    return id;
  }
}

/**
 * Tracks one kind of object for one viewer: what was last sent for each id,
 * so the next message carries only what changed, plus which ids vanished.
 */
export class Track {
  private last = new Map<number, Fields>();

  /**
   * Encodes the current set. Returns `add` (new ids: full fields, with
   * `extra` merged in), `upd` (changed fields only) and `del` (gone ids).
   */
  step<T extends object>(items: Iterable<T>, idOf: (x: T) => number, fields: (x: T) => Fields, extra?: (x: T) => Fields): { add?: Record<number, Fields>; upd?: Record<number, Fields>; del?: number[] } | null {
    const seen = new Set<number>();
    let add: Record<number, Fields> | undefined;
    let upd: Record<number, Fields> | undefined;
    for (const x of items) {
      const id = idOf(x);
      seen.add(id);
      const now = fields(x);
      const prev = this.last.get(id);
      if (!prev) (add ??= {})[id] = extra ? { ...now, ...extra(x) } : now;
      else {
        const d = diff(prev, now);
        if (d) (upd ??= {})[id] = d;
      }
      this.last.set(id, now);
    }
    let del: number[] | undefined;
    for (const id of this.last.keys()) {
      if (!seen.has(id)) {
        (del ??= []).push(id);
        this.last.delete(id);
      }
    }
    if (!add && !upd && !del) return null;
    return { ...(add && { add }), ...(upd && { upd }), ...(del && { del }) };
  }

  reset(): void {
    this.last.clear();
  }
}
