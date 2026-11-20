/** Seeded PRNG (mulberry32). Same seed -> same sequence, on every machine. */
export interface Rng {
  next(): number; // [0, 1)
  normal(): number; // standard normal
  int(maxExclusive: number): number;
  range(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  let spare: number | null = null;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    int: (n) => Math.floor(next() * n),
    range: (min, max) => min + (max - min) * next(),
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
