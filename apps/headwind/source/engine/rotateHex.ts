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

  console.log(rotations);

  switch (rotations) {
    case 1:
      return [-s, -q, -r]; // 60 degrees
    case 2:
      return [-r, -s, -q]; // 120 degrees
    case 3:
      return [s, q, r]; // 180 degrees
    case 4:
      return [r, s, q]; // 240 degrees
    case 5:
      return [s, q, r]; // -60 degrees (300 degrees clockwise)
    case 0:
    default:
      return [q, r, s]; // 0 or 360 degrees
  }
}
