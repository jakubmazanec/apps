import {createWayOut} from '../../../core/createWayOut.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {isOpen} from '../../hours.js';
import {standInPicture} from '../../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Vranovská';
const WHISKY_SHOP = 'The Whisky Shop';
const WINDOW = 'The window';
const STREET = 'The street';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      Vranovská is a long street of old houses in Husovice, with the tram line down the middle
      and a few shop windows still lit. The wind comes straight along it from the river.
    `,
  },
});
// Before the opening, 16:30 in locations.json, the door can be waited at; after the closing it
// stays locked for the night.
const door = defineScript({
  start: (night) =>
    isOpen(night, 'whiskyShop') ? 'open'
    : night.minutes < 990 ? 'early'
    : 'locked',
  nodes: {
    open: {
      speaker: WHISKY_SHOP,
      text: standIn`
        Warm light and the smell of oak come through the door whenever somebody opens it.
      `,
      choices: [
        {
          text: 'Go in',
          onChoose: (night) => {
            night.place = 'whiskyShopRoom';
          },
        },
        {text: 'Stay outside'},
      ],
    },
    early: {
      speaker: WHISKY_SHOP,
      text: standIn`
        The door is locked, and a card on the glass gives the hours: half past four until nine.
        Somebody is wiping the counter inside.
      `,
      choices: [
        {
          text: 'Wait a while',
          minutes: 10,
          next: (night) => (isOpen(night, 'whiskyShop') ? 'open' : 'early'),
        },
        {text: 'Leave it'},
      ],
    },
    locked: {
      speaker: WHISKY_SHOP,
      text: standIn`
        The door is locked, and the shelves stand dark behind the glass. The card gives the hours:
        half past four until nine.
      `,
    },
  },
});
const shopWindow = defineScript({
  start: {
    speaker: WINDOW,
    text: standIn`
      Bottles stand lit in the shop window, each turned so that its label faces the street. One of
      them costs more than your whole night.
    `,
  },
});
const street = createWayOut({
  speaker: STREET,
  text: standIn`
    The street runs on under the tram wires, and the lit windows thin out towards the river.
  `,
  ways: ['walk', 'taxi'],
});

export const whiskyShopStreet: Place = {
  id: 'whiskyShopStreet',
  name: PLACE_NAME,
  outdoors: true,
  description,
  picture: standInPicture,
  spots: [
    {label: WHISKY_SHOP, x: 0.3, y: 0.3, script: door},
    {label: WINDOW, x: 0.7, y: 0.55, script: shopWindow},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
