const HALF_TURN = 180;

export class Vector {
  /** TBD */
  x: number;

  /** TBD */
  y: number;

  /** TBD */
  #angle = 0;

  /** TBD */
  static readonly ORIGIN: Vector = Object.freeze(new Vector(0, 0)) as Vector;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.#angle = this.angleInRadians;
  }

  /** TBD */
  get angle(): number {
    return (this.angleInRadians * HALF_TURN) / Math.PI;
  }

  set angle(value: number) {
    this.angleInRadians = (value * Math.PI) / HALF_TURN;
  }

  /** TBD */
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

  /** TBD */
  get isZero(): boolean {
    return (
      this.x < Number.EPSILON &&
      this.x > -Number.EPSILON &&
      this.y < Number.EPSILON &&
      this.y > -Number.EPSILON
    );
  }

  /** TBD */
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

  /** TBD */
  add(vector: Vector, delta = 1): this {
    return this.set(this.x + vector.x * delta, this.y + vector.y * delta);
  }

  /** TBD */
  clone(): Vector {
    return new Vector(this.x, this.y);
  }

  /** TBD */
  cross(vector: Vector): number {
    return this.x * vector.y - this.y * vector.x;
  }

  /** TBD */
  distance(vector: Vector): number {
    return Math.hypot(this.x - vector.x, this.y - vector.y);
  }

  /** TBD */
  divide(vector: Vector): this {
    return this.set(this.x / vector.x, this.y / vector.y);
  }

  /** TBD */
  dot(vector: Vector): number {
    return this.x * vector.x + this.y * vector.y;
  }

  /** TBD */
  isEqual(point: Vector = Vector.ORIGIN): boolean {
    return (
      this === point ||
      (this.x === point.x && this.y === point.y) ||
      (Math.abs(this.x - point.x) < Number.EPSILON && Math.abs(this.y - point.y) < Number.EPSILON)
    );
  }

  /** TBD */
  lerp(target: Vector, t: number): this {
    return this.set(this.x + (target.x - this.x) * t, this.y + (target.y - this.y) * t);
  }

  /** TBD */
  multiply(vector: Vector): this {
    return this.set(this.x * vector.x, this.y * vector.y);
  }

  /** TBD */
  negate(): this {
    return this.set(-this.x, -this.y);
  }

  /** TBD */
  normalize(length = 1): this {
    let currentLength = this.length;
    let scale = currentLength === 0 ? 0 : length / currentLength;

    return this.set(this.x * scale, this.y * scale);
  }

  /** TBD */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;

    if (!this.isZero) {
      this.#angle = Math.atan2(this.y, this.x);
    }

    return this;
  }

  /** TBD */
  subtract(vector: Vector): this {
    return this.set(this.x - vector.x, this.y - vector.y);
  }
}
