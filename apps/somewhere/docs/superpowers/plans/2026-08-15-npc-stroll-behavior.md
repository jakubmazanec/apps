# NPC Stroll Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NPCs with authored `stroll-x`/`stroll-y` Tiled properties walk back and forth between their spawn point and one destination, pausing 3–8 s at each end, freezing during dialogue, with their talk zone following them.

**Architecture:** A new `BehaviorComponent` (discriminated union, single `stroll` variant) holds the stroll state machine's data; a new `behaviorSystem` (registered right after `playerSystem`) ticks the state machine and writes `motion.target`, which the existing `motionSystem` seek-mode consumes — collision, arrival, animation, and facing all already work. `TriggerComponent` gains two offset fields so `triggerSystem` can re-anchor an NPC's talk-zone rect to its moving position.

**Tech Stack:** TypeScript (strict), pixi.js ECS engine (in-repo, `source/engine/`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-npc-stroll-behavior-design.md`

## Global Constraints

- Gates before merge: `npm run typecheck`, `npm run lint`, `npm test` (run from `apps/somewhere`).
- Wait range at each end: random **3000–8000 ms**, hardcoded, no authoring surface.
- Stroll offsets are authored **in tiles**; one tile = **16 art px**.
- Property names are exactly `stroll-x` and `stroll-y` (int, Tiled object properties).
- Validation is spawn-time and loud via `failUnsupported` (DEV throws, prod warns + degrades to a static NPC).
- Carry a `TODO(map-native authoring)` comment at the stroll-property read site in `objectFactories.ts`.
- No follower/attachment abstraction: the talk zone follows via two plain offset numbers and one re-anchor statement; nothing configurable.
- Codebase idioms: `let` for locals (even unreassigned), imports alphabetized with `.js` extensions, comments state constraints (not narration), commit messages are imperative sentences with no `feat:`-style prefix (e.g. "Add NPC stroll behavior design spec").
- `assets/map.tmx` is the authoring source; `public/map.json` is hand-mirrored (no Tiled app in this environment) — every map change edits **both**.

## File Structure

| File | Responsibility |
|---|---|
| `source/game/BehaviorComponent.ts` (new) | `StrollBehavior` type, `BehaviorComponent` class, `randomStrollWait()` helper |
| `source/game/behaviorSystem.ts` (new) | Per-frame stroll state machine over `BehaviorComponent + MotionComponent` |
| `source/game/objectFactories.ts` | npc factory: read/validate stroll props, attach the component, record trigger rect offsets |
| `source/game/TriggerComponent.ts` | Two new fields `rectOffsetX`/`rectOffsetY` (default 0) |
| `source/game/triggerSystem.ts` | Re-anchor a moving trigger's rect before the overlap test |
| `source/game/world.ts` | Register `behaviorSystem` right after `playerSystem` |
| `assets/map.tmx` + `public/map.json` | Mira's `stroll-x: 3`, `stroll-y: 0` |
| `tests/BehaviorComponent.test.ts` (new) | `randomStrollWait` range, component construction |
| `tests/behaviorSystem.test.ts` (new) | State machine: wait → walk → flip; dialogue freeze/resume |
| `tests/objectFactories.test.ts` | Stroll authoring/validation, rect offsets |
| `tests/triggerSystem.test.ts` | Rect tracks a moved NPC; motionless triggers stay put |

---

### Task 1: BehaviorComponent

**Files:**
- Create: `source/game/BehaviorComponent.ts`
- Test: `tests/BehaviorComponent.test.ts`

**Interfaces:**
- Consumes: `Component` from `source/engine/ecs/Component.js`, `Vector` from `source/engine/utilities/Vector.js`.
- Produces (used by Tasks 2 and 3):
  - `type StrollBehavior = {type: 'stroll'; home: Vector; destination: Vector; goal: 'home' | 'destination'; phase: 'waiting' | 'walking' | 'paused'; waitRemaining: number}`
  - `type Behavior = StrollBehavior`
  - `class BehaviorComponent extends Component` with field `behavior: Behavior`, constructor `new BehaviorComponent({behavior: Behavior})`
  - `function randomStrollWait(): number` — a fresh random wait in [3000, 8000) ms

- [ ] **Step 1: Write the failing test**

Create `tests/BehaviorComponent.test.ts`:

```ts
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Vector} from '../source/engine/utilities/Vector.js';
import {BehaviorComponent, randomStrollWait} from '../source/game/BehaviorComponent.js';

