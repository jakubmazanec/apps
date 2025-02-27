import {defaultHexSettings} from '../defaultHexSettings.js';
import {Hex} from '../hex.js';
import {
  type BoundingBox,
  type Ellipse,
  type HexOffset,
  type HexOptions,
  type Orientation,
  type Point,
} from '../types.js';
import {createHexDimensions} from './createHexDimensions.js';
import {createHexOrigin} from './createHexOrigin.js';

/**
 * @category Hex
 */
export function defineHex(hexOptions?: Partial<HexOptions>): typeof Hex {
  const {dimensions, orientation, origin, offset} = {...defaultHexSettings, ...hexOptions};

  return class extends Hex {
    get dimensions(): Ellipse {
      return createHexDimensions(dimensions as BoundingBox, orientation);
    }

    get orientation(): Orientation {
      return orientation;
    }

    get origin(): Point {
      return createHexOrigin(origin as 'topLeft', this);
    }

    get offset(): HexOffset {
      return offset;
    }
  };
}
