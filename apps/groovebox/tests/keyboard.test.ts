import {describe, expect, test} from 'vitest';

import {keyToInput} from '../source/shell/keyboard.js';
import {type ButtonName} from '../source/shell/protocol.js';

function key(
  code: string,
  type = 'keydown',
  extra: {repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean} = {},
) {
  return {code, type, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...extra};
}

describe(keyToInput, () => {
  test('the pads follow piano order', () => {
    let codes = [
      'KeyZ',
      'KeyS',
      'KeyX',
      'KeyD',
      'KeyC',
      'KeyV',
      'KeyG',
      'KeyB',
      'KeyH',
      'KeyN',
      'KeyJ',
      'KeyM',
    ];

    expect(codes.map((code) => keyToInput(key(code)))).toStrictEqual(
      Array.from({length: 12}, (_, pad) => ({kind: 'pad-hit', pad, velocity: 127})),
    );
    expect(codes.map((code) => keyToInput(key(code, 'keyup')))).toStrictEqual(
      Array.from({length: 12}, (_, pad) => ({kind: 'pad-release', pad})),
    );
  });

  test.each<[string, ButtonName]>([
    ['Digit1', 'step-1'],
    ['Digit2', 'step-2'],
    ['Digit3', 'step-3'],
    ['Digit4', 'step-4'],
    ['Digit5', 'step-5'],
    ['Digit6', 'step-6'],
    ['Digit7', 'step-7'],
    ['Digit8', 'step-8'],
    ['KeyQ', 'step-9'],
    ['KeyW', 'step-10'],
    ['KeyE', 'step-11'],
    ['KeyR', 'step-12'],
    ['KeyT', 'step-13'],
    ['KeyY', 'step-14'],
    ['KeyU', 'step-15'],
    ['KeyI', 'step-16'],
    ['KeyO', 't1'],
    ['KeyP', 't2'],
    ['BracketLeft', 't3'],
    ['BracketRight', 't4'],
    ['Backslash', 'pads-keys'],
    ['KeyK', 'roll'],
    ['KeyL', 'menu'],
    ['Semicolon', 'page'],
    ['Quote', 'copy'],
    ['ShiftLeft', 'shift'],
    ['ShiftRight', 'shift'],
    ['Space', 'play'],
    ['Comma', 'rec'],
    ['Period', 'stop'],
    ['Slash', 'tempo'],
    ['Enter', 'ok'],
    ['Escape', 'cancel'],
    ['Minus', 'minus'],
    ['NumpadSubtract', 'minus'],
    ['Equal', 'plus'],
    ['NumpadAdd', 'plus'],
    ['ArrowUp', 'up'],
    ['ArrowDown', 'down'],
    ['ArrowLeft', 'left'],
    ['ArrowRight', 'right'],
  ])('%s presses and releases %s', (code, button) => {
    expect(keyToInput(key(code))).toStrictEqual({kind: 'press', button});
    expect(keyToInput(key(code, 'keyup'))).toStrictEqual({kind: 'release', button});
  });

  test('a free key, an unknown key or another event gives null', () => {
    for (let code of [
      'KeyA',
      'KeyF',
      'Digit9',
      'Digit0',
      'Backquote',
      'Tab',
      'F5',
      'Unidentified',
    ]) {
      expect(keyToInput(key(code))).toBeNull();
      expect(keyToInput(key(code, 'keyup'))).toBeNull();
    }

    expect(keyToInput(key('KeyZ', 'keypress'))).toBeNull();
  });

  test('a repeat gives null', () => {
    expect(keyToInput(key('KeyZ', 'keydown', {repeat: true}))).toBeNull();
    expect(keyToInput(key('KeyL', 'keydown', {repeat: true}))).toBeNull();
  });

  test('a key down with ctrl, alt or meta held gives null', () => {
    for (let modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(keyToInput(key('KeyZ', 'keydown', {[modifier]: true}))).toBeNull();
      expect(keyToInput(key('KeyL', 'keydown', {[modifier]: true}))).toBeNull();
    }
  });

  test('a key up lets go whatever modifiers are held', () => {
    for (let modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(keyToInput(key('KeyZ', 'keyup', {[modifier]: true}))).toStrictEqual({
        kind: 'pad-release',
        pad: 0,
      });
      expect(keyToInput(key('KeyL', 'keyup', {[modifier]: true}))).toStrictEqual({
        kind: 'release',
        button: 'menu',
      });
    }
  });
});
