import {describe, expect, test} from 'vitest';

import {Holders} from '../source/shell/holders.js';

describe(Holders, () => {
  test('two sources on one control press once and release once', () => {
    let holders = new Holders();

    expect(holders.press('pad-0', 'key:KeyZ')).toBe(true);
    expect(holders.press('pad-0', 'pointer:3')).toBe(false);
    expect(holders.release('pad-0', 'key:KeyZ')).toBe(false);
    expect(holders.release('pad-0', 'pointer:3')).toBe(true);
    expect(holders.press('pad-0', 'pointer:3')).toBe(true);
  });

  test('the first source can be the last to let go', () => {
    let holders = new Holders();

    holders.press('menu', 'key:KeyL');
    holders.press('menu', 'pointer:1');

    expect(holders.release('menu', 'pointer:1')).toBe(false);
    expect(holders.release('menu', 'key:KeyL')).toBe(true);
  });

  test('a second press by the same source changes nothing', () => {
    let holders = new Holders();

    expect(holders.press('menu', 'key:KeyL')).toBe(true);
    expect(holders.press('menu', 'key:KeyL')).toBe(false);
    expect(holders.release('menu', 'key:KeyL')).toBe(true);
    expect(holders.release('menu', 'key:KeyL')).toBe(false);
  });

  test('a release by a source that does not hold the control changes nothing', () => {
    let holders = new Holders();

    expect(holders.release('menu', 'key:KeyL')).toBe(false);

    holders.press('menu', 'key:KeyL');

    expect(holders.release('menu', 'pointer:1')).toBe(false);
    expect(holders.release('page', 'key:KeyL')).toBe(false);
    expect(holders.release('menu', 'key:KeyL')).toBe(true);
  });

  test('controls are held apart', () => {
    let holders = new Holders();

    expect(holders.press('pad-0', 'key:KeyZ')).toBe(true);
    expect(holders.press('pad-1', 'key:KeyZ')).toBe(true);
    expect(holders.release('pad-0', 'key:KeyZ')).toBe(true);
    expect(holders.release('pad-1', 'key:KeyZ')).toBe(true);
  });

  test('releaseAll returns every held control and lets go of them', () => {
    let holders = new Holders();

    holders.press('menu', 'key:KeyL');
    holders.press('pad-0', 'key:KeyZ');
    holders.press('pad-0', 'pointer:2');
    holders.press('step-8', 'pointer:5');
    holders.release('step-8', 'pointer:5');

    expect(holders.releaseAll()).toStrictEqual(['menu', 'pad-0']);
    expect(holders.releaseAll()).toStrictEqual([]);
    expect(holders.release('menu', 'key:KeyL')).toBe(false);
    expect(holders.release('pad-0', 'pointer:2')).toBe(false);
    expect(holders.press('menu', 'key:KeyL')).toBe(true);
  });
});
