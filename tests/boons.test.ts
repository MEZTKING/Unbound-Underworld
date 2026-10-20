import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/math';
import {
  availableGods,
  BOON_BY_ID,
  BOONS,
  boonValue,
  computeStats,
  MAX_GODS_PER_RUN,
  OLYMPIANS,
  pomCandidates,
  boonRarityOdds,
  BOON_RARITY_BY_REGION,
  BOON_RARITY_END,
  GODS,
  rollBoonOffers,
  rollRarity,
  type RarityOdds,
  rollHammerOffers,
  takeBoon,
  type OwnedBoon,
} from '../src/game/boons';
import type { GodId } from '../src/game/types';

describe('boon data', () => {
  it('has unique ids and a description for every boon', () => {
    const ids = BOONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BOONS) expect(b.desc(boonValue(b, 'common', 1)).length).toBeGreaterThan(10);
  });

  it('gives every Olympian a boon for each ability slot', () => {
    for (const g of OLYMPIANS) {
      for (const slot of ['attack', 'special', 'cast', 'dash']) {
        expect(BOONS.some((b) => b.god === g && b.slot === slot), `${g} ${slot}`).toBe(true);
      }
    }
  });

  it('scales values with rarity and level; inverse boons shrink', () => {
    const tidal = BOON_BY_ID.poseidon_attack;
    expect(boonValue(tidal, 'epic', 1)).toBeGreaterThan(boonValue(tidal, 'common', 1));
    expect(boonValue(tidal, 'common', 3)).toBeGreaterThan(boonValue(tidal, 'common', 1));
    const reload = BOON_BY_ID.hermes_reload;
    expect(boonValue(reload, 'rare', 1)).toBeLessThan(boonValue(reload, 'common', 1));
  });
});

describe('computeStats', () => {
  it('applies slot effects and damage bonuses', () => {
    const s = computeStats([{ id: 'poseidon_attack', rarity: 'common', level: 1 }], []);
    expect(s.dmgBonus.attack).toBeCloseTo(0.3);
    expect(s.hitEffects.attack?.kind).toBe('knock');
  });

  it('stacks passive health and meta bonuses', () => {
    const s = computeStats([{ id: 'aphrodite_vigor', rarity: 'common', level: 1 }], [], {
      maxHp: 20,
      deathDefiance: 1,
      dmg: 0.1,
      dashCharges: 1,
      castAmmo: 0,
      damageTaken: 0.9,
    });
    expect(s.maxHp).toBe(50 + 20 + 25);
    expect(s.dashCharges).toBe(2);
    expect(s.deathDefiance).toBe(1);
    expect(s.damageTaken).toBeCloseTo(0.9);
  });
});

describe('offers', () => {
  it('replaces a boon occupying the same slot', () => {
    let owned: OwnedBoon[] = [{ id: 'zeus_attack', rarity: 'common', level: 2 }];
    owned = takeBoon(owned, { id: 'ares_attack', rarity: 'rare' });
    expect(owned.map((b) => b.id)).toEqual(['ares_attack']);
    owned = takeBoon(owned, { id: 'ares_frenzy', rarity: 'common' });
    expect(owned).toHaveLength(2);
  });

  it('never offers owned boons or boons with unmet prerequisites', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const offers = rollBoonOffers(rng, 'zeus', [{ id: 'zeus_attack', rarity: 'common', level: 1 }]);
      expect(offers.length).toBeGreaterThan(0);
      expect(offers.length).toBeLessThanOrEqual(3);
      for (const o of offers) {
        expect(o.id).not.toBe('zeus_attack');
        expect(new Set(offers.map((x) => x.id)).size).toBe(offers.length);
      }
    }
    const fresh = new Rng(2);
    for (let i = 0; i < 200; i++) {
      for (const o of rollBoonOffers(fresh, 'zeus', [])) expect(o.id).not.toBe('zeus_overcharge');
    }
  });

  it('marks slot clashes and only offers duos once both gods are present', () => {
    const rng = new Rng(9);
    const owned: OwnedBoon[] = [{ id: 'zeus_special', rarity: 'common', level: 1 }];
    const zeusOnly = Array.from({ length: 100 }, () => rollBoonOffers(rng, 'poseidon', owned)).flat();
    expect(zeusOnly.some((o) => o.id === 'duo_seastorm')).toBe(false);
    const clash = zeusOnly.find((o) => o.id === 'poseidon_special');
    if (clash) expect(clash.replaces).toBe('zeus_special');
    const both: OwnedBoon[] = [...owned, { id: 'poseidon_attack', rarity: 'common', level: 1 }];
    const withDuo = Array.from({ length: 100 }, () => rollBoonOffers(rng, 'zeus', both)).flat();
    expect(withDuo.some((o) => o.id === 'duo_seastorm' && o.rarity === 'duo')).toBe(true);
  });

  it('limits a run to four gods', () => {
    const owned: OwnedBoon[] = ['zeus_attack', 'ares_special', 'athena_cast', 'demeter_dash'].map((id) => ({ id, rarity: 'common', level: 1 }));
    const gods = availableGods(owned);
    expect(gods).toHaveLength(MAX_GODS_PER_RUN);
    expect(gods).not.toContain('poseidon');
    expect(availableGods(owned.slice(0, 2))).toEqual(OLYMPIANS);
  });

  it('only poms levelable boons and offers unowned hammers', () => {
    const owned: OwnedBoon[] = [
      { id: 'athena_shield', rarity: 'common', level: 1 },
      { id: 'zeus_attack', rarity: 'common', level: 1 },
    ];
    expect(pomCandidates(owned).map((b) => b.id)).toEqual(['zeus_attack']);
    const hammers = rollHammerOffers(new Rng(4), 'sword', ['sword_double']);
    expect(hammers.every((h) => h.weapon === 'sword' && h.id !== 'sword_double')).toBe(true);
  });

  it('keeps early boons mostly common and grows rarer deeper in', () => {
    const sum = (o: ReturnType<typeof boonRarityOdds>) => o.common + o.rare + o.epic + o.heroic;
    const first = boonRarityOdds(0, true, 3);
    expect(first.epic + first.heroic).toBe(0);
    let prev = -1;
    for (let r = 0; r < 4; r++) {
      const o = boonRarityOdds(r, false, 0);
      expect(sum(o)).toBeCloseTo(1, 6);
      expect(o.epic + o.heroic).toBeGreaterThan(prev);
      prev = o.epic + o.heroic;
    }
    expect(boonRarityOdds(0).heroic).toBe(0);
    // Favor of the Gods shifts odds toward the rare tiers.
    expect(boonRarityOdds(2, false, 3).common).toBeLessThan(boonRarityOdds(2).common);
    expect(sum(boonRarityOdds(3, false, 3))).toBeCloseTo(1, 6);
  });
});

