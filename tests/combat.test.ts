import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/game/boons';
import { applyChill, applyDoom, CHILL_MAX, damageEnemy, DOOM_DELAY, updateStatuses } from '../src/game/combat';
import { createBoss, createEnemy } from '../src/game/enemies';
import { Rng } from '../src/engine/math';
import { ENDGAME_TRAIT_HEAT, ENDGAME_TRAITS } from '../src/game/odds';
import { BIOMES, generateEncounter } from '../src/game/rooms';
import { applyEliteMod } from '../src/game/world';
import type { Enemy } from '../src/game/enemies/enemy';
import type { PlayerStats } from '../src/game/stats';
import type { World } from '../src/game/world';

/** Just enough of a World for the damage pipeline. */
function stubWorld(stats: PlayerStats): World & { killed: Enemy[] } {
  const noop = () => {};
  const particles = { text: noop, directional: noop, ring: noop, burst: noop, spawn: noop };
  const killed: Enemy[] = [];
  const w = {
    stats,
    player: { x: 0, y: 0, hp: 50, maxHp: 50, rampageT: 0, combo: 0, action: null, comboHit: noop },
    particles,
    killed,
    hitstop: noop,
    healPlayer: noop,
    addBolt: noop,
    flashLight: noop,
    later: noop,
    gainSouls: noop,
    zones: [],
    telegraphs: [],
    nearestEnemy: () => null,
    enemiesInRadius: () => [],
    killEnemy: (e: Enemy) => {
      e.dead = true;
      killed.push(e);
    },
  };
  return w as unknown as World & { killed: Enemy[] };
}

function grunt(): Enemy {
  const e = createEnemy('grunt', 100, 0);
  e.spawnT = 0;
  return e;
}

describe('damage pipeline', () => {
  it('applies slot damage bonuses and kills at zero health', () => {
    const w = stubWorld(computeStats([{ id: 'poseidon_attack', rarity: 'common', level: 1 }], []));
    const e = grunt();
    const dealt = damageEnemy(w, e, 20, { source: 'attack', noEffects: true });
    expect(dealt).toBe(26);
    expect(e.hp).toBe(e.maxHp - 26);
    damageEnemy(w, e, 1000, { source: 'attack', noEffects: true });
    expect(w.killed).toContain(e);
  });

  it('soaks damage with armour first and staggers when it breaks', () => {
    const w = stubWorld(computeStats([], []));
    const e = grunt();
    e.maxArmor = e.armor = 30;
    damageEnemy(w, e, 20, { source: 'attack' });
    expect(e.armor).toBe(10);
    expect(e.hp).toBe(e.maxHp);
    damageEnemy(w, e, 20, { source: 'attack' });
    expect(e.armor).toBe(0);
    expect(e.hp).toBe(e.maxHp - 10);
    expect(e.status.stun).toBeGreaterThan(0);
  });

  it('lets hoplite shields block frontal hits but not hits from behind', () => {
    const w = stubWorld(computeStats([], []));
    const e = createEnemy('shield', 100, 0);
    e.spawnT = 0;
    e.facing = Math.PI; // facing the attacker at x=0
    const front = damageEnemy(w, e, 40, { source: 'attack', from: { x: 0, y: 0 }, noEffects: true });
    const back = damageEnemy(w, e, 40, { source: 'attack', from: { x: 200, y: 0 }, noEffects: true });
    expect(front).toBeLessThan(10);
    expect(back).toBe(40);
  });

  it('detonates Doom after its delay', () => {
    const w = stubWorld(computeStats([], []));
    const e = grunt();
    applyDoom(e, 30);
    updateStatuses(w, e, DOOM_DELAY / 2);
    expect(e.hp).toBe(e.maxHp);
    updateStatuses(w, e, DOOM_DELAY);
    expect(e.hp).toBe(e.maxHp - 30);
    expect(e.status.doom).toBeUndefined();
  });

  it('slows with Chill and shatters at max stacks with Killing Freeze', () => {
    const w = stubWorld(computeStats([{ id: 'demeter_freeze', rarity: 'common', level: 1 }], []));
    const e = grunt();
    e.maxHp = e.hp = 500;
    applyChill(w, e, 4);
    expect(updateStatuses(w, e, 0.01)).toBeCloseTo(0.8);
    applyChill(w, e, CHILL_MAX);
    expect(e.status.chill).toBeUndefined();
    expect(e.hp).toBe(500 - 80);
  });
});

describe('endgame traits and guardian rules', () => {
  it('a Warded foe soaks 90% until a Special (or powered attack) breaks the ward', () => {
    const w = stubWorld(computeStats([], []));
    const e = grunt();
    applyEliteMod(e, 'warded');
    expect(e.ward).toBe(true);
    const hp = e.hp;
    damageEnemy(w, e, 100, { source: 'attack', noEffects: true });
    expect(hp - e.hp).toBe(10);
    damageEnemy(w, e, 20, { source: 'special', noEffects: true });
    expect(e.ward).toBe(false);
    const before = e.hp;
    damageEnemy(w, e, 20, { source: 'attack', noEffects: true });
    expect(before - e.hp).toBe(20);
  });

  it('endgame traits only appear from Torment 3', () => {
    const traits = (heat: number) => {
      const seen = new Set<string>();
      const rng = new Rng(3);
      for (let i = 0; i < 300; i++) for (const wave of generateEncounter(rng, BIOMES[2], 2, 4, true, 1, 1, heat)) for (const f of wave) if (f.mod) seen.add(f.mod);
      return seen;
    };
    for (const t of ENDGAME_TRAITS) expect(traits(0).has(t)).toBe(false);
    for (const t of ENDGAME_TRAITS) expect(traits(ENDGAME_TRAIT_HEAT).has(t)).toBe(true);
  });

  it('guardians only obey their rule when it is on', () => {
    const w = stubWorld(computeStats([], []));
    const hound = createBoss('cerberus', 0, 0);
    hound.spawnT = 0;
    let hp = hound.hp;
    damageEnemy(w, hound, 100, { source: 'attack', noEffects: true });
    expect(hp - hound.hp).toBe(100);
    hound.rule = true;
    hp = hound.hp;
    damageEnemy(w, hound, 100, { source: 'attack', noEffects: true });
    expect(hp - hound.hp).toBe(22);
    // Dazed after crashing into a wall: the rule pays off.
    hound.status.stun = 1;
    hp = hound.hp;
    damageEnemy(w, hound, 100, { source: 'attack', noEffects: true });
    expect(hp - hound.hp).toBe(130);

    const colossus = createBoss('talos', 0, 0);
    colossus.spawnT = 0;
    colossus.rule = true;
    const armor = colossus.armor;
    damageEnemy(w, colossus, 100, { source: 'attack', noEffects: true });
    expect(armor - colossus.armor).toBe(8);
    damageEnemy(w, colossus, 100, { source: 'special', noEffects: true });
    expect(armor - colossus.armor).toBe(158);
    for (const b of [createBoss('fury', 0, 0), createBoss('hydra', 0, 0), hound, colossus]) {
      expect(b.ruleName.length).toBeGreaterThan(3);
      expect(b.ruleHint.length).toBeGreaterThan(20);
    }
  });
});
