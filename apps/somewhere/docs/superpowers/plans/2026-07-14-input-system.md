# Input System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An action-mapping input layer (`Input` + `inputSystem` + `InputComponent`) that translates keyboard/pointer events into per-frame polled state for ECS systems, with the demo's `playerSystem` migrated to WASD movement plus the existing tap-to-move.

**Architecture:** A new `source/engine/input/` module holds a double-buffered `Input` class (live listener state snapshotted once per sim step by `inputSystem`, the first system in world order), discovered by game systems through a singleton entity + query — mirroring the camera pattern file-for-file. The existing UI/focus keyboard stack is untouched except that its inline text-entry check moves into a shared `isTextEntryTarget` predicate.

**Tech Stack:** TypeScript (strict), pixi.js 8 (types + `pointertap` only), vitest + happy-dom, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-14-input-system-design.md` (T1.1 of the engine review).

## Global Constraints

- All commands run from `apps/somewhere/` (the package root; Node `^24.5.0`, npm).
- Single-file tests: `npx vitest run tests/<file>.test.ts`. Full gates before every commit: `npm test`, `npm run typecheck`, `npm run lint`.
- House style (copy the neighboring files, not generic TS style): `let` for locals (even when never reassigned), options-object constructors, `#`-private fields, import specifiers end in `.js`, error messages end with `!`, one class/system/component/query per file, module-level `System`/`EntityQuery` singletons.
- Commit messages are plain imperative sentences with no conventional-commit prefix (e.g. `Make deferred entity adds idempotent`).
- Binding grammar: bare `KeyboardEvent.code` values only; any code containing `+` throws at construction (the focusKeys `Shift+` grammar is deliberately NOT supported here).
- Demo bindings (exact names): `move-up`/`move-down`/`move-left`/`move-right` = `KeyW`/`KeyS`/`KeyA`/`KeyD`, `move-to` = pointer tap. WASD only — arrow keys stay with UI focus navigation.
- `MAX_SPEED = 4`, exported from `source/game/motionSystem.ts`, used by both the target-path clamp and the keyboard path.
- `inputSystem` has `displayName: 'Input system'` and is added **first** in world system order.
- Do not touch `source/game/pauseFlow.ts`, the focus-navigation logic in `Game.ts` (beyond the one predicate swap), or `EventChannel` — taps deliberately do not flow through event channels.

## File Structure

| File | Responsibility |
| --- | --- |
| Create `source/engine/ui/isTextEntryTarget.ts` | Shared predicate: does a keyboard event target a text-entry element? Lives in `ui/` next to `TextInput` (the module that creates the hidden `<input>`), in its own file so `Input` doesn't drag `TextInput`'s pixi imports into its module graph. |
| Modify `source/engine/app/Game.ts` | focusKeys handler calls the predicate instead of its inline `instanceof` check. |
| Create `source/engine/input/Input.ts` | `InputBinding` type + `Input` class: listeners, double-buffered snapshots, tap latch, `pressed`/`held`/`released`/`tapPosition`. |
| Create `source/engine/input/InputComponent.ts` | `defineComponent<{input: Input}>()` — discoverability only. |
| Create `source/engine/input/inputSystem.ts` | Calls `input.update()` exactly once per world update. |
| Create `source/game/input.ts` | Demo `Input` instance + `inputEntity` (mirrors `camera.ts`). |
| Create `source/game/inputQuery.ts` | Mirrors `cameraQuery.ts`. |
| Modify `source/game/world.ts` | Register query/system/entity; `inputSystem` first; `playerSystem` before `motionSystem`. |
| Modify `source/game/gameScreen.ts` | `attach` on show, `detach` on hide. |
| Modify `source/game/motionSystem.ts` | Export `MAX_SPEED`, use it in the clamp. |
| Modify `source/game/playerSystem.ts` | Delete listener plumbing; poll input in `onUpdate`. |
| Create `tests/isTextEntryTarget.test.ts`, `tests/Input.test.ts`, `tests/inputSystem.test.ts`, `tests/playerSystem.test.ts` | One test file per module, top-level `tests/`, matching the suite. |

---

### Task 1: `isTextEntryTarget` predicate + `Game` migration

**Files:**
- Create: `source/engine/ui/isTextEntryTarget.ts`
- Modify: `source/engine/app/Game.ts:276-281`
- Test: `tests/isTextEntryTarget.test.ts` (new), `tests/Game.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: nothing.
- Produces: `isTextEntryTarget(event: Event): boolean` — imported later by `Input` (Task 2) as `../ui/isTextEntryTarget.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/isTextEntryTarget.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {isTextEntryTarget} from '../source/engine/ui/isTextEntryTarget.js';

