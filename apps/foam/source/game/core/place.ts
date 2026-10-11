import {type RunnableDialogueScript} from 'tellurion';

import {type Night, type PlaceId} from './night.js';

/**
 * A spot lies on its thing in the place's picture: its button's centre is on
 * the thing on a wide screen, and its box overlaps the thing on a narrow one.
 */
export type Spot = {
  /** Label of the scene button. */
  label: string;

  /** Centre of the button, as fractions of the scene area's width and height. */
  x: number;
  y: number;

  script: RunnableDialogueScript<Night>;
};

export type Place = {
  id: PlaceId;

  /** The real name. The travel window lists the place by it. */
  name: string;

  /** Label of the place button, for a name that does not fit it. */
  shortName?: string;

  /**
   * Whether the place is outdoors: walk and taxi are offered only outdoors, and a location closes
   * only on a player indoors.
   */
  outdoors: boolean;

  description: RunnableDialogueScript<Night>;

  /** GLSL of the place: the function that draws its picture (see core/pictureShader.ts). */
  picture: string;

  spots: Spot[];
};
