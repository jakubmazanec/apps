import {type Constructor} from '../utilities/Constructor.js';
import {type Event} from './Event.js';
import {type World} from './World.js';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};

/** A per-frame queue of events. */
export class EventChannel<const T extends Constructor<Event> = Constructor<Event>> {
  /** Name for debugging purposes. */
  displayName: string;

  /** Event class. */
  readonly event: T;

  /** This frame's events. */
  #currentEvents: Array<InstanceType<T>> = []; // this frame's readable snapshot

  /** Was the detached-push warning already logged? */
  #hasWarnedDetached = false;

  /** Next frame's events. */
  #nextEvents: Array<InstanceType<T>> = []; // pushed now, become current next frame

  /** World the query is attached to. */
  #world: World | null = null;

  constructor({event, displayName}: EventChannelOptions<T>) {
    this.event = event;

    if (displayName === undefined) {
      this.displayName = EventChannel.name;
    } else {
      this.displayName = displayName;
    }
  }

  /** This frame's events. */
  get events(): ReadonlyArray<InstanceType<T>> {
    return this.#currentEvents;
  }

  /** Is the channel attached? */
  get isAttached(): boolean {
    return this.#world !== null;
  }

  /** @internal Called by `World`. */
  attach(world: World): void {
    if (this.#world) {
      throw new Error('Event channel is already attached to a world!');
    }

    this.#world = world;
  }

  /** @internal Called by `World`. */
  clear(): void {
    this.#nextEvents.length = 0;
    this.#currentEvents.length = 0;
  }

  /** @internal Called by `World`. */
  detach(): void {
    if (!this.#world) {
      throw new Error('Event channel is not attached to a world!');
    }

    this.#world = null;
  }

  /** Pushes one or more events onto the channel. */
  push(...events: Array<InstanceType<T>>): void {
    if (!this.#world) {
      let message = `Cannot push to the detached event channel "${this.displayName}" — events would never be delivered! Add it to a world with world.addEventChannel() first.`;

      if (import.meta.env.DEV) {
        throw new Error(message);
      }

      // Warn once and drop the event: buffering it anyway would recreate the
      // unbounded growth this guard exists to prevent.
      if (!this.#hasWarnedDetached) {
        this.#hasWarnedDetached = true;
        // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
        console.warn(message);
      }

      return;
    }

    this.#nextEvents.push(...events);
  }

  /** @internal Called by `World` on each tick. */
  swap(): void {
    let recycled = this.#currentEvents; // last frame's, already consumed

    recycled.length = 0; // reuse the drained array, no per-frame allocation
    this.#currentEvents = this.#nextEvents; // next frame's events become current
    this.#nextEvents = recycled;
  }
}
