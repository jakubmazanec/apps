import {findStory, hasStory} from '../../../core/night.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {AUTHOR, AUTHOR_STORY, isAuthorIn} from '../../author.js';
import {barPicture} from '../../pictures/barPicture.js';
import {BOTTLE_PRICE} from '../../quest.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs, and the
// author's avatar Jakub is the one exception), every node sets `speaker`, a description is two or
// three sentences, a scene button one node of one or two, and the `*` marks of italic come in
// pairs. A story's title is stand-in text too, written with standIn.
const PLACE_NAME = 'The Whisky Shop Brno';
const SHORT_NAME = 'Whisky Shop';
const TITLE = 'The Whisky Shop';
const SHELVES = 'The shelves';
const SHOPKEEPER = 'The shopkeeper';
const REGULARS = 'Two regulars';
const DOOR = 'The door';
const GOOD_ONE_STORY = standIn`The good one`;
const BOTTLE_STORY = standIn`A bottle saved for an occasion`;
const description = defineScript({
  start: {
    speaker: TITLE,
    text: standIn`
      The shop is small and warm, and every wall is covered with bottles. It smells of oak and
      smoke, and somebody has left a chair by the counter for whoever stays.
    `,
  },
});
const shelves = defineScript({
  start: 'shelves',
  nodes: {
    shelves: {
      speaker: SHELVES,
      text: standIn`
        Sixty bottles stand open for tasting, each with a small card in a careful hand.
      `,
      choices: [
        {
          text: 'Buy the bottle for the birthday',
          price: BOTTLE_PRICE,
          isVisible: (night) => !night.quest.hasBottle,
          onChoose: (night) => {
            night.quest.hasBottle = true;
          },
          next: 'wrapped',
        },
        {text: 'Pour a dram', price: 90, minutes: 15, drinks: 1, next: 'dram'},
        {text: 'Pour the good one', price: 180, minutes: 15, drinks: 1, next: 'goodOne'},
        {text: 'Not now'},
      ],
    },
    wrapped: {
      speaker: SHELVES,
      text: standIn`
        The shopkeeper wraps the bottle in brown paper and ties it with string. It goes into
        the bag, heavy and quiet, and waits for the evening.
      `,
    },
    dram: {
      speaker: SHELVES,
      text: standIn`The dram is dark and slow, and it tastes of smoke, then of something sweet.`,
    },
    goodOne: {
      speaker: SHELVES,
      text: standIn`
        The good one is older than some of the regulars, and it takes its time on the tongue.
        The shopkeeper watches your face and says nothing.
      `,
      onEnter: (night) => {
        findStory(night, GOOD_ONE_STORY);
      },
    },
  },
});
const shopkeeper = defineScript({
  start: 'shopkeeper',
  nodes: {
    shopkeeper: {
      speaker: SHOPKEEPER,
      text: standIn`
        He asks whether you like smoke or sweet, and waits as if the answer mattered to him.
      `,
      choices: [{text: 'Ask after your friend', next: 'friend'}, {text: 'Say nothing'}],
    },
    friend: {
      speaker: SHOPKEEPER,
      text: (night) =>
        night.quest.hasKeys ?
          standIn`He shrugs. Your friend is wherever they are tonight, and you have the keys.`
        : standIn`
            Your friend bought a bottle this afternoon, he says, and said something about
            Dvořákova.
          `,
    },
  },
});
const regulars = defineScript({
  start: 'regulars',
  nodes: {
    regulars: {
      speaker: REGULARS,
      text: standIn`
        Two men lean on the counter. One of them is saving a bottle for an occasion that never
        comes, and the other has stopped asking which.
      `,
      choices: [
        {
          text: 'Ask about the bottle',
          minutes: 5,
          drunkenness: {max: 1},
          isVisible: (night) => !hasStory(night, BOTTLE_STORY),
          next: 'bottle',
        },
        {text: 'Let them be'},
      ],
    },
    bottle: {
      speaker: REGULARS,
      text: standIn`
        The one with the bottle says where it came from, and the other says how long it has
        been waiting. Neither of them says what the occasion is.
      `,
      onEnter: (night) => {
        findStory(night, BOTTLE_STORY);
      },
    },
  },
});
const door = defineScript({
  start: {
    speaker: DOOR,
    text: standIn`The door opens onto Vranovská, and the cold comes in with the sound of a tram.`,
    choices: [
      {
        text: 'Go out',
        onChoose: (night) => {
          night.place = 'whiskyShopStreet';
        },
      },
    ],
  },
});
const jakub = defineScript({
  start: 'notebook',
  nodes: {
    notebook: {
      speaker: AUTHOR,
      text: standIn`
        A man with a notebook sits at the end of the counter. He says your name as if he had
        written it down, and pushes a glass across.
      `,
      choices: [
        {text: 'Take the dram', minutes: 15, drinks: 1, next: 'dram'},
        {text: 'Ask which bits are real', next: 'real'},
        {text: 'Leave him to it'},
      ],
      onEnter: (night) => {
        findStory(night, AUTHOR_STORY);
      },
    },
    dram: {
      speaker: AUTHOR,
      text: standIn`
        He drinks with you and names the regulars who are real, tapping the notebook at each.
        The others he has borrowed from other shops.
      `,
    },
    real: {
      speaker: AUTHOR,
      text: standIn`
        The shop, he says, and the smoke, and the chair by the counter. The shelves he tidied
        up a little for the page.
      `,
    },
  },
});

export const whiskyShopRoom: Place = {
  id: 'whiskyShopRoom',
  name: PLACE_NAME,
  shortName: SHORT_NAME,
  outdoors: false,
  description,
  picture: barPicture,
  spots: [
    {label: SHELVES, x: 0.22, y: 0.51, script: shelves},
    {label: SHOPKEEPER, x: 0.14, y: 0.93, script: shopkeeper},
    {label: REGULARS, x: 0.7, y: 0.84, script: regulars},
    {label: DOOR, x: 0.91, y: 0.4, script: door},
    {
      label: AUTHOR,
      x: 0.5,
      y: 0.65,
      script: jakub,
      isVisible: (night) => isAuthorIn(night, 'whiskyShopRoom'),
    },
  ],
};
