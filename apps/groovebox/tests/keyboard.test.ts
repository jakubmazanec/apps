import {describe, expect, test} from 'vitest';

import {keyToInput} from '../source/shell/keyboard.js';

describe(keyToInput, () => {
  test('KeyZ down hits pad 0 at full velocity', () => {
    expect(keyToInput({code: 'KeyZ', repeat: false, type: 'keydown'})).toEqual({
      kind: 'pad-hit',
      pad: 0,
      velocity: 127,
    });
  });

  test('KeyZ up releases pad 0', () => {
    expect(keyToInput({code: 'KeyZ', repeat: false, type: 'keyup'})).toEqual({
      kind: 'pad-release',
      pad: 0,
    });
  });

  test('a repeat is ignored', () => {
    expect(keyToInput({code: 'KeyZ', repeat: true, type: 'keydown'})).toBeNull();
  });

  test('any other key is ignored', () => {
    expect(keyToInput({code: 'KeyX', repeat: false, type: 'keydown'})).toBeNull();
  });
});
