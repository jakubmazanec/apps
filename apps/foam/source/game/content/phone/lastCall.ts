import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {TICKET_PRICE} from '../quest.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
export const lastCall: Message = {
  key: 'lastCall',
  from: SENDER,
  // From 07:00, with neither the keys nor the ticket, away from the station.
  arrives: (night) =>
    night.minutes >= 1860 &&
    !night.quest.hasKeys &&
    !night.quest.hasTicket &&
    night.place !== 'hlavniNadraziHall' &&
    night.place !== 'hlavniNadraziForecourt',
  script: defineScript({
    start: (night) => (night.money >= TICKET_PRICE ? 'go' : 'stranded'),
    nodes: {
      go: {
        speaker: SENDER,
        text: standIn`
          The morning train is the 08:04, and the ticket machine is twenty minutes from anywhere.
          Go now.
        `,
        choices: [{text: 'Going'}, {text: 'Let it leave'}],
      },
      stranded: {
        speaker: SENDER,
        text: standIn`
          I was stranded here one Saturday in 2014, with no ticket and no money. It gets better
          after the first coffee.
        `,
        choices: [{text: 'Thanks'}],
      },
    },
  }),
};
