import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/game/boons';
import { applyChill, applyDoom, CHILL_MAX, damageEnemy, DOOM_DELAY, updateStatuses } from '../src/game/combat';
import { createEnemy } from '../src/game/enemies';
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
