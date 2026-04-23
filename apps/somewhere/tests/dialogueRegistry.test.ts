import {describe, expect, test} from 'vitest';

import {dialogueRegistry, miraScript} from '../source/game/dialogueRegistry.js';

describe('dialogueRegistry', () => {
  test('exposes exactly the demo scripts', () => {
    expect(Object.keys(dialogueRegistry)).toEqual(['mira', 'sign']);
  });

  test('the mira script greets by the metMira flag', () => {
    let {start} = miraScript;

    if (typeof start !== 'function') {
      throw new Error('the mira script start is not a function');
    }

    expect(start({metMira: false})).toBe('greeting');
    expect(start({metMira: true})).toBe('again');
  });
});
