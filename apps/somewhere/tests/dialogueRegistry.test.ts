import {describe, expect, test} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {dialogueRegistry, miraScript} from '../source/game/core/dialogueRegistry.js';

describe('dialogueRegistry', () => {
  test('exposes exactly the demo scripts', () => {
    expect(Object.keys(dialogueRegistry)).toEqual(['mira', 'sign', 'shopkeeper']);
  });

  test('the mira script greets by the metMira flag', () => {
    let {start} = miraScript;

    if (typeof start !== 'function') {
      throw new Error('the mira script start is not a function');
    }

    expect(start({metMira: false})).toBe('greeting');
    expect(start({metMira: true})).toBe('again');
  });

  test('the repeat conversation offers every greeting branch again', () => {
    let tourRevisit = new Dialogue({script: miraScript, context: {metMira: true}});

    tourRevisit.advance(); // reveal 'Back already?' fully

    expect(tourRevisit.phase).toBe('choosing');
    expect(tourRevisit.visibleChoices.map((choice) => choice.text)).toEqual([
      'Sure, show me around.',
      'Maybe later.',
    ]);

    tourRevisit.choose(0);

    expect(tourRevisit.pageText).toBe('This way.');

    let laterRevisit = new Dialogue({script: miraScript, context: {metMira: true}});

    laterRevisit.advance();
    laterRevisit.choose(1);

    expect(laterRevisit.pageText).toBe('Suit yourself.');
  });

  test('the shopkeeper script is a plain repeatable greeting', () => {
    expect(dialogueRegistry.shopkeeper.start).toMatchObject({speaker: 'Shopkeeper'});
  });
});
