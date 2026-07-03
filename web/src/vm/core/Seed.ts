/**
 * Deterministic PRNG. Every visual variation in the boutique (velvet jitter,
 * wear state, product arrangement) derives from a seed so that ?store=N
 * reproduces a complete boutique layout bit-for-bit.
 */

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }

  /** mulberry32 — fast, good-enough distribution for visual jitter. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1 - 1e-9));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Derive a child RNG from a string label — stable across runs. */
  child(label: string): Rng {
    let h = this.s;
    for (let i = 0; i < label.length; i++) {
      h = Math.imul(h ^ label.charCodeAt(i), 2654435761);
    }
    return new Rng(h >>> 0);
  }
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
