/* eslint-disable no-param-reassign -- TODO */
import {describe, expect, test} from 'vitest';

import {ObjectPool} from '../source/engine/ObjectPool.js';

// class Foo {
//   value: number | null = null;

//   constructor(value: number) {
//     this.value = value;
//   }
// }

describe('ObjectPool', () => {
  test('preallocates objects', () => {
    let pool = new ObjectPool({
      onCreate: () => ({
        foo: true,
      }),
      onReset: (object) => {
        object.foo = true;

        return object;
      },
      initialSize: 5,
    });

    expect(pool.getSize()).toBe(5);
    expect(pool.create()).toEqual({foo: true});
  });

  test('creates and destroy objects', () => {
    let pool = new ObjectPool({
      onCreate: () => ({
        foo: true,
      }),
      onReset: (object) => {
        object.foo = true;

        return object;
      },
    });

    expect(pool.getSize()).toBe(0);

    let object = pool.create();

    object.foo = false;

    pool.destroy(object);

    expect(pool.getSize()).toBe(1);

    object = pool.create();

    expect(object.foo).toBeTruthy();
  });

  test('create object with parameters', () => {
    let pool = new ObjectPool({
      onCreate: () => ({
        value: 0,
      }),
      onReset: (object, value: number) => {
        object.value = value;

        return object;
      },
    });

    let object = pool.create(42);

    expect(object.value).toBe(42);
  });
});
