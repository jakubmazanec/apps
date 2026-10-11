# Timer and Tween completion: design

Date: 2026-09-04 App: `apps/somewhere` Status: approved design, implementation not started.
Revised 2026-09-04 after a `/replan` review; findings verified against the project's own `tsc`
6.0.3 and ESLint config.

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
- The two shapes are exclusive. Each member declares the other's props as `never`, so a hook next
  to the pair, or half a pair, is a compile error. Without this the plain union accepts
  `{duration, channel}`, `{duration, event}` and `{duration, onComplete, channel, event}` and the
  completion is silently lost. Today's nested `emit: {channel, event}` already rejects a half
  pair, so the flat shape must not regress that.
- A completion-less instance stays legal. `Tween` needs it (the popup float in
  `wallHitPopupSystem`); `Timer` only reaches it from tests.
- Both variants are accepted on both sides. By convention ECS entries use the event variant: a
  hook there would run mid-system and skip the next-frame ordering. Not enforced.
- Delivery happens after the instance has advanced its own state, so a hook that throws leaves a
  finished timer finished instead of re-firing every tick.
- `EventEmit` is deleted. `Sprite` show options flatten to the same `{channel, event}` props.
- No routing. The world does not look up channels by event class and there is no
  one-channel-per-event-class rule. Several channels per event class stay possible. Every push
  names its channel explicitly.
- `Scheduler` and the two ECS systems only remove finished instances. Owners hold bare instances,
  so all four side-car entry types go away.
- `Modal` keeps its `onComplete` calls unchanged.
- Existing comments stay. Where a comment, identifier or test title says "emit", it is reworded
  to "event" or "completion"; where a snippet below elides code, the comments in that code are
  untouched.

Rejected: a completion value generic on the class plus a `world.emit(event)` router; splitting
the classes per side with data-only ECS components; keeping `EventEmit` as a relocated type or a
class with `push()`.

Reviewed and not adopted: typing `channel` structurally as `{push(event: Event): void}` so the
scheduler has no type edge to `ecs/` and unit tests can use a fake (would change the written
`channel: EventChannel`); two constructor overloads instead of one union; a constructor-time
`channel.isAttached` check (would forbid building a timer before `world.start()`).

## Engine

Lint facts the snippets follow (verified with `eslint --print-config`):
`unicorn/consistent-destructuring` forbids destructuring `options` and then reading `options.x`
in the same scope, so the constructors read every prop through `options`;
`perfectionist/sort-union-types` orders union members alphabetically by source text;
`perfectionist/sort-classes` orders private fields alphabetically; Prettier runs through ESLint
with `printWidth: 100` and `experimentalTernaries: true`, so the ternaries wrap as shown;
`comment-length/limit-single-line-comments` caps comment lines at 100 characters;
`no-empty-function` is off for TypeScript, so `() => {}` is fine. If a snippet was transcribed
with the wrong order or wrap, `npx eslint --fix` corrects it.

### `source/engine/scheduler/Timer.ts`

```ts
import type * as pixi from 'pixi.js';

import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

// The `never` props make the two shapes exclusive; mixing them is a compile error.
export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean | undefined;
} & (
  | {channel: EventChannel; event: Event; onComplete?: never}
  | {channel?: never; event?: never; onComplete?: (() => void) | undefined}
);

/** Counts down a duration, once or repeatedly. */
export class Timer {
  /** Delivers the completion: calls the hook, or pushes the event on its channel (seen next frame). */
  readonly #complete: () => void;

  /** Duration in milliseconds. */
  readonly #duration: number;

  /** Elapsed milliseconds. */
  #elapsed = 0;

  /** Set once a non-repeating timer completes. */
  #isFinished = false;

  /** Whether the timer restarts after completing. */
  readonly #isRepeating: boolean;

  constructor(options: TimerOptions) {
    if (!Number.isFinite(options.duration) || options.duration <= 0) {
      throw new RangeError('Timer duration must be a finite number > 0');
    }

    this.#duration = options.duration;
    this.#isRepeating = options.repeat ?? false;
    // `'channel' in options` would not narrow here: both members declare the prop.
    this.#complete =
      options.channel === undefined ?
        (options.onComplete ?? (() => {}))
      : () => options.channel.push(options.event);
  }

  /** Does the timer restart after completing? */
  get isRepeating(): boolean {
    return this.#isRepeating;
  }

  /**
   * Advances the timer on each tick. Delivers the completion and returns true when it fires; a
   * finished one-shot returns false from then on.
   */
  update(ticker: pixi.Ticker): boolean {
    if (this.#isFinished) {
      return false;
    }

    this.#elapsed += ticker.deltaMS;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    // State first, then delivery: a hook that throws must not re-fire on the next tick.
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

Same union appended to the options, same `#complete` field and discriminant. Delivery happens
once, on the frame progress first reaches 1; the return value keeps its current meaning (sticky
`true`). `#isFinished` sorts between `#from` and `#target`.

