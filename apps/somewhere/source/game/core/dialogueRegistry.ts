import {defineDialogueScript, type DialogueChoice} from '../../engine/dialogue/DialogueScript.js';
import {type Flags} from './flags.js';

// One shared menu keeps the first and every repeat conversation offering the
// same branches, so no branch ever becomes unreachable.
const miraChoices: Array<DialogueChoice<Flags, 'later' | 'tour'>> = [
  {text: 'Sure, show me around.', next: 'tour'},
  {text: 'Maybe later.', next: 'later'},
];

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
      choices: miraChoices,
    },
    tour: {
      speaker: 'Mira',
      portrait: 'mira',
      text: ['This way.', 'Mind the well.'],
      next: 'goodbye',
    },
    again: {speaker: 'Mira', portrait: 'mira', text: 'Back already?', choices: miraChoices},
    later: {speaker: 'Mira', portrait: 'mira', text: 'Suit yourself.'},
    goodbye: {
      speaker: 'Mira',
      portrait: 'mira',
      text: 'Bye.',
      onEnter: (flags) => {
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

// The shop's resident. No flags and no choices: a plain repeatable greeting —
// commerce is out of scope, the shop exists to drive the travel system.
export const shopkeeperScript = defineDialogueScript<Flags>()({
  start: {
    speaker: 'Shopkeeper',
    text: ['Welcome in.', 'Shelves are still filling up — have a look around.'],
  },
});

// Tiled `dialogue` properties resolve against these keys at spawn (the keys
// are static, so there is no forward-reference problem).
export const dialogueRegistry = {mira: miraScript, sign: signScript, shopkeeper: shopkeeperScript};

export type DialogueRegistryName = keyof typeof dialogueRegistry;
