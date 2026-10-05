import {defineDialogueScript, type RunnableDialogueScript} from 'tellurion';

import {type Night} from '../core/night.js';

export type Spot = {
  /** Label of the scene button. */
  label: string;

  /** Centre of the button, as fractions of the scene area's width and height. */
  x: number;
  y: number;

  script: RunnableDialogueScript<Night>;
};

export type Place = {
  /** Label of the place button. */
  name: string;

  description: RunnableDialogueScript<Night>;
  spots: Spot[];
};

// Temporary text for an invented place. Its limits: no word is longer than 16
// characters (every word must fit a line on the narrowest screen), nobody and
// nothing has a real name, every node sets `speaker`, and every `text` is one
// string without line ends, which the story window cuts into pages. A `*` in a
// `text` switches italic on or off, so the marks of a text come in pairs.
const PLACE_NAME = 'The bar';
const BARTENDER = 'The bartender';
const WOMEN = 'Two women talking';
const PATRON = 'A patron';
const DOOR = 'The door';
const description = defineDialogueScript<Night>()({
  start: {
    speaker: PLACE_NAME,
    text:
      'The bar is one long room under a low ceiling, with a counter along the left wall and ' +
      'six tables that do not match. A radio plays quietly behind the taps. The air smells of ' +
      'beer and wet coats. Most of the chairs are taken, yet nobody is in a hurry, and the ' +
      'door lets in a little cold each time it opens.',
  },
});
const bartender = defineDialogueScript<Night>()({
  start: 'counter',
  nodes: {
    counter: {
      speaker: BARTENDER,
      text:
        'She dries a glass and watches the room over its rim. When you step up to the counter ' +
        'she lifts her chin, which is as much of a question as you are going to get.',
      choices: [{text: 'Order a beer', next: 'beer'}, {text: 'Leave her alone'}],
    },
    beer: {
      speaker: BARTENDER,
      text:
        'She pulls a beer without a word and sets it in front of you. The foam is thick and ' +
        'the glass is cold, and for ten minutes nothing else needs doing.',
      onEnter: (night) => {
        night.money -= 45;
        night.minutes += 10;
      },
    },
  },
});
const women = defineDialogueScript<Night>()({
  start: {
    speaker: WOMEN,
    text:
      'They lean close over two small glasses and talk in low voices, quick and sure, the way ' +
      'people do who have known each other for years. One of them laughs. Neither looks your ' +
      'way.',
  },
});
const patron = defineDialogueScript<Night>()({
  start: 'table',
  nodes: {
    table: {
      speaker: PATRON,
      text:
        'An old man sits alone at the table by the radiator, both hands around a glass that is ' +
        'nearly empty. He nods at you as if the two of you had met before.',
      choices: [
        {text: 'Talk to him', next: 'talk'},
        {text: 'Ignore him', next: 'ignore'},
      ],
    },
    talk: {
      speaker: PATRON,
      text:
        'He says he has been coming here since the place opened, and that the beer was *better* ' +
        'then. He points a finger at the ceiling and waits to see if you will ask.',
      choices: [{text: 'Ask about the ceiling', next: 'ceiling'}, {text: 'Let him be'}],
    },
    ignore: {
      speaker: PATRON,
      text:
        'You look past him. He shrugs, turns back to his glass and says something to it that ' +
        'you do not catch.',
    },
    ceiling: {
      speaker: PATRON,
      text:
        'It was the winter the pipes froze, he says, and the landlord had been told about the ' +
        'crack for two years. Everyone knew about the crack. It ran from the lamp to the ' +
        'corner above the taps, and in summer it was thin as a hair, and in winter you could ' +
        'push a coin into it. People made bets on it. A plumber who drank here drew a line at ' +
        'each end in pencil, with the date, so that we could see how fast it grew. That night ' +
        'the room was full, because of the cold and because somebody had a name day. There ' +
        'was a man with an accordion. I was sitting where you are standing now. Around ten ' +
        'the lamp began to swing, though nobody had touched it, and a little dust came down ' +
        'into the glasses. The landlord looked up and said it was only the people upstairs ' +
        'moving their beds. *Nobody* upstairs had moved a bed in thirty years. Then it went, ' +
        'all at once and without much noise, like snow sliding off a roof. Plaster, laths, a ' +
        'hundred years of dust, and in the middle of it a tin box that somebody had hidden up ' +
        'there long ago. It landed on the counter and broke two glasses. Nobody was hurt. The ' +
        'man with the accordion did not even stop playing, he only moved his chair. We opened ' +
        'the box, of course. There were letters in it, and a watch that did not run, and a ' +
        'photograph of a girl standing in front of this very door. The landlord kept the ' +
        'watch. The letters went to a museum, or so he said. The girl we never found, though ' +
        'we asked around for years. They fixed the ceiling in spring, and the beer has not ' +
        'been the same since. You can believe that or not.',
    },
  },
});
const door = defineDialogueScript<Night>()({
  start: 'door',
  nodes: {
    door: {
      speaker: DOOR,
      text:
        'The door is heavy, with a brass handle worn pale. Through the glass you can see the ' +
        'street, wet and empty under the lamps.',
      choices: [{text: 'Step outside', next: 'outside'}, {text: 'Stay'}],
    },
    outside: {
      speaker: DOOR,
      text:
        'The cold wakes you at once. You stand a minute under the sign and breathe, then the ' +
        'noise behind the door pulls you back in.',
    },
  },
});

export const samplePlace: Place = {
  name: PLACE_NAME,
  description,
  spots: [
    {label: BARTENDER, x: 0.25, y: 0.2, script: bartender},
    {label: WOMEN, x: 0.75, y: 0.3, script: women},
    {label: PATRON, x: 0.15, y: 0.6, script: patron},
    {label: DOOR, x: 0.8, y: 0.85, script: door},
  ],
};
