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

  /** Push an event onto the channel. Becomes current (visible via `events`) next frame. Safe to call mid-update. */
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

Mirror the existing `addEntityQuery` / `addSystem` registration style:

```ts
readonly eventChannels: EventChannel[] = [];

addEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
  if (this.eventChannels.includes(channel as EventChannel)) {
    throw new Error('Event channel was already added to the world!');
  }
  this.eventChannels.push(channel as EventChannel);
  return this;
}

removeEventChannel<T extends Constructor<Event>>(channel: EventChannel<T>) {
  let index = this.eventChannels.indexOf(channel as EventChannel);
  if (index < 0) {
    throw new Error("Event channel wasn't found!");
  }
  (channel as EventChannel).clear();
  this.eventChannels.splice(index, 1);
  return this;
}
```

At the **very end of `update()`**, after the existing `entitiesToBeAdded` /
`entitiesToBeDeleted` flush:

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

### Event types and channels as module singletons, registered in `world.ts`

Define each event type with `defineEvent` (like a simple component), then a channel for it.
`T` is inferred from the event class — no type argument:

```ts
// game/MoveIntent.ts
export const MoveIntent = defineEvent<{entity: Entity; target: Vector}>();
// game/WallHit.ts
export const WallHit = defineEvent<{entity: Entity; tile: MapTile}>();
// game/HealthChanged.ts — illustrative; pushed by a future health/combat system
export const HealthChanged = defineEvent<{value: number}>();

// game/moveIntentChannel.ts
export const moveIntentChannel = new EventChannel({event: MoveIntent, displayName: 'Move intent'});
// game/wallHitChannel.ts
export const wallHitChannel = new EventChannel({event: WallHit, displayName: 'Wall hit'});
// game/healthChangedChannel.ts
export const healthChangedChannel = new EventChannel({event: HealthChanged, displayName: 'Health changed'});
```

This mirrors `cameraQuery = new EntityQuery({components: [...]})` — direct `new` with an
options object. Pass an explicit `displayName`: `defineEvent`-made classes report
`.name === 'CustomEvent'`, so the channel can't derive a useful one (exactly as `EntityQuery`
defaults to its own class name).

```ts
// world.ts — onStart, alongside the queries and systems already registered
world.addEventChannel(moveIntentChannel);
world.addEventChannel(wallHitChannel);
world.addEventChannel(healthChangedChannel);
```

### Usage

```ts
// playerSystem — pointertap fires OUTSIDE update(); buffering batches it safely
moveIntentChannel.push(new MoveIntent({entity, target: new Vector(x, y)}));

// motionSystem.onUpdate — consume intents, then push collisions
for (let {entity, target} of moveIntentChannel.events) {
  entity.getComponent(MotionComponent).target = target;
}
// ...on wall clip:
wallHitChannel.push(new WallHit({entity, tile}));
```

### Timing

- Channels swap at the **end** of `World.update()`.
- ECS-internal consumers iterate `channel.events` in their `onUpdate` → they see **last
  frame's** events (~1-frame latency, insertion-ordered).
- Ordering is guaranteed **per channel** (FIFO within a channel); there is no global ordering
  across channels — do not encode cross-channel causality.
- Because `pointertap` handlers fire asynchronously relative to the ticker, buffering
  naturally batches off-cycle input writes into the next deterministic read.
- Behavior change to note: routing click-to-move through `moveIntentChannel` adds **exactly
  one frame** of input latency vs. today's direct `motion.target =` write in `playerSystem` —
  imperceptible for click-to-move.

## UI event system (`eventemitter3`)

A typed, synchronous bus for UI/presentation events, separate from the ECS channels.

```ts
// engine/ui/ui.ts
import {EventEmitter} from 'eventemitter3';

export type UIEventMap = {
  'menu:open': (payload: {menu: string}) => void;
  'menu:close': (payload: {menu: string}) => void;
  'hud:health': (payload: {value: number}) => void;
  // ...add UI events as needed
};

export const ui = new EventEmitter<UIEventMap>(); // module singleton, like `game`, `world`
```

```ts
// a Pixi HUD container reacts immediately — just sets a BitmapText, no frame wait
ui.on('hud:health', ({value}) => healthLabel.setText(`HP ${value}`));
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
  backgrounds: {normal: pixi.Container; hover?; pressed?; disabled?};
  onClick?: (button: Button) => void;
  layout?: pixi.ContainerOptions['layout'];
};
```

- **No base widget class.** A widget composes a Pixi `LayoutContainer`, exposed as
  `readonly view`; you nest widgets with `parent.view.addChild(child.view)`.
- It wires its own Pixi federated events on `this.view` (`pointerover` / `out` / `down` /
  `up` / `tap`), guards each transition by an internal `#state`, and on `pointertap` calls
  `event.stopPropagation()` then `this.onClick?.(this)`. It also exposes `enable()` /
  `disable()` and a `state` getter.
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

