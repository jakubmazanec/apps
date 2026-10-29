import {findStory, hasMet} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {AUTHOR} from '../author.js';
import {getCornerTable} from '../locations/rotorBar/room.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
const FIFTY_STORY = standIn`The fifty on the guitar`;

export const betSettled: Message = {
  key: 'betSettled',
  from: AUTHOR,
  // From 22:05, once the bet is on.
  arrives: (night) => night.minutes >= 1325 && hasMet(night, 'bet'),
  script: defineScript({
    // The bet is on tonight: after 01:00 the guitarist has left, but he was there.
    start: (night) => (['guitarist', 'table'].includes(getCornerTable(night)) ? 'payUp' : 'win'),
    nodes: {
      payUp: {
        speaker: AUTHOR,
        text: standIn`A guitar in the corner, as I said. Pay up.`,
        choices: [
          {text: 'Here', price: 50, next: 'paid'},
          {text: 'Skint', next: 'skint'},
        ],
      },
      paid: {
        speaker: AUTHOR,
        text: standIn`Pleasure doing business.`,
      },
      skint: {
        speaker: AUTHOR,
        text: standIn`Then you owe me one. I'll remember.`,
      },
      win: {
        speaker: AUTHOR,
        text: standIn`No guitar, then. Fine, you win. The fifty is yours.`,
        onEnter: (night) => {
          night.money += 50;
          findStory(night, FIFTY_STORY);
        },
        choices: [{text: 'Cheers'}],
      },
    },
  }),
};
