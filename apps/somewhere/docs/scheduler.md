# Scheduler design

Status: **proposed** — design agreed, not yet implemented. **Depends on the event system**
(see `event-system.md`) being implemented first: the simulation side announces completion by
pushing events onto `EventChannel`s.

This document describes the planned timing layer for the Somewhere engine: easing functions,
a `Tween` and a `Timer` primitive, and two ways to drive them — an imperative `Scheduler` for
Pixi UI, and ECS components advanced by systems for the simulation. Both reuse one core; the
difference between them is enforced by the type system.

## Context

Today there is **no tween / timer / easing facility**. The only timing is the per-frame
`pixi.Ticker` `deltaTime` handed to every system, plus `motionSystem`'s hand-rolled velocity
integration. There is no way to animate a value over a duration (fade a panel, ease the camera,
knock an entity back), no delayed or repeating callback, and no shared easing.

Two consumers want timing, and they want it differently:

- **Pixi UI** (panels, buttons, the focus ring, screen transitions) is built in the canvas and
  is **not** part of the ECS. It wants imperative, fire-and-forget, `await`-able animation on
  arbitrary display objects.
- **The simulation** (entities in the `World`) wants deterministic, ordered, frame-stepped
  timing that is cleared with the world and announces results as events, not closures.

The design serves both from one set of primitives without letting the two timing models bleed
into each other.

## Two doors over one core

|  | Core | UI door | ECS door |
| --- | --- | --- | --- |
| Lives in | `engine/scheduler` | `Scheduler` (owned by `GameScreen`) | `TweenComponent` / `TimerComponent` + their systems |
| Drives | nothing (pure) | Pixi UI / any numeric object | simulation entities |
| Ticked by | — | `GameScreen.update` (Pixi ticker) | `World.update` (system order) |
| Completion | — | closure / `Promise` | push a domain `Event` onto a channel |
| Lifecycle | — | cleared on screen `hide()` | cleared on `world.stop()` |

The camera is an entity (`CameraComponent` + `cameraSystem`), so camera tweens are ECS-side, not
`Scheduler`-side. The litmus is one test: **is the thing being timed part of the simulation?**
ECS components. **Is it Pixi UI?** the `Scheduler`.

## Layering

```
UI:   scheduler.tween / after / every / wait   → mutate Pixi objects, resolve promises   (immediate)
sim:  TweenComponent / TimerComponent entries  → systems advance by deltaMS
         → on completion push a domain event → channel → gameplay systems react next frame
core: Tween / Timer / easing                   (pure; no Pixi, no ECS)
```

## Core primitives (`engine/scheduler/`)

