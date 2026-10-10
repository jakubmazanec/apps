import {type Location} from '../../../core/location.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {whiskyShopRoom} from './room.js';
import {whiskyShopStreet} from './street.js';

// The text of this location is stand-in text, with the limits of its places' text: the author
// replaces standIn by prose when writing the real text.
const closing = defineScript({
  start: {
    speaker: 'Closing time',
    text: standIn`
      The shopkeeper counts the till and looks at you over his glasses until you understand. He
      holds the door, and the lock turns behind you.
    `,
  },
});

export const whiskyShop: Location = {
  id: 'whiskyShop',
  name: 'The Whisky Shop Brno',
  places: [whiskyShopRoom, whiskyShopStreet],
  arrival: 'whiskyShopRoom',
  outside: 'whiskyShopStreet',
  closing,
};
