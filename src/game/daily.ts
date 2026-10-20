// The daily challenge: one escape a day with the same seed and the same two
// modifiers for everyone (the date, in UTC, picks them). You play your own
// hero. The best score of the day counts; playing on consecutive days builds
// a streak. A daily run is never saved mid-way and never touches a saved escape.
import { Rng } from '../engine/math';

export type DailyModId = 'glass' | 'swarm' | 'flatland' | 'miser' | 'enchanted' | 'nosecond' | 'bounty';

export interface DailyMod {
  id: DailyModId;
  name: string;
  desc: string;
  glyph: string;
}

export const DAILY_MODS: Record<DailyModId, DailyMod> = {
  glass: { id: 'glass', name: 'Glass Cannon', glyph: '✦', desc: 'You deal double damage, and take double damage.' },
  swarm: { id: 'swarm', name: 'Swarm', glyph: '☍', desc: 'Half again as many foes, each with half the health.' },
  flatland: { id: 'flatland', name: 'Flatland', glyph: '▭', desc: 'The whole escape is flat: drawn in 2D.' },
  miser: { id: 'miser', name: "Miser's Road", glyph: '◎', desc: "No shops. Foes and pots drop double obols." },
  enchanted: { id: 'enchanted', name: 'Enchanted Day', glyph: '✧', desc: 'Every chamber holds enchanted foes (more of them carry elite traits).' },
  nosecond: { id: 'nosecond', name: 'No Second Chances', glyph: '♱', desc: 'Death Defiance is off. Ash ×1.5.' },
  bounty: { id: 'bounty', name: 'Bounty', glyph: '⚑', desc: 'Guardians have +50% health. Ash ×1.5 and score ×1.25.' },
};

export interface DailyRun {
  /** The day, as YYYY-MM-DD (UTC). */
  key: string;
  seed: number;
  mods: DailyModId[];
}

/** Today's date (UTC) as YYYY-MM-DD. */
export function dailyKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** A stable 32-bit seed from the day. */
export function dailySeed(key: string): number {
  let h = 2166136261;
  for (const c of `unbound-daily-${key}`) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

/** The day's challenge: its seed and two different modifiers. */
export function dailyFor(key: string): DailyRun {
  const seed = dailySeed(key);
  const rng = new Rng(seed ^ 0x5bd1e995);
  const ids = rng.shuffle(Object.keys(DAILY_MODS) as DailyModId[]);
  return { key, seed, mods: ids.slice(0, 2) };
}

export interface DailyResult {
  rooms: number;
  bosses: number;
  victory: boolean;
  /** Seconds the run took. */
  time: number;
  mods: readonly DailyModId[];
}

/**
 * Score: 100 a chamber, 600 a guardian, and for an escape 2,500 plus up to
 * 1,500 for speed (the bonus runs out at 25 minutes). Bounty days ×1.25.
 */
export function dailyScore(r: DailyResult): number {
  let s = r.rooms * 100 + r.bosses * 600;
  if (r.victory) s += 2500 + Math.max(0, Math.round(1500 - r.time));
  if (r.mods.includes('bounty')) s *= 1.25;
  return Math.round(s);
}

/** What the save keeps about daily challenges. */
export interface DailyRecord {
  /** Best score per day (the last 30 days are kept). */
  best: Record<string, number>;
  /** Days in a row with at least one daily run. */
  streak: number;
  longest: number;
  /** The last day played. */
  last: string;
}

export function defaultDaily(): DailyRecord {
  return { best: {}, streak: 0, longest: 0, last: '' };
}

export function normalizeDaily(raw: unknown): DailyRecord {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DailyRecord>;
  const best: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.best ?? {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number(v) >= 0) best[k] = Math.round(Number(v));
  return { best, streak: Math.max(0, Number(r.streak) || 0), longest: Math.max(0, Number(r.longest) || 0), last: typeof r.last === 'string' ? r.last : '' };
}

/** The day before `key`. */
export function dayBefore(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dailyKey(d);
}

/** Ash for keeping a streak going: 10 a day of streak, up to 100. */
export const streakAsh = (streak: number) => Math.min(100, streak * 10);

/**
 * Records a finished daily run. Returns whether it beat the day's best, and
 * the streak bonus earned (only the first run of a day extends the streak).
 */
export function recordDaily(rec: DailyRecord, key: string, score: number): { newBest: boolean; streakBonus: number } {
  const newBest = score > (rec.best[key] ?? -1);
  if (newBest) rec.best[key] = score;
  let streakBonus = 0;
  if (rec.last !== key) {
    rec.streak = rec.last === dayBefore(key) ? rec.streak + 1 : 1;
    rec.longest = Math.max(rec.longest, rec.streak);
    rec.last = key;
    streakBonus = streakAsh(rec.streak);
  }
  // Keep the last 30 days.
  const days = Object.keys(rec.best).sort();
  for (const d of days.slice(0, Math.max(0, days.length - 30))) delete rec.best[d];
  return { newBest, streakBonus };
}
