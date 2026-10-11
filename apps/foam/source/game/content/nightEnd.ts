import {standIn} from '../core/prose.js';
import {defineScript} from '../core/script.js';

// The end text is stand-in text: the author replaces standIn by prose when writing the real text.
// Its limits: no word is longer than 16 characters, every node sets `speaker`, and the `*` marks
// of italic come in pairs. It opens over black once the night is over, after the window that
// crossed 08:00, and the night it reads stands at its final minute.
export const nightEnd = defineScript({
  start: {
    speaker: 'Morning',
    text: (night) => standIn`
      The sky has gone grey and the first trams of Saturday are full of people who slept.
      Whatever the night was, it is over, and you have ${night.money} Kč left in your pocket.
    `,
  },
});