describe('isTextEntryTarget', () => {
  test('is true for a keyboard event targeting a DOM input element', () => {
    let input = document.createElement('input');

    document.body.append(input);

    let event = new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true});

    input.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBe(true);

    input.remove();
  });

  test('is false for a keyboard event targeting anything else', () => {
    let event = new KeyboardEvent('keydown', {code: 'KeyW'});

    window.dispatchEvent(event);

    expect(isTextEntryTarget(event)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/isTextEntryTarget.test.ts`
Expected: FAIL — `Cannot find module` / failed to resolve `source/engine/ui/isTextEntryTarget.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/ui/isTextEntryTarget.ts`:

```ts
/**
 * Whether a keyboard event targets a text-entry element, i.e. every key
 * belongs to the element and keyboard consumers must stand down. `TextInput`
 * drives its editing through a hidden DOM `<input>`; this predicate lives next
 * to it so the module that creates that element owns the knowledge of what
 * counts as one. Both `Game`'s focus-key handler and `Input`'s key listeners
 * call it.
 */
export function isTextEntryTarget(event: Event): boolean {
  return event.target instanceof HTMLInputElement;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/isTextEntryTarget.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Migrate the focusKeys handler in `Game.ts`**

In `source/engine/app/Game.ts`, add the import after the pixi-tools imports (around line 6; `npm run lint` confirms exact ordering):

```ts
import {isTextEntryTarget} from '../ui/isTextEntryTarget.js';
```

Then replace the inline check inside `addRef`'s `handleKeyDown` (currently line 279):

```ts
      let handleKeyDown = (event: KeyboardEvent) => {
        if (event.target instanceof HTMLInputElement) {
          return;
        }
```

becomes:

```ts
      let handleKeyDown = (event: KeyboardEvent) => {
        if (isTextEntryTarget(event)) {
          return;
        }
```

Keep the existing comment above the handler unchanged.

- [ ] **Step 6: Run the Game tests**

Run: `npx vitest run tests/Game.test.ts`
Expected: PASS — the existing test `ignores keys while a DOM input element has focus` now exercises the predicate.

- [ ] **Step 7: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add source/engine/ui/isTextEntryTarget.ts source/engine/app/Game.ts tests/isTextEntryTarget.test.ts
git commit -m "Share the text-entry guard between focus keys and future input consumers"
```

---

### Task 2: `Input` class — keyboard core

**Files:**
- Create: `source/engine/input/Input.ts`
- Test: `tests/Input.test.ts`

**Interfaces:**
- Consumes: `isTextEntryTarget` (Task 1), `Vector` (`source/engine/utilities/Vector.ts`).
- Produces: `type InputBinding = {keys?: string[]}` (Task 3 adds `pointerTap`), `class Input` with `constructor({bindings}: {bindings: Record<string, InputBinding>})`, `attach(view: pixi.Container): void`, `detach(): void`, `update(): void`, `pressed(action: string): boolean`, `held(action: string): boolean`, `released(action: string): boolean`. Task 4's `InputComponent` stores an `Input`; Task 6's `playerSystem` polls it.

Semantics being implemented (spec §2): listeners maintain a **live** down-set that may mutate at any moment; `update()` is the step boundary — it shifts current → previous and snapshots the live set (the `EventChannel.swap()` double-buffer flip, reusing the retired set so there is no per-step allocation). Reads diff the snapshots, never the live set: `held` = in current; `pressed` = in current ∧ not in previous (action-level: *any* bound key); `released` = the reverse. Pressing-and-releasing entirely between two steps therefore yields no edge — that is what makes pause resumption correct for free. `blur` clears the live set (released edges next step). Keyboard events are ignored when `isTextEntryTarget(event)` is true. `preventDefault()` fires only for bound codes.

- [ ] **Step 1: Write the failing tests**

Create `tests/Input.test.ts`:

```ts
import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Input} from '../source/engine/input/Input.js';

// Input's only pixi surface is `view.on`/`view.off`, so a recording fake
// stands in for a real container.
function createView() {
  let handlers: Record<string, Array<(event: unknown) => void>> = {};

  return {
    handlers,
    on(event: string, handler: (event: unknown) => void) {
      (handlers[event] ??= []).push(handler);

      return this;
    },
    off(event: string, handler: (event: unknown) => void) {
      handlers[event] = (handlers[event] ?? []).filter((existing) => existing !== handler);

      return this;
    },
  };
}

const DEFAULT_BINDINGS = {
  'move-up': {keys: ['KeyW', 'ArrowUp']},
  'move-left': {keys: ['KeyA']},
};

// Attached inputs hold window listeners; every test must detach or keydowns
// leak into the next test. The helper tracks them for afterEach; tests that
// exercise detach themselves must not use the helper.
let attachedInputs: Input[] = [];

function createAttachedInput(bindings: ConstructorParameters<typeof Input>[0]['bindings'] = DEFAULT_BINDINGS) {
  let view = createView();
  let input = new Input({bindings});

  input.attach(view as unknown as pixi.Container);
  attachedInputs.push(input);

  return {input, view};
}

function press(code: string) {
  let event = new KeyboardEvent('keydown', {code, cancelable: true});

  window.dispatchEvent(event);

  return event;
}

function release(code: string) {
  let event = new KeyboardEvent('keyup', {code, cancelable: true});

  window.dispatchEvent(event);

  return event;
}

afterEach(() => {
  for (let input of attachedInputs) {
    input.detach();
  }

  attachedInputs = [];
});

describe('Input keyboard edges', () => {
  test('pressed → held → released sequencing across steps', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(true);
    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);

    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);

    release('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(true);

    input.update();

    expect(input.released('move-up')).toBe(false);
  });

  test('two keys on one action: releasing one keeps it held with no released edge', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    press('ArrowUp');
    input.update();

    expect(input.pressed('move-up')).toBe(true);

    release('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);
    expect(input.pressed('move-up')).toBe(false);

    release('ArrowUp');
    input.update();

    expect(input.released('move-up')).toBe(true);
  });

  test('window blur clears the down-set: released edge on the next step', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);

    window.dispatchEvent(new Event('blur'));
    input.update();

    expect(input.held('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(true);
  });

  test('keyboard events targeting a text-entry element are ignored', () => {
    let {input} = createAttachedInput();
    let field = document.createElement('input');

    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true, cancelable: true}));
    input.update();

    expect(input.held('move-up')).toBe(false);

    field.remove();
  });

  test('preventDefault fires only for bound codes', () => {
    createAttachedInput();

    expect(press('KeyW').defaultPrevented).toBe(true);
    expect(press('KeyQ').defaultPrevented).toBe(false);
  });

  test('an unknown action name throws', () => {
    let {input} = createAttachedInput();

    expect(() => input.pressed('warp')).toThrow('Unknown action "warp"!');
    expect(() => input.held('warp')).toThrow('Unknown action "warp"!');
    expect(() => input.released('warp')).toThrow('Unknown action "warp"!');
  });

  test('a binding code containing "+" throws at construction', () => {
    expect(() => new Input({bindings: {jump: {keys: ['Shift+KeyW']}}})).toThrow(
      'Invalid key code "Shift+KeyW" for action "jump"',
    );
  });

  test('strict attach/detach lifecycle and listener removal', () => {
    // Not via the helper: this test manages its own detach.
    let view = createView();
    let input = new Input({bindings: DEFAULT_BINDINGS});

    expect(() => input.detach()).toThrow('Input is not attached!');

    input.attach(view as unknown as pixi.Container);

    expect(() => input.attach(view as unknown as pixi.Container)).toThrow(
      'Input is already attached!',
    );

    input.detach();

    // Listeners are gone and state was cleared: a press after detach never lands.
    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(false);

    // A detached input can be re-attached cleanly.
    input.attach(view as unknown as pixi.Container);
    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);

    input.detach();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Input.test.ts`
Expected: FAIL — cannot resolve `source/engine/input/Input.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/input/Input.ts`:

```ts
import type * as pixi from 'pixi.js';

import {isTextEntryTarget} from '../ui/isTextEntryTarget.js';

export type InputBinding = {
  /** `KeyboardEvent.code` values; no modifier syntax (Shift itself can be an action). */
  keys?: string[];
};

export type InputOptions = {
  bindings: Record<string, InputBinding>;
};

/**
 * Action map from devices to per-frame polled state. Listeners accumulate raw
 * device state between frames; `update()` is the step boundary that snapshots
 * it (the same double-buffer flip as `EventChannel.swap()`). Reads diff the
 * snapshots, so they are stable for the whole step.
 */
export class Input {
  readonly #bindings: ReadonlyMap<string, InputBinding>;
  readonly #boundCodes: ReadonlySet<string>;

  /** Live set mutated by listeners; may change at any moment between steps. */
  readonly #downCodes = new Set<string>();

  // Double-buffered snapshots, flipped once per step by `update()`; reads diff
  // these, never `#downCodes`.
  #currentCodes = new Set<string>();
  #previousCodes = new Set<string>();

  #view: pixi.Container | null = null;
  #disposables = new DisposableStack();

  constructor({bindings}: InputOptions) {
    let boundCodes = new Set<string>();

    for (let [action, binding] of Object.entries(bindings)) {
      for (let code of binding.keys ?? []) {
        if (code.includes('+')) {
          throw new Error(
            `Invalid key code "${code}" for action "${action}": bindings take bare KeyboardEvent.code values, not the focusKeys "Shift+" grammar — bind the modifier's own code (e.g. "ShiftLeft") instead!`,
          );
        }

        boundCodes.add(code);
      }
    }

    this.#bindings = new Map(Object.entries(bindings));
    this.#boundCodes = boundCodes;
  }

  attach(view: pixi.Container): void {
    if (this.#view) {
      throw new Error('Input is already attached!');
    }

    this.#view = view;
    this.#disposables = new DisposableStack();

    let handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event)) {
        return;
      }

      if (!this.#boundCodes.has(event.code)) {
        return;
      }

      // Shared convention with the focus layer: only bound codes are consumed.
      event.preventDefault();
      this.#downCodes.add(event.code);
    };

    let handleKeyUp = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event)) {
        return;
      }

      this.#downCodes.delete(event.code);
    };

    // Keys released while the window is unfocused never send a keyup; clearing
    // here turns them into released edges on the next step instead of stuck keys.
    let handleBlur = () => {
      this.#downCodes.clear();
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);
    globalThis.addEventListener('blur', handleBlur);

    this.#disposables.defer(() => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
      globalThis.removeEventListener('blur', handleBlur);
    });
  }

  detach(): void {
    if (!this.#view) {
      throw new Error('Input is not attached!');
    }

    this.#disposables.dispose();
    this.#view = null;

    // The next attach starts clean: nothing carries over between sessions.
    this.#downCodes.clear();
    this.#currentCodes.clear();
    this.#previousCodes.clear();
  }

  /** @internal Called by `inputSystem` once per world update; one call = one sim step. */
  update(): void {
    // Flip the double buffer, reusing the retired set — no per-step allocation.
    let recycled = this.#previousCodes;

    this.#previousCodes = this.#currentCodes;
    recycled.clear();

    for (let code of this.#downCodes) {
      recycled.add(code);
    }

    this.#currentCodes = recycled;
  }

  /** Whether the action went down this step. */
  pressed(action: string): boolean {
    let binding = this.#getBinding(action);

    return this.#isDown(binding, this.#currentCodes) && !this.#isDown(binding, this.#previousCodes);
  }

  /** Whether the action is down now. */
  held(action: string): boolean {
    return this.#isDown(this.#getBinding(action), this.#currentCodes);
  }

  /** Whether the action went up this step. */
  released(action: string): boolean {
    let binding = this.#getBinding(action);

    return !this.#isDown(binding, this.#currentCodes) && this.#isDown(binding, this.#previousCodes);
  }

  #getBinding(action: string): InputBinding {
    let binding = this.#bindings.get(action);

    if (!binding) {
      throw new Error(`Unknown action "${action}"!`);
    }

    return binding;
  }

  #isDown(binding: InputBinding, codes: ReadonlySet<string>): boolean {
    return (binding.keys ?? []).some((code) => codes.has(code));
  }
}
```

Notes for the implementer:
- `DisposableStack` is a global in Node 24 / the browser targets; `TextInput.ts` already uses it bare — no import.
- `globalThis.addEventListener` matches the `Game.ts` keydown precedent (`globalThis` IS `window` in the browser; the spec's "window keydown/keyup/blur" is the same thing without lint churn).
- The guard applies to both `keydown` and `keyup` — the spec says keyboard *events* are ignored while a text-entry element is targeted.
- `pixi.Container` is a type-only import; nothing in this module touches pixi at runtime, which is what lets the tests use a plain fake view.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/Input.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add source/engine/input/Input.ts tests/Input.test.ts
git commit -m "Add the Input action map with double-buffered keyboard edges"
```

