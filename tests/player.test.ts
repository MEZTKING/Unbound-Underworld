import { describe, expect, it } from 'vitest';
import { Player } from '../src/game/player';
import { baseStats } from '../src/game/stats';

describe('max Health changes', () => {
  const withMax = (maxHp: number) => ({ ...baseStats(), maxHp });

  it('new max Health comes with as much Health', () => {
    const p = new Player('sword', 'kael');
    p.applyStats(withMax(100), true);
    p.hp = 50;
    p.applyStats(withMax(125));
    expect(p.hp).toBe(75);
  });

  it('taking gear off and back on does not heal', () => {
    const p = new Player('sword', 'kael');
    p.applyStats(withMax(100), true);
    p.hp = 50;
    for (let i = 0; i < 5; i++) {
      p.applyStats(withMax(80));
      p.applyStats(withMax(100));
    }
    expect(p.hp).toBe(50);
    // Real new max Health afterwards still heals.
    p.applyStats(withMax(120));
    expect(p.hp).toBe(70);
  });

  it('a full heal clears what was lost', () => {
    const p = new Player('sword', 'kael');
    p.applyStats(withMax(100), true);
    p.applyStats(withMax(80));
    p.applyStats(withMax(100), true);
    p.hp = 60;
    p.applyStats(withMax(120));
    expect(p.hp).toBe(80);
  });
});
