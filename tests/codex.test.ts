import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, BESTIARY, newAchievements } from '../src/game/codex';
import { defaultSave, normalizeSave } from '../src/game/meta';

describe('codex', () => {
  it('lists every foe and guardian once, with a portrait maker', () => {
    const names = BESTIARY.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of BESTIARY) expect(e.make().name).toBe(e.name);
    expect(BESTIARY.filter((e) => e.guardian).map((e) => e.name)).toEqual(expect.arrayContaining(['Campe', 'The Hydra', 'Talos', 'Cerberus']));
  });

  it('awards achievements from save data once', () => {
    const save = defaultSave();
    expect(newAchievements(save)).toEqual([]);
    save.stats.kills = 1;
    save.bestiary.Campe = 1;
    const got = newAchievements(save).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['first_blood', 'jailbreak']));
    save.achievements.push(...got);
    expect(newAchievements(save)).toEqual([]);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('keeps old saves loadable with the new fields', () => {
    const old = { ash: 5, stats: { runs: 2, kills: 10 }, settings: { volume: 0.3 } };
    const s = normalizeSave(old);
    expect(s.bestiary).toEqual({});
    expect(s.achievements).toEqual([]);
    expect(s.shopSeen).toEqual([]);
    expect(s.looks).toEqual({});
    expect(s.stats.shopBuys).toBe(0);
    expect(s.settings.uiSize).toBe(1);
    expect(s.settings.volume).toBe(0.3);
  });
});