---

### Task 3: `Input` class — pointer-tap support

**Files:**
- Modify: `source/engine/input/Input.ts`
- Test: `tests/Input.test.ts` (append a describe block)

**Interfaces:**
- Consumes: Task 2's `Input`.
- Produces: `InputBinding.pointerTap?: boolean`; `readonly tapPosition: Vector` (getter) on `Input`; tap semantics folded into `pressed`/`released`. Task 6's `playerSystem` reads `input.tapPosition` after `input.pressed('move-to')`.

Semantics (spec §2): the `pointertap` listener buffers the tap **position by copy** (pixi reuses federated event objects); multiple taps in one frame collapse to one, last position wins. `update()` drains the buffer into a per-step latch and sets `tapPosition`. On the latched step a `pointerTap`-bound action reads `pressed = true`, `released = true`, `held = false` — the tap never enters the down-set. An action bound to both `keys` and `pointerTap` needs no special rule: the definitions already union the two sources. `attach()` registers **no** `pointermove`/`pointerdown` listeners.

- [ ] **Step 1: Write the failing tests**

Append to `tests/Input.test.ts`. First extend the fake view with a `tap` helper — replace `createView`'s returned object with:

```ts
  return {
    handlers,
    on(event: string, handler: (event: unknown) => void) {
      (handlers[event] ??= []).push(handler);

      return this;
    },
    off(event: string, handler: (event: unknown) => void) {
      handlers[event] = (handlers[event] ?? []).filter((existing) => existing !== handler);

      return this;
    },
    // Simulates pixi dispatching 'pointertap' and returns the event object so
    // tests can mutate it afterwards (pixi reuses federated events).
    tap(x: number, y: number) {
      let event = {global: {x, y}};

      for (let handler of handlers['pointertap'] ?? []) {
        handler(event);
      }

      return event;
    },
  };
```

