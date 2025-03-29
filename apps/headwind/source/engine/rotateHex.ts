import {type TupleCoordinates, tupleToCube} from '../honeycomb/index.js';

export function rotateHex(coordinates: TupleCoordinates, degrees: number): TupleCoordinates {
  const {q, r, s} = tupleToCube(coordinates);

  let angle = degrees;

  if (angle >= 360) {
    angle -= 360;
  }

  if (angle < 0) {
    angle += 360;
  }

  const rotations = (angle / 60) % 6;

  switch (rotations) {
    case 1: {
      return [-r, -s, -q];
    } // 60° right
    case 2: {
      return [s, q, r];
    } // 120° right
    case 3: {
      return [-q, -r, -s];
    } // 180°
    case 4: {
      return [r, s, q];
    } // 240° right (or 120° left)
    case 5: {
      return [-s, -q, -r];
    } // 300° right (or 60° left)
    default: {
      return [q, r, s];
    } // 0° or 360°
  }
}
