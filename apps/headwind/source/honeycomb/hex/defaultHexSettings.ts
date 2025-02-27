import {type HexSettings, Orientation} from './types.js';

/**
 * @category Hex
 */

export const defaultHexSettings: HexSettings = {
  dimensions: {xRadius: 1, yRadius: 1},
  orientation: Orientation.POINTY,
  origin: {x: 0, y: 0},
  offset: -1,
};
