# Timer and Tween completion: design

Date: 2026-09-04 App: `apps/somewhere` Status: approved design, implementation not started

## Background

`Timer` and `Tween` in `source/engine/scheduler` serve two owners with different completion
protocols:

- The screen side. `Scheduler` owns lifecycle (creates, ticks, cancels, clears on hide) and
  completion is an immediate callback. Ordering between callbacks does not matter.
- The ECS side. Systems run in a chosen order and completion is an event pushed onto an
  `EventChannel`, seen next frame. Timers, tweens and `Sprite` one-shots all complete this way.

Today the completion lives outside the classes, in side-car wrappers: `Scheduler` keeps
`{timer, onComplete}` and `{tween, onComplete}` entries, the components keep `{timer, emit}` and
`{tween, emit}` entries, and `Sprite` takes `{emit}` in its show options. `emit` is the
`EventEmit` pair type in `source/engine/scheduler/EventEmit.ts`, which neither `Timer` nor
`Scheduler` use. `Scheduler.tween` also threads `onComplete` through `TweenOptions` into the
`Tween` constructor, which silently drops it.

## Decisions

- `Timer` and `Tween` own their completion. Each takes one of two flat option shapes and delivers
  the completion itself inside `update`: it calls the hook, or pushes the event on the channel.
  `update` keeps returning a boolean so owners know when to drop the instance.
- No nested objects in options. The event variant is `{channel, event}` as direct props.
- `EventEmit` is deleted. `Sprite` show options flatten to the same `{channel, event}` props.
- No routing. The world does not look up channels by event class and there is no
  one-channel-per-event-class rule. Several channels per event class stay possible. Every emit
  names its channel explicitly.
- `Scheduler` and the two ECS systems only remove finished instances. Owners hold bare instances,
  so all four side-car entry types go away.
- `Modal` keeps its `onComplete` calls unchanged.

Rejected: a completion value generic on the class plus a `world.emit(event)` router; splitting
the classes per side with data-only ECS components; keeping `EventEmit` as a relocated type or a
class with `push()`.

## Engine

### `source/engine/scheduler/Timer.ts`

```ts
import type * as pixi from 'pixi.js';

import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean | undefined;
} & ({onComplete?: (() => void) | undefined} | {channel: EventChannel; event: Event});

/** Counts down a duration in milliseconds, once or repeatedly. */
export class Timer {
  /** Delivers the completion: calls the hook, or pushes the event on its channel. */
  readonly #complete: () => void;

  /** Duration in milliseconds. */
  readonly #duration: number;

  /** Elapsed milliseconds since the start or, when repeating, the last completion. */
  #elapsed = 0;

  /** Set once a non-repeating timer completes. */
  #isFinished = false;

  /** Whether the timer restarts after completing. */
  readonly #isRepeating: boolean;

  constructor(options: TimerOptions) {
    let {duration, repeat = false} = options;

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = duration;
    this.#isRepeating = repeat;
    this.#complete =
      'channel' in options ? () => options.channel.push(options.event) : (options.onComplete ?? (() => {}));
  }

  /** Does the timer restart after completing? */
  get isRepeating(): boolean {
    return this.#isRepeating;
  }

  /** Advances the timer on each tick; delivers the completion and returns true when it fires. */
  update(ticker: pixi.Ticker): boolean {
    if (this.#isFinished) {
      return false;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    if (this.#isRepeating) {
      this.#elapsed %= this.#duration;
    } else {
      this.#isFinished = true;
    }

    this.#complete();

    return true;
  }
}
```

### `source/engine/scheduler/Tween.ts`

Same union appended to the options, same `#complete` field. Delivery happens once, on the frame
progress first reaches 1; the return value keeps its current meaning.

```ts
export type TweenOptions<T> = {
  target: T;
  to: Partial<Pick<T, NumericKeys<T>>>;
  duration: number; // milliseconds, >= 0 (0 completes on the first update)
  easing?: Easing | undefined;
} & ({onComplete?: (() => void) | undefined} | {channel: EventChannel; event: Event});

export class Tween<T = Record<string, number>> {
  readonly #complete: () => void;
  #isFinished = false;
  // #duration, #easing, #elapsed, #from, #target, #to unchanged

  constructor(options: TweenOptions<T>) {
    let {target, to, duration, easing = linear} = options;
    // range check and from-capture unchanged
    this.#complete =
      'channel' in options ? () => options.channel.push(options.event) : (options.onComplete ?? (() => {}));
  }

  update(ticker: pixi.Ticker): boolean {
    // elapsed, progress, eased and the property writes unchanged

    if (progress < 1) {
      return false;
    }

    if (!this.#isFinished) {
      this.#isFinished = true;
      this.#complete();
    }

    return true;
  }
}
```

### `source/engine/scheduler/Scheduler.ts`

Both entry types go. Sets hold bare instances, `after` and `every` build the hook variant,
`tween` passes options through, `update` only removes.

