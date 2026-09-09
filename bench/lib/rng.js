/**
 * Seeded randomness so every library build sees the identical random sequence.
 */

/**
 * mulberry32 - a fast 32-bit seeded PRNG. Returns a function producing floats in `[0, 1)`.
 * The returned function also exposes `int(maxExclusive)` and `pick(array)` helpers.
 *
 * @param {number} seed
 */
export function rng(seed) {
  let a = seed >>> 0;

  /** @returns {number} float in [0, 1) */
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @param {number} max @returns {number} integer in [0, max) */
  next.int = (max) => Math.floor(next() * max);
  /** @template T @param {readonly T[]} array @returns {T} */
  next.pick = (array) => array[Math.floor(next() * array.length)];

  return next;
}

/**
 * In-place Fisher-Yates shuffle driven by a seeded `rng`.
 *
 * @template T
 * @param {T[]} array
 * @param {() => number} rand
 * @returns {T[]}
 */
export function shuffle(array, rand) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = array[i];
    array[i] = array[j];
    array[j] = t;
  }
  return array;
}
