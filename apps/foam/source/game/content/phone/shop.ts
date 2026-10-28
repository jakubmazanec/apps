import {meet} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const shop: Message = {
  key: 'shop',
  from: SENDER,
  // From 20:30, while no bottle is in the bag or given.
  arrives: (night) => night.minutes >= 1230 && !night.quest.hasBottle && !night.quest.bottleGiven,
  script: defineScript({
    start: {
      speaker: SENDER,
      text: standIn`Still no bottle? The whisky shop in Husovice is twenty minutes away. Go.`,
      choices: [
        {text: 'Going'},
        {
          text: 'Skipping it',
          onChoose: (night) => {
            meet(night, 'skippedBottle');
          },
        },
      ],
    },
  }),
};
