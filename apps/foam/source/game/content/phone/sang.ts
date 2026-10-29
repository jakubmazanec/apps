import {hasMet} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {AUTHOR} from '../author.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const sang: Message = {
  key: 'sang',
  from: AUTHOR,
  // From 01:05, after the birthday, when the bottle was skipped and never given.
  arrives: (night) =>
    night.minutes >= 1505 && hasMet(night, 'skippedBottle') && !night.quest.bottleGiven,
  script: defineScript({
    start: {
      speaker: AUTHOR,
      text: standIn`They sang without you.`,
      choices: [{text: 'I know'}],
    },
  }),
};
