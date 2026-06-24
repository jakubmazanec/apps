import {type Constructor} from '../../utilities/Constructor.js';
import {type Event} from './Event.js';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};

export class EventChannel<const T extends Constructor<Event> = Constructor<Event>> {
  #nextEvents: Array<InstanceType<T>> = []; // pushed now, become current next frame
  #currentEvents: Array<InstanceType<T>> = []; // this frame's readable snapshot

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

  /** Push an event onto the channel. Becomes current (visible via `events`) next frame. Safe to call mid-update. Off-cycle pushes are batched into the next swap (readable the following frame), never dropped. */
  push(event: InstanceType<T>): void {
    this.#nextEvents.push(event);
  }

  /** This frame's events — a stable snapshot for the whole frame (parallels `EntityQuery.entities`). */
  get events(): ReadonlyArray<InstanceType<T>> {
    return this.#currentEvents;
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