```ts
import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

export type TweenOptions<T> = {
  target: T;
  to: Partial<Pick<T, NumericKeys<T>>>;
  duration: number; // milliseconds, >= 0 (0 completes on the first update)
  easing?: Easing | undefined;
} & (
  | {channel: EventChannel; event: Event; onComplete?: never}
  | {channel?: never; event?: never; onComplete?: (() => void) | undefined}
);

export class Tween<T = Record<string, number>> {
  /** Delivers the completion: calls the hook, or pushes the event on its channel (seen next frame). */
  readonly #complete: () => void;

  /** Set once the completion has been delivered. */
  #isFinished = false;

  // #duration, #easing, #elapsed, #from, #target, #to unchanged

  constructor(options: TweenOptions<T>) {
    if (!Number.isFinite(options.duration) || options.duration < 0) {
      throw new RangeError('Tween duration must be a finite number >= 0');
    }

    this.#target = options.target;
    this.#to = options.to;
    this.#duration = options.duration;
    this.#easing = options.easing ?? linear;
    this.#complete =
      options.channel === undefined ?
        (options.onComplete ?? (() => {}))
      : () => options.channel.push(options.event);

    let source = options.target as Record<NumericKeys<T>, number>;

    for (let key of Object.keys(options.to) as Array<NumericKeys<T>>) {
      this.#from[key] = source[key];
    }
  }

  /** Advances the tween on each tick; delivers the completion once and returns true from then on. */
  update(ticker: pixi.Ticker): boolean {
    // elapsed, progress, eased and the property writes unchanged

    if (progress < 1) {
      return false;
    }

    // At most once: the class guarantees single delivery, not each owner.
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
`tween` passes options through, `update` only removes. The `Tween<unknown>` comment moves above
`#tweens` and is re-wrapped (at the class indent its longest line exceeds the 100-character
comment cap). The `tween` doc changes to "Runs a tween, which delivers its own completion when it
finishes; returns a cancel function."

```ts
type WaitEntry = (result: {cancelled: boolean}) => void;

export class Scheduler {
  readonly #timers = new Set<Timer>();

  // `Tween<unknown>` comment, moved here
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

Behaviour is preserved: the `has` guard still runs before `update`, so every re-entrancy case in
`tests/Scheduler.test.ts` (a completion that cancels a sibling, clears the scheduler or schedules
new work) holds unchanged. `Scheduler.update` runs from `GameScreen.update`, outside
`World.update`, so a screen-side `tween({channel, event})` needs an attached channel or `push`
throws; nothing uses that path today.

### `source/engine/scheduler/EventEmit.ts`

Deleted, as the last step: it is imported by `Sprite.ts`, `TimerComponent.ts` and
`TweenComponent.ts` until those are migrated.

### `source/engine/graphics/Sprite.ts`

Show options flatten to the same two props. The pending slot holds the options object itself.
`#pendingEmit` becomes `#pending` and `#hasWarnedLoopEmit` becomes `#hasWarnedLoopEvent`; both
renames keep the private-field sort order. `Event` and `EventChannel` are imported from
`../ecs/` in place of `EventEmit`.

```ts
export type SpriteShowOptions = {channel: EventChannel; event: Event};

#pending: SpriteShowOptions | null = null;

// in show():
if (options && !isOneShot) {
  let message = `Animated sprite "${String(spriteName)}" loops and never completes, so its event would never fire!`;
  ...
}
...
this.#detachOnComplete(this.view);
this.#pending = null;
this.#isOneShotPlaying = false;
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

The message keeps the substring `never completes`, which `tests/Sprite.test.ts` asserts on.

## Game

```ts
// components/TimerComponent.ts
export const TimerComponent = defineComponent<{timers: Timer[]}>();

// components/TweenComponent.ts
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

The "consumed next frame by a gameplay system" note in `timerSystem` sits on the line that goes
away; its content lives on in the `#complete` doc. `timers[index]!` and `tweens[index]!` already
exist today and `no-non-null-assertion` is a warning, so no new disable comment is needed.

## Sequencing

`tsc` and ESLint are all-or-nothing across the repo, so each step is internally complete and
ends green on `npx vitest run --project unit`, `npm run lint` and `npm run typecheck`. Only
Vitest tolerates a red intermediate, which is what the red tests use.

0. Baseline: run both Vitest projects and record green.
1. `Timer`. Add the new tests to `tests/Timer.test.ts`, see them fail, implement `Timer.ts`.
   Safe alone: no caller passes a hook to `Timer` yet, so `Scheduler` keeps calling its own
   `onComplete` and nothing double-fires.
