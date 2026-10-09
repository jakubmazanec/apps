import {createWayOut} from '../../core/createWayOut.js';
import {type Place} from '../../core/place.js';
import {standIn} from '../../core/prose.js';
import {defineScript} from '../../core/script.js';
import {standInPicture} from '../pictures/standInPicture.js';

// The text of this place is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
const PLACE_NAME = 'Brno-Židenice';
const TIMETABLE = 'The timetable';
const BENCH = 'The bench';
const UNDERPASS = 'The underpass';
const description = defineScript({
  start: {
    speaker: PLACE_NAME,
    text: standIn`
      The station is a low building with one lit window and a platform that ends in weeds.
      A tram bell rings somewhere beyond the fence, and the night smells of rain on rails.
    `,
  },
});
const timetable = defineScript({
  start: {
    speaker: TIMETABLE,
    text: standIn`
      The paper timetable hangs behind cracked glass. The trains back to the main station are
      listed in a column, and the last one is already behind you.
    `,
  },
});
const bench = defineScript({
  start: {
    speaker: BENCH,
    text: standIn`
      A man sits with his bag on his knees, waiting for a train that is not on the
      timetable. He does not seem to mind.
    `,
  },
});
const underpass = createWayOut({
  speaker: UNDERPASS,
  text: standIn`The stairs lead down and out to the street, where the trams run.`,
  ways: ['walk', 'tram', 'taxi'],
});

export const zidenice: Place = {
  id: 'zidenice',
  name: PLACE_NAME,
  description,
  picture: standInPicture,
  spots: [
    {label: TIMETABLE, x: 0.3, y: 0.3, script: timetable},
    {label: BENCH, x: 0.7, y: 0.55, script: bench},
    {label: UNDERPASS, x: 0.5, y: 0.8, script: underpass},
  ],
};
