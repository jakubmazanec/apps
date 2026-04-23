/* eslint-disable max-classes-per-file -- needed */
const tag: unique symbol = Symbol('Tag');
const event: unique symbol = Symbol('Event');

export abstract class Event {
  /** TBD */
  private readonly [tag] = event;
}

export function defineEvent<T extends Record<string, unknown>>() {
  return class CustomEvent extends Event {
    constructor(data: T) {
      super();
      Object.assign(this, data);
    }
  } as new (data: T) => Event & T;
}
