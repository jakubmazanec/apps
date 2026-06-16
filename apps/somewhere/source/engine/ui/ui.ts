import {EventEmitter} from 'eventemitter3';

import {type MapTile} from '../tiled/Map.js';

export type UIEventMap = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- colon-namespaced UI event name follows eventemitter3 convention and the design doc's UIEventMap vocabulary
  'world:wallHit': (payload: {tile: MapTile}) => void;
};

export const ui = new EventEmitter<UIEventMap>();
