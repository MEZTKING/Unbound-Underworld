import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math';
import { AFFIXES, applyGear, equippedItems, GEAR_RARITY, GEAR_SLOTS, normalizeGear, rollGear, salvageValue, spendMaterials, upgradeCost } from '../src/game/gear';
import { baseStats } from '../src/game/stats';

describe('gear', () => {
  it('rolls valid pieces with affixes allowed on their slot', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      const g = rollGear(rng, 0.3);
      expect(GEAR_SLOTS).toContain(g.slot);
      expect(g.affixes.length).toBe(GEAR_RARITY[g.rarity].affixes);
      expect(new Set(g.affixes.map((a) => a.id)).size).toBe(g.affixes.length);
      for (const a of g.affixes) {
        const slots = AFFIXES[a.id].slots;
        if (slots) expect(slots).toContain(g.slot);
      }
    }
    expect(rollGear(rng, 0, 'boots', 'epic').rarity).toMatch(/epic|legendary/);
  });

  it('applies equipped bonuses to stats, stronger when upgraded', () => {
    const item = { uid: 'a', slot: 'armor' as const, rarity: 'rare' as const, name: 'Test', level: 1, affixes: [{ id: 'health' as const, roll: 1 }] };
    const s1 = baseStats();
    applyGear([item], s1);
    item.level = 3;
    const s3 = baseStats();
    applyGear([item], s3);
    expect(s1.maxHp).toBeGreaterThan(baseStats().maxHp);
    expect(s3.maxHp).toBeGreaterThan(s1.maxHp);
  });

  it('spends materials only when affordable', () => {
    const have = { bone: 5 };
    expect(spendMaterials(have, { bone: 6 })).toBe(false);
    expect(have.bone).toBe(5);
    expect(spendMaterials(have, { bone: 5 })).toBe(true);
    expect(have.bone).toBe(0);
    const item = rollGear(new Rng(1));
    expect(upgradeCost(item).bone).toBeGreaterThan(0);
    expect(salvageValue(item).bone).toBeGreaterThan(0);
  });

  it('drops broken gear and stale equips when loading', () => {
    const good = rollGear(new Rng(3), 0, 'helmet');
    const g = normalizeGear({ items: [good, { uid: 'x', slot: 'cape', rarity: 'rare', affixes: [] }], equipped: { helmet: good.uid, boots: 'missing' } });
    expect(g.items).toHaveLength(1);
    expect(g.equipped).toEqual({ helmet: good.uid });
    expect(equippedItems(g)).toEqual([good]);
  });
});