Then add the describe block:

```ts
const TAP_BINDINGS = {
  'move-up': {keys: ['KeyW']},
  'move-to': {pointerTap: true},
  'interact': {keys: ['KeyE'], pointerTap: true},
};

describe('Input taps', () => {
  test('a tap is instantaneous: pressed and released on its step, never held', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(10, 20);
    input.update();

    expect(input.pressed('move-to')).toBe(true);
    expect(input.released('move-to')).toBe(true);
    expect(input.held('move-to')).toBe(false);
    expect(input.tapPosition.x).toBe(10);
    expect(input.tapPosition.y).toBe(20);

    input.update();

    expect(input.pressed('move-to')).toBe(false);
    expect(input.released('move-to')).toBe(false);
  });

  test('multiple taps in one step collapse to one edge, last position wins', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(1, 2);
    view.tap(3, 4);
    input.update();

    expect(input.pressed('move-to')).toBe(true);
    expect(input.tapPosition.x).toBe(3);
    expect(input.tapPosition.y).toBe(4);

    input.update();

    expect(input.pressed('move-to')).toBe(false);
  });

  test('tapPosition is the tap-time position: later event mutation cannot retarget it', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    // pixi reuses federated event objects; a pointer move before the next
    // update() mutates `global`. The buffered copy must not follow it.
    let event = view.tap(10, 20);

    event.global.x = 999;
    event.global.y = 999;
    input.update();

    expect(input.tapPosition.x).toBe(10);
    expect(input.tapPosition.y).toBe(20);
  });

  test('taps do not leak into key-only actions; a dual-bound action unions both sources', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(5, 5);
    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.pressed('interact')).toBe(true);
    expect(input.held('interact')).toBe(false);

    press('KeyE');
    input.update();

    expect(input.pressed('interact')).toBe(true);
    expect(input.held('interact')).toBe(true);
    expect(input.released('interact')).toBe(false);
  });

  test('attach registers pointertap and nothing else on the view', () => {
    let {view} = createAttachedInput(TAP_BINDINGS);

    expect(Object.keys(view.handlers)).toEqual(['pointertap']);
    expect(view.handlers['pointertap']).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/Input.test.ts`
Expected: FAIL — TS error on `pointerTap` in `TAP_BINDINGS` / `tapPosition` missing; the new tests all fail, Task 2's still pass.

- [ ] **Step 3: Extend the implementation**

In `source/engine/input/Input.ts`:

Add the `Vector` import:

```ts
import {Vector} from '../utilities/Vector.js';
```

Extend `InputBinding`:

```ts
export type InputBinding = {
  /** `KeyboardEvent.code` values; no modifier syntax (Shift itself can be an action). */
  keys?: string[];
  /** Bound to pixi `pointertap` on the attached view. */
  pointerTap?: boolean;
};
```

Add the tap fields after the snapshot fields:

```ts
  // Tap buffer (written by the listener, position stored by copy) and the
  // per-step latch `update()` drains it into. The latch never enters the
  // down-set: a tap is pressed+released on its step and never held.
  #hasBufferedTap = false;
  readonly #bufferedTapPosition = new Vector(0, 0);
  #isTapLatched = false;
  readonly #tapPosition = new Vector(0, 0);
```

Add the getter (after the constructor):

```ts
  /**
   * Position of the last latched tap, in view coordinates (device px). Changes
   * only at the step boundary, so a pointer move between the tap and the next
   * `update()` cannot retarget it.
   */
  get tapPosition(): Vector {
    return this.#tapPosition;
  }
```

In `attach()`, add the handler and registration (before the `#disposables.defer` call), and extend the defer:

