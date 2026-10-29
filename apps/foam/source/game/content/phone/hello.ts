import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {type Choice, defineScript} from '../../core/script.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
const HELLO_ODDS = {code: 0.4, guide: 0.4, tram: 0.2};
const REPLIES: Array<Choice<'who'>> = [
  {text: 'Hi'},
  {text: 'Who is this?', next: 'who'},
  {text: 'Mute'},
];

export const hello: Message = {
  key: 'hello',
  from: SENDER,
  arrives: () => true,
  script: defineScript({
    start: (night) => night.pick('hello', HELLO_ODDS),
    nodes: {
      code: {
        speaker: SENDER,
        text: (night) => standIn`
          Hi. I wrote tonight in a few lines of code, so if anything goes wrong, blame me.${
            night.collection.titles.length > 0 ? ' Back for another night? Good.' : ''
          }
        `,
        choices: REPLIES,
      },
      guide: {
        speaker: SENDER,
        text: (night) => standIn`
          Hi. Three things tonight: the keys from your friend, a bottle for the birthday and the
          train home in the morning.${
            night.collection.titles.length > 0 ? ' You know the drill by now.' : ''
          }
        `,
        choices: REPLIES,
      },
      tram: {
        speaker: SENDER,
        text: (night) => standIn`
          Can't talk, I'm on the 4. Have a good one.${
            night.collection.titles.length > 0 ? ' Glad you came back.' : ''
          }
        `,
        choices: REPLIES,
      },
      who: {
        speaker: SENDER,
        text: (night) => {
          let version = night.pick('hello', HELLO_ODDS);

          return (
            version === 'code' ?
              standIn`Jakub. I made the night you are in, every street and every beer of it.`
            : version === 'guide' ?
              standIn`Jakub. Think of me as the friend who reads the timetable for you.`
            : standIn`Jakub. Still on the 4. I'll explain later.`
          );
        },
      },
    },
  }),
};
