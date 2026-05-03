const HALF_TURN = 180;

export class Vector {
  x: number;
  y: number;
  #angle = 0;

  static readonly ORIGIN: Vector = Object.freeze(new Vector(0, 0)) as Vector;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.#angle = this.angleInRadians;
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;

    if (!this.isZero) {
      this.#angle = Math.atan2(this.y, this.x);
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
      this.set(Math.cos(this.#angle) * value, Math.sin(this.#angle) * value);
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
    return this.isZero ? this.#angle : Math.atan2(this.y, this.x);
  }

  set angleInRadians(value: number) {
    if (this.isZero) {
      this.#angle = value;
    } else {
      let {length} = this;

      this.set(Math.cos(value) * length, Math.sin(value) * length);
    }
  }

  normalize(length = 1): this {
    let currentLength = this.length;
    let scale = currentLength === 0 ? 0 : length / currentLength;

    this.x *= scale;
    this.y *= scale;

    return this;
  }

  isEqual(point: Vector = Vector.ORIGIN): boolean {
    return (
      this === point ||
      (this.x === point.x && this.y === point.y) ||
      (Math.abs(this.x - point.x) < Number.EPSILON && Math.abs(this.y - point.y) < Number.EPSILON)
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

  dot(vector: Vector): number {
    return this.x * vector.x + this.y * vector.y;
  }

  cross(vector: Vector): number {
    return this.x * vector.y - this.y * vector.x;
  }

  distance(vector: Vector): number {
    return Math.hypot(this.x - vector.x, this.y - vector.y);
  }

  negate(): this {
    this.x = -this.x;
    this.y = -this.y;

    return this;
  }

  lerp(target: Vector, t: number): this {
    this.x += (target.x - this.x) * t;
    this.y += (target.y - this.y) * t;

    return this;
  }
}
