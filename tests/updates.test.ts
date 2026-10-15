import { describe, expect, it } from 'vitest';
import { APP_VERSION, newerThan } from '../src/updates';
import pkg from '../package.json';

describe('update checks', () => {
  it('knows its own version', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('compares release tags with the running version', () => {
    expect(newerThan('v0.1.2', '0.1.1')).toBe(true);
    expect(newerThan('v0.2.0', '0.1.9')).toBe(true);
    expect(newerThan('v0.1.10', '0.1.9')).toBe(true);
    expect(newerThan('v1.0.0', '0.9.9')).toBe(true);
    expect(newerThan('v0.1.1', '0.1.1')).toBe(false);
    expect(newerThan('v0.1.0', '0.1.1')).toBe(false);
  });
});
