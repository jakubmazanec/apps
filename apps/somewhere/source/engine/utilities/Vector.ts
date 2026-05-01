// TODO: rework this class
// const TURN = 360;
const HALF_TURN = 180;
const EPSILON = Number.EPSILON || 10e-12;

export class Vector {
  x: number;
  y: number;
  private __angle: number; // TODO: what about using private fields?

  static ORIGIN = new Vector(0, 0);

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;

    if (this.x === 0 && this.y === 0) {
      this.__angle = 0;
    } else {
      this.__angle = this.angleInRadians;
    }
  }

  set(x: number, y: number) {
    this.x = x;
    this.y = y;

    if (this.x === 0 && this.y === 0) {
      this.__angle ||= 0;
    } else {
      this.__angle = this.angleInRadians;
    }

    return this;
  }

  clone(): Vector {
    return new Vector(this.x, this.y);
  }

  get isZero(): boolean {
    return (
      this.x < Number.EPSILON &&
      this.x > -Number.EPSILON &&
      this.y < Number.EPSILON &&
      this.y > -Number.EPSILON
    );
  }

  get length(): number {
    return Math.hypot(this.x, this.y);
  }

  set length(value: number) {
    if (this.isZero) {
      let angle = this.__angle || 0;

      this.set(Math.cos(angle) * value, Math.sin(angle) * value);
    } else {
      let scale = value / this.length;

      this.set(this.x * scale, this.y * scale);
    }
  }

  get angle(): number {
    return (this.angleInRadians * HALF_TURN) / Math.PI;
  }

  set angle(value: number) {
    this.angleInRadians = (value * Math.PI) / HALF_TURN;
  }

  get angleInRadians(): number {
    return this.isZero ? this.__angle : Math.atan2(this.y, this.x);
  }

  set angleInRadians(value: number) {
    this.__angle = value;

    if (!this.isZero) {
      this.set(Math.cos(value) * this.length, Math.sin(value) * this.length);
    }
  }

  normalize(length = 1) {
    let currentLength = this.length;
    let scale = currentLength === 0 ? 0 : length / currentLength;

    // TODO: modify this instead
    return new Vector(this.x * scale, this.y * scale);
  }

  isEqual(point = Vector.ORIGIN) {
    return (
      this === point ||
      (this.x === point.x && this.y === point.y) ||
      (Math.abs(this.x - point.x) < EPSILON && Math.abs(this.y - point.y) < EPSILON) ||
      false
    );
  }

  add(vector: Vector, delta = 1): this {
    this.x += vector.x * delta;
    this.y += vector.y * delta;

    return this;
  }

  subtract(vector: Vector): this {
    this.x -= vector.x;
    this.y -= vector.y;

    return this;
  }

  multiply(vector: Vector): this {
    this.x *= vector.x;
    this.y *= vector.y;

    return this;
  }

  divide(vector: Vector): this {
    this.x /= vector.x;
    this.y /= vector.y;

    return this;
  }
}
