import {afterEach, beforeEach, describe, expect, type MockInstance, test, vitest} from 'vitest';

import {places} from '../source/game/content/locations.js';
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
    expect(getJumpIn('?place=rotorBarRoom&time=23:10&money=120&drunkenness=2.5', places)).toEqual({
      place: 'rotorBarRoom',
      minutes: 1390,
      money: 120,
      drunkenness: 2.5,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test('reads the drunkenness without a decimal part', () => {
    expect(getJumpIn('?place=rotorBarRoom&drunkenness=2', places)?.drunkenness).toBe(2);
  });

  test('counts a time before noon as after midnight, and keeps noon', () => {
    expect(getJumpIn('?place=rotorBarRoom&time=01:30', places)?.minutes).toBe(1530);
    expect(getJumpIn('?place=rotorBarRoom&time=00:00', places)?.minutes).toBe(1440);
    expect(getJumpIn('?place=rotorBarRoom&time=12:00', places)?.minutes).toBe(720);
  });

  test('takes a negative sum of money', () => {
    expect(getJumpIn('?place=rotorBarRoom&money=-40', places)?.money).toBe(-40);
  });

  test('gives null for an unknown place, with a warning', () => {
    expect(getJumpIn('?place=nowhere&time=23:10', places)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nowhere"'));
  });

  test('gives null for the id of a location, which is not a place', () => {
    expect(getJumpIn('?place=rotorBar', places)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"rotorBar"'));
  });

  test('gives null without a place, and says nothing', () => {
    expect(getJumpIn('?time=23:10&money=5', places)).toBeNull();
    expect(getJumpIn('', places)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test.each(['7:30', '24:00', '12:60'])('drops the time %s with a warning', (time) => {
    let jumpIn = getJumpIn(`?place=rotorBarRoom&time=${time}&money=5`, places);

    expect(jumpIn).toEqual({place: 'rotorBarRoom', money: 5});
    expect(jumpIn).not.toHaveProperty('minutes');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test.each(['1e3', '12.5', 'abc'])('drops the money %s with a warning', (money) => {
    let jumpIn = getJumpIn(`?place=rotorBarRoom&time=23:10&money=${money}`, places);

    expect(jumpIn).toEqual({place: 'rotorBarRoom', minutes: 1390});
    expect(jumpIn).not.toHaveProperty('money');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test.each(['-1', '2,5', '.5', 'abc'])('drops the drunkenness %s with a warning', (value) => {
    let jumpIn = getJumpIn(`?place=rotorBarRoom&drunkenness=${value}`, places);

    expect(jumpIn).toEqual({place: 'rotorBarRoom'});
    expect(jumpIn).not.toHaveProperty('drunkenness');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('reads the seed, leading zeros and all', () => {
    expect(getJumpIn('?place=rotorBarRoom&seed=7', places)).toEqual({
      place: 'rotorBarRoom',
      seed: 7,
    });
    expect(getJumpIn('?place=rotorBarRoom&seed=20261025', places)?.seed).toBe(20_261_025);
    expect(getJumpIn('?place=rotorBarRoom&seed=007', places)?.seed).toBe(7);
    expect(getJumpIn('?place=rotorBarRoom&seed=999999999999999', places)?.seed).toBe(
      999_999_999_999_999,
    );
    expect(getJumpIn('?place=rotorBarRoom&seed=0', places)?.seed).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  test.each(['', 'abc', '-1', '1234567890123456'])('drops the seed %s with a warning', (seed) => {
    let jumpIn = getJumpIn(`?place=rotorBarRoom&seed=${seed}`, places);

    expect(jumpIn).toEqual({place: 'rotorBarRoom'});
    expect(jumpIn).not.toHaveProperty('seed');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`"${seed}"`));
  });

  test('stories=none asks to forget the collection', () => {
    expect(getJumpIn('?place=rotorBarRoom&stories=none', places)).toEqual({
      place: 'rotorBarRoom',
      forgetStories: true,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test('drops another stories value with a warning', () => {
    expect(getJumpIn('?place=rotorBarRoom&stories=all', places)).toEqual({place: 'rotorBarRoom'});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"all"'));
  });

  test("reads the quest's flags in any order", () => {
    expect(getJumpIn('?place=rotorBarRoom&quest=keys,ticket', places)).toEqual({
      place: 'rotorBarRoom',
      quest: {hasKeys: true, hasTicket: true},
    });
    expect(getJumpIn('?place=rotorBarRoom&quest=ticket,keys', places)).toEqual({
      place: 'rotorBarRoom',
      quest: {hasKeys: true, hasTicket: true},
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test('reads every flag', () => {
    expect(getJumpIn('?place=rotorBarRoom&quest=bottle,given', places)?.quest).toEqual({
      hasBottle: true,
      bottleGiven: true,
    });
  });

  test('drops an unknown flag with a warning and keeps the others', () => {
    expect(getJumpIn('?place=rotorBarRoom&quest=keys,flat', places)).toEqual({
      place: 'rotorBarRoom',
      quest: {hasKeys: true},
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"flat"'));
  });

  test('leaves quest off the result when no flag is known', () => {
    expect(getJumpIn('?place=rotorBarRoom&quest=flat', places)).toEqual({place: 'rotorBarRoom'});
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('ignores stories without a place', () => {
    expect(getJumpIn('?stories=none', places)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