The core is dependency-free and **handler-free**: a primitive answers exactly one question,
"did you fire this frame", and holds no completion behavior of its own. That is what keeps a
closure from leaking into the simulation (see [Why the boundary is type-enforced](#why-the-boundary-is-type-enforced)).

All durations are **milliseconds**, advanced with `ticker.deltaMS` (not `deltaTime`, which is
in frames). Tween targets stay floats; the renderer's `roundPixels: true` keeps pixels crisp.

### `easing`

Pure functions `(t: number) => number`, both `t` and result in `0..1`. The `Easing` type is
exported so a game can supply its own.

```ts
// engine/scheduler/easing.ts
export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;
export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => t * (2 - t);
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeInCubic: Easing = (t) => t ** 3;
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const easeInOutSine: Easing = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
```

### `Tween`

Interpolates the numeric fields named in `to` on a single target object, capturing the start
values at construction (so it begins the moment it is created or pushed). `advance` returns
`true` the frame it completes.

```ts
// engine/scheduler/Tween.ts
import {type Easing, linear} from './easing.js';

export type TweenOptions<T extends Record<string, number>> = {
  target: T;
  to: Partial<T>;
  duration: number; // milliseconds
  easing?: Easing;
};

export class Tween<T extends Record<string, number> = Record<string, number>> {
  readonly #target: T;
  readonly #to: Partial<T>;
  readonly #from: Partial<T> = {};
  readonly #duration: number;
  readonly #easing: Easing;
  #elapsed = 0;

  constructor({target, to, duration, easing = linear}: TweenOptions<T>) {
    this.#target = target;
    this.#to = to;
    this.#duration = duration;
    this.#easing = easing;

    for (let key in to) {
      this.#from[key] = target[key];
    }
  }

  /** Advance by `deltaMs`; returns `true` on the frame it reaches the end. */
  advance(deltaMs: number): boolean {
    this.#elapsed += deltaMs;
    let progress = Math.min(this.#elapsed / this.#duration, 1);
    let eased = this.#easing(progress);

    for (let key in this.#to) {
      let from = this.#from[key]!;
      this.#target[key] = from + (this.#to[key]! - from) * eased;
    }

    return progress >= 1;
  }
}
```

Nested targets are reached by pointing `target` at the sub-object: `{target: sprite.scale, to: {x: 2, y: 2}}`.

### `Timer`

Counts down, then fires. A one-shot fires once; a `repeat` timer fires every period and
re-arms. `advance` returns `true` on the frame it fires — for a repeat timer that is **every**
period, not once (see [Timing](#timing)).

```ts
// engine/scheduler/Timer.ts
export type TimerOptions = {
  duration: number; // milliseconds
  repeat?: boolean;
};

export class Timer {
  readonly #duration: number;
  readonly #repeat: boolean;
  #elapsed = 0;
  #finished = false;

  constructor({duration, repeat = false}: TimerOptions) {
    this.#duration = duration;
    this.#repeat = repeat;
  }

  get repeats(): boolean {
    return this.#repeat;
  }

  /** Advance by `deltaMs`; returns `true` on the frame it fires (a repeat fires every period). */
  advance(deltaMs: number): boolean {
    if (this.#finished) {
      return false;
    }

    this.#elapsed += deltaMs;

    if (this.#elapsed < this.#duration) {
      return false;
    }

    if (this.#repeat) {
      this.#elapsed -= this.#duration;
    } else {
      this.#finished = true;
    }

    return true;
  }
}
```

`advance` returns "fired this frame", **not** "remove me": a repeating timer must keep firing
while staying alive, so removal is the owner's decision (via `repeats`), never the return value.

## UI door: `Scheduler`

Imperative and `await`-able, operating on any numeric object (a Pixi `Container`, a `Vector`, a
widget). It owns a `Set` of entries, each pairing a bare primitive with the closure to run when
it fires; the closure lives in the entry, never on the primitive.

```ts
// engine/scheduler/Scheduler.ts
import type * as pixi from 'pixi.js';
import {Timer} from './Timer.js';
import {Tween, type TweenOptions} from './Tween.js';

type TweenEntry = {tween: Tween; onComplete?: (() => void) | undefined};
type TimerEntry = {timer: Timer; onComplete: () => void};

export class Scheduler {
  readonly #tweens = new Set<TweenEntry>();
  readonly #timers = new Set<TimerEntry>();

  /** @internal Called by `GameScreen.update`. */
  update(ticker: pixi.Ticker) {
    for (let entry of this.#tweens) {
      if (entry.tween.advance(ticker.deltaMS)) {
        entry.onComplete?.();
        this.#tweens.delete(entry);
      }
    }

    for (let entry of this.#timers) {
      if (entry.timer.advance(ticker.deltaMS)) {
        entry.onComplete();

        if (!entry.timer.repeats) {
          this.#timers.delete(entry);
        }
      }
    }
  }

  tween<T extends Record<string, number>>(
    options: TweenOptions<T> & {onComplete?: () => void},
  ): () => void {
    let entry: TweenEntry = {tween: new Tween(options), onComplete: options.onComplete};
    this.#tweens.add(entry);
    return () => this.#tweens.delete(entry);
  }

  after(duration: number, onComplete: () => void): () => void {
    let entry: TimerEntry = {timer: new Timer({duration}), onComplete};
    this.#timers.add(entry);
    return () => this.#timers.delete(entry);
  }

  every(duration: number, onComplete: () => void): () => void {
    let entry: TimerEntry = {timer: new Timer({duration, repeat: true}), onComplete};
    this.#timers.add(entry);
    return () => this.#timers.delete(entry);
  }

  wait(duration: number): Promise<void> {
    return new Promise((resolve) => {
      this.after(duration, resolve);
    });
  }

  clear() {
    this.#tweens.clear();
    this.#timers.clear();
  }
}
```

Each method returns a cancel function; `clear()` cancels everything at once.

### `GameScreen` ownership

`GameScreen` owns one `Scheduler`, the same way it already owns its `UiRoot`. It is advanced
from the existing per-frame `update` hook (already on the Pixi ticker) and cleared on `hide()`.
This is the only engine change the UI door needs:

```ts
// engine/app/GameScreen.ts
readonly scheduler = new Scheduler();

update(ticker: pixi.Ticker) {
  this.scheduler.update(ticker); // added: Pixi drives this every frame
  this.#onUpdate?.(ticker, this, this.game);
  this.#ui?.update();
}

async hide() {
  this.#ui?.clearFocus();
  this.scheduler.clear(); // added: cancel in-flight UI tweens/timers on hide
  await this.#onHide?.(this, this.game);
}
```

Usage:

```ts
screen.scheduler.tween({target: panel.view, to: {alpha: 0}, duration: 200, easing: easeOutQuad});
await screen.scheduler.wait(300);
let stop = screen.scheduler.every(500, () => button.flash());
```

## ECS door: `TweenComponent` / `TimerComponent`

The simulation door mirrors the UI door, but completion is **event data, not a closure**. Each
entry pairs a bare primitive with an optional `emit`: a channel and a pre-built `Event` to push
when it fires. The system does the push.

```ts
// engine/scheduler/EventEmit.ts
import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

export type EventEmit = {channel: EventChannel; event: Event};
```

```ts
// engine/scheduler/TweenComponent.ts
import {defineComponent} from '../ecs/Component.js';
import {type Tween} from './Tween.js';
import {type EventEmit} from './EventEmit.js';

export const TweenComponent = defineComponent<{
  tweens: Array<{tween: Tween; emit?: EventEmit | undefined}>;
}>();

// engine/scheduler/TimerComponent.ts
export const TimerComponent = defineComponent<{
  timers: Array<{timer: Timer; emit?: EventEmit | undefined}>;
}>();
```

```ts
// engine/scheduler/timerSystem.ts
export const timerSystem = new System({
  components: [TimerComponent],
  displayName: 'Timer',
  onUpdate: (ticker, system) => {
    for (let entity of system.entities) {
      let {timers} = entity.getComponent(TimerComponent);

      for (let index = timers.length - 1; index >= 0; index--) {
        let {timer, emit} = timers[index]!;

        if (timer.advance(ticker.deltaMS)) {
          emit?.channel.push(emit.event); // consumed next frame by a gameplay system
          if (!timer.repeats) {
            timers.splice(index, 1);
          }
        }
      }
    }
  },
});
```

`tweenSystem` is identical, except a tween never repeats, so it always removes its entry on
completion.

Because an `Entity`'s component set is fixed at construction (there is no `addComponent`, and
the component map is keyed by constructor so there is one per type), a tweenable or timed entity
is created up front with an **empty** `TweenComponent` / `TimerComponent`, and entries are pushed
into the list at runtime. The list-in-a-component pattern also lets one entity run several tweens
or timers at once. To cancel, splice the entry out of the list.

```ts
// per-entity one-shot: cooldown that announces readiness as a domain event next frame
enemy.getComponent(TimerComponent).timers.push({
  timer: new Timer({duration: 2000}),
  emit: {channel: attackReadyChannel, event: new AttackReady({entity: enemy})},
});

// global repeat: a singleton "director" entity spawns a wave every 10s
director.getComponent(TimerComponent).timers.push({
  timer: new Timer({duration: 10_000, repeat: true}),
  emit: {channel: spawnWaveChannel, event: new SpawnWave({})},
});
```

A `repeat` timer reuses its `event` instance on every fire, which suits an immutable
announcement; a per-fire payload would require a factory function, which is a closure and is
deliberately out of scope.

### Registration and system order

The systems are registered by the game in `world.ts`, like every other system:

```ts
// world.ts — onStart
world.addSystem(timerSystem); // early: timer events are queued promptly
// ...motion, player, camera systems...
world.addSystem(tweenSystem); // late, just before graphicsSystem: scripted motion is the last word
world.addSystem(graphicsSystem);
```

Order is significant here (systems run in registration order, as the existing pipeline already
relies on). The default above puts `timerSystem` early so timer-driven events are available the
rest of the frame, and `tweenSystem` late so a tween that writes `position` is the final value a
frame's render sees. A game that wants velocity to win over a tween can move `tweenSystem` ahead
of `motionSystem` instead; this is a per-game tuning knob, not a fixed rule.

## Why the boundary is type-enforced

The core primitive has **no completion handler**. The two doors carry completion in their own,
non-overlapping types: a `Scheduler` entry has `onComplete: () => void` and no `emit`; a component
entry has `emit?: EventEmit` and no callback field. So:

- A closure cannot reach the simulation: there is no `onComplete` parameter on `Timer`/`Tween`
  and none on the component entry, so a function is not assignable anywhere in the ECS door and
  `tsc` rejects it. A closure firing inside the deterministic `World.update` is impossible by
  construction, not by convention.
- Event data cannot reach the UI door either; the `Scheduler` has no `emit`.

"Which door am I in" is answered by which API you called, and the compiler holds you to it.

## Timing

- `advance` returns "fired this frame". The owner runs completion (closure or event push) and
  then decides removal: a `Tween` is always dropped on completion; a `Timer` is dropped only if
  `!repeats`.
- UI completion is **synchronous**: the closure runs and a `Promise` from `wait` resolves in the
  same frame the primitive fires.
- ECS completion is an event push, so a consumer sees it the **frame after** it fires — the
  event system swaps channels at the end of `World.update`, the standard one-frame latency.
  Ordering is FIFO per channel; do not encode cross-channel causality.

## Lifecycle / cleanup

- **UI:** the `Scheduler` is cleared in `GameScreen.hide()`, cancelling every in-flight UI tween
  and timer; individual items can be cancelled earlier via their returned handle. Because the
  scheduler is advanced from the screen's own `update`, a hidden screen's animations simply stop.
- **ECS:** nothing special. Components are cleared when the `World` tears down entities on
  `stop()`; an entry is cancelled by splicing it from its list. The `emit` channels are owned and
  cleared by the `World` per the event-system design.

## Trade-offs

**Pros**

- One set of primitives (`Tween`, `Timer`, `easing`) serves both UI and simulation; the doors are
  thin adapters, not parallel implementations.
- The simulation/presentation boundary is enforced by types, not discipline: a closure cannot
  enter the deterministic update, and event data cannot enter the UI path.
- The UI door uses Pixi's existing ticker via the `GameScreen.update` hook and a single `clear()`
  for cleanup; no per-tween ticker registration to track.
- The ECS door is deterministic, ordered, cleared with the world, announces results as domain
  events (decoupling producers from reactors), and is shaped as data with no closures, which keeps
  it amenable to a future save/load.

**Cons / risks**

- Two doors mean a "which do I reach for" choice, resolved by the simulation-vs-UI litmus.
- ECS tween/timer entries must be created up front as empty component containers because the
  component set is fixed at construction; you cannot make an arbitrary existing entity timed on
  demand without having attached the container.
- System order is load-bearing for tweens that write the same fields other systems read; the
  default is a starting point, not a guarantee.
- A `repeat` timer reuses its event instance; varying per-fire payloads is intentionally not
  supported.

## Scope

**In scope:** `easing` (the functions above, with `Easing` exported for custom curves); `Tween`
(one target, numeric `to`, duration, easing); `Timer` (duration, repeat); the `Scheduler`
(`tween`, `after`, `every`, `wait`, `clear`, cancel handles) owned by `GameScreen`;
`TweenComponent` / `TimerComponent` with `tweenSystem` / `timerSystem` and event-data completion;
the `GameScreen` and `world.ts` wiring; unit tests for all of it.

**Out of scope (future):** tween chaining / timelines, yoyo / ping-pong, relative `by` tweens,
per-frame `onUpdate` callbacks (read the value in a system instead), pause / resume of individual
items, spring / physics-based tweens, per-fire repeat payloads, and literal save/load
serialization of in-flight schedules (the data-shaped ECS door enables it later but does not
implement it).

**Dependency:** assumes the event system (`Event`, `defineEvent`, `EventChannel`,
`World.addEventChannel`) from `event-system.md` is implemented first.

## Open decisions

- The default system order (`timerSystem` early, `tweenSystem` late) is a sensible starting point;
  individual games may reorder. No engine-level ordering is imposed.
- Whether to add a tiny typed helper for building an `EventEmit` (to keep the channel and event
  type aligned at the construction site) or leave it as a plain object literal. Leaning literal
  until the friction is felt.

## Suggested build order

1. Add `easing`, `Tween`, `Timer` with unit tests (interpolation, easing endpoints, fire timing,
   repeat re-arm, the `#finished` guard). Pure, no engine dependency.
2. Add the `Scheduler` and wire it into `GameScreen` (`update` tick, `clear` on `hide`). Convert
   one real UI animation (for example a screen or panel fade) to prove the API.
3. Add `TweenComponent` / `TimerComponent`, `tweenSystem` / `timerSystem`, and `EventEmit`;
   register them in `world.ts`. Convert one real simulation timing need (a cooldown or the camera
   ease) and assert the completion event arrives on its channel the next frame.
