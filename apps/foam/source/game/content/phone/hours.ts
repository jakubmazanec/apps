import {formatHourWords} from '../../core/hours.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {AUTHOR} from '../author.js';
import {getFriendEvening} from '../quest.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const hours: Message = {
  key: 'hours',
  from: AUTHOR,
  // From 17:00, while the keys are still to get.
  arrives: (night) => {
    let hint = night.pick('hoursHint', {sent: 0.7, silent: 0.3});

    return night.minutes >= 1020 && !night.quest.hasKeys && hint === 'sent';
  },
  script: defineScript({
    start: 'seen',
    nodes: {
      seen: {
        speaker: AUTHOR,
        text: (night) => {
          let {early, late} = getFriendEvening(night);

          return standIn`
            Spoke to your friend. They're at Rotor from ${formatHourWords(early[0])} for a few
            hours, then back at ${formatHourWords(late[0])} till it closes.
          `;
        },
        choices: [{text: 'Thanks'}, {text: 'Which room?', next: 'room'}],
      },
      room: {
        speaker: AUTHOR,
        text: standIn`The back room, behind the bar. Nobody sits in the front if they can help it.`,
      },
    },
  }),
};
