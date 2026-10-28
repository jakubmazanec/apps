import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const broke: Message = {
  key: 'broke',
  from: SENDER,
  // From 20:00, under 50 Kč, with neither the keys nor the ticket.
  arrives: (night) =>
    night.minutes >= 1200 && night.money < 50 && !night.quest.hasKeys && !night.quest.hasTicket,
  script: defineScript({
    start: (night) => night.pick('brokeHelp', {pays: 0.8, dry: 0.2}),
    nodes: {
      pays: {
        speaker: SENDER,
        text: standIn`Running on empty? I can get a hundred to you, but it takes half an hour.`,
        choices: [
          {
            text: 'Please',
            minutes: 30,
            onChoose: (night) => {
              night.money += 100;
            },
            next: 'sent',
          },
          {text: "I'm fine"},
        ],
      },
      sent: {
        speaker: SENDER,
        text: standIn`Sent. Don't spend it all on beer.`,
      },
      dry: {
        speaker: SENDER,
        text: standIn`I'd help, but I'm skint too.`,
        choices: [{text: 'Figures'}],
      },
    },
  }),
};
