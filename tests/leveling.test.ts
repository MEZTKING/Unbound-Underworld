import { describe, expect, it } from 'vitest';
import { BOONS, needsCast, rollBoonOffers } from '../src/game/boons';
import { CHARACTERS, characterUnlocked } from '../src/game/characters';
import { Rng } from '../src/engine/math';
import { defaultSave, normalizeSave } from '../src/game/meta';
import {
  applyFeatures,
  applyForge,
  applyTalents,
  artifactSlots,
  canRaiseTalent,
  levelFromXp,
  MAX_LEVEL,
  TALENTS,
  talentPoints,
  TIERS,
  tierFor,
  UNLOCKS,
  xpForLevel,
} from '../src/game/progression';
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
    expect([artifactSlots(4), artifactSlots(5), artifactSlots(8), artifactSlots(12)]).toEqual([0, 1, 2, 3]);
    const all = baseStats();
    applyFeatures(MAX_LEVEL, all);
    expect(all.canPotion && all.canCast && all.canJump && all.canWrath).toBe(true);
  });

  it('keeps Cast boons out of offers until Cast is unlocked', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 40; i++) {
      for (const god of ['zeus', 'hermes'] as const) {
        const offers = rollBoonOffers(rng, god, [], 0, 3, (d) => !needsCast(d));
        for (const o of offers) expect(needsCast(BOONS.find((b) => b.id === o.id)!)).toBe(false);
      }
    }
  });
});

describe('talents', () => {
  it('earns one point per level and respects tiers and caps', () => {
    expect(talentPoints(1)).toBe(0);
    expect(canRaiseTalent(1, {}, 'might')).toBe(false);
    expect(canRaiseTalent(2, {}, 'might')).toBe(true);
    // A Wraith talent needs level 5.
    expect(canRaiseTalent(4, {}, 'bloodlust')).toBe(false);
    expect(canRaiseTalent(5, {}, 'bloodlust')).toBe(true);
    // Out of points.
    expect(canRaiseTalent(3, { might: 2 }, 'toughness')).toBe(false);
    // At the cap.
    expect(canRaiseTalent(MAX_LEVEL, { swiftness: 3 }, 'swiftness')).toBe(false);
  });

  it('applies talent ranks to stats', () => {
    const s = baseStats();
    applyTalents({ toughness: 2, might: 1, undying: 1 }, s);
    expect(s.maxHp).toBe(50 + 12);
    expect(s.globalDmg).toBeCloseTo(0.03);
    expect(s.deathDefiance).toBe(1);
    expect(TALENTS.every((t) => t.tier < TIERS.length)).toBe(true);
  });
});

describe('heroes and the forge', () => {
  it('unlocks heroes by their condition', () => {
    const save = defaultSave();
    const starters = CHARACTERS.filter((c) => characterUnlocked(c, save, 1)).map((c) => c.id);
    expect(starters).toEqual(['kael', 'lyra', 'doran']);
    save.stats.bossesSlain = 2;
    save.stats.escapes = 1;
    expect(CHARACTERS.every((c) => characterUnlocked(c, save, 8))).toBe(true);
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
    expect(kept.talents.might).toBe(2);
    expect(kept.weapons).toEqual(['sword', 'fists']);
    expect(normalizeSave({ character: 'nobody' }).character).toBe('kael');
  });
});
