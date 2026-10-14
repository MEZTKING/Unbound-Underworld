import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math';
import { ENCHANTS, MAX_ENCHANT_TIER, rollEnchantOffers, takeEnchant } from '../src/game/enchants';
import { defaultSave, metaBonuses, nextCost, normalizeSave, UPGRADES } from '../src/game/meta';
import { BIOMES, buildGrid, doorPositions, ENEMY_COST, generateEncounter, generateLayout, hazardContains, isConnected } from '../src/game/rooms';
import { Run } from '../src/game/run';

describe('room generation', () => {
  it('produces connected rooms with a clear entrance in every biome', () => {
    const rng = new Rng(1234);
    for (const biome of BIOMES.slice(0, 3)) {
      for (let i = 0; i < 40; i++) {
        const l = generateLayout(rng, biome, 'combat');
        expect(isConnected(l), `${biome.id} #${i}`).toBe(true);
        const g = buildGrid(l);
        expect(g.cols * g.rows).toBeGreaterThan(0);
        expect(l.hazards.some((h) => hazardContains(h, l.entrance.x, l.entrance.y))).toBe(false);
      }
    }
  });

  it('places doors inside the room', () => {
    for (const n of [1, 2, 3]) {
      for (const x of doorPositions(1300, n)) {
        expect(x).toBeGreaterThan(100);
        expect(x).toBeLessThan(1200);
      }
    }
  });

  it('builds encounters from the biome pool that grow with depth', () => {
    const rng = new Rng(5);
    const biome = BIOMES[0];
    const cost = (d: number) =>
      generateEncounter(rng, biome, 0, d)
        .flat()
        .reduce((s, e) => s + ENEMY_COST[e.kind], 0);
    const pool = new Set(biome.pool.map(([k]) => k));
    for (const wave of generateEncounter(rng, biome, 0, 2)) {
      expect(wave.length).toBeGreaterThan(0);
      for (const s of wave) expect(pool.has(s.kind)).toBe(true);
    }
    const early = Array.from({ length: 30 }, () => cost(0)).reduce((a, b) => a + b);
    const late = Array.from({ length: 30 }, () => cost(4)).reduce((a, b) => a + b);
    expect(late).toBeGreaterThan(early);
  });
});

describe('run structure', () => {
  it('walks combat rooms → antechamber → boss → next biome', () => {
    const run = new Run(defaultSave(), 99);
    run.enter(run.startPlan());
    expect(run.current.kind).toBe('combat');
    run.depth = run.biome.combatRooms;
    const ante = run.rollDoors();
    expect(ante).toEqual([{ kind: 'antechamber', reward: { kind: 'antechamber' } }]);
    run.enter(ante[0]);
    const boss = run.rollDoors();
    expect(boss[0].kind).toBe('boss');
    run.enter(boss[0]);
    const next = run.rollDoors();
    run.enter(next[0]);
    expect(run.biomeIndex).toBe(1);
    expect(run.depth).toBe(0);
  });

  it('offers 1–3 doors without duplicate gods or once-only rooms', () => {
    const run = new Run(defaultSave(), 7);
    run.enter(run.startPlan());
    run.depth = 2;
    for (let i = 0; i < 100; i++) {
      const doors = run.rollDoors();
      expect(doors.length).toBeGreaterThanOrEqual(1);
      expect(doors.length).toBeLessThanOrEqual(3);
      const gods = doors.filter((d) => d.reward?.kind === 'boon').map((d) => d.reward!.god);
      expect(new Set(gods).size).toBe(gods.length);
    }
    run.markUsed('shop');
    for (let i = 0; i < 100; i++) expect(run.rollDoors().some((d) => d.kind === 'shop')).toBe(false);
  });

  it('ends after the final guardian', () => {
    const run = new Run(defaultSave(), 3);
    run.biomeIndex = BIOMES.length - 1;
    run.enter({ kind: 'boss', reward: null });
    expect(run.isFinalBiome).toBe(true);
    expect(run.rollDoors()).toEqual([]);
  });

  it('starts with meta-progression bonuses', () => {
    const save = defaultSave();
    save.upgrades = { fortune: 2, defiance: 1 };
    save.startArtifact = 'thunder_rod';
    const run = new Run(save, 1);
    expect(run.gold).toBe(80);
    expect(run.deathDefiance).toBe(1);
    expect(run.artifacts[0]).toBe('thunder_rod');
  });
});

describe('enchantments', () => {
  it('upgrades tiers and caps at the maximum', () => {
    let owned = takeEnchant([], { id: 'echo', tier: 1 });
    owned = takeEnchant(owned, { id: 'echo', tier: 2 });
    expect(owned).toEqual([{ id: 'echo', tier: 2 }]);
    owned = takeEnchant(owned, { id: 'echo', tier: 9 });
    expect(owned[0].tier).toBe(MAX_ENCHANT_TIER);
  });

  it('offers next tiers and skips maxed enchantments', () => {
    const owned = ENCHANTS.map((e) => ({ id: e.id, tier: e.id === 'chains' ? 1 : MAX_ENCHANT_TIER }));
    const offers = rollEnchantOffers(new Rng(2), owned);
    expect(offers).toEqual([{ id: 'chains', tier: 2 }]);
  });
});

describe('save data', () => {
  it('recovers from missing or corrupt saves', () => {
    expect(normalizeSave(null)).toEqual(defaultSave());
    const s = normalizeSave({ ash: 'lots', weapons: ['sword', 'laser'], weapon: 'laser', stats: { kills: 5 } });
    expect(s.ash).toBe(0);
    expect(s.weapons).toEqual(['sword']);
    expect(s.weapon).toBe('sword');
    expect(s.stats.kills).toBe(5);
    expect(s.stats.runs).toBe(0);
  });

  it('prices upgrades by rank and reports max', () => {
    const save = defaultSave();
    const reflex = UPGRADES.find((u) => u.id === 'reflex')!;
    expect(nextCost(save, reflex)).toBe(reflex.costs[0]);
    save.upgrades.reflex = reflex.costs.length;
    expect(nextCost(save, reflex)).toBeNull();
    expect(metaBonuses(save).dashCharges).toBe(1);
  });
});
