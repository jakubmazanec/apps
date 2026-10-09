import {afterEach, beforeEach, describe, expect, type MockInstance, test, vitest} from 'vitest';

import {places} from '../source/game/content/places.js';
import {getJumpIn} from '../source/game/core/getJumpIn.js';

describe(getJumpIn, () => {
  let warn: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  test('reads the place, the hour, the money and the drunkenness', () => {
    expect(getJumpIn('?place=rotorBar&time=23:10&money=120&drunkenness=2.5', places)).toEqual({
      place: 'rotorBar',
      minutes: 1390,
      money: 120,
      drunkenness: 2.5,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test('reads the drunkenness without a decimal part', () => {
    expect(getJumpIn('?place=rotorBar&drunkenness=2', places)?.drunkenness).toBe(2);
  });

  test('counts a time before noon as after midnight, and keeps noon', () => {
    expect(getJumpIn('?place=rotorBar&time=01:30', places)?.minutes).toBe(1530);
    expect(getJumpIn('?place=rotorBar&time=00:00', places)?.minutes).toBe(1440);
    expect(getJumpIn('?place=rotorBar&time=12:00', places)?.minutes).toBe(720);
  });

  test('takes a negative sum of money', () => {
    expect(getJumpIn('?place=rotorBar&money=-40', places)?.money).toBe(-40);
  });

  test('gives null for an unknown place, with a warning', () => {
    expect(getJumpIn('?place=nowhere&time=23:10', places)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nowhere"'));
  });

  test('gives null without a place, and says nothing', () => {
    expect(getJumpIn('?time=23:10&money=5', places)).toBeNull();
    expect(getJumpIn('', places)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test.each(['7:30', '24:00', '12:60'])('drops the time %s with a warning', (time) => {
    let jumpIn = getJumpIn(`?place=rotorBar&time=${time}&money=5`, places);

    expect(jumpIn).toEqual({place: 'rotorBar', money: 5});
    expect(jumpIn).not.toHaveProperty('minutes');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test.each(['1e3', '12.5', 'abc'])('drops the money %s with a warning', (money) => {
    let jumpIn = getJumpIn(`?place=rotorBar&time=23:10&money=${money}`, places);

    expect(jumpIn).toEqual({place: 'rotorBar', minutes: 1390});
    expect(jumpIn).not.toHaveProperty('money');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test.each(['-1', '2,5', '.5', 'abc'])('drops the drunkenness %s with a warning', (value) => {
    let jumpIn = getJumpIn(`?place=rotorBar&drunkenness=${value}`, places);

    expect(jumpIn).toEqual({place: 'rotorBar'});
    expect(jumpIn).not.toHaveProperty('drunkenness');
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
