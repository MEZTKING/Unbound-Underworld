import { describe, expect, it } from 'vitest';
import { CHARACTER_BY_ID, heroForWeapon } from '../src/game/characters';
import { normalizeSave } from '../src/game/meta';

describe('classes', () => {
  it('refunds Ash spent on weapons once, and arms the hero with their own weapon', () => {
    const old = { ash: 10, weapons: ['sword', 'spear', 'bow'], weapon: 'bow', character: 'doran' };
    const s = normalizeSave(old);
    expect(s.ash).toBe(10 + 40 + 60);
    expect(s.notice).toMatch(/refunded/);
    expect(s.weapon).toBe(CHARACTER_BY_ID.doran.weapon);
    // A save already on classes is not refunded again.
    const again = normalizeSave({ ...s, notice: '' });
    expect(again.ash).toBe(s.ash);
    expect(again.notice).toBe('');
  });

  it('finds the hero for each weapon', () => {
    expect(heroForWeapon('katana').id).toBe('selene');
    expect(heroForWeapon('blunderbuss').id).toBe('rook');
    expect(heroForWeapon('nunchaku').id).toBe('ione');
  });
});
