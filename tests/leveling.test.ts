import { describe, expect, it } from 'vitest';
import { BOONS, needsCast, rollBoonOffers } from '../src/game/boons';
import { CHARACTERS, characterUnlocked } from '../src/game/characters';
import { Rng } from '../src/engine/math';
import { defaultSave, normalizeSave, WEAPON_IDS } from '../src/game/meta';
import {
  applyFeatures,
  applyForge,
  applyLevel,
  artifactSlots,
  hasFeature,
  levelBonus,
  levelFromXp,
  MAX_LEVEL,
  TIERS,
  tierFor,
  UNLOCKS,
  xpForLevel,
  xpToNext,
} from '../src/game/progression';
import { ALTAR, ALTAR_UPGRADES, altarDefiance, applyAltar, canBuyAltar, migrateTalents, nextAltarCost, sectionState, tableOpen } from '../src/game/altar';
import { applySkills, canRaiseSkill, HERO_MAX_LEVEL, HERO_TREES, heroLevelFromXp, heroPoints, heroXpForLevel, rowOpen } from '../src/game/herotree';
import { partFor, partsFromHistory } from '../src/game/smith';
import { baseStats } from '../src/game/stats';

describe('levels', () => {
  it('converts experience to levels consistently', () => {
    expect(levelFromXp(0).level).toBe(1);
    for (let l = 1; l <= MAX_LEVEL; l++) {
      expect(levelFromXp(xpForLevel(l)).level).toBe(l);
      if (l > 1) expect(levelFromXp(xpForLevel(l) - 1).level).toBe(l - 1);
    }
    expect(levelFromXp(1e9).level).toBe(MAX_LEVEL);
  });

  it('names a rank tier for every level', () => {
    expect(tierFor(1).name).toBe('Shade');
    expect(tierFor(10).name).toBe('Revenant');
    expect(tierFor(MAX_LEVEL).name).toBe(TIERS[TIERS.length - 1].name);
  });
});

describe('feature unlocks', () => {
  it('starts with only attack, special and dash', () => {
    const s = baseStats();
    applyFeatures(1, s);
    expect(s.canPotion || s.canCast || s.canJump || s.canWrath).toBe(false);
    expect(s.artifactSlots).toBe(0);
    expect(s.castAmmo).toBe(0);
  });

  it('opens mechanics in order as you level', () => {
    const levels = UNLOCKS.map((u) => u.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    const s = baseStats();
    applyFeatures(3, s);
    expect(s.canPotion && s.canCast).toBe(true);
    expect(s.canJump).toBe(false);
    expect([artifactSlots(3), artifactSlots(4), artifactSlots(8), artifactSlots(12)]).toEqual([0, 1, 2, 3]);
    // Jump comes at level 5, or as soon as you've slain the final guardian.
    expect(hasFeature(4, 'jump')).toBe(false);
    expect(hasFeature(5, 'jump')).toBe(true);
    expect(hasFeature(2, 'jump', true)).toBe(true);
    const all = baseStats();
    applyFeatures(MAX_LEVEL, all);
    expect(all.canPotion && all.canCast && all.canJump && all.canWrath).toBe(true);
  });

  it('keeps Cast boons out of offers until Cast is unlocked', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 40; i++) {
      for (const god of ['zeus', 'hermes'] as const) {
        const offers = rollBoonOffers(rng, god, [], undefined, 3, (d) => !needsCast(d));
        for (const o of offers) expect(needsCast(BOONS.find((b) => b.id === o.id)!)).toBe(false);
      }
    }
  });
});

describe('levels to 50', () => {
  it('reaches level 50 with a gentler climb after 30', () => {
    expect(MAX_LEVEL).toBe(50);
    expect(levelFromXp(xpForLevel(50) + 1e6).level).toBe(50);
    expect(xpToNext(31) - xpToNext(30)).toBe(100);
    expect(tierFor(50).name).toBe('Deathless');
    expect(TIERS.every((t, i) => i === 0 || t.level > TIERS[i - 1].level)).toBe(true);
  });

  it('makes every hero sturdier with each level', () => {
    expect(levelBonus(1)).toEqual({ hp: 0, dmg: 0 });
    expect(levelBonus(50).hp).toBe(49);
    expect(levelBonus(50).dmg).toBeCloseTo(0.1);
    const s = baseStats();
    applyLevel(12, s);
    expect(s.maxHp).toBe(50 + 11);
    expect(s.globalDmg).toBeCloseTo(0.02);
  });
});