A synchronous UI/widget handler pushes to a channel; buffering absorbs the off-cycle
timing exactly like a `pointertap` does today.

```ts
// inside a Button.onClick (or a `ui` listener). The callback obtains its ECS references by
// closure capture from the constructing screen, or via the exported `playersQuery` — never a
// global helper:
new Button({
  backgrounds: {/* normal, hover, pressed, disabled */},
  onClick: () => {
    let entity = playersQuery.getFirst();
    moveIntentChannel.push(new MoveIntent({entity, target: someVector}));
    // → buffered → consumed by motionSystem next frame. No re-entrancy.
  },
});
```

### ECS → UI (buffered → immediate): a bridge drains channels and re-emits

```ts
// game/uiBridge.ts — a component-less reader System, registered in world.ts
export const uiBridge = new System({
  components: [],
  displayName: 'ECS->UI bridge',
  onUpdate: () => {
    for (let {value} of healthChangedChannel.events) {
      ui.emit('hud:health', {value});
    }
    for (let {tile} of wallHitChannel.events) {
      // play sound / flash a label — all Pixi presentation
    }
  },
});
```

This is safe because UI handlers are pure Pixi presentation (they set display objects,
never spawn/kill entities), so they cannot trip the `#isUpdating` guard. If a handler
ever must mutate the world, `World.addEntity` already defers through `entitiesToBeAdded`
during updates, so it degrades gracefully.

**Optional zero-lag / zero-coupling variant:** flush the bridge on the ticker *right
after* `world.update()` returns. Because channels swap at the end of `update()`,
`events` then holds **this** frame's events and the re-emit happens fully outside
`#isUpdating`:

```ts
game.app.ticker.add(() => uiBridge.flush()); // registered after world's ticker callback
```

Start with the System version (simpler, ~1-frame imperceptible lag); move to the post-update
flush only if same-frame delivery or full decoupling is needed. Caveat: the "registered after
world's ticker callback" ordering is fragile — screen hide/show re-appends `world.update` and
can reverse the order. If you adopt it, sequence both calls in one screen callback or use
explicit ticker priorities rather than relying on insertion order.

## Lifecycle / cleanup

There are two distinct cleanup regimes — do not conflate them.

**Bus / raw-input listeners** (`ui.on`, `game.on`) are not owned by any display object, so
they leak unless removed. Screens must unsubscribe on hide — the same pattern `playerSystem`
already uses for its `pointertap` handler (`onAdd` subscribes via `game.on`, `onRemove`
unsubscribes via `game.off`). Consider a small screen helper that tracks `ui.on` registrations
and drops them in `onHide`.

**Widget-owned Pixi listeners** (e.g. all of `Button`'s listeners on its own `view`) are freed
only by `view.destroy()`, **not** by `removeChild`. Today `mainScreen.onHide` only
`removeChild`s and reuses the same widget instances on the next `onShow`, so these listeners
correctly **persist** across hide/show — they must *not* be manually removed on hide. Remove
them only when a screen permanently discards a widget (via `view.destroy()`).

ECS channels need no such discipline: the `World` clears and drops them on `stop()`.

## Trade-offs

**Pros**

- Each layer uses the timing model it actually wants (UI immediate, sim deterministic).
- Reuses `eventemitter3`, already in the tree and what Pixi itself uses.
- Events reuse the engine's data-class idiom (`defineEvent` mirrors `defineComponent`) and the
  channel infers its type from the event class — no explicit type argument, and no
  `getComponent` (events are read-once, stateless). A distinct `Event` tag keeps messages and
  entity-state type-separate.
- ECS channels are re-entrancy-safe (the load-bearing property: `wallHit` is pushed *inside*
  `motionSystem.onUpdate` while later systems run the same frame — a single shared array would
  be mutated mid-iteration) and allocation-free per frame (array recycling). Reads are
  insertion-ordered per channel.
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

## Open decisions

- Whether `EventChannel` should also expose an opt-in immediate `subscribe()` escape hatch
  for pure-presentation events, or keep channels strictly buffered/poll-only.
- Bridge placement is **decided**: the in-world reader `System` is the default; the
  post-update ticker flush is a documented optional escalation if same-frame delivery is ever
  needed (mind its ticker-ordering caveat above).

## Suggested build order

1. Add `Event` + `defineEvent`, the first event type (`MoveIntent`), and the minimal
   `EventChannel` + `World` registration/swap/clear — **and** convert the `motion.target`
   click-to-move path to `moveIntentChannel` in the same slice, proving the API against a real
   consumer (push-outside-update) rather than generalizing first. Add unit tests for swap
   timing against the working conversion.
2. Add the `WallHit` event + `wallHitChannel`, pushed from `motionSystem`'s collision clip
   (exercises push-during-update + re-entrancy).
3. Introduce the `ui` bus + `uiBridge` reader System; wire one HUD element / sound to a
   gameplay event (`wallHitChannel`, or `healthChangedChannel`) through it.
4. Add a screen-level `ui`-subscription cleanup helper.
```