2. `Tween` and `Scheduler`, in one step. `Scheduler.tween` passes the caller's options into
   `new Tween(options)` and also calls `tween.onComplete?.()` from its entry; the moment `Tween`
   owns `#complete`, every screen tween fires its hook twice and the Modal fades break. Add the
   new `tests/Tween.test.ts` tests, see them fail, then change `Tween.ts` and `Scheduler.ts`
   together: bare sets, delete `TimerEntry` and `TweenEntry`, drop the
   `& {onComplete?: () => void}` intersection, drop both `onComplete` calls in `update`.
   `tests/Scheduler.test.ts` and `tests/Modal.browser.test.ts` stay green.
3. `Sprite` and `playerActionSystem`, in one step. Flatten the four literals in
   `tests/Sprite.test.ts`, see them fail, change `Sprite.ts` and the only optioned call site in
   `playerActionSystem.ts` together (`SpriteShowOptions` is exported and consumed there).
4. Components, both systems and `wallHitPopupSystem`, in one step: the components' element type
   changes and all three consumers read it. Rewrite the entries in `tests/timerSystem.test.ts`
   and `tests/tweenSystem.test.ts` first. `tests/wallHitPopupSystem.test.ts` and
   `tests/popupCleanupSystem.test.ts` stay green untouched.
5. Delete `source/engine/scheduler/EventEmit.ts`. Only now has it zero importers (there is no
   barrel file in `source/engine/scheduler/`).
6. Verify (commands below).

Steps 3 and 4 are independent of each other. `docs/` has no other description of the side-car
protocol.

## Tests and verification

Red first, then the code above. Existing style applies: `describe(Timer, ...)` and
`describe(Tween, ...)` take the class, the module-level `tick(deltaMS)` helper stays, hooks are
`vitest.fn<() => void>()`.

A channel test needs an attached channel: `EventChannel.push` throws on a detached channel and
`events` only reflects a push after a swap. The unit files use the hand-driven pattern from
`tests/EventChannel.test.ts` (`channel.attach(new World())`, then `channel.swap()`), which adds
`defineEvent`, `EventChannel` and `World` imports plus a module-level `Fired` event class to both
files.

- `tests/Timer.test.ts`, four new tests:
  - Hook one-shot: `onComplete` is called once when elapsed reaches the duration and a further
    `update` does not call it again.
  - Hook repeat: called once per period.
  - Channel variant: after the firing `update`, `channel.events` is still empty; after
    `channel.swap()` it holds exactly the event instance that was passed in.
  - Shape exclusivity, type-level: `new Timer({duration: 100, onComplete, channel, event})` and
    `new Timer({duration: 100, channel})` each carry `// @ts-expect-error -- ...` in the style of
    `tests/Sprite.test.ts`; `npm run typecheck` covers `tests/`.
- `tests/Tween.test.ts`, three new tests: the hook and channel variants as above, plus one
  asserting that a second `update` after completion returns `true`, leaves the target at the end
  value and does not deliver again.
- `tests/timerSystem.test.ts`: entries become `new Timer({duration: 100, channel, event})` and
  `new Timer({duration: 100, repeat: true, channel, event: new Fired({value: 1})})`. Assertions
  unchanged.
- `tests/tweenSystem.test.ts`: `tweens: [new Tween({target, to: {value: 10}, duration: 100})]`,
  plus one new test with `new Tween({target, to: {value: 10}, duration: 100, channel, event})` in
  a `TweenComponent`: the event is visible after the world swaps and the tween is removed. This
  path has no coverage today (no game code sets `emit` on a tween entry).
- `tests/Sprite.test.ts`: the four `{emit: {channel, event}}` literals become `{channel, event}`.
  The loop-guard assertion `toThrow('never completes')` keeps passing.
- Unchanged: Scheduler, Modal, World, wallHitPopupSystem, popupCleanupSystem, playerActionSystem
  and GameScreen tests. `tests/GameScreen.browser.test.ts` calls `scheduler.tween` without a
  completion and stays valid.

Run from `apps/somewhere`:

```
npx vitest run --project unit
npx vitest run --project browser
npm run lint
npm run typecheck
```

The browser project covers `tests/Modal.browser.test.ts` (the only real consumer of
`Scheduler.tween` with `onComplete`, including the cancel-and-replace fade) and
`tests/GameScreen.browser.test.ts`; Playwright's Chromium is already installed, so no install is
needed. `npm run lint` includes Prettier through `eslint-plugin-prettier`. `npm run typecheck`
is the canonical gate (`tsconfig.typecheck.json` includes `tests/`; the script also checks
`tools/`).

No dependency changes.
