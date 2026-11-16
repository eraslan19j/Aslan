/** Deterministic PRNG (Mulberry32). Never use Math.random() in world/sim code. */
export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

export function hashSeed(...parts: readonly number[]): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    h ^= Math.imul(part | 0, 0x9e3779b1) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range(min: number, max: number): number {
      return min + (max - min) * next();
    },
    int(min: number, maxInclusive: number): number {
      return Math.floor(min + (maxInclusive - min + 1) * next());
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('Cannot pick from empty array');
      }
      const idx = Math.floor(next() * items.length);
      return items[idx]!;
    },
  };
}
