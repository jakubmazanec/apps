import {formatHourWords} from '../../core/hours.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {type Choice, defineScript} from '../../core/script.js';
import {AUTHOR, getSeat, SEATS} from '../author.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
const REPLIES: Array<Choice<'why'>> = [{text: 'Maybe'}, {text: 'Why?', next: 'why'}];

export const invitation: Message = {
  key: 'invitation',
  from: AUTHOR,
  arrives: (night) => night.minutes >= 990,
  script: defineScript({
    start: getSeat,
    nodes: {
      shop: {
        speaker: AUTHOR,
        text: standIn`
          I'm at The Whisky Shop in Husovice from ${formatHourWords(SEATS.shop.hours[0])} to
          ${formatHourWords(SEATS.shop.hours[1])}, by the regulars. No obligation.
        `,
        choices: REPLIES,
      },
      rotor: {
        speaker: AUTHOR,
        text: standIn`
          I'm at Rotor's bar from ${formatHourWords(SEATS.rotor.hours[0])} to
          ${formatHourWords(SEATS.rotor.hours[1])}. No obligation.
        `,
        choices: REPLIES,
      },
      hall: {
        speaker: AUTHOR,
        text: standIn`
          I'm at the main station from ${formatHourWords(SEATS.hall.hours[0])}, on the bench under
          the board. No obligation.
        `,
        choices: REPLIES,
      },
      why: {
        speaker: AUTHOR,
        text: standIn`To see if it works. The game, not Brno.`,
      },
    },
  }),
};