```ts
    let handlePointerTap = (event: pixi.FederatedPointerEvent) => {
      // Multiple taps in one frame collapse to one, last position wins. Copy
      // the position: pixi reuses federated event objects after handlers return.
      this.#hasBufferedTap = true;
      this.#bufferedTapPosition.set(event.global.x, event.global.y);
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);
    globalThis.addEventListener('blur', handleBlur);
    view.on('pointertap', handlePointerTap);

    this.#disposables.defer(() => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
      globalThis.removeEventListener('blur', handleBlur);
      view.off('pointertap', handlePointerTap);
    });
```

In `detach()`, add to the state clearing:

```ts
    this.#hasBufferedTap = false;
    this.#isTapLatched = false;
```

At the end of `update()`, drain the buffer into the latch:

```ts
    // Drain the tap buffer into the per-step latch.
    this.#isTapLatched = this.#hasBufferedTap;

    if (this.#hasBufferedTap) {
      this.#tapPosition.set(this.#bufferedTapPosition.x, this.#bufferedTapPosition.y);
      this.#hasBufferedTap = false;
    }
```

Fold taps into the edge reads — `pressed` and `released` become:

```ts
  /** Whether the action went down this step. A tap counts on the step it latches. */
  pressed(action: string): boolean {
    let binding = this.#getBinding(action);

    return (
      (this.#isDown(binding, this.#currentCodes) &&
        !this.#isDown(binding, this.#previousCodes)) ||
      this.#isTapped(binding)
    );
  }

  /** Whether the action went up this step. A tap counts on the step it latches. */
  released(action: string): boolean {
    let binding = this.#getBinding(action);

    return (
      (!this.#isDown(binding, this.#currentCodes) &&
        this.#isDown(binding, this.#previousCodes)) ||
      this.#isTapped(binding)
    );
  }
```

(`held` is unchanged — the tap latch never enters the down-set.)

Add the private helper next to `#isDown`:

```ts
  #isTapped(binding: InputBinding): boolean {
    return binding.pointerTap === true && this.#isTapLatched;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/Input.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add source/engine/input/Input.ts tests/Input.test.ts
git commit -m "Add pointer-tap latching to Input"
```

---

### Task 4: `InputComponent` + `inputSystem`

**Files:**
- Create: `source/engine/input/InputComponent.ts`
- Create: `source/engine/input/inputSystem.ts`
- Test: `tests/inputSystem.test.ts`

**Interfaces:**
- Consumes: `Input` (Tasks 2–3), `defineComponent` (`source/engine/ecs/Component.ts`), `System` (`source/engine/ecs/System.ts`).
- Produces: `InputComponent` (construct with `new InputComponent({input})`; read with `entity.getComponent(InputComponent).input`) and `inputSystem` (module-level `System`, `displayName: 'Input system'`). Task 5 registers both in the demo world; Task 6 reads the component through `inputQuery`.

- [ ] **Step 1: Write the failing tests**

Create `tests/inputSystem.test.ts`:

```ts
import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Input} from '../source/engine/input/Input.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {inputSystem} from '../source/engine/input/inputSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

// Input never calls anything on the view except on/off in attach/detach.
function createFakeView(): pixi.Container {
  return {on() {}, off() {}} as unknown as pixi.Container;
}

// inputSystem is a module-level singleton: every test must world.stop() so the
// next test's addSystem doesn't hit the already-has-a-world throw.
describe('inputSystem', () => {
  test('calls input.update() exactly once per world update', () => {
    let updateCount = 0;
    let fakeInput = {
      update() {
        updateCount += 1;
      },
    } as unknown as Input;
    let entity = new Entity({components: [new InputComponent({input: fakeInput})]});
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick());

    expect(updateCount).toBe(1);

    world.update(tick());

    expect(updateCount).toBe(2);

    world.stop();
  });

  test('throws loudly when the input entity is missing', () => {
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem);
      },
    });

    world.start();

    // Call the system directly rather than world.update(): a throw inside
    // world.update() would leave the world's updating flag set and make
    // stop() impossible, poisoning the module-level system for later tests.
    expect(() => inputSystem.update(tick())).toThrow('No entity found!');

    world.stop();
  });

  test('an edge latched before pause() stays readable across paused frames and resolves to held after resume()', () => {
    let input = new Input({bindings: {'move-up': {keys: ['KeyW']}}});

    input.attach(createFakeView());

    let entity = new Entity({components: [new InputComponent({input})]});
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem).addEntity(entity);
      },
    });

    world.start();
    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', cancelable: true}));
    world.update(tick());

    expect(input.pressed('move-up')).toBe(true);

    world.pause();
    world.update(tick());
    world.update(tick());

    // The step boundary never advanced: the pre-pause edge is still this step's edge.
    expect(input.pressed('move-up')).toBe(true);
    expect(input.held('move-up')).toBe(true);

    world.resume();
    world.update(tick());

    // First frame after resume: plain held, no new edge.
    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(true);

    world.stop();
    input.detach();
  });

  test('a key pressed and released entirely during pause leaves no edge after resume', () => {
    let input = new Input({bindings: {'move-up': {keys: ['KeyW']}}});

    input.attach(createFakeView());

    let entity = new Entity({components: [new InputComponent({input})]});
    let world = new World({
      onStart: (w) => {
        w.addSystem(inputSystem).addEntity(entity);
      },
    });

    world.start();
    world.update(tick());
    world.pause();

    window.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyW', cancelable: true}));
    world.update(tick());
    window.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyW', cancelable: true}));
    world.update(tick());

    world.resume();
    world.update(tick());

    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(false);

    world.stop();
    input.detach();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/inputSystem.test.ts`
Expected: FAIL — cannot resolve `InputComponent.js` / `inputSystem.js`.

- [ ] **Step 3: Write the implementation**

Create `source/engine/input/InputComponent.ts`:

