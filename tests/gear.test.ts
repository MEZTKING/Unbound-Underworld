import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math';
import {
  AFFIXES,
  affixValue,
  applyGear,
  canStarUp,
  equippedItems,
  GEAR_RARITY,
  GEAR_SLOTS,
  gearStars,
  isStarredTier,
  levelMult,
  makeGear,
  MAX_GEAR_LEVEL,
  maxDropStars,
  normalizeGear,
  PERKS,
  RARITY_ORDER,
  rollDrop,
  rollGhost,
  salvageValue,
  spendMaterials,
  starOdds,
  upgradeCost,
} from '../src/game/gear';
import { FOE_DROP, GHOST_CHANCE, STAR_CHANCE, STARRED_TIER } from '../src/game/odds';
import { baseStats } from '../src/game/stats';

describe('gear', () => {
  it('rolls valid pieces with affixes allowed on their slot', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 300; i++) {
      const g = rollDrop(rng, (['foe', 'elite', 'chest', 'guardian'] as const)[i % 4], 30);
      expect(GEAR_SLOTS).toContain(g.slot);
      expect(g.affixes.length).toBe(GEAR_RARITY[g.rarity].affixes);
      expect(new Set(g.affixes.map((a) => a.id)).size).toBe(g.affixes.length);
      for (const a of g.affixes) {
        const slots = AFFIXES[a.id].slots;
        if (slots) expect(slots).toContain(g.slot);
      }
    }
  });

  it('drops plain Common/Uncommon pieces and rarer starred ones, Legendary only from guardians', () => {
    const rng = new Rng(13);
    const seen = { plain: 0, starred: 0 };
    for (let i = 0; i < 4000; i++) {
      const g = rollDrop(rng, 'foe', 30);
      if (isStarredTier(g.rarity)) {
        seen.starred++;
        expect(g.level).toBeGreaterThanOrEqual(1);
        expect(g.rarity).toBe('rare');
      } else {
        seen.plain++;
        expect(g.level).toBe(0);
        expect(canStarUp(g)).toBe(false);
      }
    }
    // About 10% of a foe's drops carry stars (5% one star, halving per star).
    expect(seen.starred / 4000).toBeGreaterThan(0.07);
    expect(seen.starred / 4000).toBeLessThan(0.13);
    for (const src of ['foe', 'elite', 'chest'] as const) expect(STARRED_TIER[src].legendary ?? 0).toBe(0);
    expect(STARRED_TIER.guardian.legendary! / STARRED_TIER.guardian.epic!).toBeLessThanOrEqual(40 / 60 + 1e-9);
    for (let i = 0; i < 200; i++) expect(isStarredTier(rollDrop(rng, 'guardian', 1).rarity)).toBe(true);
  });

  it('halves the odds for every extra star and caps stars by player level', () => {
    const o = starOdds('foe', 30);
    expect(o.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(o[1]).toBeCloseTo(STAR_CHANCE.foe, 9);
    for (let k = 2; k < o.length; k++) expect(o[k]).toBeCloseTo(o[k - 1] / 2, 9);
    expect(starOdds('foe', 1)).toHaveLength(2);
    expect(maxDropStars(1)).toBe(1);
    expect(maxDropStars(30)).toBe(MAX_GEAR_LEVEL);
    const rng = new Rng(2);
    for (let i = 0; i < 500; i++) expect(rollDrop(rng, 'guardian', 4).level).toBeLessThanOrEqual(maxDropStars(4));
    // A run's worth of kills yields only a starred piece or two.
    const run = 70 * FOE_DROP.gear * (1 - starOdds('foe', 30)[0]) + 10 * FOE_DROP.eliteGear * (1 - starOdds('elite', 30)[0]) + 80 * GHOST_CHANCE;
    expect(run).toBeGreaterThan(0.8);
    expect(run).toBeLessThan(2.2);
  });

  it('has seven tiers, rising in strength', () => {
    expect(RARITY_ORDER).toEqual(['common', 'uncommon', 'rare', 'epic', 'legendary', 'unique', 'ghost']);
    // Power and bonus count never drop as tiers rise.
    RARITY_ORDER.slice(1).forEach((k, i) => {
      expect(GEAR_RARITY[k].power).toBeGreaterThan(GEAR_RARITY[RARITY_ORDER[i]].power);
      expect(GEAR_RARITY[k].affixes).toBeGreaterThanOrEqual(GEAR_RARITY[RARITY_ORDER[i]].affixes);
    });
    expect(GHOST_CHANCE).toBeCloseTo(0.001, 9);
  });

  it('gives Unique and Ghost pieces a perk of their tier', () => {
    const rng = new Rng(11);
    const u = makeGear(rng, 'unique', 1);
    const gh = rollGhost(rng, 30);
    expect(u.rarity).toBe('unique');
    expect(u.perk && !PERKS[u.perk].ghost).toBe(true);
    expect(gh.rarity).toBe('ghost');
    expect(gh.level).toBeGreaterThanOrEqual(1);
    // Ghost bonuses never roll low: each beats the best a Legendary can roll.
    for (let i = 0; i < 50; i++) {
      const piece = rollGhost(rng, 1);
      piece.affixes.forEach((a, j) => expect(affixValue(piece, j)).toBeGreaterThanOrEqual(AFFIXES[a.id].base * 1.25 * GEAR_RARITY.legendary.power * levelMult(piece.level) - 1e-9));
    }
    expect(gh.perk && PERKS[gh.perk].ghost).toBe(true);
    expect(gh.name).toMatch(/^Ghostly /);
    const s = baseStats();
    applyGear([{ ...gh, affixes: [] }], s);
    expect(JSON.stringify({ ...s, duos: 0, hammers: 0 })).not.toBe(JSON.stringify({ ...baseStats(), duos: 0, hammers: 0 }));
  });

  it('shows gold stars to five, then turns them purple up to ten', () => {
    expect(MAX_GEAR_LEVEL).toBe(10);
    expect(gearStars(0)).toEqual({ gold: 0, purple: 0 });
    expect(gearStars(1)).toEqual({ gold: 1, purple: 0 });
    expect(gearStars(5)).toEqual({ gold: 5, purple: 0 });
    expect(gearStars(7)).toEqual({ gold: 3, purple: 2 });
    expect(gearStars(10)).toEqual({ gold: 0, purple: 5 });
    for (let l = 2; l <= 10; l++) expect(levelMult(l)).toBeGreaterThan(levelMult(l - 1));
    expect(levelMult(0)).toBe(1);
    // Purple stars need Titan Scales.
    const item = makeGear(new Rng(5), 'rare', 6, 'boots');
    expect(upgradeCost(item).scale).toBeGreaterThan(0);
    expect(canStarUp(item)).toBe(true);
    expect(canStarUp(makeGear(new Rng(5), 'uncommon', 0))).toBe(false);
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
    const item = makeGear(new Rng(1), 'rare', 1);
    expect(upgradeCost(item).bone).toBeGreaterThan(0);
    expect(salvageValue(item).bone).toBeGreaterThan(0);
  });

  it('drops broken gear and stale equips when loading', () => {
    const good = makeGear(new Rng(3), 'rare', 1, 'helmet');
    const g = normalizeGear({ items: [good, { uid: 'x', slot: 'cape', rarity: 'rare', affixes: [] }], equipped: { helmet: good.uid, boots: 'missing' } });
    expect(g.items).toHaveLength(1);
    expect(g.equipped).toEqual({ helmet: good.uid });
    expect(equippedItems(g)).toEqual([good]);
    const old = normalizeGear({ items: [{ ...good, level: 99, perk: 'nope' }], equipped: {} });
    expect(old.items[0].level).toBe(10);
    expect(old.items[0].perk).toBeUndefined();
    // Older saves gave plain pieces one star: they lose it; starred ones keep at least one.
    const plain = normalizeGear({ items: [{ ...good, uid: 'p', rarity: 'common', level: 1 }, { ...good, uid: 'q', rarity: 'epic', level: 0 }], equipped: {} });
    expect(plain.items.map((i) => i.level)).toEqual([0, 1]);
  });
});
