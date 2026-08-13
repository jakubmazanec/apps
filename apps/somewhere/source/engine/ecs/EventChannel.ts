import {type Constructor} from '../../utilities/Constructor.js';
import {type Event} from './Event.js';
import {type World} from './World.js';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};

export class EventChannel<const T extends Constructor<Event> = Constructor<Event>> {
  /** TBD */
  displayName: string;

  /** TBD */
  readonly event: T;

  /** TBD */
  #currentEvents: Array<InstanceType<T>> = []; // this frame's readable snapshot

  /** TBD */
  #hasWarnedDetached = false;

  /** TBD */
  #nextEvents: Array<InstanceType<T>> = []; // pushed now, become current next frame

  /** TBD */
  #world: World | null = null;

  constructor({event, displayName}: EventChannelOptions<T>) {
    this.event = event;

    if (displayName === undefined) {
      this.displayName = EventChannel.name;
    } else {
      this.displayName = displayName;
    }
  }

  /**
   * This frame's events — a stable snapshot for the whole frame (parallels
   * `EntityQuery.entities`).
   */
  get events(): ReadonlyArray<InstanceType<T>> {
    return this.#currentEvents;
  }

  /** Whether a world currently drains this channel (see `attach`). */
  get isAttached(): boolean {
    return this.#world !== null;
  }

  /** @internal Called by `World.addEventChannel`. The world is held only to derive `isAttached`; the channel never reads it. */
  attach(world: World): void {
    if (this.#world) {
      throw new Error('Event channel is already attached to a world!');
    }

    this.#world = world;
  }

  /** @internal Called by `World` on stop / removal. */
  clear(): void {
    this.#nextEvents.length = 0;
    this.#currentEvents.length = 0;
  }

  /** @internal Called by `World.removeEventChannel`, and so by `World.stop`. */
  detach(): void {
    if (!this.#world) {
      throw new Error('Event channel is not attached to a world!');
    }

    this.#world = null;
  }

  /**
   * Push one or more events onto the channel. Becomes current (visible via `events`) next frame.
   * Safe to call mid-update. Off-cycle pushes are batched into the next swap (readable the
   * following frame), never dropped. The channel must be attached (`world.addEventChannel`): only
   * attached channels get their `swap()` called, so a detached push would buffer — and leak —
   * forever while consumers read an always-empty snapshot.
   */
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

  /** @internal Called by `World` once per frame. */
  swap(): void {
    let recycled = this.#currentEvents; // last frame's, already consumed

    recycled.length = 0; // reuse the drained array, no per-frame allocation
    this.#currentEvents = this.#nextEvents; // next frame's events become current
    this.#nextEvents = recycled;
  }
}