```ts
import {defineComponent} from '../ecs/Component.js';
import {type Input} from './Input.js';

// Purely discoverability: game systems find input through a query, the way
// playerSystem finds the camera through cameraQuery. Singleton entity + query
// per T1.1 — not a module singleton, not a world resource (that API arrives
// with T2.15; the query reads migrate to resource reads then).
export const InputComponent = defineComponent<{input: Input}>();
```

Create `source/engine/input/inputSystem.ts`:

```ts
import {System} from '../ecs/System.js';
import {InputComponent} from './InputComponent.js';

export const inputSystem = new System({
  displayName: 'Input system',
  components: [InputComponent],
  onUpdate: (ticker, system) => {
    // getFirst() throws loudly when the singleton entity is missing (the
    // cameraSystem precedent). Exactly one update() call per world update —
    // that single call IS the "drain edges once per sim step" contract, owned
    // by the system rather than by an entity-count assumption.
    system.getFirst().getComponent(InputComponent).input.update();
  },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/inputSystem.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add source/engine/input/InputComponent.ts source/engine/input/inputSystem.ts tests/inputSystem.test.ts
git commit -m "Add InputComponent and inputSystem for ECS input discovery"
```

---

### Task 5: Demo wiring (`input.ts`, `inputQuery.ts`, `world.ts`, `gameScreen.ts`)

**Files:**
- Create: `source/game/input.ts`
- Create: `source/game/inputQuery.ts`
- Modify: `source/game/world.ts:32-62` (`onStart`) + imports
- Modify: `source/game/gameScreen.ts:152-178` (`onShow`/`onHide`) + imports

**Interfaces:**
- Consumes: `Input`, `InputComponent`, `inputSystem` (Tasks 2–4), `EntityQuery`, `Entity`, `game` (`source/game/game.ts`), `world`.
- Produces: `input` and `inputEntity` exports from `source/game/input.ts`; `inputQuery` export from `source/game/inputQuery.ts`. Task 6's `playerSystem` reads `inputQuery.getFirst().getComponent(InputComponent).input`.

No new tests: this task is registration/lifecycle wiring; its pieces are unit-covered by Tasks 2–4 and its behavior is exercised end-to-end in Task 7. The gate is the full suite + typecheck + lint staying green, and the demo still running exactly as before (`playerSystem` still uses its old `pointertap` path until Task 6 — both layers acting on a tap in the interim is harmless and invisible since nothing polls `move-to` yet).

- [ ] **Step 1: Create `source/game/input.ts`**

```ts
import {Entity} from '../engine/ecs/Entity.js';
import {Input} from '../engine/input/Input.js';
import {InputComponent} from '../engine/input/InputComponent.js';

// WASD only — arrows stay with UI focus navigation (the spec's arbitration
// rule: UiRoot.moveFocus grabs the nearest focusable when nothing is focused,
// so arrow-bound movement would light the HUD focus ring).
export const input = new Input({
  bindings: {
    'move-up': {keys: ['KeyW']},
    'move-down': {keys: ['KeyS']},
    'move-left': {keys: ['KeyA']},
    'move-right': {keys: ['KeyD']},
    'move-to': {pointerTap: true},
  },
});

export const inputEntity = new Entity({components: [new InputComponent({input})]});
```

- [ ] **Step 2: Create `source/game/inputQuery.ts`**

```ts
import {EntityQuery} from '../engine/ecs/EntityQuery.js';
import {InputComponent} from '../engine/input/InputComponent.js';

export const inputQuery = new EntityQuery({
  components: [InputComponent],
});
```

- [ ] **Step 3: Wire the world**

In `source/game/world.ts`, add imports (lint fixes ordering):

```ts
import {inputSystem} from '../engine/input/inputSystem.js';
import {inputEntity} from './input.js';
import {inputQuery} from './inputQuery.js';
```

In `onStart`, add the query alongside the others:

```ts
    world.addEntityQuery(cameraQuery);
    world.addEntityQuery(inputQuery);
    world.addEntityQuery(levelQuery);
    world.addEntityQuery(playersQuery);
```

Replace the `addSystem` block with (changes: `inputSystem` added first, `playerSystem` moved from after `uiBridge` to before `motionSystem`; every other line and comment kept verbatim):

```ts
    world.addSystem(inputSystem); // first: every system this frame reads the same freshly-advanced input
    world.addSystem(mapSystem);
    world.addSystem(playerSystem); // before motionSystem: it writes velocity that motionSystem consumes this frame
    world.addSystem(motionSystem);
    world.addSystem(wallHitPopupSystem); // spawn popups from the previous frame's wall hits
    world.addSystem(popupCleanupSystem); // remove popups whose lifetime timer has expired
    world.addSystem(timerSystem); // placement is free: timer events are buffered, seen next frame
    world.addSystem(uiBridge);
    world.addSystem(cameraSystem);
    world.addSystem(tweenSystem); // late, just before graphicsSystem: scripted motion is the last word
    world.addSystem(graphicsSystem);
```

Add the entity alongside the camera:

```ts
    world.addEntity(camera);
    world.addEntity(inputEntity);
```

- [ ] **Step 4: Wire the screen lifecycle**

In `source/game/gameScreen.ts`, add the import:

```ts
import {input} from './input.js';
```

In `onShow`, attach just before `world.start()`:

```ts
  onShow: (screen) => {
    screen.addToView(world);
    input.attach(game.view);
    world.start();
```

In `onHide`, detach after `teardownGameScreen(...)` (before the `openModal` reset):

```ts
  onHide: (screen) => {
    teardownGameScreen({
      world,
      modal: screen.state.openModal,
      detachWorld: () => {
        screen.removeFromView(world);
      },
    });
    input.detach();
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.openModal = null;
  },
```

`pauseFlow.ts` stays untouched.

- [ ] **Step 5: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green (no behavior change yet — nothing polls the new input).

- [ ] **Step 6: Quick smoke (optional but cheap)**

