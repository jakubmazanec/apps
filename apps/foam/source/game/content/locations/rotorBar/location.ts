import {type Location} from '../../../core/location.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {rotorBarRoom} from './room.js';
import {rotorBarStreet} from './street.js';

// The text of this location is stand-in text, with the limits of its places' text: the author
// replaces standIn by prose when writing the real text.
const closing = defineScript({
  start: {
    speaker: 'Closing time',
    text: standIn`
      The lights come up and the bartender starts putting chairs on the tables. Nobody argues,
      and somebody holds the door for you.
    `,
  },
});

export const rotorBar: Location = {
  id: 'rotorBar',
  name: 'Rotor Bar',
  places: [rotorBarRoom, rotorBarStreet],
  arrival: 'rotorBarRoom',
  outside: 'rotorBarStreet',
  closing,
};
