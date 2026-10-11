/**
 * Seeded pseudo-random numbers (mulberry32), so every analysis is reproducible.
 *
 *   const random = createRandom(42);
 *   random.next()        // float in [0, 1)
 *   random.int(10)       // integer in [0, 10)
 *   random.shuffle(arr)  // in place, Fisher-Yates; returns arr
 *   random.seed()        // a fresh 31-bit integer seed for a child generator
 */
export function createRandom(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(n) { return Math.floor(next() * n); },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    seed() { return Math.floor(next() * 2147483647) || 1; },
  };
}
