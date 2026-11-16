import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from './rng';

describe('core/rng', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createRng(hashSeed(42, 3, -7));
    const b = createRng(hashSeed(42, 3, -7));
    for (let i = 0; i < 20; i += 1) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('diverges for different coordinates', () => {
    const a = createRng(hashSeed(42, 1, 2));
    const b = createRng(hashSeed(42, 2, 1));
    expect(a.next()).not.toBe(b.next());
  });

  it('respects range, int, and pick bounds', () => {
    const rng = createRng(1337);
    for (let i = 0; i < 100; i += 1) {
      const r = rng.range(10, 20);
      expect(r).toBeGreaterThanOrEqual(10);
      expect(r).toBeLessThan(20);
      const n = rng.int(1, 5);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
      expect(Number.isInteger(n)).toBe(true);
    }
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow();
  });
});
