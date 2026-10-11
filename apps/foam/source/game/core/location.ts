import {type RunnableDialogueScript} from 'tellurion';

import {type Night, type PlaceId} from './night.js';
import {type Place} from './place.js';

export type LocationId =
  | 'hlavniNadrazi'
  | 'malinovskehoNamesti'
  | 'namestiRepubliky'
  | 'rotorBar'
  | 'train'
  | 'whiskyShop'
  | 'zidenice';

export type Location = {
  id: LocationId;

  /** The real name. The destination button and a journey's text show it. */
  name: string;

  places: Place[];

  /** Where a journey ends while the location is open. */
  arrival: PlaceId;

  /**
   * A location with hours: its outdoor place, where a journey ends while it is closed and where
   * the game puts the player when it closes.
   */
  outside?: PlaceId;

  /** A location with hours: runs when it closes with the player indoors. */
  closing?: RunnableDialogueScript<Night>;
};