```ts
type WaitEntry = (result: {cancelled: boolean}) => void;

export class Scheduler {
  /** Pending timers. */
  readonly #timers = new Set<Timer>();

  // `Tween<unknown>`, not `Tween`: (existing comment kept verbatim)
  /** Running tweens. */
  readonly #tweens = new Set<Tween<unknown>>();

  readonly #waits: Set<WaitEntry> = new Set();

  after(duration: number, onComplete: () => void): () => void {
    let timer = new Timer({duration, onComplete});

    this.#timers.add(timer);

    return () => {
      this.#timers.delete(timer);
    };
  }

  every(duration: number, onComplete: () => void): () => void {
    let timer = new Timer({duration, repeat: true, onComplete});

    this.#timers.add(timer);

    return () => {
      this.#timers.delete(timer);
    };
  }

  tween<T>(options: TweenOptions<T>): () => void {
    let tween = new Tween(options);

    this.#tweens.add(tween);

    return () => {
      this.#tweens.delete(tween);
    };
  }

  update(ticker: pixi.Ticker) {
    // Snapshot before iterating, so a completion can schedule a new tween or timer.
    let tweens = [...this.#tweens];
    let timers = [...this.#timers];

    for (let tween of tweens) {
      if (this.#tweens.has(tween) && tween.update(ticker)) {
        this.#tweens.delete(tween);
      }
    }

    for (let timer of timers) {
      if (this.#timers.has(timer) && timer.update(ticker) && !timer.isRepeating) {
        this.#timers.delete(timer);
      }
    }
  }

  // clear() and wait() unchanged
}
```

### `source/engine/scheduler/EventEmit.ts`

Deleted.

### `source/engine/graphics/Sprite.ts`

Show options flatten to the same two props. The pending slot holds the options object itself.

```ts
import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

export type SpriteShowOptions = {channel: EventChannel; event: Event};

#pending: SpriteShowOptions | null = null;

// in show():
if (options && !isOneShot) { /* existing loop warning, message says "its event would never fire" */ }
...
this.#detachOnComplete(this.view);
this.#pending = null;
...
if (isOneShot) {
  this.#isOneShotPlaying = true;
  this.#pending = options ?? null;
  this.view.onComplete = () => {
    let pending = this.#pending;

    this.#detachOnComplete(this.view);
    this.#isOneShotPlaying = false;
    this.#pending = null;
    pending?.channel.push(pending.event);
  };
  this.view.gotoAndPlay(0);
}
```

## Game

```ts
// components/TimerComponent.ts
export const TimerComponent = defineComponent<{timers: Timer[]}>();

// components/TweenComponent.ts
// `Tween<unknown>` so a `Tween<Vector>` (an entity position) or any concrete target assigns in.
export const TweenComponent = defineComponent<{tweens: Array<Tween<unknown>>}>();

// systems/timerSystem.ts (loop body)
let timer = timers[index]!;

if (timer.update(ticker) && !timer.isRepeating) {
  timers.splice(index, 1);
}

// systems/tweenSystem.ts (loop body)
if (tweens[index]!.update(ticker)) {
  tweens.splice(index, 1);
}

// systems/wallHitPopupSystem.ts
popup.getComponent(TweenComponent).tweens.push(
  new Tween({target: motion.position, to: {y: y - 6}, duration: 400, easing: easeOutQuad}),
);
popup.getComponent(TimerComponent).timers.push(
  new Timer({duration: 400, channel: popupExpiredChannel, event: new PopupExpired({entity: popup})}),
);

// systems/playerActionSystem.ts
sprite.show(`${spriteNamePrefix}spin`, {
  channel: playerActionFinishedChannel,
  event: new PlayerActionFinished({entity}),
});
```

## Tests and verification

Red first, then the code above.

- `tests/Timer.test.ts`: two new tests. The hook variant calls `onComplete` once for a one-shot
  and each period for a repeat. The channel variant pushes the event, visible after the channel
  swaps.
- `tests/Tween.test.ts`: the same two, plus one asserting a second `update` after completion does
  not deliver again.
- `tests/timerSystem.test.ts`: entries become `new Timer({duration: 100, channel, event})` and
  `new Timer({duration: 100, repeat: true, channel, event: new Fired({value: 1})})`. Assertions
  unchanged.
- `tests/tweenSystem.test.ts`: `tweens: [new Tween({target, to: {value: 10}, duration: 100})]`.
- `tests/Sprite.test.ts`: the four `{emit: {channel, event}}` literals become `{channel, event}`.
- Unchanged: Scheduler, Modal, World, wallHitPopupSystem, popupCleanupSystem and
  playerActionSystem tests.

Run from `apps/somewhere`:

```
npx vitest run --project unit
npm run lint
npx tsc -p tsconfig.typecheck.json --noEmit
```

No dependency changes.