Run: `npm run develop`, open http://localhost:5000, start a game: tap-to-move still works (old path), pause/resume still works, quitting to menu and starting a new game does not throw (attach/detach balance across screen swaps). Stop the server.

- [ ] **Step 7: Commit**

```bash
git add source/game/input.ts source/game/inputQuery.ts source/game/world.ts source/game/gameScreen.ts
git commit -m "Wire the input system into the demo world and game screen"
```

---

### Task 6: `playerSystem` migration + `MAX_SPEED`

**Files:**
- Modify: `source/game/motionSystem.ts:9,32-34`
- Modify: `source/game/playerSystem.ts` (full rewrite)
- Test: `tests/playerSystem.test.ts` (new), `tests/motionSystem.test.ts` (existing, must stay green)

**Interfaces:**
- Consumes: `inputQuery` + `InputComponent` (`input.held/pressed/tapPosition`), `cameraQuery`/`CameraComponent`, `MotionComponent`, `MAX_SPEED` (created here).
- Produces: `MAX_SPEED = 4` exported from `motionSystem.ts`; `playerSystem` with no `onAdd`/`onRemove` and no `game` import.

Rules (spec §5), in priority order — keys beat taps in a same-frame tie because rule 1 runs first:
1. Any movement key held → clear `motion.target`, velocity = held direction normalized to `MAX_SPEED` (diagonals not faster; opposite keys cancel to a zero vector, which `Vector.normalize` leaves at zero).
2. Else `pressed('move-to')` → set `motion.target` from `tapPosition` + camera position − the existing `-32`/`-60` bounding-box offsets (TODOs stay; T1.4/T1.5 territory), zero velocity.
3. Else no target → zero velocity. (An active tap target with no key input is left alone — `motionSystem` owns steering toward it.)

- [ ] **Step 1: Write the failing tests**

Create `tests/playerSystem.test.ts`:

```ts
import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {type Input} from '../source/engine/input/Input.js';
import {InputComponent} from '../source/engine/input/InputComponent.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {CameraComponent} from '../source/game/CameraComponent.js';
import {cameraQuery} from '../source/game/cameraQuery.js';
import {inputQuery} from '../source/game/inputQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {MAX_SPEED} from '../source/game/motionSystem.js';
import {PlayerComponent} from '../source/game/PlayerComponent.js';
import {playerSystem} from '../source/game/playerSystem.js';

function tick(deltaTime = 1): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

type FakeInputState = {
  heldActions?: string[];
  pressedActions?: string[];
  tapPosition?: Vector;
};

// playerSystem only polls, so a state bag stands in for a real Input — no
// listeners, no update() plumbing.
function createFakeInput(state: FakeInputState): Input {
  return {
    held: (action: string) => state.heldActions?.includes(action) ?? false,
    pressed: (action: string) => state.pressedActions?.includes(action) ?? false,
    released: () => false,
    tapPosition: state.tapPosition ?? new Vector(0, 0),
  } as unknown as Input;
}

// cameraQuery/inputQuery/playerSystem are module singletons: every test must
// world.stop() so the next test can register them again.
function createWorld(state: FakeInputState) {
  let motion = new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)});
  let player = new Entity({components: [new PlayerComponent({name: 'Test'}), motion]});
  let inputEntity = new Entity({
    components: [new InputComponent({input: createFakeInput(state)})],
  });
  let camera = new Entity({components: [new CameraComponent({position: new Vector(100, 50)})]});
  let world = new World({
    onStart: (w) => {
      w.addEntityQuery(inputQuery)
        .addEntityQuery(cameraQuery)
        .addSystem(playerSystem)
        .addEntity(inputEntity)
        .addEntity(camera)
        .addEntity(player);
    },
  });

  return {world, motion};
}

describe('playerSystem', () => {
  test('held movement keys set velocity to MAX_SPEED and clear the tap target', () => {
    let {world, motion} = createWorld({heldActions: ['move-right']});

    world.start();
    motion.target = new Vector(500, 500);
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(MAX_SPEED);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('diagonal movement is normalized, not faster', () => {
    let {world, motion} = createWorld({heldActions: ['move-right', 'move-down']});

    world.start();
    world.update(tick());

    expect(motion.velocity.length).toBeCloseTo(MAX_SPEED);
    expect(motion.velocity.x).toBeCloseTo(MAX_SPEED / Math.SQRT2);
    expect(motion.velocity.y).toBeCloseTo(MAX_SPEED / Math.SQRT2);

    world.stop();
  });

  test('opposite keys cancel: target cleared, velocity zero', () => {
    let {world, motion} = createWorld({heldActions: ['move-left', 'move-right']});

    world.start();
    motion.target = new Vector(500, 500);
    motion.velocity.set(3, 3);
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('a tap sets the target from tapPosition plus camera offset and zeroes velocity', () => {
    let {world, motion} = createWorld({
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    motion.velocity.set(3, 3);
    world.update(tick());

    // 10 + 100 - 32, 20 + 50 - 60 (camera at (100, 50), bounding-box offsets).
    expect(motion.target?.x).toBe(78);
    expect(motion.target?.y).toBe(10);
    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('no keys, no tap, no target: velocity is zeroed', () => {
    let {world, motion} = createWorld({});

    world.start();
    motion.velocity.set(3, 3);
    world.update(tick());

    expect(motion.velocity.x).toBe(0);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });

  test('an active tap target without key input is left alone for motionSystem', () => {
    let {world, motion} = createWorld({});

    world.start();
    motion.target = new Vector(5, 5);
    motion.velocity.set(3, 3);
    world.update(tick());

    expect(motion.target?.x).toBe(5);
    expect(motion.velocity.x).toBe(3);

    world.stop();
  });

  test('keys beat a same-frame tap', () => {
    let {world, motion} = createWorld({
      heldActions: ['move-left'],
      pressedActions: ['move-to'],
      tapPosition: new Vector(10, 20),
    });

    world.start();
    world.update(tick());

    expect(motion.target).toBeUndefined();
    expect(motion.velocity.x).toBe(-MAX_SPEED);
    expect(motion.velocity.y).toBe(0);

    world.stop();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/playerSystem.test.ts`
