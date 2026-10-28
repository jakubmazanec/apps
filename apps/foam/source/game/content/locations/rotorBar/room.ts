import {formatHourWords, isWithin, type Span} from '../../../core/hours.js';
import {findStory, getDrunkenness, type Night} from '../../../core/night.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {barPicture} from '../../pictures/barPicture.js';
import {
  BIRTHDAY_STORY,
  getFriendEvening,
  isFriendIn,
  KEYS_STORY,
  PARTY,
  SEARCH_HOUR,
} from '../../quest.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs. A story's title is stand-in text too, written with
// standIn.
const PLACE_NAME = 'Rotor Bar';
const BAR = 'The bar';
const BACK_ROOM = 'The back room';
const TABLE = 'The corner table';
const LONG_TABLE = 'The long table';
const DOOR = 'The door';
// On music night the guitarist has the corner table from 22:00 to 01:00.
const GUITARIST: Span = [1320, 1500];

export const GUITARIST_STORY = standIn`The guitarist who plays for one`;

const SEAT_STORY = standIn`A seat at the table`;
const BEER_STORY = standIn`The spilled beer`;
const CARDS_STORY = standIn`The hand that paid for a round`;
const COUPLE_STORY = standIn`The argument in whispers`;

/**
 * The corner table tonight: the version by the seed, with the guitarist in his hours on music
 * night.
 */
export function getCornerTable(night: Night): 'cards' | 'couple' | 'guitarist' | 'table' {
  let version = night.pick('cornerTable', {music: 0.5, cards: 0.3, couple: 0.2});

  return (
    version === 'music' ?
      isWithin(night, GUITARIST) ? 'guitarist'
      : 'table'
    : version
  );
}

