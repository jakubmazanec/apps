import {type HexCoordinates, type HexSettings, toCube} from '../../hex/index.js';

export function distance(
  hexSettings: Pick<HexSettings, 'offset' | 'orientation'>,
  from: HexCoordinates,
  to: HexCoordinates,
) {
  const {q: fromQ, r: fromR, s: fromS} = toCube(hexSettings, from);
  const {q: toQ, r: toR, s: toS} = toCube(hexSettings, to);

  return Math.max(Math.abs(fromQ - toQ), Math.abs(fromR - toR), Math.abs(fromS - toS));
}
