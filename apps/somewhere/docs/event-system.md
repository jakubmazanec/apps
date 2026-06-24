# Event system design

Status: **proposed** — design agreed, not yet implemented.

This document describes the planned event architecture for the Somewhere engine: a
buffered, re-entrancy-safe event system for the ECS simulation, and a separate synchronous
event system for the UI, with a single well-defined bridge between them.

## Context

Today there is **no ECS-level event system**. Systems communicate by polling shared
component state through queries every frame:

- `playerSystem`'s pointer handler writes `MotionComponent.target`.
- `motionSystem` polls `target`, moves toward it, and clears it on arrival.
- `graphicsSystem` polls `velocity` to pick an animation.
- `cameraSystem` polls the player's `position`.

The only existing `.on/.off/.once` is `Game`'s wrapper over Pixi's `interactionView`
(`FederatedEventMap`) for **raw pointer input**, backed by `eventemitter3` (already a
dependency). There is no channel for gameplay events ("arrived", "collided") and no way
for UI to learn about world state except by polling.

All UI in this app is built in **Pixi.js inside the canvas** — React is only a mount
shell. The event design must therefore serve Pixi-based UI, not a React store.

## Two systems, by design

The simulation and the UI want opposite timing models, so they get separate systems:

| | ECS events | UI events |
| --- | --- | --- |
| Backing | custom double-buffered `EventChannel` | `eventemitter3` |
| Dispatch | deferred (drained at a frame boundary) | immediate (synchronous) |
| Guarantees | insertion-ordered per channel, re-entrancy-safe | none needed — presentation only |
| Lifecycle | owned by `World` (registered, cleared on stop) | lives with game/screens |
| Used by | systems / simulation | Pixi widgets and HUD |

