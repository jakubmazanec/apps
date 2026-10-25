import {describe, expect, test} from 'vitest';

import {hash} from '../source/game/core/hash.js';

describe(hash, () => {
  test('gives the pinned numbers, so a change to the mixing is seen', () => {
    expect(hash(1, 'roll', 7)).toBe(0.7821403872107414);
    expect(hash(1, 'roll7')).toBe(0.015864459726748326);
    expect(hash(1, 'roll', '7')).toBe(0.2522690349405118);
    expect(hash(1)).toBe(0.1083593640983247);
    expect(hash(1, '')).toBe(0.48166427865483596);
    expect(hash(0)).toBe(0.03333600335508935);
    expect(hash(7, 'money')).toBe(0.39803232322002846);
    expect(hash(20261025, 'money')).toBe(0.10634002642339069);
    expect(hash(7, 'roll', 0)).toBe(0.6536293425182508);
    expect(hash(7, 'roll', 1)).toBe(0.7100422694286578);
  });

  test('gives a number from 0 up to 1 over many seeds and keys', () => {
    for (let seed = 0; seed < 10000; seed++) {
      let plain = hash(seed, 'x');
      let rolled = hash(seed, 'roll', seed);

      expect(plain).toBeGreaterThanOrEqual(0);
      expect(plain).toBeLessThan(1);
      expect(rolled).toBeGreaterThanOrEqual(0);
      expect(rolled).toBeLessThan(1);
    }
  });

  test('differs between two seeds', () => {
    expect(hash(1, 'money')).not.toBe(hash(2, 'money'));
  });

  test("tells ('roll', 7), ('roll7') and ('roll', '7') apart", () => {
    expect(new Set([hash(1, 'roll', '7'), hash(1, 'roll', 7), hash(1, 'roll7')]).size).toBe(3);
  });

  test('tells no key from one empty key', () => {
    expect(hash(1)).not.toBe(hash(1, ''));
  });

  test('takes a seed of fifteen digits', () => {
    expect(hash(999999999999999, 'money')).toBe(0.8632372305497801);
  });
});
