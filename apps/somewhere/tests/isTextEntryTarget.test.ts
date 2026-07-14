import {describe, expect, test} from 'vitest';

import {isTextEntryTarget} from '../source/engine/ui/isTextEntryTarget.js';

describe('isTextEntryTarget', () => {
  test('is true for a keyboard event targeting a DOM input element', () => {
    let input = document.createElement('input');

    document.body.append(input);

    let event = new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true});

    input.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBeTruthy();

    input.remove();
  });

  test('is false for a keyboard event targeting anything else', () => {
    let event = new KeyboardEvent('keydown', {code: 'KeyW'});

    globalThis.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBeFalsy();
  });
});
