import {defineDialogueScript, type RunnableDialogueScript} from 'tellurion';

import {type Night, type Way} from '../core/night.js';
import {standIn} from '../core/prose.js';
import {nightStart} from './nightStart.js';

// The text of a journey is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters, every node sets `speaker`, and
// the `*` marks of italic come in pairs. When the script runs, `night.place` is the destination.
function getDestination(night: Night): string {
  return nightStart.places[night.place]?.name ?? 'the next place';
}

export const journeys: Record<Way, RunnableDialogueScript<Night>> = {
  walk: defineDialogueScript<Night>()({
    start: {
      speaker: 'On foot',
      text: (night) => standIn`
        You walk through the quiet streets, and your feet find the way to ${getDestination(night)}.
      `,
    },
  }),
  tram: defineDialogueScript<Night>()({
    start: {
      speaker: 'The tram',
      text: (night) => standIn`
        The tram rattles along the rails with its lights low, and you get off at ${getDestination(night)}.
      `,
    },
  }),
  taxi: defineDialogueScript<Night>()({
    start: {
      speaker: 'The taxi',
      text: (night) => standIn`
        The taxi smells of pine and cold coffee, and the driver says nothing until ${getDestination(night)}.
      `,
    },
  }),
};
