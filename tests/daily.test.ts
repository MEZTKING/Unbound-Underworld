import { describe, expect, it } from 'vitest';
import { DAILY_MODS, dailyFor, dailyKey, dailyScore, dayBefore, defaultDaily, normalizeDaily, recordDaily, streakAsh } from '../src/game/daily';
import { normalizeSave } from '../src/game/meta';

describe('daily challenge', () => {
  it('is the same for everyone on a day, and changes from day to day', () => {
    expect(dailyKey(new Date('2026-10-20T23:59:00Z'))).toBe('2026-10-20');
    const a = dailyFor('2026-10-20');
    expect(dailyFor('2026-10-20')).toEqual(a);
    expect(a.mods.length).toBe(2);
    expect(new Set(a.mods).size).toBe(2);
    for (const m of a.mods) expect(DAILY_MODS[m]).toBeDefined();
    const days = Array.from({ length: 60 }, (_, i) => dailyFor(`2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`));
    expect(new Set(days.map((d) => d.seed)).size).toBe(60);
    // Every modifier comes up over two months.
    expect(new Set(days.flatMap((d) => d.mods)).size).toBe(Object.keys(DAILY_MODS).length);
  });

  it('scores chambers, guardians and a fast escape', () => {
    expect(dailyScore({ rooms: 7, bosses: 1, victory: false, time: 600, mods: [] })).toBe(1300);
    expect(dailyScore({ rooms: 20, bosses: 4, victory: true, time: 1200, mods: [] })).toBe(2000 + 2400 + 2500 + 300);
    // Slow escapes get no speed bonus, Bounty days a quarter more.
    expect(dailyScore({ rooms: 20, bosses: 4, victory: true, time: 4000, mods: ['bounty'] })).toBe(Math.round((2000 + 2400 + 2500) * 1.25));
  });

  it('keeps the best of the day and a streak of consecutive days', () => {
    const rec = defaultDaily();
    expect(recordDaily(rec, '2026-10-18', 500)).toEqual({ newBest: true, streakBonus: streakAsh(1) });
    // A second run the same day: a better score counts, the streak doesn't grow.
    expect(recordDaily(rec, '2026-10-18', 400)).toEqual({ newBest: false, streakBonus: 0 });
    expect(recordDaily(rec, '2026-10-18', 900).newBest).toBe(true);
    expect(rec.best['2026-10-18']).toBe(900);
    recordDaily(rec, '2026-10-19', 100);
    recordDaily(rec, '2026-10-20', 100);
    expect(rec.streak).toBe(3);
    // A missed day starts over.
    recordDaily(rec, '2026-10-22', 100);
    expect(rec.streak).toBe(1);
    expect(rec.longest).toBe(3);
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(streakAsh(30)).toBe(100);
  });

  it('keeps 30 days of scores and survives old or broken saves', () => {
    const rec = defaultDaily();
    for (let i = 0; i < 40; i++) recordDaily(rec, dailyKey(new Date(Date.UTC(2026, 0, 1 + i))), i);
    expect(Object.keys(rec.best).length).toBeLessThanOrEqual(30);
    expect(normalizeDaily({ best: { nope: 5, '2026-10-20': 42 }, streak: -3 })).toEqual({ best: { '2026-10-20': 42 }, streak: 0, longest: 0, last: '' });
    expect(normalizeSave({}).daily).toEqual(defaultDaily());
  });
});
