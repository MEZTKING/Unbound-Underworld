import { describe, expect, it } from 'vitest';
import { CHAPTERS, chapterDone, chapterMissions, chapterStars, defaultCampaign, MISSIONS, missionOpen, missionReward, missionStars, nextMission, normalizeCampaign, recordMission } from '../src/game/campaign';
import { normalizeSave } from '../src/game/meta';
import { Rng } from '../src/engine/math';
import { BIOMES, ENEMY_COST, generateLayout, isConnected } from '../src/game/rooms';

describe('campaign', () => {
  it('chapter 1 has six missions, each with a story and a guardian at the end', () => {
    const ms = chapterMissions(1);
    expect(ms.length).toBe(6);
    for (const m of ms) {
      expect(m.intro.length).toBeGreaterThan(0);
      expect(m.outro.length).toBeGreaterThan(0);
      expect(m.rooms.length).toBeGreaterThan(0);
      for (const r of m.rooms.slice(0, -1)) expect(r.goal).not.toBe('boss');
      for (const r of m.rooms) if (r.waves) for (const wave of r.waves) for (const [kind] of wave) expect(ENEMY_COST[kind]).toBeGreaterThan(0);
    }
    expect(ms[ms.length - 1].rooms.at(-1)!.goal).toBe('boss');
    expect(CHAPTERS.find((c) => c.n === 2)?.soon).toBe(true);
  });

  it('builds the same chambers every time, all walkable', () => {
    for (const m of MISSIONS) {
      for (const r of m.rooms) {
        const a = generateLayout(new Rng(r.seed), BIOMES[0], r.kind, { chestChance: 0, shape: r.shape, heights: r.heights });
        const b = generateLayout(new Rng(r.seed), BIOMES[0], r.kind, { chestChance: 0, shape: r.shape, heights: r.heights });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        if (r.kind === 'combat') expect(isConnected(a), `${m.id} ${r.seed}`).toBe(true);
      }
    }
  });

  it('opens missions in order and records the best result', () => {
    const p = defaultCampaign();
    expect(missionOpen(p, 'c1m1')).toBe(true);
    expect(missionOpen(p, 'c1m2')).toBe(false);
    expect(nextMission(p).id).toBe('c1m1');
    expect(recordMission(p, 'c1m1', 2, 100)).toBe(true);
    expect(recordMission(p, 'c1m1', 1, 80)).toBe(false);
    expect(p.missions.c1m1).toEqual({ stars: 2, best: 80 });
    expect(missionOpen(p, 'c1m2')).toBe(true);
    expect(nextMission(p).id).toBe('c1m2');
    for (const m of chapterMissions(1)) recordMission(p, m.id, 3, 50);
    expect(chapterDone(p, 1)).toBe(true);
    expect(chapterStars(p, 1)).toEqual({ got: 18, max: 18 });
  });

  it('gives stars for finishing, the par time and taking little damage', () => {
    const m = MISSIONS[0];
    expect(missionStars(m, m.par - 1, 0.1).stars).toBe(3);
    expect(missionStars(m, m.par + 1, 0.1).stars).toBe(2);
    expect(missionStars(m, m.par + 1, 0.9).stars).toBe(1);
    expect(missionReward(m, true).ash).toBe(m.ash);
    expect(missionReward(m, false).ash).toBeLessThan(m.ash);
  });

  it('is kept in the save and cleaned of bad entries', () => {
    expect(normalizeSave({}).campaign).toEqual({ missions: {} });
    const c = normalizeCampaign({ missions: { c1m1: { stars: 7, best: 42 }, nope: { stars: 2, best: 1 }, c1m2: 'x' } });
    expect(c).toEqual({ missions: { c1m1: { stars: 3, best: 42 } } });
  });
});
