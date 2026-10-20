import { describe, expect, it } from 'vitest';
import { sha256 } from '../src/engine/sha256';
import { gameParams } from '../src/game/devaccess';

describe('developer access', () => {
  it('hashes like SHA-256', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256('é ✦ the Underworld'.repeat(20)).length).toBe(64);
  });

  it('keeps the debug address parameters for the owner only', () => {
    const search = '?god&seed=5&biome=2&room=boss&level=40&view=2d&quality=high';
    const anyone = gameParams(search, false);
    expect([...anyone.keys()]).toEqual(['view', 'quality']);
    const owner = gameParams(search, true);
    expect(owner.has('god')).toBe(true);
    expect(owner.get('seed')).toBe('5');
  });
});
