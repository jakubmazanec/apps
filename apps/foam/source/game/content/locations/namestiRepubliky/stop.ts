import {createWayOut} from '../../../core/createWayOut.js';
import {sleepTillMorning} from '../../../core/hours.js';
import {findStory, hasMet, meet, type Night} from '../../../core/night.js';
import {type Place} from '../../../core/place.js';
import {standIn} from '../../../core/prose.js';
import {defineScript} from '../../../core/script.js';
import {standInPicture} from '../../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs. A story's title is stand-in text too, written with
// standIn.
const PLACE_NAME = 'Náměstí Republiky';
const SHORT_NAME = 'Nám. Republiky';
const SHELTER = 'The shelter';
const BENCH = 'The bench';
const DRUNK = 'The drunk';
const DISPLAY = 'The display';
const STREET = 'The street';
const TIMETABLE_STORY = standIn`The man who knew the timetable`;
const WALLET_STORY = standIn`The wallet on the bench`;
const DRINK_STORY = standIn`A drink at the stop`;

// The wallet holds 100, 200 or 300 Kč by the night, drawn where it is used.
function getWalletMoney(night: Night): number {
  return 100 + 100 * Math.floor(night.random('walletMoney') * 3);
}

const description = defineScript({
  start: (night) => {
    let event = night.pick('republikyArrival', {none: 0.5, wallet: 0.25, drunk: 0.25});

    return event === 'none' || hasMet(night, event) ? 'stop' : event;
  },
  nodes: {
    stop: {
      speaker: PLACE_NAME,
      text: standIn`
        The tram stop is a glass shelter on a wide, empty street. A few lit windows hang above
        it, and the rails shine wet in both directions.
      `,
    },
    wallet: {
      speaker: BENCH,
      text: (night) => standIn`
        A wallet lies forgotten on the bench under the glass. Inside are
        ${getWalletMoney(night)} Kč in notes and nothing to say whose they are.
      `,
      onEnter: (night) => {
        meet(night, 'wallet');
      },
      choices: [
        {
          text: 'Keep the money',
          onChoose: (night) => {
            night.money += getWalletMoney(night);
          },
          next: 'kept',
        },
        {text: 'Leave it', next: 'stop'},
      ],
    },
    kept: {
      speaker: BENCH,
      text: standIn`
        The notes go into your pocket, and the empty wallet goes back on the bench. Nobody comes
        running along the street.
      `,
      onEnter: (night) => {
        findStory(night, WALLET_STORY);
      },
      next: 'stop',
    },
    drunk: {
      speaker: DRUNK,
      text: standIn`
        A man with a bottle sways up to the shelter and insists that you drink with him. He holds
        it out like a ticket you have to take.
      `,
      onEnter: (night) => {
        meet(night, 'drunk');
      },
      choices: [
        {text: 'Drink with him', minutes: 10, drinks: 1, next: 'drank'},
        {text: 'Refuse', next: 'stop'},
      ],
    },
    drank: {
      speaker: DRUNK,
      text: standIn`
        The bottle is warm, and the drink burns all the way down. He talks for ten minutes about
        a tram he never caught, and then he forgets you were there.
      `,
      onEnter: (night) => {
        findStory(night, DRINK_STORY);
      },
      next: 'stop',
    },
  },
});
const shelter = defineScript({
  start: 'shelter',
  nodes: {
    shelter: {
      speaker: SHELTER,
      text: standIn`
        Somebody stands under the glass with the look of a person who has just missed a tram.
        They check the time anyway.
      `,
      choices: [
        {
          text: 'Ask when the next tram goes',
          minutes: 5,
          odds: 0.6,
          next: ({roll}) => (roll?.won ? 'knows' : 'shrugs'),
        },
        {text: 'Wait in silence'},
        {text: 'Sleep it off', onChoose: sleepTillMorning, next: 'asleep'},
      ],
    },
    asleep: {
      speaker: SHELTER,
      text: standIn`
        You sit down on the cold bench under the glass and close your eyes. The first tram of
        the morning wakes you.
      `,
    },
    knows: {
      speaker: SHELTER,
      text: standIn`
        They know the line and the minute, and they tell you both without looking up from the
        rails.
      `,
      onEnter: (night) => {
        findStory(night, TIMETABLE_STORY);
      },
    },
    shrugs: {
      speaker: SHELTER,
      text: standIn`
        They shrug. The display has been wrong all evening, and they stopped believing it an
        hour ago.
      `,
    },
  },
});
const display = defineScript({
  start: {
    speaker: DISPLAY,
    text: standIn`The display says the next tram comes in 6 minutes. It has said so for a while.`,
  },
});
const street = createWayOut({
  speaker: STREET,
  text: standIn`The street runs on in both directions, and the rails run with it.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const namestiRepubliky: Place = {
  id: 'namestiRepubliky',
  name: PLACE_NAME,
  shortName: SHORT_NAME,
  outdoors: true,
  description,
  picture: standInPicture,
  spots: [
    {label: SHELTER, x: 0.3, y: 0.3, script: shelter},
    {label: DISPLAY, x: 0.7, y: 0.55, script: display},
    {label: STREET, x: 0.5, y: 0.8, script: street},
  ],
};
