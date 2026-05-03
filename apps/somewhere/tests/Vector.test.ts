import {describe, expect, test} from 'vitest';

import {Vector} from '../source/engine/utilities/Vector.js';

describe('Vector', () => {
  describe('construction and basic state', () => {
    test('default constructor creates a zero vector', () => {
      let v = new Vector();

      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.isZero).toBeTruthy();
    });

    test('constructor sets x and y', () => {
      let v = new Vector(3, 4);

      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
      expect(v.isZero).toBeFalsy();
    });

    test('isZero is false when a component is exactly Number.EPSILON', () => {
      expect(new Vector(Number.EPSILON, 0).isZero).toBeFalsy();
      expect(new Vector(0, Number.EPSILON).isZero).toBeFalsy();
      expect(new Vector(-Number.EPSILON, 0).isZero).toBeFalsy();
    });

    test('set updates x and y and returns this', () => {
      let v = new Vector();
      let result = v.set(5, 6);

      expect(result).toBe(v);
      expect(v.x).toBe(5);
      expect(v.y).toBe(6);
    });

    test('clone returns an independent copy', () => {
      let v = new Vector(7, 8);
      let copy = v.clone();

      expect(copy).not.toBe(v);
      expect(copy.x).toBe(7);
      expect(copy.y).toBe(8);

      copy.x = 99;

      expect(v.x).toBe(7);
    });
  });

  describe('length', () => {
    test('length getter returns Euclidean magnitude', () => {
      let v = new Vector(3, 4);

      expect(v).toHaveLength(5);
    });

    test('length setter scales a non-zero vector', () => {
      let v = new Vector(3, 4);

      v.length = 10;

      expect(v.length).toBeCloseTo(10);
      expect(v.x).toBeCloseTo(6);
      expect(v.y).toBeCloseTo(8);
    });

    test('length setter on a zero vector with cached angle produces a directional vector', () => {
      let v = new Vector(3, 4);

      v.set(0, 0);
      v.length = 10;

      expect(v.length).toBeCloseTo(10);
      expect(v.x).toBeCloseTo(6);
      expect(v.y).toBeCloseTo(8);
    });
  });

  describe('angle and direction memory', () => {
    test('angle getter returns degrees', () => {
      let v = new Vector(1, 0);

      expect(v.angle).toBeCloseTo(0);

      v.set(0, 1);

      expect(v.angle).toBeCloseTo(90);
    });

    test('angle setter accepts degrees and updates components', () => {
      let v = new Vector(5, 0);

      v.angle = 90;

      expect(v.x).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(5);
    });

    test('angle setter at 360 degrees produces the same components as 0', () => {
      let v = new Vector(5, 0);

      v.angle = 360;

      expect(v.x).toBeCloseTo(5);
      expect(v.y).toBeCloseTo(0);
    });

    test('angle setter accepts negative degrees', () => {
      let v = new Vector(5, 0);

      v.angle = -90;

      expect(v.x).toBeCloseTo(0);
      expect(v.y).toBeCloseTo(-5);
    });

    test('angleInRadians round-trips through the setter and preserves length', () => {
      let v = new Vector(5, 0);

      v.angleInRadians = Math.PI / 4;

      expect(v.angleInRadians).toBeCloseTo(Math.PI / 4);
      expect(v.length).toBeCloseTo(5);
    });

    test('angleInRadians setter on a zero vector caches the angle without producing components', () => {
      let v = new Vector();

      v.angleInRadians = Math.PI / 3;

      expect(v.isZero).toBeTruthy();
      expect(v.angleInRadians).toBeCloseTo(Math.PI / 3);
    });

    test('set on a non-zero vector caches the new angle', () => {
      let v = new Vector(1, 0);

      v.set(0, 1);
      v.set(0, 0);

      expect(v.angleInRadians).toBeCloseTo(Math.PI / 2);
    });

    test('zeroing a vector preserves the cached angle (direction memory)', () => {
      let v = new Vector(3, 4);
      let cachedAngle = v.angleInRadians;

      v.set(0, 0);

      expect(v.isZero).toBeTruthy();
      expect(v.angleInRadians).toBeCloseTo(cachedAngle);
    });
  });

  describe('normalize', () => {
    test('normalize mutates the vector to unit length and returns this', () => {
      let v = new Vector(3, 4);
      let result = v.normalize();

      expect(result).toBe(v);
      expect(v.length).toBeCloseTo(1);
      expect(v.x).toBeCloseTo(0.6);
      expect(v.y).toBeCloseTo(0.8);
    });

    test('normalize with a target length scales while preserving direction', () => {
      let v = new Vector(3, 4);

      v.normalize(10);

      expect(v.length).toBeCloseTo(10);
      expect(v.x).toBeCloseTo(6);
      expect(v.y).toBeCloseTo(8);
    });

    test('normalize on a zero vector leaves it at zero', () => {
      let v = new Vector(0, 0);

      v.normalize();

      expect(v.isZero).toBeTruthy();
    });

    test('normalize with a target length on a zero vector leaves it at zero', () => {
      let v = new Vector(0, 0);

      v.normalize(10);

      expect(v.isZero).toBeTruthy();
    });
  });

  describe('equality', () => {
    test('isEqual is reflexive and symmetric for bit-equal components', () => {
      let a = new Vector(1, 2);
      let b = new Vector(1, 2);
      let d = new Vector(1, 3);

      expect(a.isEqual(a)).toBeTruthy();
      expect(a.isEqual(b)).toBeTruthy();
      expect(b.isEqual(a)).toBeTruthy();
      expect(a.isEqual(d)).toBeFalsy();
    });

    test('isEqual treats components within Number.EPSILON as equal', () => {
      let a = new Vector(1e-10, 2e-10);
      let c = new Vector(1e-10 + 1e-17, 2e-10);

      expect(a.x === c.x).toBeFalsy();
      expect(Math.abs(a.x - c.x)).toBeLessThan(Number.EPSILON);
      expect(a.isEqual(c)).toBeTruthy();
    });

    test('isEqual defaults to comparing against ORIGIN', () => {
      expect(new Vector(0, 0).isEqual()).toBeTruthy();
      expect(new Vector(1, 0).isEqual()).toBeFalsy();
    });

    test('Vector.ORIGIN is frozen', () => {
      expect(Object.isFrozen(Vector.ORIGIN)).toBeTruthy();
      expect(() => {
        Vector.ORIGIN.x = 5;
      }).toThrow(TypeError);
    });
  });

  describe('arithmetic', () => {
    test('add mutates and returns this', () => {
      let v = new Vector(1, 2);
      let result = v.add(new Vector(3, 4));

      expect(result).toBe(v);
      expect(v.x).toBe(4);
      expect(v.y).toBe(6);
    });

    test('add scales the operand by delta when provided', () => {
      let position = new Vector(0, 0);
      let velocity = new Vector(2, 3);

      position.add(velocity, 0.5);

      expect(position.x).toBe(1);
      expect(position.y).toBe(1.5);
    });

    test('subtract mutates and returns this', () => {
      let v = new Vector(5, 7);

      v.subtract(new Vector(2, 3));

      expect(v.x).toBe(3);
      expect(v.y).toBe(4);
    });

    test('multiply mutates elementwise', () => {
      let v = new Vector(2, 3);

      v.multiply(new Vector(4, 5));

      expect(v.x).toBe(8);
      expect(v.y).toBe(15);
    });

    test('divide mutates elementwise', () => {
      let v = new Vector(8, 15);

      v.divide(new Vector(4, 5));

      expect(v.x).toBe(2);
      expect(v.y).toBe(3);
    });

    test('negate flips signs and returns this', () => {
      let v = new Vector(3, -4);
      let result = v.negate();

      expect(result).toBe(v);
      expect(v.x).toBe(-3);
      expect(v.y).toBe(4);
    });
  });

  describe('products and distance', () => {
    test('dot product', () => {
      expect(new Vector(1, 2).dot(new Vector(3, 4))).toBe(11);
      expect(new Vector(1, 0).dot(new Vector(0, 1))).toBe(0);
    });

    test('cross product (2D z-component)', () => {
      expect(new Vector(1, 0).cross(new Vector(0, 1))).toBe(1);
      expect(new Vector(0, 1).cross(new Vector(1, 0))).toBe(-1);
      expect(new Vector(2, 3).cross(new Vector(2, 3))).toBe(0);
    });

    test('distance between two non-origin points', () => {
      let a = new Vector(1, 2);
      let b = new Vector(4, 6);

      expect(a.distance(b)).toBe(5);
    });

    test('distance is symmetric', () => {
      let a = new Vector(1, 2);
      let b = new Vector(4, 6);

      expect(b.distance(a)).toBe(a.distance(b));
    });
  });

  describe('interpolation', () => {
    test('lerp interpolates toward target by t from a non-zero start', () => {
      let v = new Vector(2, 3);

      v.lerp(new Vector(10, 20), 0.5);

      expect(v.x).toBe(6);
      expect(v.y).toBe(11.5);
    });

    test('lerp at t=0 leaves the vector unchanged', () => {
      let v = new Vector(2, 3);

      v.lerp(new Vector(10, 20), 0);

      expect(v.x).toBe(2);
      expect(v.y).toBe(3);
    });

    test('lerp at t=1 reaches the target', () => {
      let v = new Vector(2, 3);

      v.lerp(new Vector(10, 20), 1);

      expect(v.x).toBe(10);
      expect(v.y).toBe(20);
    });
  });
});