describe('Altar of Ashes', () => {
  it('runs from weak to strong, with sections sealed by level and Ash spent', () => {
    const t = ALTAR[0];
    expect(t.sections.map((x) => x.level)).toEqual([...t.sections.map((x) => x.level)].sort((a, b) => a - b));
    expect(sectionState({}, 1, 0, 0).open).toBe(true);
    expect(sectionState({}, 50, 0, 1).open).toBe(false);
    // Spend enough in Embers and Cinders opens at level 4.
    const ranks = { vitality: 4, fortune: 1 };
    expect(sectionState(ranks, 3, 0, 1).needLevel).toBe(1);
    expect(sectionState(ranks, 4, 0, 1).open).toBe(true);
    expect(canBuyAltar(ranks, 4, 1000, 'fury')).toBe(true);
    expect(canBuyAltar(ranks, 4, 5, 'fury')).toBe(false);
  });

  it("keeps Death's Reprieve in the last section, and very dear", () => {
    const last = ALTAR[0].sections.at(-1)!;
    const reprieve = last.ups.find((u) => u.id === 'defiance')!;
    expect(reprieve.costs[0]).toBeGreaterThanOrEqual(900);
    expect(altarDefiance({ defiance: 2, undying: 1 })).toBe(3);
  });

  it('opens the Deep Altar only when the first table is complete', () => {
    const all = Object.fromEntries(ALTAR[0].sections.flatMap((s) => s.ups.map((u) => [u.id, u.costs.length])));
    expect(tableOpen({}, 1)).toBe(false);
    expect(tableOpen(all, 1)).toBe(true);
    expect(nextAltarCost(all, 'vitality')).toBeNull();
  });

  it('prices both tables to finish around level 50', () => {
    const total = ALTAR_UPGRADES.reduce((n, u) => n + u.costs.reduce((a, b) => a + b, 0), 0);
    expect(total).toBeGreaterThan(30000);
    expect(total).toBeLessThan(50000);
    expect(Math.max(...ALTAR[1].sections.map((s) => s.level))).toBeLessThanOrEqual(MAX_LEVEL);
  });

  it('moves old talents onto the Altar and refunds what no longer fits', () => {
    const { upgrades, refund } = migrateTalents({ vitality: 4, defiance: 3 }, { toughness: 2, might: 1, shardcraft: 2 });
    expect(upgrades.vitality).toBe(4);
    expect(upgrades.fury).toBe(1);
    expect(upgrades.defiance).toBe(2);
    // Two Toughness ranks had no room, Shardcraft has no home, and the third Reprieve rank is refunded.
    expect(refund).toBe(40 * 4 + 140);
    const s = baseStats();
    applyAltar({ vitality: 2, fury: 1 }, s);
    expect(s.maxHp).toBe(50 + 16);
    expect(s.globalDmg).toBeCloseTo(0.04);
  });

  it('migrates an old save once', () => {
    const s = normalizeSave({ xp: 5000, stats: { runs: 10 }, talents: { might: 2 }, upgrades: { fury: 1 }, bestiary: { Vexa: 1 } });
    expect(s.talents).toEqual({});
    expect(s.upgrades.fury).toBe(3);
    expect(s.progress).toBe(2);
    expect(s.smith.parts).toEqual(['whetstone']);
    expect(heroLevelFromXp(s.heroXp.kael ?? 0).level).toBeGreaterThan(1);
    const again = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(again.upgrades).toEqual(s.upgrades);
  });
});

describe('hero skill trees', () => {
  it('gives each hero their own three-branch tree', () => {
    for (const c of CHARACTERS) {
      const t = HERO_TREES[c.id];
      expect(t.nodes).toHaveLength(12);
      expect(new Set(t.nodes.map((n) => n.id)).size).toBe(12);
    }
  });

  it('levels heroes to 20 with a point per level, and gates rows by points in the branch', () => {
    expect(heroLevelFromXp(heroXpForLevel(HERO_MAX_LEVEL)).level).toBe(HERO_MAX_LEVEL);
    expect(heroPoints(HERO_MAX_LEVEL)).toBe(19);
    expect(canRaiseSkill('kael', 1, {}, 'kael.00')).toBe(false);
    expect(canRaiseSkill('kael', 2, {}, 'kael.00')).toBe(true);
    expect(canRaiseSkill('kael', 2, {}, 'lyra.00')).toBe(false);
    expect(rowOpen('kael', {}, 0, 1)).toBe(false);
    expect(rowOpen('kael', { 'kael.00': 2 }, 0, 1)).toBe(true);
    const s = baseStats();
    applySkills('kael', { 'kael.00': 2, 'kael.10': 1 }, s);
    expect(s.dmgBonus.attack).toBeCloseTo(0.1);
    expect(s.maxHp).toBe(56);
  });
});

