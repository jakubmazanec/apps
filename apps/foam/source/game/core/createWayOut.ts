import {type RunnableDialogueScript} from 'tellurion';

import {type Night, type Way} from './night.js';

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

/** A script of one node: a choice for each way, then "Stay", which costs nothing. */
export function createWayOut(options: WayOutOptions): RunnableDialogueScript<Night> {
  let {speaker, text, ways} = options;

  return {
    start: {
      speaker,
      text,
      choices: [
        ...ways.map((way) => ({text: WAY_LABELS[way], onChoose: leaveBy(way, ways)})),
        {text: 'Stay'},
      ],
    },
  };
}