const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The bar is loud and low, with a counter along one wall and a crowd that has settled in
      for the night. The music is a little too loud to talk under, and nobody seems to mind.
    `,
  },
});
const bar = defineScript({
  start: 'bar',
  nodes: {
    bar: {
      speaker: BAR,
      text: standIn`The bartender nods at the taps.`,
      choices: [
        {text: 'Order a beer', price: 45, minutes: 10, drinks: 1, next: 'beer'},
        {text: 'Ask after your friend', next: 'friend'},
        {text: 'Not now'},
      ],
    },
    beer: {
      speaker: BAR,
      text: standIn`The beer is cold and the foam is thick, and for a while nothing else needs doing.`,
    },
    friend: {
      speaker: BAR,
      text: (night) => {
        let {early, late} = getFriendEvening(night);

        return (
          night.quest.hasKeys ?
            standIn`The bartender shrugs. Your friend is wherever they are tonight, and you have the keys.`
          : night.minutes < early[0] ?
            standIn`The bartender has not seen your friend yet. Come back when the room fills up.`
          : isWithin(night, early) ?
            standIn`Your friend is in the back room, the bartender says, and points with a cloth.`
          : night.minutes < late[0] ?
            standIn`Your friend left at ${formatHourWords(early[1])}, the bartender says, and promised to be back at ${formatHourWords(late[0])}.`
          : standIn`Back in the back room again, the bartender says, as if they never left.`
        );
      },
    },
  },
});
const backRoom = defineScript({
  start: (night) =>
    night.quest.hasKeys ? 'chat'
    : isFriendIn(night) ? 'there'
    : 'away',
  nodes: {
    there: {
      speaker: BACK_ROOM,
      text: standIn`
        The back room is full and warm, and your friend is somewhere in it. Every face turns
        out to be someone else.
      `,
      choices: [
        {
          text: 'Look for them',
          minutes: 10,
          odds: (night) => (getDrunkenness(night) >= 3 ? 0.4 : 0.7),
          next: ({roll}) => (roll?.won ? 'found' : 'missed'),
        },
        {text: 'Not now'},
      ],
    },
    found: {
      speaker: BACK_ROOM,
      text: standIn`
        There they are, at the back, and the keys change hands across a table of glasses.
        Nobody asks what they open.
      `,
      onEnter: (night) => {
        night.quest.hasKeys = true;
        findStory(night, KEYS_STORY);
      },
    },
    missed: {
      speaker: BACK_ROOM,
      text: (night) => standIn`
        You go from table to table and an hour goes by without a sign of them.${
          isFriendIn(night) ? '' : ' By the end the back room has emptied.'
        }
      `,
      onEnter: (night) => {
        night.minutes += SEARCH_HOUR;
      },
    },
    away: {
      speaker: BACK_ROOM,
      text: (night) => {
        let {early, late} = getFriendEvening(night);

        return standIn`
          The back room is ${night.minutes < early[0] ? 'still empty' : 'quiet'}, and your friend is not in it. ${
            night.minutes < early[0] ?
              'Not yet.'
            : `They will be back at ${formatHourWords(late[0])}.`
          }
        `;
      },
    },
    chat: {
      speaker: BACK_ROOM,
      text: standIn`
        Your friend waves you over, and the two of you talk until the music takes the words
        away. The keys are where they belong now.
      `,
    },
  },
});
const table = defineScript({
  // Cards night and the couple last all night, while music night keeps the guitarist's hours.
  start: getCornerTable,
  nodes: {
    guitarist: {
      speaker: TABLE,
      text: standIn`
        A man with a guitar has the corner table to himself and plays to nobody in particular,
        songs that everybody half knows. His case lies on the spare chair.
      `,
      choices: [{text: 'Ask for a song', minutes: 10, next: 'song'}, {text: 'Leave him to it'}],
    },
    song: {
      speaker: TABLE,
      text: standIn`
        He nods, finds the chords and plays it through, a little slower than you remember it. The
        next table sings the last verse with him.
      `,
      onEnter: (night) => {
        findStory(night, GUITARIST_STORY);
      },
    },
    table: {
      speaker: TABLE,
      text: standIn`
        A few strangers sit around the table in the corner, with one spare chair among them.
        They glance at you, and then at the chair.
      `,
      choices: [
        {
          text: 'Take the spare chair',
          minutes: 15,
          odds: (night) => (getDrunkenness(night) >= 2 ? 0.7 : 0.4),
          next: ({roll}) =>
            roll?.won ? 'welcomed'
            : (roll?.value ?? 0) > 0.9 ? 'spilled'
            : 'brushedOff',
        },
        {text: 'Leave them to it'},
      ],
    },
    welcomed: {
      speaker: TABLE,
      text: standIn`
        Somebody moves a coat off the chair, and the talk opens up to let you in. A quarter of
        an hour goes by before anyone asks your name.
      `,
      onEnter: (night) => {
        findStory(night, SEAT_STORY);
      },
    },
    brushedOff: {
      speaker: TABLE,
      text: standIn`
        The nearest of them puts a hand on the chair before you reach it. Somebody is coming
        back, apparently. You stand there a while anyway.
      `,
    },
    spilled: {
      speaker: TABLE,
      text: standIn`
        The chair catches a glass on its way out, and the glass goes over. Everybody looks at
        you while somebody fetches a cloth, and the cleaning up takes a while longer.
      `,
      onEnter: (night) => {
        night.minutes += 10;
        findStory(night, BEER_STORY);
      },
    },
    cards: {
      speaker: TABLE,
      text: standIn`
        Four strangers play cards for small money, and a fifth chair stands empty. One of them
        gathers the deck and raises an eyebrow at you.
      `,
      choices: [
        {
          text: 'Sit in for a hand',
          price: 50,
          minutes: 15,
          odds: (night) => (getDrunkenness(night) >= 3 ? 0.3 : 0.5),
          next: ({roll}) => (roll?.won ? 'won' : 'lost'),
        },
        {text: 'Watch a while'},
      ],
    },
    won: {
      speaker: TABLE,
      text: standIn`
        The last card falls your way, and the pot is yours. Somebody pushes the coins across the
        table and orders a round for everyone.
      `,
      onEnter: (night) => {
        night.money += 100;
        findStory(night, CARDS_STORY);
      },
    },
    lost: {
      speaker: TABLE,
      text: standIn`
        The last card falls against you, and the fifty is gone. Somebody sweeps the coins to the
        other side of the table without looking up.
      `,
    },
    couple: {
      speaker: TABLE,
      text: standIn`
        A couple at the corner table argue in whispers, leaning so close that their foreheads
        almost touch. Neither of them raises a voice, and neither gives way.
      `,
      choices: [{text: 'Listen in', minutes: 10, next: 'listened'}, {text: 'Leave them to it'}],
    },
    listened: {
      speaker: TABLE,
      text: standIn`
        You lean on the next chair, and the whispers come in pieces: a promise, a silence, a
        door that was left open. Ten minutes later you know more than you wanted.
      `,
      onEnter: (night) => {
        findStory(night, COUPLE_STORY);
      },
    },
  },
});
const longTable = defineScript({
  start: (night) =>
    isWithin(night, PARTY) ?
      night.quest.bottleGiven ? 'thanked'
      : night.quest.hasBottle ? 'withBottle'
      : 'withoutBottle'
    : night.minutes < PARTY[0] ? 'laid'
    : 'over',
  nodes: {
    withBottle: {
      speaker: LONG_TABLE,
      text: standIn`
        The long table is full of friends and half-finished plates. There is a gap at the head
        of it, just the size of a bottle.
      `,
      choices: [
        {
          text: 'Hand over the bottle',
          onChoose: (night) => {
            night.quest.bottleGiven = true;
          },
          next: (night) => (getDrunkenness(night) >= 3 ? 'opened' : 'given'),
        },
        {text: 'Keep it for now'},
      ],
    },
    given: {
      speaker: LONG_TABLE,
      text: standIn`
        The bottle goes down the table from hand to hand, and somebody finds glasses. The
        toast is short, and everybody means it.
      `,
      onEnter: (night) => {
        findStory(night, BIRTHDAY_STORY);
      },
    },
    opened: {
      speaker: LONG_TABLE,
      text: standIn`
        The bottle is open before anybody has found a glass. It goes round the table anyway,
        and the toast is longer than it should be, and louder.
      `,
      onEnter: (night) => {
        findStory(night, BIRTHDAY_STORY);
      },
    },
    withoutBottle: {
      speaker: LONG_TABLE,
      text: standIn`
        The long table is full of friends and half-finished plates. Somebody asks, kindly,
        whether you brought anything, and you say you will see.
      `,
    },
    thanked: {
      speaker: LONG_TABLE,
      text: standIn`
        They thank you again for the bottle, and make room for you on the bench. The party goes
        on around you, warm and loud.
      `,
    },
    laid: {
      speaker: LONG_TABLE,
      text: standIn`
        A long table stands ready at the back, laid with plates and paper cups. The party has
        not started yet.
      `,
    },
    over: {
      speaker: LONG_TABLE,
      text: standIn`
        The long table is bare, with crumbs on the cloth and one forgotten cup. The party is
        over, and the room has moved on.
      `,
    },
  },
});
const door = defineScript({
  start: {
    speaker: DOOR,
    text: standIn`The door lets in the cold and the sound of a tram in Dvořákova street.`,
    choices: [
      {
        text: 'Go out',
        onChoose: (night) => {
          night.place = 'rotorBarStreet';
        },
      },
    ],
  },
});

export const rotorBarRoom: Place = {
  id: 'rotorBarRoom',
  name: PLACE_NAME,
  outdoors: false,
  description,
  picture: barPicture,
  spots: [
    {label: BAR, x: 0.22, y: 0.51, script: bar},
    {label: BACK_ROOM, x: 0.3, y: 0.2, script: backRoom},
    {label: TABLE, x: 0.7, y: 0.84, script: table},
    {label: LONG_TABLE, x: 0.72, y: 0.62, script: longTable},
    {label: DOOR, x: 0.91, y: 0.4, script: door},
  ],
};
