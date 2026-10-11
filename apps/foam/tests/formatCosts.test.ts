import {describe, expect, test} from 'vitest';

import {formatCosts} from '../source/game/core/formatCosts.js';

describe(formatCosts, () => {
  test('gives each number alone', () => {
    expect(formatCosts({minutes: 10})).toBe('10 min');
    expect(formatCosts({price: 45})).toBe('45 Kč');
    expect(formatCosts({odds: 0.6})).toBe('60%');
  });

  test('gives the numbers together, in the order minutes, price, odds', () => {
    expect(formatCosts({minutes: 15, price: 90, odds: 0.4})).toBe('15 min  90 Kč  40%');
    expect(formatCosts({minutes: 11, price: 170})).toBe('11 min  170 Kč');
  });

  test('leaves a price of 0 out, and gives nothing for no numbers', () => {
    expect(formatCosts({minutes: 35, price: 0})).toBe('35 min');
    expect(formatCosts({})).toBe('');
  });

  test('rounds the odds to a whole percentage', () => {
    expect(formatCosts({odds: 0.666})).toBe('67%');
    expect(formatCosts({odds: 0.333})).toBe('33%');
  });
});
