import {defineDialogueScript} from '../engine/dialogue/DialogueScript.js';
import {type Flags} from './flags.js';

// Authored dialogue content. Naming guideline: ids for nodes referenced more
// than once, looped to or asserted on in tests; inline nodes for dead-end
// tails and one-off responses.
export const miraScript = defineDialogueScript<Flags>()({
  start: (flags) => (flags.metMira ? 'again' : 'greeting'),
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
      onEnter: (flags) => {
        // eslint-disable-next-line no-param-reassign -- needed
        flags.metMira = true;
      },
    },
  },
});

// Inline-only: no speaker, no portrait; proves the collapsed layout and the
// auto-start entry point.
export const signScript = defineDialogueScript<Flags>()({
  start: {text: 'KEEP OUT.'},
});

// Tiled `dialogue` properties resolve against these keys at spawn (the keys
// are static, so there is no forward-reference problem).
export const dialogueRegistry = {mira: miraScript, sign: signScript};

export type DialogueRegistryName = keyof typeof dialogueRegistry;
