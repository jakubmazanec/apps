/* eslint @typescript-eslint/class-literal-property-style: ["error", "getters"] */

import {isOffset} from '../utils/index.js';
import {defaultHexSettings} from './defaultHexSettings.js';
import {equals} from './functions/equals.js';
import {hexToOffset} from './functions/hexToOffset.js';
import {hexToPoint} from './functions/hexToPoint.js';
import {offsetToCube} from './functions/offsetToCube.js';
import {toCube} from './functions/toCube.js';
import {translate} from './functions/translate.js';
import {
  type BoundingBox,
  type CubeCoordinates,
  type Ellipse,
  type HexConstructor,
  type HexCoordinates,
  type HexOffset,
  type HexSettings,
  type OffsetCoordinates,
  Orientation,
  type PartialCubeCoordinates,
  type Point,
} from './types.js';

export class Hex
  implements
    Readonly<CubeCoordinates>,
    Readonly<OffsetCoordinates>,
    Readonly<Point>,
    Readonly<BoundingBox>
{
  static get settings(): HexSettings {
    const {dimensions, orientation, origin, offset} = this.prototype;
    return {dimensions, orientation, origin, offset};
  }

  /**
   * This returns a point relative to the __top left corner__ of the hex with coordinates `[0, 0]`, ignoring any `origin` you may have set.
   *
   * @deprecated This probably doesn't do what you expect. If you want the center coordinates of a hex, use `hex.x` and `hex.y` instead.
   * See https://github.com/flauwekeul/honeycomb/discussions/95#discussioncomment-5158862.
   */
  get center(): Point {
    const {width, height, x, y} = this;
    return {x: width / 2 - x, y: height / 2 - y};
  }

  get col(): number {
    return hexToOffset(this).col;
  }

  // todo: add to docs that this always returns corners relative to Hex(0, 0)
  get corners(): Point[] {
    const {orientation, width, height, x, y} = this;
    return orientation === Orientation.POINTY ?
        cornersPointy(width, height, x, y)
      : cornersFlat(width, height, x, y);
  }

  get dimensions(): Ellipse {
    return defaultHexSettings.dimensions;
  }

  get height(): number {
    const {
      orientation,
      dimensions: {yRadius},
    } = this;
    return orientation === Orientation.POINTY ? yRadius * 2 : yRadius * Math.sqrt(3);
  }

  get isFlat(): boolean {
    return this.orientation === Orientation.FLAT;
  }

  get isPointy(): boolean {
    return this.orientation === Orientation.POINTY;
  }

  get orientation(): Orientation {
    return defaultHexSettings.orientation;
  }

  get origin(): Point {
    return defaultHexSettings.origin;
  }

  get offset(): HexOffset {
    return defaultHexSettings.offset;
  }

  get row(): number {
    return hexToOffset(this).row;
  }

  get width(): number {
    const {
      orientation,
      dimensions: {xRadius},
    } = this;
    return orientation === Orientation.POINTY ? xRadius * Math.sqrt(3) : xRadius * 2;
  }

  get x(): number {
    return hexToPoint(this).x;
  }

  get y(): number {
    return hexToPoint(this).y;
  }

  get s(): number {
    return -this.q - this.r;
  }

  readonly q: number;
  readonly r: number;

  constructor(coordinates: HexCoordinates = [0, 0]) {
    const {q, r} = toCube(this, coordinates);
    this.q = q;
    this.r = r;
  }

  clone<T extends Hex>(newProps: HexCoordinates = this): T {
    return new (this.constructor as HexConstructor<T>)(newProps);
  }

  equals(coordinates: HexCoordinates) {
    return equals(this, isOffset(coordinates) ? offsetToCube(this, coordinates) : coordinates);
  }

  toString() {
    return `${this.constructor.name}(${this.q},${this.r})`;
  }

  translate(delta: PartialCubeCoordinates) {
    return translate(this, delta);
  }
}

const cornersPointy = (width: number, height: number, x: number, y: number) => [
  {x: x + width * 0.5, y: y - height * 0.25},
  {x: x + width * 0.5, y: y + height * 0.25},
  {x, y: y + height * 0.5},
  {x: x - width * 0.5, y: y + height * 0.25},
  {x: x - width * 0.5, y: y - height * 0.25},
  {x, y: y - height * 0.5},
];

const cornersFlat = (width: number, height: number, x: number, y: number) => [
  {x: x + width * 0.25, y: y - height * 0.5},
  {x: x + width * 0.5, y},
  {x: x + width * 0.25, y: y + height * 0.5},
  {x: x - width * 0.25, y: y + height * 0.5},
  {x: x - width * 0.5, y},
  {x: x - width * 0.25, y: y - height * 0.5},
];
