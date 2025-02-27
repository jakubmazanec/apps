// todo: rename (also rename offset)?

import {type HexOffset} from '../hex/index.js';

// todo: change to https://www.redblobgames.com/grids/hexagons/#conversions-offset
export const offsetFromZero = (offset: HexOffset, distance: number) =>
  (distance + offset * (distance & 1)) >> 1;
