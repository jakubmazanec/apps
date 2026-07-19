import {describe, expect, test} from 'vitest';

import {defineDialogueScript} from '../source/engine/dialogue/DialogueScript.js';

type TestContext = {metMira: boolean};

describe('defineDialogueScript', () => {
  test('returns the script unchanged and keeps the node record typed', () => {
    let script = defineDialogueScript<TestContext>()({
      start: (context) => (context.metMira ? 'again' : 'greeting'),
      nodes: {
        greeting: {
          speaker: 'Mira',
          portrait: 'mira',
          text: 'Welcome to Somewhere.',
          choices: [
            {text: 'Sure, show me around.', next: 'tour'},
            {
              text: 'Maybe later.',
              next: {speaker: 'Mira', portrait: 'mira', text: 'Suit yourself.'},
            },
          ],
        },
        tour: {
          speaker: 'Mira',
          portrait: 'mira',
          text: ['This way.', 'Mind the well.'],
          next: 'goodbye',
        },
        again: {speaker: 'Mira', portrait: 'mira', text: 'Back already?', next: 'goodbye'},
        goodbye: {
          speaker: 'Mira',
          portrait: 'mira',
          text: 'Bye.',
          onEnter: (context) => {
            context.metMira = true;
          },
        },
      },
    });

    expect(script.nodes?.tour.next).toBe('goodbye');
    expect(typeof script.start).toBe('function');
  });

  test('inline-only scripts skip the node record', () => {
    let script = defineDialogueScript<TestContext>()({start: {text: 'KEEP OUT.'}});

    expect(script.nodes).toBeUndefined();
  });

  test('dangling references are compile errors, not runtime errors', () => {
    // The fixtures below exist for the @ts-expect-error assertions; the
    // function itself never validates at runtime.
    let dangling = defineDialogueScript<TestContext>()({
      start: 'greeting',
      nodes: {
        greeting: {
          text: 'hi',
          // @ts-expect-error -- a dangling `next` errors at the offending literal, not on the valid nodes
          next: 'missing',
        },
      },
    });

    let danglingStart = defineDialogueScript<TestContext>()({
      // @ts-expect-error -- a dangling `start` id errors here
      start: 'missing',
      nodes: {greeting: {text: 'hi'}},
    });

    expect(dangling.start).toBe('greeting');
    expect(danglingStart.nodes?.greeting.text).toBe('hi');
  });

  test('inline nodes recurse with the same id union', () => {
    let script = defineDialogueScript<TestContext>()({
      start: 'a',
      nodes: {
        a: {
          text: 'x',
          next: {
            text: 'inline',
            // @ts-expect-error -- string references inside inline nodes are checked too
            next: 'missing',
          },
        },
      },
    });

    expect(script.start).toBe('a');
  });
});