describe('BehaviorComponent', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('randomStrollWait spans 3000–8000 ms across the Math.random range', () => {
    vitest.spyOn(Math, 'random').mockReturnValue(0);

    expect(randomStrollWait()).toBe(3000);

    vitest.mocked(Math.random).mockReturnValue(0.5);

    expect(randomStrollWait()).toBe(5500);

    vitest.mocked(Math.random).mockReturnValue(0.999);

    expect(randomStrollWait()).toBeLessThan(8000);
  });

  test('carries the stroll behavior as given', () => {
    let behavior = {
      type: 'stroll' as const,
      home: new Vector(244, 180),
      destination: new Vector(292, 180),
      goal: 'destination' as const,
      phase: 'waiting' as const,
      waitRemaining: 4000,
    };

    expect(new BehaviorComponent({behavior}).behavior).toBe(behavior);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/BehaviorComponent.test.ts`
Expected: FAIL — cannot resolve `../source/game/BehaviorComponent.js`.

- [ ] **Step 3: Write the implementation**

Create `source/game/BehaviorComponent.ts`:

```ts
import {Component} from '../engine/ecs/Component.js';
import {type Vector} from '../engine/utilities/Vector.js';

// Hardcoded by design: stroll timing has no authoring surface.
const MIN_WAIT_MS = 3000;
const MAX_WAIT_MS = 8000;

// The degenerate case of NPC behavior ("dumb AI"): a discriminated union with
// a single variant today, so future behaviors slot in as new variants without
// renames.
export type StrollBehavior = {
  type: 'stroll';
  home: Vector; // spawn position (world px, entity position space)
  destination: Vector; // home + authored offset × 16
  goal: 'home' | 'destination'; // where the next/current walk heads
  phase: 'waiting' | 'walking' | 'paused';
  waitRemaining: number; // ms left in the current wait
};

export type Behavior = StrollBehavior;

export type BehaviorComponentOptions = {
  behavior: Behavior;
};

// Shared by the npc factory (the initial linger at spawn) and behaviorSystem
// (each arrival), so the two rolls cannot drift apart.
export function randomStrollWait(): number {
  return MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
}

export class BehaviorComponent extends Component {
  behavior: Behavior;

  constructor({behavior}: BehaviorComponentOptions) {
    super();

    this.behavior = behavior;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/BehaviorComponent.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add source/game/BehaviorComponent.ts tests/BehaviorComponent.test.ts
git commit -m "Add BehaviorComponent with the single stroll variant"
```

---

### Task 2: npc factory reads the stroll properties

**Files:**
- Modify: `source/game/objectFactories.ts` (the `npc` factory, lines 64–108, restructured)
- Test: `tests/objectFactories.test.ts`

**Interfaces:**
- Consumes: `BehaviorComponent`, `randomStrollWait`, `type Behavior`-compatible literal from Task 1.
- Produces: npc entities that carry a `BehaviorComponent` when both `stroll-x` and `stroll-y` (numbers, tile offsets) are authored; `home` is a **clone** of the spawn position (never the same `Vector` instance as `motion.position`, which `motionSystem` mutates in place); `destination = home + (stroll-x, stroll-y) × 16`; initial state `goal: 'destination'`, `phase: 'waiting'`, `waitRemaining: randomStrollWait()`. Also produces the `position` local computed **before** the component list — Task 4 relies on that ordering for the rect offsets.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('objectFactories', ...)` block in `tests/objectFactories.test.ts`, and add the import at the top (alphabetical order — right after the `assets` import):

```ts
import {BehaviorComponent} from '../source/game/BehaviorComponent.js';
```

```ts
  test('npc with stroll properties attaches a stroll behavior', () => {
    stubSpritesheetAssets();
    vitest.spyOn(Math, 'random').mockReturnValue(0.5);

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        x: 240,
        y: 176,
        width: 24,
        height: 28,
        properties: {dialogue: 'mira', 'stroll-x': 3, 'stroll-y': 0},
      }),
    );
    let {behavior} = npc.getComponent(BehaviorComponent);
    let {position} = npc.getComponent(MotionComponent);

    expect(behavior.type).toBe('stroll');
    expect(behavior.goal).toBe('destination');
    expect(behavior.phase).toBe('waiting');
    // Home is the spawn position by value, not the same (mutating) vector.
    expect(behavior.home).not.toBe(position);
    expect(behavior.home.x).toBe(244);
    expect(behavior.home.y).toBe(180);
    // Destination = home + (3, 0) tiles × 16 px.
    expect(behavior.destination.x).toBe(292);
    expect(behavior.destination.y).toBe(180);
    expect(behavior.waitRemaining).toBe(5500); // 3000 + 0.5 × 5000
  });

  test('npc without stroll properties stays static: no BehaviorComponent', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({id: 9, name: 'mira', type: 'npc', properties: {dialogue: 'mira'}}),
    );

    expect(npc.hasComponent(BehaviorComponent)).toBe(false);
  });

  test('npc with only one stroll property throws in DEV (static in prod)', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(
        createObject({
          id: 9,
          name: 'mira',
          type: 'npc',
          properties: {dialogue: 'mira', 'stroll-x': 3},
        }),
      ),
    ).toThrow(/stroll/);
  });

  test('npc with a non-numeric stroll property throws in DEV', () => {
    stubSpritesheetAssets();

    expect(() =>
      objectFactories.npc!(
        createObject({
          id: 9,
          name: 'mira',
          type: 'npc',
          properties: {dialogue: 'mira', 'stroll-x': '3', 'stroll-y': 0},
        }),
      ),
    ).toThrow(/stroll/);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/objectFactories.test.ts`
Expected: the four new tests FAIL (no `BehaviorComponent` attached, no validation); the eight existing tests still PASS.

- [ ] **Step 3: Implement**

In `source/game/objectFactories.ts`:

Add imports (alphabetical): `import {type Component} from '../engine/ecs/Component.js';` and `import {BehaviorComponent, randomStrollWait} from './BehaviorComponent.js';`

Add next to the existing `NPC_WIDTH`/`NPC_HEIGHT` constants:

```ts
// Stroll offsets are authored in tiles; one tile is 16 art px.
const TILE_SIZE = 16;
```

Replace the whole `npc` factory with (the dialogue validation and all existing comments are unchanged; the entity is now assembled *after* the position is known so components can depend on it):

```ts
  npc: (object) => {
    // The Tiled rect is the interaction zone; the sprite renders at its
    // center. Validation is spawn-time and loud (the door-target precedent):
    // a bad dialogue name leaves the NPC inert; dialogueSystem re-checks at
    // start and no-ops, so an inert NPC can never start a script.
    let {dialogue, sprite} = object.properties;

    if (typeof dialogue !== 'string' || !Object.hasOwn(dialogueRegistry, dialogue)) {
      failUnsupported(
        `NPC "${object.name}" (id ${object.id}) has a missing or unregistered "dialogue" property! Register the script in dialogueRegistry or fix the property in Tiled. The NPC is inert.`,
      );
    }

    let graphics = new GraphicsComponent({
      // A per-NPC spriteset (registered in assets.ts) comes from the
      // object's optional "sprite" property; an unknown name fails loudly
      // at spawn inside assets.spriteset(). Without the property, the NPC
      // keeps the single-frame npc placeholder sheet.
      spriteOptions: {
        assetName: typeof sprite === 'string' ? sprite : 'npc',
        spriteNames: [...NPC_SPRITE_NAMES],
      },
      boundingBox: new pixi.Rectangle(0, 0, NPC_WIDTH, NPC_HEIGHT),
    });
    let position = getPositionForBoundingBoxCenter(
      new Vector(object.x + object.width / 2, object.y + object.height / 2),
      graphics.boundingBox,
    );
    let components: Component[] = [
      new TriggerComponent({
        id: object.id,
        name: object.name,
        type: object.type,
        rect: new pixi.Rectangle(object.x, object.y, object.width, object.height),
        properties: object.properties,
      }),
      new MotionComponent({position, velocity: new Vector(0, 0)}),
      graphics,
    ];
    // TODO(map-native authoring): move the stroll destination into map-native
    // data (a Tiled point/path object referenced by the NPC) instead of raw
    // tile-offset numbers.
    let strollX = object.properties['stroll-x'];
    let strollY = object.properties['stroll-y'];

    if (strollX !== undefined || strollY !== undefined) {
      if (typeof strollX === 'number' && typeof strollY === 'number') {
        components.push(
          new BehaviorComponent({
            behavior: {
              type: 'stroll',
              // Cloned: motionSystem mutates motion.position in place, and
              // home must keep pointing at the spawn point.
              home: position.clone(),
              destination: new Vector(
                position.x + strollX * TILE_SIZE,
                position.y + strollY * TILE_SIZE,
              ),
              goal: 'destination',
              phase: 'waiting',
              waitRemaining: randomStrollWait(),
            },
          }),
        );
      } else {
        failUnsupported(
          `NPC "${object.name}" (id ${object.id}) has invalid stroll properties! Author both "stroll-x" and "stroll-y" as int tile offsets in Tiled, or neither. The NPC stays put.`,
        );
      }
    }

    return new Entity({components});
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/objectFactories.test.ts`
Expected: PASS — all 12 tests, including the pre-existing "npc builds the trigger zone plus a sprite centered on the rect" (the restructure must not change spawn positions).

- [ ] **Step 5: Commit**

```bash
git add source/game/objectFactories.ts tests/objectFactories.test.ts
git commit -m "Read stroll-x/stroll-y NPC properties into a stroll behavior"
```

---

### Task 3: behaviorSystem

**Files:**
- Create: `source/game/behaviorSystem.ts`
- Modify: `source/game/world.ts` (one import, one `addSystem` line)
- Test: `tests/behaviorSystem.test.ts`

**Interfaces:**
- Consumes: `BehaviorComponent`, `randomStrollWait`, `type StrollBehavior` (Task 1); `MotionComponent` (`target: Vector | undefined`, `velocity: Vector`); `dialogueQuery` + `DialogueComponent` (`active !== null` = dialogue running — the `playerSystem` pattern); `ticker.deltaMS`.
- Produces: `export const behaviorSystem: System` over `[BehaviorComponent, MotionComponent]`. Contract with `motionSystem`: this system only ever *sets* `motion.target` (a clone, so seek/clear can never touch the authored `home`/`destination` vectors) or clears it together with zeroing velocity; `motionSystem` clears `target` itself on arrival **and** when fully blocked, and that cleared target is what flips the stroll.

- [ ] **Step 1: Write the failing tests**

Create `tests/behaviorSystem.test.ts` (the module-singleton world setup copies `tests/playerSystem.test.ts`; no `GraphicsComponent`/`motionSystem` needed — the tests drive `motion.target` by hand to simulate arrival):

```ts
import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {BehaviorComponent, type StrollBehavior} from '../source/game/BehaviorComponent.js';
import {behaviorSystem} from '../source/game/behaviorSystem.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {dialogueQuery} from '../source/game/dialogueQuery.js';
import {flags} from '../source/game/flags.js';
import {MotionComponent} from '../source/game/MotionComponent.js';

function tick(deltaMS = 100): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

// dialogueQuery/behaviorSystem are module singletons: every test must
// world.stop() so the next one can register them again; afterEach stops via
// activeWorld even when an assertion throws mid-test.
let activeWorld: World | null = null;

function createWorld(overrides: Partial<StrollBehavior> = {}) {
  let motion = new MotionComponent({position: new Vector(100, 100), velocity: new Vector(0, 0)});
  let behaviorComponent = new BehaviorComponent({
    behavior: {
      type: 'stroll',
      home: new Vector(100, 100),
      destination: new Vector(148, 100),
      goal: 'destination',
      phase: 'waiting',
      waitRemaining: 5000,
      ...overrides,
    },
  });
  let npc = new Entity({components: [behaviorComponent, motion]});
  let dialogueEntity = new Entity({components: [new DialogueComponent({active: null})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(dialogueQuery)
        .addSystem(behaviorSystem)
        .addEntity(dialogueEntity)
        .addEntity(npc);
    },
  });

  activeWorld = world;

  return {
    world,
    motion,
    behavior: behaviorComponent.behavior,
    dialogueComponent: dialogueEntity.getComponent(DialogueComponent),
  };
}

function startDialogue(dialogueComponent: {active: unknown}) {
  dialogueComponent.active = new Dialogue({script: {start: {text: 'Hi.'}}, context: flags});
}

describe('behaviorSystem', () => {
  afterEach(() => {
    activeWorld?.stop();
    activeWorld = null;
    vitest.restoreAllMocks();
  });

  test('the wait counts down and holds while time remains', () => {
    let {world, motion, behavior} = createWorld({waitRemaining: 250});

    world.start();
    world.update(tick(100));

    expect(behavior.phase).toBe('waiting');
    expect(behavior.waitRemaining).toBe(150);
    expect(motion.target).toBeUndefined();
  });

  test('an expired wait starts the walk toward the goal', () => {
    let {world, motion, behavior} = createWorld({waitRemaining: 250});

    world.start();
    world.update(tick(100));
    world.update(tick(100));
    world.update(tick(100)); // 300 ms elapsed: expires mid-frame

    expect(behavior.phase).toBe('walking');
    expect(motion.target?.x).toBe(148);
    expect(motion.target?.y).toBe(100);
    // The issued target is a copy, so motionSystem consuming it can never
    // touch the authored destination.
    expect(motion.target).not.toBe(behavior.destination);
  });

  test('a live walk is left alone', () => {
    let {world, motion, behavior} = createWorld({phase: 'walking'});

    world.start();
    motion.target = new Vector(148, 100);
    world.update(tick(100));

    expect(behavior.phase).toBe('walking');
    expect(behavior.goal).toBe('destination');
    expect(motion.target.x).toBe(148);
  });

  test('a cleared target flips the goal and rolls a fresh 3–8 s wait', () => {
    vitest.spyOn(Math, 'random').mockReturnValue(0.5);

    let {world, motion, behavior} = createWorld({phase: 'walking'});

    world.start();
    motion.target = undefined; // motionSystem cleared it: arrived, or fully blocked
    world.update(tick(100));

    expect(behavior.goal).toBe('home');
    expect(behavior.phase).toBe('waiting');
    expect(behavior.waitRemaining).toBe(5500); // 3000 + 0.5 × 5000
  });

  test('an active dialogue freezes a mid-walk stroll and preserves facing', () => {
    let {world, motion, behavior, dialogueComponent} = createWorld({
      phase: 'walking',
      destination: new Vector(100, 148),
    });

    world.start();
    motion.target = new Vector(100, 148);
    motion.velocity.set(0, 1); // walking down: angle 90
    startDialogue(dialogueComponent);
    world.update(tick(100));

    expect(behavior.phase).toBe('paused');
    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);
    expect(motion.velocity.angle).toBe(90); // stored angle: still facing down
  });

  test('dialogue holds the wait timer', () => {
    let {world, behavior, dialogueComponent} = createWorld({waitRemaining: 250});

    world.start();
    startDialogue(dialogueComponent);
    world.update(tick(100));
    world.update(tick(100));

    expect(behavior.phase).toBe('waiting');
    expect(behavior.waitRemaining).toBe(250);
  });

  test('the interrupted stroll resumes toward the same goal after the dialogue', () => {
    let {world, motion, behavior, dialogueComponent} = createWorld({
      phase: 'walking',
      goal: 'home',
    });

    world.start();
    motion.target = new Vector(100, 100);
    startDialogue(dialogueComponent);
    world.update(tick(100)); // freeze

    expect(behavior.phase).toBe('paused');

    dialogueComponent.active = null;
    world.update(tick(100)); // resume

    expect(behavior.phase).toBe('walking');
    expect(behavior.goal).toBe('home');
    expect(motion.target?.x).toBe(100);
    expect(motion.target?.y).toBe(100);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/behaviorSystem.test.ts`
Expected: FAIL — cannot resolve `../source/game/behaviorSystem.js`.

- [ ] **Step 3: Implement the system**

Create `source/game/behaviorSystem.ts`:

```ts
import {System} from '../engine/ecs/System.js';
import {BehaviorComponent, randomStrollWait} from './BehaviorComponent.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueQuery} from './dialogueQuery.js';
import {MotionComponent} from './MotionComponent.js';

// The one piece motionSystem's seek mode is missing: something that sets
// motion.target. A small per-entity state machine on behavior.phase; walks end
// when motionSystem clears the target — on arrival and when fully blocked
// alike — so a blocked stroll self-heals into "give up, head back after the
// wait" with no pathfinding and no walking-in-place.
export const behaviorSystem = new System({
  displayName: 'Behavior system',
  components: [BehaviorComponent, MotionComponent],
  onUpdate: (ticker, system) => {
    let isDialogueActive =
      dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null;

    for (let entity of system.entities) {
      let {behavior} = entity.getComponent(BehaviorComponent);
      let motion = entity.getComponent(MotionComponent);
      let goalPoint = behavior.goal === 'home' ? behavior.home : behavior.destination;

      // Dialogue freeze first: interrupt a live walk; everything else —
      // wait timers included — holds until the dialogue ends.
      if (isDialogueActive) {
        if (behavior.phase === 'walking' && motion.target !== undefined) {
          motion.target = undefined;
          // set(0, 0) keeps the stored angle, so facing survives the freeze.
          motion.velocity.set(0, 0);
          behavior.phase = 'paused';
        }

        continue;
      }

      // The dialogue has ended: resume the interrupted stroll toward the
      // same goal.
      if (behavior.phase === 'paused') {
        behavior.phase = 'walking';
        motion.target = goalPoint.clone();

        continue;
      }

      if (behavior.phase === 'waiting') {
        behavior.waitRemaining -= ticker.deltaMS;

        if (behavior.waitRemaining <= 0) {
          behavior.phase = 'walking';
          // Cloned so motionSystem's consume/clear can never alias the
          // authored home/destination vectors.
          motion.target = goalPoint.clone();
        }

        continue;
      }

      // walking: a cleared target means the walk is over (arrived or fully
      // blocked). Flip the goal and rest.
      if (motion.target === undefined) {
        behavior.goal = behavior.goal === 'home' ? 'destination' : 'home';
        behavior.phase = 'waiting';
        behavior.waitRemaining = randomStrollWait();
      }
    }
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/behaviorSystem.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Register the system in the world**

In `source/game/world.ts`: add the import (alphabetical — right after the `import {audioEntity, ...} from './audio.js';` line):

```ts
import {behaviorSystem} from './behaviorSystem.js';
```

Then insert one line directly after the `world.addSystem(playerSystem);` line (before `playerActionSystem`):

```ts
    world.addSystem(behaviorSystem); // right after playerSystem, same reason: writes motion.target that motionSystem consumes this frame, and honors the same dialogue lock
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — the world-booting browser tests (`worldSpawn.browser.test.ts`, `Game.browser.test.ts`) still pass; no NPC has stroll properties yet, so the system iterates zero entities there.

- [ ] **Step 7: Commit**

```bash
git add source/game/behaviorSystem.ts source/game/world.ts tests/behaviorSystem.test.ts
git commit -m "Add behaviorSystem driving the two-point NPC stroll"
```

---

### Task 4: The talk zone follows the NPC

**Files:**
- Modify: `source/game/TriggerComponent.ts`
- Modify: `source/game/triggerSystem.ts` (top of the per-entity loop)
- Modify: `source/game/objectFactories.ts` (npc factory's `TriggerComponent` call)
- Test: `tests/triggerSystem.test.ts`, `tests/objectFactories.test.ts`

**Interfaces:**
- Consumes: the `position` local the Task 2 restructure computes before the component list.
- Produces: `TriggerComponentOptions` gains optional `rectOffsetX?: number` / `rectOffsetY?: number`; `TriggerComponent` gains public fields `rectOffsetX: number` / `rectOffsetY: number` defaulting to 0. `triggerSystem` re-anchors `rect.x/y = motion.position + offset` for any trigger entity that also has a `MotionComponent` — doors and zones have none and are untouched.

- [ ] **Step 1: Write the failing tests**

In `tests/triggerSystem.test.ts`, add below `createWorld`:

```ts
// An NPC-shaped trigger: rect authored at (240, 176, 24, 28), entity position
// (244, 180) — the real Mira numbers, so offsets are (−4, −4).
function createNpcWorld() {
  let playerMotion = new MotionComponent({
    position: new Vector(0, 0),
    velocity: new Vector(0, 0),
  });
  let player = new Entity({
    components: [
      new PlayerComponent({name: 'Test'}),
      playerMotion,
      stubComponent(GraphicsComponent, {boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
    ],
  });
  let npcMotion = new MotionComponent({
    position: new Vector(244, 180),
    velocity: new Vector(0, 0),
  });
  let npc = new Entity({
    components: [
      new TriggerComponent({
        id: 5,
        name: 'mira',
        type: 'npc',
        rect: new pixi.Rectangle(240, 176, 24, 28),
        properties: {},
        rectOffsetX: -4,
        rectOffsetY: -4,
      }),
      npcMotion,
    ],
  });
  let world = new World({
    onStart: (w) => {
      w.addEventChannel(triggerEnterChannel)
        .addEventChannel(triggerExitChannel)
        .addEntityQuery(playersQuery)
        .addSystem(triggerSystem)
        .addEntity(player)
        .addEntity(npc);
    },
  });

  activeWorld = world;

  return {world, playerMotion, npcMotion, trigger: npc.getComponent(TriggerComponent)};
}
```

And the tests, inside the existing `describe`:

```ts
  test('the rect tracks a moved NPC via its offsets', () => {
    let {world, npcMotion, trigger} = createNpcWorld();

    world.start();
    npcMotion.position.set(292, 180); // strolled 3 tiles east
    world.update(tick());

    expect(trigger.rect.x).toBe(288); // 292 − 4
    expect(trigger.rect.y).toBe(176); // 180 − 4
    expect(trigger.rect.width).toBe(24); // size untouched
    expect(trigger.rect.height).toBe(28);
  });

  test('the moved talk zone is what enter fires against', () => {
    let {world, npcMotion} = createNpcWorld();

    world.start();
    world.update(tick()); // seeds: outside

    npcMotion.position.set(4, 4); // rect re-anchors to (0, 0): onto the player
    world.update(tick());

    expect(triggerEnterChannel.events).toHaveLength(1);
  });

  test('a motionless trigger keeps its authored rect', () => {
    let {world, trigger} = createWorld({x: 0, y: 0}, new pixi.Rectangle(16, 0, 16, 16));

    world.start();
    world.update(tick());

    expect(trigger.getComponent(TriggerComponent).rect).toMatchObject({x: 16, y: 0});
  });
```

In `tests/objectFactories.test.ts`, add:

```ts
  test('npc records the rect offset from the entity position', () => {
    stubSpritesheetAssets();

    let npc = objectFactories.npc!(
      createObject({
        id: 9,
        name: 'mira',
        type: 'npc',
        x: 240,
        y: 176,
        width: 24,
        height: 28,
        properties: {dialogue: 'mira'},
      }),
    );
    let trigger = npc.getComponent(TriggerComponent);

    // Authored rect (240, 176) minus entity position (244, 180).
    expect(trigger.rectOffsetX).toBe(-4);
    expect(trigger.rectOffsetY).toBe(-4);
  });

  test('door triggers default the rect offsets to zero', () => {
    let door = objectFactories.door!(createObject({id: 7, type: 'door', x: 176, y: 176}));

    expect(door.getComponent(TriggerComponent).rectOffsetX).toBe(0);
    expect(door.getComponent(TriggerComponent).rectOffsetY).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/triggerSystem.test.ts tests/objectFactories.test.ts`
Expected: FAIL — TypeScript rejects `rectOffsetX` in the options object / the fields don't exist.

- [ ] **Step 3: Implement**

`source/game/TriggerComponent.ts` — add to the options type, the class fields, and the constructor:

```ts
export type TriggerComponentOptions = {
  id: number; // Tiled object id; door targets resolve against this
  name: string;
  type: string;
  rect: pixi.Rectangle; // map-space art px
  properties: Record<string, boolean | number | string>;
  // The rect's authored offset from the owning entity's position. Only the
  // npc factory passes these; doors and zones have no entity position to
  // follow and keep the 0 default.
  rectOffsetX?: number;
  rectOffsetY?: number;
};
```

In the class, add fields `rectOffsetX: number;` and `rectOffsetY: number;` (alphabetical with the others), and in the constructor destructure `rectOffsetX = 0, rectOffsetY = 0` and assign `this.rectOffsetX = rectOffsetX;` / `this.rectOffsetY = rectOffsetY;`.

`source/game/triggerSystem.ts` — at the top of the `for (let entity of system.entities)` loop, right after `let trigger = entity.getComponent(TriggerComponent);`:

```ts
      // A strolling NPC carries its talk zone: re-anchor the rect to the
      // just-resolved position (this system runs right after motionSystem, so
      // tracking is exact within the frame). Doors and zones have no
      // MotionComponent and keep their authored rect.
      let motion = entity.getComponent(MotionComponent);

      if (motion !== undefined) {
        trigger.rect.x = motion.position.x + trigger.rectOffsetX;
        trigger.rect.y = motion.position.y + trigger.rectOffsetY;
      }
```

(`MotionComponent` is already imported there for the player lookup. Rename the loop-local if needed to avoid shadowing — the player's motion is destructured as `{position}` at the top, so `motion` is free.)

`source/game/objectFactories.ts` — in the npc factory's `new TriggerComponent({...})` (Task 2's restructure already placed the components list after the `position` computation, so `position` is in scope), add:

```ts
        rectOffsetX: object.x - position.x,
        rectOffsetY: object.y - position.y,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/triggerSystem.test.ts tests/objectFactories.test.ts`
Expected: PASS — all tests in both files, including the four pre-existing triggerSystem tests (their triggers have no motion, so behavior is unchanged).

- [ ] **Step 5: Commit**

```bash
git add source/game/TriggerComponent.ts source/game/triggerSystem.ts source/game/objectFactories.ts tests/triggerSystem.test.ts tests/objectFactories.test.ts
git commit -m "Re-anchor a moving NPC's talk zone to its position"
```

---

### Task 5: Author Mira's stroll in the map, run the gates

**Files:**
- Modify: `assets/map.tmx` (object id 5, `mira`, line ~199)
- Modify: `public/map.json` (object id 5 in the object layer, `"name": "mira"`)

**Interfaces:**
- Consumes: the `stroll-x`/`stroll-y` reading from Task 2. Mira spawns at position (244, 180); with `stroll-x: 3`, `stroll-y: 0` her destination is (292, 180) — 3 tiles east, open ground away from the hut door.
- Produces: the shipped map data. `assets/map.tmx` is authoring truth, `public/map.json` is the hand-mirrored runtime copy (documented workflow; no Tiled app in this environment). Both files must stay in sync.

- [ ] **Step 1: Edit `assets/map.tmx`**

In the mira object (id 5), extend the `<properties>` block (property order alphabetical, matching Tiled's output):

```xml
  <object id="5" name="mira" type="npc" x="240" y="176" width="24" height="28">
   <properties>
    <property name="dialogue" value="mira"/>
    <property name="sprite" value="mira"/>
    <property name="stroll-x" type="int" value="3"/>
    <property name="stroll-y" type="int" value="0"/>
   </properties>
  </object>
```

- [ ] **Step 2: Mirror into `public/map.json`**

In the mira object (`"id": 5`), extend the `"properties"` array (after the `sprite` entry, keeping alphabetical order):

```json
            {
              "name": "stroll-x",
              "type": "int",
              "value": 3
            },
            {
              "name": "stroll-y",
              "type": "int",
              "value": 0
            }
```

(`int` properties are already supported end to end: `tiledPropertySchema` accepts them and `normalizeProperties` passes the number through.)

- [ ] **Step 3: Verify the map still parses and the world still boots**

Run: `npx vitest run tests/exportedAssets.test.ts tests/mapSystem.test.ts tests/Map.test.ts`
Expected: PASS — the runtime schema accepts the new int properties.

- [ ] **Step 4: Run the full merge gates**

Run, in order, from `apps/somewhere`:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all three PASS. (`npm test` includes the browser projects; Mira now carries a `BehaviorComponent`, but her first stroll starts after a 3–8 s wait, far beyond what any browser test simulates.)

- [ ] **Step 5 (optional, manual): Watch her stroll**

Run: `npm run develop` and open `http://localhost:5000`. Expected: Mira lingers 3–8 s, walks 3 tiles east with the walking animation, lingers, walks back, repeats; talking to her mid-walk freezes her (facing preserved) and she resumes after the dialogue; her talk prompt still triggers at her current spot.

- [ ] **Step 6: Commit**

```bash
git add assets/map.tmx public/map.json
git commit -m "Author Mira's two-point stroll in the map"
```

---

## Self-Review

- **Spec coverage:** `BehaviorComponent` + initial state → Task 1/2; authoring & loud validation (both/one/non-number/absent) → Task 2; state machine incl. dialogue freeze, resume, flip-on-cleared-target, `Math.random` spied in tests → Task 3; world registration right after `playerSystem` → Task 3 Step 5; talk-zone offsets + re-anchor, doors/zones untouched → Task 4; Mira's map data in both tmx and json → Task 5; `TODO(map-native authoring)` comment → Task 2; full gates → Task 5. No gaps found.
- **Placeholder scan:** every code step carries the actual code; no TBDs.
- **Type consistency:** `randomStrollWait()` (Tasks 1→2→3), `StrollBehavior`/`Behavior` (Tasks 1→2→3), `rectOffsetX`/`rectOffsetY` (Task 4 across component, system, factory, tests) — names and shapes match throughout.
