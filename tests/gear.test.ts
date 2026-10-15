import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math';
import { AFFIXES, applyGear, equippedItems, GEAR_RARITY, GEAR_SLOTS, gearStars, levelMult, MAX_GEAR_LEVEL, normalizeGear, PERKS, RARITY_ORDER, rarityOdds, rollGear, salvageValue, spendMaterials, upgradeCost } from '../src/game/gear';
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
    expect(rollGear(rng, 0, 'boots', 'epic').rarity).toMatch(/epic|legendary|unique|ghost/);
  });

  it('has seven tiers, with Ghost the rarest whatever the luck', () => {
    expect(RARITY_ORDER).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique', 'ghost']);
    for (const luck of [0, 0.3, 0.6, 1]) {
      const o = rarityOdds(luck);
      const total = Object.values(o).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 6);
      for (const k of RARITY_ORDER) if (k !== 'ghost') expect(o.ghost).toBeLessThan(o[k] || 1);
      expect(o.ghost).toBeLessThanOrEqual(0.01);
    }
    // Power and bonus count never drop as tiers rise.
    RARITY_ORDER.slice(1).forEach((k, i) => {
      expect(GEAR_RARITY[k].power).toBeGreaterThan(GEAR_RARITY[RARITY_ORDER[i]].power);
      expect(GEAR_RARITY[k].affixes).toBeGreaterThanOrEqual(GEAR_RARITY[RARITY_ORDER[i]].affixes);
    });
  });

  it('gives Unique and Ghost pieces a perk of their tier', () => {
    const rng = new Rng(11);
    const u = rollGear(rng, 0, undefined, 'unique');
    const gh = rollGear(rng, 0, undefined, 'ghost');
    expect(u.rarity).toMatch(/unique|ghost/);
    expect(gh.rarity).toBe('ghost');
    expect(gh.perk && PERKS[gh.perk].ghost).toBe(true);
    expect(gh.name).toMatch(/^Ghostly /);
    const s = baseStats();
    applyGear([{ ...gh, affixes: [] }], s);
    expect(JSON.stringify({ ...s, duos: 0, hammers: 0 })).not.toBe(JSON.stringify({ ...baseStats(), duos: 0, hammers: 0 }));
  });

  it('shows gold stars to five, then turns them purple up to ten', () => {
    expect(MAX_GEAR_LEVEL).toBe(10);
    expect(gearStars(1)).toEqual({ gold: 1, purple: 0 });
    expect(gearStars(5)).toEqual({ gold: 5, purple: 0 });
    expect(gearStars(7)).toEqual({ gold: 3, purple: 2 });
    expect(gearStars(10)).toEqual({ gold: 0, purple: 5 });
    for (let l = 2; l <= 10; l++) expect(levelMult(l)).toBeGreaterThan(levelMult(l - 1));
    // Purple stars need Titan Scales.
    const item = rollGear(new Rng(5), 0, 'boots', 'common');
    item.level = 6;
    expect(upgradeCost(item).scale).toBeGreaterThan(0);
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
    const old = normalizeGear({ items: [{ ...good, level: 99, perk: 'nope' }], equipped: {} });
    expect(old.items[0].level).toBe(10);
    expect(old.items[0].perk).toBeUndefined();
  });
});
