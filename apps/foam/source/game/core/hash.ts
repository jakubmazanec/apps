/* eslint-disable no-bitwise -- a hash is 32-bit integer arithmetic; no other module needs it */

/**
 * A number from 0 up to 1 that depends on the seed and the keys alone. The same arguments give the
 * same number in every browser and in Node, today and after any change to the content: a key is a
 * contract, and a decision that changes gets a new key.
 */
export function hash(seed: number, ...keys: Array<number | string>): number {
  // cyrb53 (bryc, public domain), whose mixing and finish are kept so the numbers are the same
  // everywhere; only the stream of words differs:
  // https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  let mix = (word: number): void => {
    h1 = Math.imul(h1 ^ word, 2654435761);
    h2 = Math.imul(h2 ^ word, 1597334677);
  };
  // A whole number as its two 32-bit halves: a seed of 15 digits is wider than 32 bits.
  let mixNumber = (value: number): void => {
    mix(value >>> 0);
    mix(Math.floor(value / 2 ** 32) >>> 0);
  };

  mixNumber(seed);

  for (let key of keys) {
    if (typeof key === 'number') {
      mix(1);
      mixNumber(key);
    } else {
      mix(2);

      for (let index = 0; index < key.length; index++) {
        mix(key.codePointAt(index) ?? 0);
      }
    }

    // The boundary tag keeps ('roll', 7) and ('roll7') from reading as one stream.
    mix(0);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) / 2 ** 53;
}
