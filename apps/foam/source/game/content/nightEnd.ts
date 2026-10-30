import {type Night} from '../core/night.js';
import {standIn} from '../core/prose.js';
import {defineScript} from '../core/script.js';

// The end text is stand-in text: the author replaces standIn by prose when writing the real text.
// Its limits: no word is longer than 16 characters, every node sets `speaker`, and the `*` marks
// of italic come in pairs. It opens over black once the night is over, after the window that
// crossed 08:00, and the night it reads stands at its final minute. The end reads the quest's four
// flags and the night's list of stories, never the place or the money. The three ending nodes write
// `ending` on the night, as the quest's flags are written by content, and the record reads it.

// What became of the bottle, from the flags alone.
function bottleLine(night: Night): string[] | string {
  if (night.quest.bottleGiven) {
    return standIn`The bottle went where you promised it would.`;
  }

  if (night.quest.hasBottle) {
    return standIn`The bottle rode along with you all night and is still unopened.`;
  }

  return standIn`You never bought a bottle, so none was ever missed.`;
}

// How many stories the night achieved: none, one, or the count.
function storiesLine(night: Night): string[] | string {
  if (night.stories.length === 0) {
    return standIn`The night left no story behind.`;
  }

  if (night.stories.length === 1) {
    return standIn`The night left one story behind.`;
  }

  return standIn`The night left ${night.stories.length} stories behind.`;
}

export const nightEnd = defineScript({
  start: ({quest}) =>
    quest.hasTicket && quest.hasKeys ? 'both'
    : quest.hasTicket ? 'leave'
    : quest.hasKeys ? 'stay'
    : 'stranded',
  nodes: {
    both: {
      speaker: 'Morning',
      text: standIn`
        The sky has gone grey, with a ticket in one pocket and the keys in the other.
        The 08:04 leaves soon, and the door is waiting too.
      `,
      choices: [
        {text: 'Take the train', next: 'leave'},
        {text: 'Stay', next: 'stay'},
      ],
    },
    leave: {
      speaker: 'Morning',
      onEnter: (night) => {
        night.ending = 'leave';
      },
      text: (night) => standIn`
        You stand on the platform in the grey light, waiting for the 08:04.
        ${bottleLine(night)} ${storiesLine(night)}
      `,
    },
    stay: {
      speaker: 'Morning',
      onEnter: (night) => {
        night.ending = 'stay';
      },
      text: (night) => standIn`
        You are at the flat, with the grey light on the wall and the keys in your hand.
        ${bottleLine(night)} ${storiesLine(night)}
      `,
    },
    stranded: {
      speaker: 'Morning',
      onEnter: (night) => {
        night.ending = 'stranded';
      },
      text: (night) => standIn`
        The sky has gone grey and you have neither a ticket nor a door to open.
        ${bottleLine(night)} ${storiesLine(night)}
      `,
    },
  },
});