They never cross-talk except at one explicit bridge (see [Bridge](#bridge)).

## Layering

```
raw input  →  UI events (sync)  →  write ECS channel  →  systems simulate
   →  write ECS channel  →  bridge  →  UI events (sync)  →  Pixi render update
```

1. **Raw input** — Pixi federated events (`pointertap`, `pointermove`). Already exists
   via `game.on/off/once`.
2. **UI events** — `eventemitter3`, synchronous, semantic UI events. Widgets translate
   raw input into these (or invoke widget-local callbacks directly).
3. **ECS channels** — double-buffered, insertion-ordered simulation events.

Input and outcomes both pass through the UI layer synchronously; everything between is
deterministic ECS. UI never *polls* component state to render; it may read the references it
needs to *address* an intent it writes to a channel. No system touches a Pixi display object.
The bridge is the only seam.

## ECS event system (double-buffered channels)

Combines two ideas: **module-singleton channels** (matches the existing
`cameraQuery` / `levelQuery` / `mapPool` grain) that are each **internally
double-buffered** (re-entrancy-safe, insertion-ordered), and **registered with the `World`**
so the World drives the per-frame swap and clears them on stop.

The type model parallels the persistent side: `Component` → `Entity` → `EntityQuery` for
persistent, queryable state; **`Event` → `EventChannel`** for transient, one-frame messages.
An `Event` mirrors a `Component`'s shape (a named data bag) but is a distinct type (see below).

### `Event` and `EventChannel`

An **event** mirrors a `Component` in *shape* — a small named bag of data — but is a distinct
*type*: `engine/ecs/Event.ts` is a near-mirror of `Component.ts` with its **own tag**, so
`Event & T` is not assignable to `Component & T`. That keeps messages and entity-state from
being confused (an event can't be placed on an `Entity` or matched by an `EntityQuery`, and
vice-versa). It comes with a `defineEvent` helper paralleling `defineComponent`:

```ts
// engine/ecs/Event.ts
/* eslint-disable max-classes-per-file -- needed */
const tag: unique symbol = Symbol('Tag');
const event: unique symbol = Symbol('Event');

export abstract class Event {
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
```

Note `Event` and the inner `CustomEvent` shadow the DOM globals of the same name. This mirrors
`defineComponent`'s `CustomComponent` and is safe because engine modules don't reference the DOM
`Event`/`CustomEvent`; if a lint rule flags it, suppress locally rather than rename, to preserve the
`defineComponent` symmetry.

`EventChannel` parallels `EntityQuery`: it is generic over the event **constructor**, holds it
directly in `event` (as `EntityQuery` holds `components`), and derives instances via
`InstanceType<T>` — so `T` is inferred from the event class and there is **no explicit type
argument** at the construction site:

```ts
// engine/ecs/EventChannel.ts
import {type Constructor} from '../../utilities/Constructor.js';
import {type Event} from './Event.js';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};

export class EventChannel<const T extends Constructor<Event> = Constructor<Event>> {
  #nextEvents: Array<InstanceType<T>> = [];   // pushed now, become current next frame
  #currentEvents: Array<InstanceType<T>> = [];  // this frame's readable snapshot

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
  get events(): readonly InstanceType<T>[] {
    return this.#currentEvents;
  }

  /** @internal Called by `World` once per frame. */
  swap(): void {
    let recycled = this.#currentEvents;        // last frame's, already consumed
    recycled.length = 0; // reuse the drained array, no per-frame allocation
    this.#currentEvents = this.#nextEvents;  // next frame's events become current
    this.#nextEvents = recycled;
  }

  /** @internal Called by `World` on stop / removal. */
  clear(): void {
    this.#nextEvents.length = 0;
    this.#currentEvents.length = 0;
  }
}
```

Producers only touch `#nextEvents`; consumers (via `events`) only touch `#currentEvents` —
never the same array, so there is no re-entrancy hazard even when an event is pushed during
`World.update()`. (`#nextEvents` is exactly the next frame's batch — a two-slot buffer, not a
general scheduler.)

The `const` modifier on `T` is load-bearing: it preserves the literal constructor type so
`new EventChannel({event: WallHit})` infers `T = typeof WallHit` and `events` is typed
`readonly (Event & {entity; tile})[]` (destructuring `{entity, tile}` works because `Object.assign`
puts the fields on the instance). Note one asymmetry vs `EntityQuery`/`System`, whose generic only
flows through `@internal` methods: `push(event: InstanceType<T>)` is a **public** typed sink, so the
erased `EventChannel` form (`World.eventChannels`) is write-unsound. That is acceptable only because
producers always hold the precisely-typed module singleton (`wallHitChannel`), never the erased
array element; the `World` only ever calls `swap()`/`clear()` on it.

Three intentional shape choices, so they don't read as accidental:

- **An event is its own primitive, not a `Component`.** They share a shape but differ in role
  (transient message vs. persistent entity state); the distinct `[tag]` enforces that at the
  type level.
- **No `getComponent`.** `Entity.getComponent` exists so a system can fetch one *stateful*
  aspect of a persistent entity to mutate it. An event is read-once and never mutated, so its
  fields are read directly off the value yielded by `events`.
- **No `setWorld`/`world` getter** (unlike `EntityQuery`/`System`): a channel never collects
  from the world — producers `push()` to it directly — so it needs no world back-ref; the
  `World` only ever calls `swap()`/`clear()` on it.

### `World` changes

Mirror the existing `addEntityQuery` / `addSystem` registration style, including the **double
cast** `as unknown as EventChannel`. A single `as EventChannel` will not compile: `EventChannel<T>`
is not assignable to the bare `EventChannel` default-parameter form (the `readonly event: T` field
makes it invariant), exactly as `System<T>` / `EntityQuery<T>` aren't, which is why `World.ts`
already double-casts everywhere.

```ts
readonly eventChannels: EventChannel[] = [];

addEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
  if (this.eventChannels.includes(channel as unknown as EventChannel)) {
    throw new Error('Event channel was already added to the world!');
  }
  this.eventChannels.push(channel as unknown as EventChannel);
  return this;
}

removeEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
  let index = this.eventChannels.indexOf(channel as unknown as EventChannel);
  if (index < 0) {
    throw new Error("Event channel wasn't found!");
  }
  (channel as unknown as EventChannel).clear();
  this.eventChannels.splice(index, 1);
  return this;
}
```

At the **very end of `update()`**, after both the `#entitiesToBeAdded` and `#entitiesToBeDeleted`
drain loops (the swap must be the last statement in `update()`, so once `update()` returns `events`
holds the batch that was just produced this frame, ready to read next frame):

```ts
for (let channel of this.eventChannels) {
  channel.swap();
}
```

And in `stop()`, next to the systems/queries teardown, a reverse-iteration loop the same
shape as the existing entity/system/query teardown loops:

```ts
for (let i = this.eventChannels.length - 1; i >= 0; i--) {
  let channel = this.eventChannels[i];

  if (channel !== undefined) {
    this.removeEventChannel(channel);
  }
}
```

This must **splice** each channel out of `eventChannels`, not merely `clear()` it: channels
are module singletons that outlive `stop()`/`start()`, so a clear-only loop would leave them
registered and the next `onStart` re-`addEventChannel` would throw "already added".

Because `removeEventChannel` runs `clear()`, any event pushed during teardown (from an `onStop`, or a
system's `onRemove`) is discarded by design; channels do not deliver across a stop boundary. And
`events` is empty during the **first** `update()` after `start()` (no swap has run yet); register
all channels in `onStart`, never mid-update (`addEventChannel` has no `#isUpdating` deferral, unlike
`addEntity`).

### Event types and channels as module singletons, registered in `world.ts`

Define each event type with `defineEvent` (like a simple component), then a channel for it.
`T` is inferred from the event class — no type argument:

```ts
// game/WallHit.ts
export const WallHit = defineEvent<{entity: Entity; tile: MapTile}>();

// game/wallHitChannel.ts
export const wallHitChannel = new EventChannel({event: WallHit, displayName: 'Wall hit'});
```

This mirrors `cameraQuery = new EntityQuery({components: [...]})` — direct `new` with an
options object. Pass an explicit `displayName`: a channel could in principle derive its name from
`this.event.name`, but every `defineEvent` class shares `.name === 'CustomEvent'` (a
`defineComponent`-inherited limitation), so the derived name would be useless. Absent an explicit
`displayName` the channel falls back to the literal string `'EventChannel'` (`EventChannel.name`),
exactly as `EntityQuery` falls back to its own class name.

```ts
// world.ts — onStart, alongside the queries and systems already registered
world.addEventChannel(wallHitChannel);
```

### Usage

```ts
// motionSystem.onUpdate — on a wall clip, push a collision event. The push happens DURING
// update(); buffering keeps it safe even while later systems iterate the same channel:
wallHitChannel.push(new WallHit({entity, tile}));

// any reader — iterate last frame's events (a stable, insertion-ordered snapshot):
for (let {entity, tile} of wallHitChannel.events) {
  // react to the collision
}
```

### Timing

- Channels swap at the **end** of `World.update()`.
- ECS-internal consumers iterate `channel.events` in their `onUpdate` → they see the events
  promoted by the previous frame's end-of-update swap (~1-frame latency, insertion-ordered).
- **Ordering** is guaranteed **per channel** (FIFO within a channel); channel swaps are
  independent, so there is no global ordering across channels; do not encode cross-channel
  causality.
- **Latency budget** (distinct from ordering): each channel hop costs **+1 frame**, because an
  event is invisible until its own channel's swap. A chain A (channel 1) → B (channel 2) → UI is
  therefore +2 frames before the bridge's own hop; budget accordingly in multi-system chains.
- A `WallHit` pushed inside `motionSystem.onUpdate` (push-during-update) lands in `#nextEvents` and
  becomes readable next frame, so a consumer (e.g. the `uiBridge`) reacts one frame after the
  collision: imperceptible.
- Because `pointertap` handlers fire asynchronously relative to the ticker, buffering naturally
  batches any off-cycle push into the next deterministic read.

## UI event system (`eventemitter3`)

A typed, synchronous bus for UI/presentation events, separate from the ECS channels.

```ts
// engine/ui/ui.ts
import {EventEmitter} from 'eventemitter3';

export type UIEventMap = {
  'menu:open': (payload: {menu: string}) => void;
  'menu:close': (payload: {menu: string}) => void;
  'world:wallHit': (payload: {tile: MapTile}) => void;
  // ...add UI events as needed
};

// module singleton (like `game` and `world`). The map-of-functions form (each key → listener
// signature) is eventemitter3 v5's typed-map convention. Note `game` does NOT use this form; it
// wraps `this.view` and types its `on/off/once` via `EventEmitter.EventNames`/`EventListener` over
// `pixi.FederatedEventMap`, so don't model this bus on `Game`'s emitter typing.
export const ui = new EventEmitter<UIEventMap>();
```

```ts
// a Pixi HUD container reacts immediately, just flashes a marker, no frame wait
ui.on('world:wallHit', ({tile}) => hitMarker.flashAt(tile));
```

Per-widget interaction (a clickable control invoking a local callback) is handled by the
widget itself — Pixi display objects already carry their own `eventemitter3` and can
listen to their own `pointertap`. The global `ui` bus is reserved for **broadcast /
decoupled** UI events and as the bridge's emit target; it is not required for simple
widget-local callbacks.

### Widgets and `Button`

`Button` (`engine/ui/Button.ts`) is the concrete realization of widget-local interaction:

```ts
export type ButtonOptions = {
  backgrounds: {normal: pixi.Container; hovered?: pixi.Container; active?: pixi.Container; disabled?: pixi.Container};
  children?: UiChild[];
  onClick?: (button: Button) => void;
  layout?: pixi.ContainerOptions['layout'];
  pressOffset?: number;
};
```

- **No base widget class.** A widget composes a Pixi `LayoutContainer`, exposed as
  `readonly view`; you nest widgets with `parent.view.addChild(child.view)`.
- It wires its own Pixi federated events on `this.view` (`pointerover` / `out` / `down` /
  `up` / `tap`), guards each transition by an internal `#state`, and on `pointertap` (when not
  disabled) calls `event.stopPropagation()` then `this.activate()`, which invokes the private
  `#onClick` callback. `activate()` is also the public focus/keyboard activation entry point. It
  also exposes `enable()` / `disable()` and a `state` getter.
- Because `pointertap` calls `stopPropagation()`, a click on a Button does **not** also reach
  the canvas-wide `game.on('pointertap')` move handler in `playerSystem` — clicking a button
  won't move the player. This is the desired interaction layering.

**Three UI event mechanisms — when to use which:**

| Mechanism | Use for |
| --- | --- |
| Raw federated events on `view` / `game.on` | Engine-internal: widget internals, canvas-wide raw input. |
| `Button.onClick` (widget-local callback) | "Control activated → do one thing." Bridges to ECS by calling `channel.push` inside the callback. |
| The global `ui` bus | Broadcast / decoupled UI-to-UI, and as the ECS→UI bridge's emit target. |

Litmus: *one sender → one local effect* ⇒ `onClick`; *one world fact → many UI reactions*
⇒ the `ui` bus.

A Button may also be **driven by** a `ui` event to `enable()` / `disable()` itself on game
state — but that `ui.on` subscription belongs to the **screen/HUD, not the Button** (keeps
the widget free of bus coupling), and is then subject to the cleanup rule below.

## Bridge

The two systems meet at exactly one place.

### UI → ECS (immediate → buffered): trivially safe

A synchronous UI/widget handler (a `Button.onClick`, or a `ui` listener) may push to a channel;
buffering absorbs the off-cycle timing exactly like a `pointertap` does today, so there is no
re-entrancy hazard. The handler obtains its ECS references by closure capture from the constructing
screen, or via an exported query (e.g. `playersQuery.getFirst()`); never a global helper.

For example, a "Stop" button that halts the player:

```ts
// game/HaltRequest.ts
export const HaltRequest = defineEvent<{entity: Entity}>();
// game/haltChannel.ts
export const haltChannel = new EventChannel({event: HaltRequest, displayName: 'Halt'});

// a "Stop" button in the HUD:
new Button({
  backgrounds: {/* normal, hovered, active, disabled */},
  onClick: () => haltChannel.push(new HaltRequest({entity: playersQuery.getFirst()})),
  // synchronous click → buffered push → consumed by motionSystem next frame. No re-entrancy.
});
```

`motionSystem` consumes it next frame and clears the entity's `motion.target` and zeroes its
velocity, the same reset it already runs on arrival. This channel is illustrative; it is not part of
the initial `wallHit` slice, and registering `haltChannel` in `world.ts` `onStart` follows the same
pattern as `wallHitChannel`.

### ECS → UI (buffered → immediate): a bridge drains channels and re-emits

```ts
// game/uiBridge.ts — a component-less reader System, registered in world.ts
export const uiBridge = new System({
  components: [],
  displayName: 'ECS->UI bridge',
  onUpdate: () => {
    for (let {tile} of wallHitChannel.events) {
      ui.emit('world:wallHit', {tile}); // → many HUD listeners react; all Pixi presentation
    }
  },
});
```

(A `components: []` System is fine; `System.update()` calls `onUpdate` unconditionally, regardless
of entity count.) "Immediate" here is only the **emit → render** step: because `uiBridge.onUpdate`
runs *inside* `World.update()`, it reads the snapshot promoted by the **previous** frame's swap, so
the UI sees an event the frame *after* it was pushed (~1-frame, imperceptible). The bridge is the
single seam that imports both `ui` and the ECS channels.

This is safe because UI handlers are pure Pixi presentation (they set display objects,
never spawn/kill entities), so they cannot trip the `#isUpdating` guard. If a handler
ever must mutate the world, `World.addEntity` already defers through `entitiesToBeAdded`
during updates, so it degrades gracefully.

## Lifecycle / cleanup

There are two distinct cleanup regimes — do not conflate them.

**Bus / raw-input listeners** (`ui.on`, `game.on`) are not owned by any display object, so
they leak unless removed. Screens must unsubscribe on hide — the same pattern `playerSystem`
already uses for its `pointertap` handler (`onAdd` subscribes via `game.on`, `onRemove`
unsubscribes via `game.off`).

For `ui.on` specifically, make this structural rather than per-screen discipline: give `GameScreen`
a subscription tracker (a `#uiSubscriptions: Array<() => void>` plus a `screen.subscribe(event,
handler)` that registers on `ui` and stores the off-thunk), drained automatically inside
`GameScreen.hide()` *before* `#onHide` runs (it already does lifecycle work there, e.g.
`clearFocus()`). Mandate that screens never call `ui.on` directly, always `screen.subscribe`. This
matters because `ui` is a module singleton and `onShow` runs on **every** show: an `ui.on` added in
`onShow` without a matching teardown both leaks (the closure outlives the hidden screen) and
**double-subscribes on re-show** (`eventemitter3` does not dedupe, so `world:wallHit` would fire
twice, then thrice). Putting the tracker on `GameScreen` makes that failure mode structurally
impossible instead of merely documented-against.

**Widget-owned Pixi listeners** (e.g. all of `Button`'s listeners on its own `view`) are freed
only by `view.destroy()`, **not** by `removeChild`. Today `mainScreen.onHide` only
`removeChild`s and reuses the same widget instances on the next `onShow`, so these listeners
correctly **persist** across hide/show — they must *not* be manually removed on hide. Remove
them only when a screen permanently discards a widget (via `view.destroy()`).

ECS channels need almost no such discipline: `stop()` `clear()`s both buffers and splices each
channel out. One invariant to respect, though: a channel must not be `push`-ed to while the world is
stopped; such an event would land in `#nextEvents`, never swap, and then surface as stale input on
the next start's first frame. In practice no current producer can do this (systems unsubscribe in
`onRemove`, which runs during `stop()`; hidden-screen widgets leave the scene graph and receive no
input), so the rule is simply: only push from listeners that are torn down before `stop()`.

## Trade-offs

**Pros**

- Each layer uses the timing model it actually wants (UI immediate, sim deterministic).
- Reuses `eventemitter3`, already in the tree and what Pixi itself uses.
- Events reuse the engine's data-class idiom (`defineEvent` mirrors `defineComponent`) and the
  channel infers its type from the event class — no explicit type argument, and no
  `getComponent` (events are read-once, stateless). A distinct `Event` tag keeps messages and
  entity-state type-separate.
- ECS channels are re-entrancy-safe. The load-bearing property: a consumer iterating
  `channel.events` may `push()` to that channel (or any channel) without corrupting the in-flight
  iteration, because reads hit `#currentEvents` and writes hit `#nextEvents`. This does **not** make
  a pushed event visible the same frame; by construction the earliest a pushed event is readable is
  the next frame's `events`. Reads are insertion-ordered per channel.
- The buffer **arrays** are allocation-free per frame (recycled across swaps). The event
  **instances** are not: each `push` heap-allocates one event (plus any objects constructed in its
  payload), which becomes garbage one swap later. Negligible for low-frequency events; for hot
  per-entity-per-frame events (collisions) consider pooling event instances or carrying primitive
  fields instead of freshly allocated objects.
- Module-singleton channels match the existing codebase grain; systems just `import`
  them — no `world.events` indirection.
- The single bridge seam keeps the simulation/presentation boundary auditable.

**Cons / risks**

- Two mental models — emitting on the wrong bus is possible; the layering rule must be a
  stated convention, ideally with the bridge as the only module importing both `ui` and
  the ECS channels.
- A channel that is `push`-ed to but never registered with the `World` will accumulate silently
  (never swaps). The `World` cannot detect this — an unregistered channel is invisible to it;
  if needed, `EventChannel` itself can warn in dev when `#nextEvents` grows past a threshold
  with no `swap()` ever observed, a self-contained heuristic with no `World` coupling.
- Consumption is poll-based (`events` in `onUpdate`); a reader that does not run a given
  frame misses that frame's snapshot.
- UI listener cleanup is manual (see the two regimes above).
- Registration order is immaterial to reads: systems read channels by import reference, and the
  end-of-update swap applies uniformly to all registered channels, so `addEventChannel` vs
  `addSystem` order in `onStart` does not matter.
- Hot-reload caveat: module-singleton channels don't survive HMR cleanly; a reload can split
  producer and consumer across old/new instances (events silently vanish); do a full reload after
  editing a channel module or `world.ts`.

**Debugging.** Channels are reachable like the rest of the world: `window.world.eventChannels`, each
carrying its `displayName`. That also makes the unregistered-accumulation hazard observable rather
than invisible.

## Open decisions

- Whether `EventChannel` should also expose an opt-in immediate `subscribe()` escape hatch
  for pure-presentation events, or keep channels strictly buffered/poll-only.
- Bridge placement is **decided**: the in-world reader `System` is the sole mechanism. A
  post-update ticker flush was considered and rejected; it would deliver same-frame but its latency
  varies nondeterministically with screen hide/show order (the ticker re-appends `world.update` on
  every `onShow`), which defeats the deterministic-sim goal for a ~1-frame gain.

## Suggested build order

1. Add `Event` + `defineEvent`, the minimal `EventChannel` + `World` registration/swap/clear, **and**
   the first event `WallHit` + `wallHitChannel`, pushed from `motionSystem`'s collision clip in the
   same slice (push-during-update + re-entrancy), proving the API against a real producer rather than
   generalizing first. Unit tests, written red-green: (a) swap latency: `push` is invisible via
   `events` until one `swap()`, visible the frame after; (b) FIFO order preserved across a swap;
   (c) `clear()` empties both buffers; (d) double-add throws "already added"; (e) re-add after
   `stop()` succeeds (proves the splice, not just `clear`); (f) pushing while iterating `events` does
   not mutate the current snapshot and appears next frame (re-entrancy).
2. Introduce the `ui` bus + `uiBridge` reader System; wire one HUD element / sound to `wallHitChannel`
   through it.
3. Add the `GameScreen` `ui`-subscription tracker (`screen.subscribe` + auto-drain in `hide()`), and
   route the step-2 subscription through it.
```