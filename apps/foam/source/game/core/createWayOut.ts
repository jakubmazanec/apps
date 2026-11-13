import {sleepTillMorning} from './hours.js';
import {type Night, type Way} from './night.js';
import {standIn} from './prose.js';
import {defineScript, type Script} from './script.js';

// The text of the flat is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), people have no names (places, streets and stops keep theirs), every node
// sets `speaker`, a description is two or three sentences, a scene button one node of one or two,
// and the `*` marks of italic come in pairs.
export type WayOutOptions = {
  speaker: string;
  text: string[] | string;

  /** The ways of travelling this way out offers, in the order of its choices. */
  ways: readonly Way[];
};

const WAY_LABELS: Record<Way, string> = {
  walk: 'Walk',
  tram: 'Take the tram',
  taxi: 'Take a taxi',
};

/** Returns the effect of a choice that leaves by `way`. */
export function leaveBy(way: Way, ways: readonly Way[]): (night: Night) => void {
  return (night) => {
    night.leaving = {way, ways};
  };
}

/**
 * A script of one node: a choice for each way, then, with the keys, the walk to the flat and sleep,
 * then "Stay", which costs nothing.
 */
export function createWayOut(options: WayOutOptions): Script<string> {
  let {speaker, text, ways} = options;

  return defineScript({
    start: {
      speaker,
      text,
      choices: [
        ...ways.map((way) => ({text: WAY_LABELS[way], onChoose: leaveBy(way, ways)})),
        {
          text: 'Walk to the flat and sleep',
          isVisible: (night) => night.quest.hasKeys,
          onChoose: sleepTillMorning,
          next: {
            speaker: 'The flat',
            text: standIn`
              The keys turn easily in the lock. You sleep through the rest of the night, and the
              morning finds you in a borrowed bed.
            `,
          },
        },
        {text: 'Stay'},
      ],
    },
  });
}
