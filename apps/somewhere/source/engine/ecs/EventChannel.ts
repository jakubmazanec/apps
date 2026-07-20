import {type Constructor} from '../../utilities/Constructor.js';
import {type Event} from './Event.js';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};

export class EventChannel<const T extends Constructor<Event> = Constructor<Event>> {
  #nextEvents: Array<InstanceType<T>> = []; // pushed now, become current next frame
  #currentEvents: Array<InstanceType<T>> = []; // this frame's readable snapshot
  #isRegistered = false;
  #hasWarnedUnregistered = false;

  readonly event: T;
  displayName: string;

  constructor({event, displayName}: EventChannelOptions<T>) {
    this.event = event;

    if (displayName === undefined) {
      this.displayName = EventChannel.name;
    } else {
      this.displayName = displayName;
    }
  }

  /** Push an event onto the channel. Becomes current (visible via `events`) next frame. Safe to call mid-update. Off-cycle pushes are batched into the next swap (readable the following frame), never dropped. The channel must be registered (`world.addEventChannel`): only registered channels get their `swap()` called, so an unregistered push would buffer — and leak — forever while consumers read an always-empty snapshot. */
  push(event: InstanceType<T>): void {
    if (!this.#isRegistered) {
      let message = `Cannot push to the unregistered event channel "${this.displayName}" — events would never be delivered! Register it with world.addEventChannel() first.`;

      if (import.meta.env.DEV) {
        throw new Error(message);
      }

      // Warn once and drop the event: buffering it anyway would recreate the
      // unbounded growth this guard exists to prevent.
      if (!this.#hasWarnedUnregistered) {
        this.#hasWarnedUnregistered = true;
        // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
        console.warn(message);
      }

      return;
    }

    this.#nextEvents.push(event);
  }

  /** This frame's events — a stable snapshot for the whole frame (parallels `EntityQuery.entities`). */
  get events(): ReadonlyArray<InstanceType<T>> {
    return this.#currentEvents;
  }

  /** Whether a world currently drains this channel (see `setRegistered`). */
  get isRegistered(): boolean {
    return this.#isRegistered;
  }

  /** @internal Set by `World.addEventChannel` / `removeEventChannel` (and so cleared by `World.stop`). */
  setRegistered(isRegistered: boolean): void {
    this.#isRegistered = isRegistered;
  }

  /** @internal Called by `World` once per frame. */
  swap(): void {
    let recycled = this.#currentEvents; // last frame's, already consumed
    recycled.length = 0; // reuse the drained array, no per-frame allocation
    this.#currentEvents = this.#nextEvents; // next frame's events become current
    this.#nextEvents = recycled;
  }

  /** @internal Called by `World` on stop / removal. */
  clear(): void {
    this.#nextEvents.length = 0;
    this.#currentEvents.length = 0;
  }
}