Expected: FAIL — `MAX_SPEED` is not exported from `motionSystem.js`, and once that resolves, the behavior assertions fail against the old listener-based `playerSystem`.

- [ ] **Step 3: Export `MAX_SPEED` from `motionSystem.ts`**

In `source/game/motionSystem.ts`, add below `MAX_DELTA_TIME`:

```ts
// Shared with playerSystem's keyboard path so keyboard speed and this clamp
// cannot drift apart — the clamp only runs when motion.target is set, so the
// keyboard path must carry the same value itself.
export const MAX_SPEED = 4;
```

and replace the clamp (currently lines 32–34):

```ts
        if (motion.velocity.length > MAX_SPEED) {
          motion.velocity.length = MAX_SPEED;
        }
```

- [ ] **Step 4: Rewrite `playerSystem.ts`**

Replace the entire content of `source/game/playerSystem.ts` with:

```ts
import {System} from '../engine/ecs/System.js';
import {InputComponent} from '../engine/input/InputComponent.js';
import {Vector} from '../engine/utilities/Vector.js';
import {CameraComponent} from './CameraComponent.js';
import {cameraQuery} from './cameraQuery.js';
import {inputQuery} from './inputQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {MAX_SPEED} from './motionSystem.js';
import {PlayerComponent} from './PlayerComponent.js';

export const playerSystem = new System({
  displayName: 'Player system',
  components: [PlayerComponent, MotionComponent],
  onUpdate: (delta, system) => {
    let {input} = inputQuery.getFirst().getComponent(InputComponent);

    let isUpHeld = input.held('move-up');
    let isDownHeld = input.held('move-down');
    let isLeftHeld = input.held('move-left');
    let isRightHeld = input.held('move-right');
    let isMoveHeld = isUpHeld || isDownHeld || isLeftHeld || isRightHeld;
    let directionX = (isRightHeld ? 1 : 0) - (isLeftHeld ? 1 : 0);
    let directionY = (isDownHeld ? 1 : 0) - (isUpHeld ? 1 : 0);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);

      if (isMoveHeld) {
        // Keys beat taps in a same-frame tie and take over from an active tap
        // target. Normalized so diagonals are not faster; opposite keys cancel
        // to a zero vector, which normalize leaves at zero.
        motion.target = undefined;
        motion.velocity.set(directionX, directionY).normalize(MAX_SPEED);
      } else if (input.pressed('move-to')) {
        let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);

        motion.target = new Vector(
          input.tapPosition.x + cameraPosition.x - 32, // TODO: 32 is from the bounding box, fix it sthe value is used directly, not as a cosntant
          input.tapPosition.y + cameraPosition.y - 60, // TODO: 60 is from the bounding box, fix it sthe value is used directly, not as a cosntant
        );
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      } else if (motion.target === undefined) {
        motion.velocity.x = 0;
        motion.velocity.y = 0;
      }
    }
  },
});
```

Deleted along the way: the `pointerTapHandler` module variable, `onAdd`/`onRemove`, the empty `onAddEntity`, and the `game`/`pixi` imports (the system no longer touches the pixi event surface at all).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/playerSystem.test.ts tests/motionSystem.test.ts`
Expected: PASS (7 new + 2 existing).

- [ ] **Step 6: Full gates**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add source/game/playerSystem.ts source/game/motionSystem.ts tests/playerSystem.test.ts
git commit -m "Drive player movement from the input action map"
```

---

### Task 7: Manual verification pass in the demo

**Files:** none (fixes, if any, get their own minimal commits).

Spec §6's manual checklist. Run `npm run develop` and open http://localhost:5000, start a game.

- [ ] **WASD feel:** W/A/S/D move the player in all four directions; holding two perpendicular keys moves diagonally at visibly the same speed as cardinal movement; releasing all keys stops the player immediately.
- [ ] **Arbitration:** arrow keys move the HUD focus ring, not the player (WASD-only bindings; arrows stay UI).
- [ ] **Tap-to-move intact:** clicking/tapping the map walks the player to the tapped spot, stopping at walls exactly as before; pressing a movement key mid-walk cancels the tap target and takes over.
- [ ] **Hold-W-through-pause:** hold W, open the pause menu (world freezes; player stops), keep holding W, resume — the player keeps moving with no stutter or double-edge.
- [ ] **Release-during-pause:** hold W, pause, release W, resume — the player stops (no stuck key).
- [ ] **Pause taps stay UI:** while paused, clicking the map area (the modal scrim) does not queue a `move-to` — after resume the player stays put.
- [ ] **Screen-swap lifecycle:** Quit to menu, start a New Game, WASD and taps still work (attach/detach balance held).
- [ ] **Gates one last time:** `npm test && npm run typecheck && npm run lint` all green.

If anything fails: use superpowers:systematic-debugging, fix, and commit the fix with a plain imperative message before ticking the box.

---

## Execution notes

- Tasks are strictly ordered: 1 → 2 → 3 → 4 → 5 → 6 → 7. Every task leaves the demo working (Task 5 wires the new stack in while the old `playerSystem` path still drives movement; Task 6 swaps the driver).
- `tests/Input.test.ts`, `tests/inputSystem.test.ts`, and `tests/playerSystem.test.ts` all rely on module-singleton hygiene: any test that starts a world must stop it, and any test that attaches an `Input` must detach it — otherwise the *next* test fails with a confusing "already set/attached" throw.
- Out of scope (spec §7 — do not add these): gamepad, axes, hover/`pointermove` tracking, typed action names, world resources, runtime rebinding, virtual joystick, Escape-to-pause.
