import {offsetFromZero} from '../../utils/index.js';
import {type Hex} from '../hex.js';
import {type HexOffset, type OffsetCoordinates} from '../types.js';

const hexToOffsetPointy = (q: number, r: number, offset: HexOffset): OffsetCoordinates => ({
  col: q + offsetFromZero(offset, r),
  row: r,
});

const hexToOffsetFlat = (q: number, r: number, offset: HexOffset): OffsetCoordinates => ({
  col: q,
  row: r + offsetFromZero(offset, q),
});

/**
 * @category Hex
 */
export const hexToOffset = ({
  q,
  r,
  offset,
  isPointy,
}: Pick<Hex, 'q' | 'r' | 'offset' | 'isPointy'>) =>
  isPointy ? hexToOffsetPointy(q, r, offset) : hexToOffsetFlat(q, r, offset);