describe('boon rarity, measured', () => {
  const N = 100_000;
  const measure = (odds: RarityOdds) => {
    const rng = new Rng(97);
    const n: Record<string, number> = { common: 0, rare: 0, epic: 0, heroic: 0 };
    for (let i = 0; i < N; i++) n[rollRarity(rng, odds)]++;
    return n;
  };
  // 4 standard deviations of a binomial at N draws: a real drift fails, noise never does.
  const close = (got: number, p: number) => expect(Math.abs(got / N - p)).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / N) + 1e-9);

  it('rolls each tier as often as the odds say, at every chamber of every region', () => {
    for (let region = 0; region < BOON_RARITY_BY_REGION.length; region++) {
      for (const progress of [0, 0.5, 1]) {
        const odds = boonRarityOdds(region, false, 0, progress);
        expect(odds.common + odds.rare + odds.epic + odds.heroic).toBeCloseTo(1, 9);
        const n = measure(odds);
        for (const k of ['common', 'rare', 'epic', 'heroic'] as const) close(n[k], odds[k]);
      }
    }
  });

  it('climbs smoothly: every chamber is at least as generous as the one before, with no jump at a region gate', () => {
    let prev = 1;
    for (let region = 0; region < BOON_RARITY_BY_REGION.length; region++) {
      for (let step = 0; step <= 5; step++) {
        const common = boonRarityOdds(region, false, 0, step / 5).common;
        expect(common).toBeLessThanOrEqual(prev + 1e-9);
        prev = common;
      }
      // The end of one region is the start of the next.
      if (region + 1 < BOON_RARITY_BY_REGION.length) expect(boonRarityOdds(region, false, 0, 1)).toEqual(boonRarityOdds(region + 1, false, 0, 0));
    }
    expect(boonRarityOdds(3, false, 0, 1)).toEqual({ ...BOON_RARITY_END });
  });

  it('keeps the first boon of an escape Common or Rare, whatever the Favor', () => {
    const n = measure(boonRarityOdds(0, true, 5));
    expect(n.epic + n.heroic).toBe(0);
    close(n.rare, 0.05);
  });

  it('Favor of the Gods moves 3.25% per rank to the rarer tiers (Heroic only past the first region)', () => {
    for (const region of [0, 2]) {
      const base = boonRarityOdds(region, false, 0, 0.4);
      const fav = boonRarityOdds(region, false, 4, 0.4);
      const moved = base.common - fav.common;
      expect(moved).toBeCloseTo(region === 0 ? 4 * 0.03 : 4 * 0.0325, 9);
      expect(fav.heroic > base.heroic).toBe(region > 0);
    }
  });

  it("real offers match the odds: no boon is quietly stuck on one tier (fixed-effect boons show as Special)", () => {
    const rng = new Rng(4242);
    const gods = Object.keys(GODS) as GodId[];
    for (let region = 0; region < 4; region++) {
      const odds = boonRarityOdds(region, false, 0, 0.5);
      const n: Record<string, number> = { common: 0, rare: 0, epic: 0, heroic: 0 };
      let total = 0;
      for (let run = 0; run < 6000; run++) {
        let owned: OwnedBoon[] = [];
        for (let k = 0; k < 2 + region * 3; k++) {
          const o = rollBoonOffers(rng, rng.pick(gods), owned, odds);
          if (o.length) owned = takeBoon(owned, o[0]);
        }
        for (const o of rollBoonOffers(rng, rng.pick(gods), owned, odds)) {
          const def = BOON_BY_ID[o.id];
          if (def.slot === 'duo' || def.fixed) continue;
          n[o.rarity]++;
          total++;
        }
      }
      for (const k of ['common', 'rare', 'epic', 'heroic'] as const) {
        const p = odds[k];
        expect(Math.abs(n[k] / total - p)).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / total) + 1e-9);
      }
    }
  });
});
