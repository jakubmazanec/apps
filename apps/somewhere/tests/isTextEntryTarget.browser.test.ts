import {describe, expect, test} from 'vitest';

import {isTextEntryTarget} from '../source/engine/ui/isTextEntryTarget.js';

describe(isTextEntryTarget, () => {
  test('is true for a keyboard event targeting a DOM input element', () => {
    let input = document.createElement('input');

    document.body.append(input);

    let event = new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true});

    input.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBe(true);

    input.remove();
  });

  test.each([
    {name: 'textarea', create: () => document.createElement('textarea')},
    {name: 'select', create: () => document.createElement('select')},
    {
      name: 'contenteditable',
      create: () => {
        let element = document.createElement('div');

        element.contentEditable = 'true';

        return element;
      },
    },
  ])('is true for a keyboard event targeting a $name', ({create}) => {
    // GameInput consumes every key it does not stand down from, so a widget whose
    // keys belong to the DOM has to be recognised here or they are eaten.
    let element = create();

    document.body.append(element);

    let event = new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true});

    element.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBe(true);

    element.remove();
  });

  test('is false for a keyboard event targeting anything else', () => {
    let event = new KeyboardEvent('keydown', {code: 'KeyW'});

    globalThis.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBe(false);
  });
});