describe('the Blacksmith', () => {
  it('gets a forge part from each guardian, and the Anvil Heart under Torment', () => {
    expect(partFor('Vexa', 0, [])).toBe('whetstone');
    expect(partFor('Vexa', 0, ['whetstone'])).toBeNull();
    expect(partFor('Vexa', 1, ['whetstone'])).toBe('heart');
    expect(partFor('Grunt', 2, [])).toBeNull();
    expect(partsFromHistory({ Vexa: 2, Aurex: 1 }, 2)).toEqual(['whetstone', 'crucible', 'heart']);
  });
});

describe('heroes and the forge', () => {
  it('unlocks heroes by their condition', () => {
    const save = defaultSave();
    const starters = CHARACTERS.filter((c) => characterUnlocked(c, save, 1)).map((c) => c.id);
    expect(starters).toEqual(['kael', 'lyra', 'doran']);
    // Classes open slowly as you rank up; guardians and escapes are a second way in.
    expect(CHARACTERS.filter((c) => characterUnlocked(c, save, 6)).map((c) => c.id)).toEqual(['kael', 'lyra', 'doran']);
    expect(CHARACTERS.filter((c) => characterUnlocked(c, save, 10)).map((c) => c.id)).toEqual(['kael', 'lyra', 'doran', 'gorran', 'ione']);
    save.stats.bossesSlain = 1;
    expect(CHARACTERS.filter((c) => characterUnlocked(c, save, 1)).map((c) => c.id)).toEqual(['kael', 'lyra', 'doran', 'gorran']);
    save.stats.bossesSlain = 6;
    save.stats.escapes = 1;
    expect(CHARACTERS.filter((c) => !characterUnlocked(c, save, 1)).map((c) => c.id)).toEqual(['selene']);
    expect(CHARACTERS.every((c) => characterUnlocked(c, defaultSave(), 22))).toBe(true);
  });

  it('gives every hero their own signature weapon', () => {
    const weapons = CHARACTERS.map((c) => c.weapon);
    expect(new Set(weapons).size).toBe(CHARACTERS.length);
    expect([...weapons].sort()).toEqual([...WEAPON_IDS].sort());
  });

  it('gives each hero a distinct stat profile', () => {
    const profiles = CHARACTERS.map((c) => {
      const s = baseStats();
      c.apply(s);
      return JSON.stringify([s.maxHp, s.moveSpeed, s.damageTaken, s.globalDmg, s.dashCharges, s.dmgBonus, s.critChance, s.lifeOnKill, s.wrathGain]);
    });
    expect(new Set(profiles).size).toBe(CHARACTERS.length);
  });

  it('adds weapon damage per forge tier', () => {
    const s = baseStats();
    applyForge(5, s);
    expect(s.dmgBonus.attack).toBeCloseTo(0.45);
    expect(s.forgeTier).toBe(5);
  });
});

describe('save migration', () => {
  it('gives veterans experience for their past runs and keeps new saves at level 1', () => {
    expect(normalizeSave({}).xp).toBe(0);
    const vet = normalizeSave({ stats: { runs: 10, kills: 300, bestDepth: 12, bossesSlain: 2, escapes: 0, deaths: 10, bestTime: 0, totalAsh: 50 } });
    expect(levelFromXp(vet.xp).level).toBeGreaterThanOrEqual(5);
    // Their old unlocks aren't announced all over again.
    expect(vet.seenLevel).toBe(levelFromXp(vet.xp).level);
    const kept = normalizeSave({ xp: 500, talents: { might: 2 }, character: 'lyra', forge: { sword: 3 }, weapons: ['sword', 'fists', 'bogus'] });
    expect(kept.xp).toBe(500);
    expect(kept.character).toBe('lyra');
    // Talents moved onto the Altar (v0.9).
    expect(kept.talents).toEqual({});
    expect(kept.upgrades.fury).toBe(2);
    expect(kept.weapons).toEqual(['sword', 'fists']);
    expect(normalizeSave({ character: 'nobody' }).character).toBe('kael');
  });
});
