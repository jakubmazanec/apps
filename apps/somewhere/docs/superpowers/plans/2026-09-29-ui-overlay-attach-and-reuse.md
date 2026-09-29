# UI Overlay Attach Protocol, Reusable Modals and Yoga-Sized Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `UiRoot.addOverlay` and `UiRoot.removeOverlay` the only way an overlay enters or leaves a `UiRoot`, let a `Modal` be kept and added again (`isReusable`), and let yoga size a `Modal` instead of every screen calling `resize()`.

**Architecture:** `Overlay` gains two optional owner-called methods, `attach(ui)` and `detach()`. `UiRoot.addOverlay` calls `attach` after the overlay holds its focus scope, `UiRoot.removeOverlay` calls `detach` after the overlay left the tree, and `Modal.open`, `DialogueBox.open` and `Modal.resize` are deleted. `Focusable` gains an optional `deactivate()` that `removeOverlay` calls on every focusable inside the overlay, so a kept overlay still ends a running `TextInput` edit. The `Modal` root and its scrim take percentage sizes that yoga resolves against the `UiRoot` view, and the scrim gets a hit area that accepts every point.

**Tech Stack:** TypeScript 6, pixi.js 8.19, `@pixi/layout` 3.2 (yoga), Vitest 4 with a `browser` project (Playwright, headless Chromium) and a `unit` project, ESLint (`@jakubmazanec/eslint-config`, `perfectionist/sort-classes`), Prettier.

**Spec:** `docs/superpowers/specs/2026-09-29-ui-overlay-attach-and-reuse-design.md`. Read it first. This plan implements its "Sequencing" steps 0 to 6 as Tasks 1 to 6 (step 0, the baseline, is Task 1 Step 1).

## Global Constraints

- All commands run from `apps/somewhere`. Work on the existing branch `somewhere-update`; no new worktree.
- Base commit is `81919a6` (`Add UI overlay attach and reuse design`). Line numbers in this plan are as of that commit. Earlier tasks shift them, so always match on the quoted text, never on the number.
- "Red first for every behaviour change. Each step compiles and passes its tests before the next."
- "`npm run lint` is red on the baseline, so lint is checked per changed file." Gate every commit with `npx eslint <the files changed in that task>` (exit code 0; warnings are allowed, errors are not), the task's Vitest run and `npm run typecheck`. Run them before `git commit`, never after.
- Vitest does not typecheck. A red test run can pass files that `npm run typecheck` rejects; that is expected between "write the failing test" and "implement".
- "No dependency changes." No lockfile changes.
- "`UiRoot.addOverlay` and `UiRoot.removeOverlay` are the only way an overlay enters or leaves. `Modal.open(ui)` and `DialogueBox.open(ui)` are deleted."
- "`detach()` undoes `attach()` and nothing else. It never destroys and fires no lifecycle hook."
- "All identifiers keep their names: `Overlay`, `addOverlay`, `removeOverlay`, `topOverlay`, `Modal`, `DialogueBox`."
- Error messages, verbatim: `'Overlay was already added to the UI root!'`, `'Overlay is destroyed!'`, `"Overlay wasn't found!"`, `'Modal is already attached to a UI root!'`, `'Modal is not attached to a UI root!'`, `'UI root has no layout, the modal is sized against it!'`, `'Dialogue box is already attached to a UI root!'`, `'Dialogue box is not attached to a UI root!'`.
- "`ModalOptions` gains `isReusable`, default `false`." "`destroy()` always destroys."
- "`DialogueBox.resize()` stays, fed by `dialogueBoxSystem` as today."
- "Both modals of the test game stay single-use. Nothing the player can see or do changes." Neither `buildPauseModal` nor `openOptionsModal` sets `isReusable`.
- "Comments are rewritten where their subject changed, never deleted." When code moves, its comment moves with it.
- A lifecycle hook is an option `onX` stored in a `readonly #onX` field and fired by the instance. `attach`, `detach` and `deactivate` are not lifecycle hooks: they are public verb methods called by the owner and carry the doc comment `/** @internal Called by `UiRoot`. */`.
- `UiRoot` does not roll back when `attach` throws: "a throw here is a programming error, the same as `World.addSystem` when `system.attach` throws."
- Do not run Prettier on this plan file (`npm run format` would). It re-indents fenced code, and the "current" blocks below must match the source byte for byte.
- Every comment line stays at or under 100 columns. The installed `@jakubmazanec/eslint-config` is 5.0.0 while `package.json` pins `6.0.0-unstable.72f063e3`, so the `comment-length` rule fails only in CI.
- House style: `let` over `const` for locals; a blank line after every `let` block and around every `if`; class members sorted by `perfectionist/sort-classes` (`npx eslint --fix` decides, and the positions given in this plan are already the sorted ones); imports sorted by path; no em-dashes in new comments; error messages end with `!`.
- Commit after each task in the short imperative style of this repo (`Rework UI overlays`, `Add private field bags`).
- `/** TBD */` in the quoted code is the placeholder doc comment this codebase already uses on undocumented members. It is code to keep as it is, not a gap in this plan.
- Non-goals, verbatim from the spec: removing the `openModal` tracking from the screens; forwarding resize through `UiRoot`, or any change to `DialogueBox.resize`; reopening a modal during its fade-out; passing the modal to `onClosing` and `onClosed`; a lifecycle hook that refreshes a kept modal; ending an edit when a panel is removed with `removeChild` or hidden; making a modal of the test game reusable; overlays that do not trap focus.

## How this plan was verified

Every code block in this plan was prototyped in the working tree on 2026-09-29, run, and then reverted. The plan file is generated by a script that replays each edit below against `81919a6` and compares the result with that prototype, so "current" blocks match the source byte for byte and "replacement" blocks are the code that ran.

| Check | Result |
| --- | --- |
| Baseline at `81919a6` | browser 386 tests in 27 files, unit 722 tests in 75 files, `npm run typecheck` clean, all green |
| After Task 6 | browser 428 tests in 28 files, unit 722 tests in 75 files, `npm run typecheck` clean, all green |
| Lint on the changed files | 0 errors. Warnings that exist today and stay: `unicorn/expiring-todo-comments` (`UiRoot.ts` 1, `TextInput.ts` 2), `@typescript-eslint/no-non-null-assertion` (`DialogueBox.ts` 1), `vitest/require-hook` (one per test file with a top-level `let roots`, two in the new `ModalLayout` file) |
| The scrim hit area, which the spec calls "the only unproven part" | The test `a pointer press right after addOverlay, before any render, hits the scrim` passes with the hit area and fails without it, so the fallback in Task 5 Step 9 was not needed |
| Real game (dev server, headless Chromium, 960x540 then 700x900) | Options and pause modals fill the screen and follow the window resize with no `onResize` lifecycle hook, the pause menu opens above a dialogue box, Quit to menu tears both down. Script and output are in Task 6 Step 7 |

The red and green test counts quoted in each task are from those runs.

## Review Focus

Input classes and failure modes the spec implies but its "Tests and verification" list does not exercise, most likely to bite an engine user first. Each has a test in the task that owns the code.

1. **A single-use modal is added again after `close()`** (the forgotten `isReusable`). Expected: `addOverlay` throws `'Overlay is destroyed!'` and the root is unchanged. Test: `adding a closed modal throws, because close() destroyed it` (Task 2).
2. **An overlay is removed twice** (the owner calls `ui.removeOverlay(modal)` from `onClosed`, after `close()` already removed it). Expected: the second call throws `"Overlay wasn't found!"` and `detach` is not called again. Test: `removeOverlay throws the second time, because the overlay already left` (Task 1).
3. **The HUD is pressed after the modal left.** The scrim's hit area accepts every point, so it must stop taking presses the moment the modal is removed. Expected: the press reaches the HUD again. Test: `the scrim releases the pointer when the modal is removed` (Task 5).
4. **`destroy()` runs after the overlay already left, or after its root died** (teardown order belongs to the owner: `dialogueBoxSystem.onDetach` runs whenever the world stops). Expected: no throw, the root is not touched. Tests: `destroy() after ui.removeOverlay(box) leaves the root alone`, `destroy() survives a root that was destroyed first` (Task 3), `destroy() destroys a kept modal, attached or not` (Task 4).
5. **One overlay instance is offered to a second root while attached to the first** (a kept modal shared by two screens). Expected: `attach` throws and names the overlay, and the overlay's own state is not corrupted. Tests: `a modal is attached to one root at a time` (Task 2), `a box is attached to one root at a time` (Task 3).

## Additions to the spec

Small things this plan does that the spec does not list. Each is a candidate for a veto in review.

- Tests beyond the spec's list: the Review Focus tests above, plus `focus set inside attach survives addOverlay`, `a removed overlay can be added again`, `destroy() lets an overlay that removes itself run its detach` (Task 1), `deactivate() on an idle field does nothing` (Task 1), `detach() throws for a modal that is not attached` (Task 2), `detach() throws for a box that is not attached` (Task 3), `a kept modal fades in again from alpha 0`, `adding a kept modal that is still fading out throws`, `adding a destroyed kept modal throws` (Task 4), `the modal stays out of the flow of the UiRoot view`, `the caller layout places the content inside the full-screen root` (Task 5).
- In `tests/Modal.browser.test.ts` the deleted `resize()` test is replaced by `the root asks yoga for the whole UiRoot view, out of its flow`, which pins the percentage layout in the file that runs without a layout system (Task 5).
- In both test files the local variable that holds the ring container is renamed from `overlay` to `ringContainer`, and one test comment is reworded, so that "overlay" means one thing in the tests as well (Task 6).
- The comment of `ModalOptions.initialFocus` says "on every attach" instead of "on open" (Task 6), and the doc comment of `DialogueBox.focusedChoiceIndex` says "not attached" instead of "not open" (Task 3).

## File Structure

No file is split or merged. One test file is new.

| File | Change | Task |
| --- | --- | --- |
| `source/engine/ui/Overlay.ts` | The overlay contract: gains `attach?` and `detach?` | 1 |
| `source/engine/ui/Focusable.ts` | The focusable contract: gains `deactivate?` | 1 |
| `source/engine/ui/UiRootParts.ts` | `overlay` becomes `ringContainer` | 1 |
| `source/engine/ui/UiRoot.ts` | Guards and the three new calls in `addOverlay` and `removeOverlay`; the rename | 1 |
| `source/engine/ui/TextInput.ts` | `deactivate()` | 1 |
| `source/engine/ui/ModalRuntime.ts` | Gains `ui: UiRoot \| null` | 2 |
| `source/engine/ui/Modal.ts` | `attach`, `detach`, no `open` (2); `isReusable` (4); percentage layout, scrim hit area, layout check, no `resize` (5) | 2, 4, 5 |
| `source/engine/ui/ModalOptions.ts` | `isReusable` option (4); `initialFocus` comment (6) | 4, 6 |
| `source/engine/ui/ModalConfig.ts` | `isReusable: boolean` | 4 |
| `source/engine/dialogue/DialogueBox.ts` | `attach`, `detach`, no `open` | 3 |
| `source/game/systems/dialogueBoxSystem.ts` | `ui.addOverlay(box)` | 3 |
| `source/game/screens/worldScreen.ts` | `addOverlay` (2); no `resize` call, no `onResize` (5); comment (6) | 2, 5, 6 |
| `source/game/screens/mainMenuScreen.ts` | `addOverlay` (2); no `resize` call, no `onResize` (5) | 2, 5 |
| `tests/UiRoot.browser.test.ts` | New `overlay attach protocol` block, two titles (1); ring locals (6) | 1, 6 |
| `tests/TextInput.browser.test.ts` | Three `deactivate` tests | 1 |
| `tests/Modal.browser.test.ts` | Call sites, titles, new tests (2); `isReusable` block (4); sizing tests (5); ring local (6) | 2, 4, 5, 6 |
| `tests/pauseFlow.browser.test.ts` | One call site | 2 |
| `tests/DialogueBox.browser.test.ts` | Call sites, one title, new tests | 3 |
| `tests/ModalLayout.browser.test.ts` | **New.** `Modal` under a real `LayoutSystem` | 5 |

Untouched on purpose: `source/game/screens/pauseFlow.ts`, `errorScreen.ts`, `loadingScreen.ts`, `source/engine/app/GameScreen.ts` (its `onResize` option stays for engine users), `source/engine/ui/internals/collectFocusables.ts`.

Task order: 1, then 2 and 3 in either order (they are independent), then 4 (needs 2), then 5 (last, it carries the hit area), then 6.

---

### Task 1: Overlay contract and UiRoot

Spec "Sequencing" steps 0 and 1. `Modal.open` and `DialogueBox.open` keep working after this task, because `attach` and `detach` are optional.

**Files:**
- Modify: `source/engine/ui/Overlay.ts` (whole file)
- Modify: `source/engine/ui/Focusable.ts:13-15`
- Modify: `source/engine/ui/UiRootParts.ts:5`
- Modify: `source/engine/ui/UiRoot.ts:46`, `:169-179` (`addOverlay`), `:384-414` (`removeOverlay`), `:419`, `:431-432` (`update`)
- Modify: `source/engine/ui/TextInput.ts:351` (new method above `destroy()`)
- Test: `tests/UiRoot.browser.test.ts`, `tests/TextInput.browser.test.ts`

**Interfaces:**
- Consumes: `collectFocusables(root: UiChild): Focusable[]` from `source/engine/ui/internals/collectFocusables.ts`, already imported by `UiRoot.ts:7`. It skips hidden and destroyed subtrees and components whose `isFocusable` is `false`.
- Produces:
  - `type Overlay = UiParent & {attach?: (ui: UiRoot) => void; close?: () => void; detach?: () => void}`
  - `Focusable['deactivate']?: () => void`
  - `UiRoot.addOverlay(overlay: Overlay): this`. Throws `'Overlay was already added to the UI root!'` when `children` already includes it, `'Overlay is destroyed!'` when `overlay.view.destroyed`. Calls `overlay.attach?.(this)` last, after the scope was pushed.
  - `UiRoot.removeOverlay(overlay: Overlay): this`. Throws `"Overlay wasn't found!"` when `children` does not include it. Calls `deactivate?.()` on every collected focusable first, `overlay.detach?.()` last, after `removeChild`.
  - `TextInput.deactivate(): void`
  - `type UiRootParts = Parts<{ring: pixi.NineSliceSprite; ringContainer: pixi.Container}>`

- [ ] **Step 1: Baseline**

Run:

```bash
git status --short
npx vitest run --project browser
npx vitest run --project unit
npm run typecheck
```

Expected: `git status` prints nothing, or only this plan file. Browser: `Test Files 27 passed (27)`, `Tests 386 passed (386)`. Unit: `Test Files 75 passed (75)`, `Tests 722 passed (722)`. Typecheck prints no error. If any of this is red, stop: the baseline is broken independently of this plan.

- [ ] **Step 2: Reword the two test titles that call the ring container an overlay**

In `tests/UiRoot.browser.test.ts` (`:95`), replace:

```ts
    test('tracks components and keeps the focus ring overlay topmost', () => {
```

with:

```ts
    test('tracks components and keeps the focus ring topmost', () => {
```

and (`:174`) replace:

```ts
    test('the focus-ring overlay is transparent to hit-testing so it never steals a tap from the widget beneath it', () => {
```

with:

```ts
    test('the focus ring is transparent to hit-testing so it never steals a tap from the widget beneath it', () => {
```

- [ ] **Step 3: Write the failing `UiRoot` tests**

In `tests/UiRoot.browser.test.ts`, add this block as the last block inside `describe(UiRoot, ...)`, after the closing `});` of `describe('overlay removal contract', ...)`, with one blank line before it. The helpers `createRoot`, `createRootWith`, `focusable` and `panel` and the imports `UiChild`, `UiRoot` and `vitest` already exist at the top of the file.

```ts
  describe('overlay attach protocol', () => {
    test('addOverlay calls attach with the root once the overlay holds the scope', () => {
      let root = createRootWith(focusable());
      let topOverlayInsideAttach: unknown = null;
      let childrenInsideAttach: UiChild[] = [];
      let overlay = {
        ...panel([focusable()]),
        attach: vitest.fn<(ui: UiRoot) => void>((ui) => {
          topOverlayInsideAttach = ui.topOverlay;
          childrenInsideAttach = [...ui.children];
        }),
      };

      root.addOverlay(overlay);

      expect(overlay.attach).toHaveBeenCalledTimes(1);
      expect(overlay.attach).toHaveBeenCalledWith(root);
      expect(topOverlayInsideAttach).toBe(overlay);
      expect(childrenInsideAttach).toContain(overlay);
    });

    test('focus set inside attach survives addOverlay', () => {
      let inside = focusable();
      let root = createRootWith(focusable());
      let overlay = {
        ...panel([inside]),
        attach: (ui: UiRoot) => {
          ui.focus(inside);
        },
      };

      root.addOverlay(overlay);

      expect(root.focused).toBe(inside);
    });

    test('addOverlay throws for an overlay that is already attached and changes nothing', () => {
      let a = focusable();
      let lower = {...panel([focusable()]), attach: vitest.fn<(ui: UiRoot) => void>()};
      let top = panel([focusable()]);
      let root = createRootWith(a);

      root.addOverlay(lower);
      root.addOverlay(top);

      expect(() => {
        root.addOverlay(lower);
      }).toThrow('Overlay was already added to the UI root!');

      expect(root.children).toEqual([a, lower, top]);
      expect(root.topOverlay).toBe(top);
      expect(lower.attach).toHaveBeenCalledTimes(1);
    });

    test('addOverlay throws for an overlay whose view is destroyed', () => {
      let a = focusable();
      let overlay = {...panel([focusable()]), attach: vitest.fn<(ui: UiRoot) => void>()};
      let root = createRootWith(a);

      overlay.view.destroy();

      expect(() => {
        root.addOverlay(overlay);
      }).toThrow('Overlay is destroyed!');

      expect(root.children).toEqual([a]);
      expect(root.topOverlay).toBeNull();
      expect(overlay.attach).not.toHaveBeenCalled();
    });

    test('removeOverlay calls detach after the overlay left the children', () => {
      let root = createRootWith(focusable());
      let childrenInsideDetach: UiChild[] | null = null;
      let topOverlayInsideDetach: unknown;
      let overlay = {
        ...panel([focusable()]),
        detach: vitest.fn<() => void>(() => {
          childrenInsideDetach = [...root.children];
          topOverlayInsideDetach = root.topOverlay;
        }),
      };

      root.addOverlay(overlay);
      root.removeOverlay(overlay);

      expect(overlay.detach).toHaveBeenCalledTimes(1);
      expect(childrenInsideDetach).not.toContain(overlay);
      expect(topOverlayInsideDetach).toBeNull();
      expect(overlay.view.parent).toBeNull();
    });

    test('removeOverlay throws for an overlay that is not attached', () => {
      let a = focusable();
      let attached = panel([focusable()]);
      let stranger = {...panel([focusable()]), detach: vitest.fn<() => void>()};
      let root = createRootWith(a);

      root.addOverlay(attached);

      expect(() => {
        root.removeOverlay(stranger);
      }).toThrow("Overlay wasn't found!");

      expect(root.children).toEqual([a, attached]);
      expect(root.topOverlay).toBe(attached);
      expect(stranger.detach).not.toHaveBeenCalled();
    });

    test('removeOverlay throws the second time, because the overlay already left', () => {
      let overlay = {...panel([focusable()]), detach: vitest.fn<() => void>()};
      let root = createRootWith(focusable());

      root.addOverlay(overlay);
      root.removeOverlay(overlay);

      expect(() => {
        root.removeOverlay(overlay);
      }).toThrow("Overlay wasn't found!");

      expect(overlay.detach).toHaveBeenCalledTimes(1);
    });

    test('a removed overlay can be added again', () => {
      let inside = focusable();
      let overlay = {
        ...panel([inside]),
        attach: vitest.fn<(ui: UiRoot) => void>(),
        detach: vitest.fn<() => void>(),
      };
      let root = createRootWith(focusable());

      root.addOverlay(overlay);
      root.removeOverlay(overlay);
      root.addOverlay(overlay);
      root.focusNext();

      expect(overlay.attach).toHaveBeenCalledTimes(2);
      expect(overlay.detach).toHaveBeenCalledTimes(1);
      expect(root.topOverlay).toBe(overlay);
      expect(root.focused).toBe(inside);
    });

    test('removeOverlay deactivates the focusables inside the overlay that declare it', () => {
      let calls: string[] = [];
      let outside = {...focusable(), deactivate: vitest.fn<() => void>()};
      let first = {...focusable(), deactivate: vitest.fn<() => void>()};
      let plain = focusable(); // declares no deactivate
      let nested = {...focusable(), deactivate: vitest.fn<() => void>()};
      let overlay = {
        ...panel([first, plain, panel([nested])]),
        detach: vitest.fn<() => void>(),
      };
      let root = createRootWith(outside);
      let isAttached = () => String(root.children.includes(overlay));

      first.deactivate.mockImplementation(() => {
        calls.push(`first:${isAttached()}`);
      });
      nested.deactivate.mockImplementation(() => {
        calls.push(`nested:${isAttached()}`);
      });
      overlay.detach.mockImplementation(() => {
        calls.push(`detach:${isAttached()}`);
      });

      root.addOverlay(overlay);
      root.removeOverlay(overlay);

      // Each focusable is told while the overlay is still a child; detach last.
      expect(calls).toEqual(['first:true', 'nested:true', 'detach:false']);
      expect(outside.deactivate).not.toHaveBeenCalled();
    });

    test('removeOverlay still calls detach after clearFocus emptied the scopes', () => {
      let a = focusable();
      let overlay = {...panel([focusable()]), detach: vitest.fn<() => void>()};
      let root = createRootWith(a);

      root.addOverlay(overlay);
      root.clearFocus(); // what GameScreen.hide does before the screen's onHide
      root.removeOverlay(overlay);

      expect(overlay.detach).toHaveBeenCalledTimes(1);
      expect(root.children).toEqual([a]);
    });

    test('destroy() lets an overlay that removes itself run its detach', () => {
      let root = createRoot();
      let overlay = {
        ...panel([]),
        destroy: vitest.fn<() => void>(),
        detach: vitest.fn<() => void>(),
      };

      overlay.destroy.mockImplementation(() => {
        root.removeOverlay(overlay);
      });

      root.addOverlay(overlay);
      root.destroy();

      expect(overlay.detach).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 4: Write the failing `TextInput` tests**

In `tests/TextInput.browser.test.ts`, `UiRoot` needs pixi's federated events. Replace:

```ts
import {createTestTheme} from './createTestTheme.js';

// A fixed advance per character, so the expected caret offsets stay arithmetic;
```

with:

```ts
import {createTestTheme} from './createTestTheme.js';

// UiRoot registers its pointertap listeners via the federated event system
// (addEventListener), which pixi only installs on Container through this side
// effect.
import 'pixi.js/events';

// A fixed advance per character, so the expected caret offsets stay arithmetic;
```

Replace:

```ts
// Imported after the mocks so it picks up the mocked Pixi surface.
const {TextInput} = await import('../source/engine/ui/TextInput.js');
```

with:

```ts
// Imported after the mocks so it picks up the mocked Pixi surface.
const {TextInput} = await import('../source/engine/ui/TextInput.js');
const {UiRoot} = await import('../source/engine/ui/UiRoot.js');
```

Inside `describe('TextInput', ...)`, insert the three tests below directly above this line, with one blank line after them:

```ts
  describe('keys while editing follow the bindings', () => {
```

The tests:

```ts
  test('deactivate() ends a running edit', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let removeSpy = vitest.spyOn(globalThis, 'removeEventListener');

    input.startEditing();

    expect(document.activeElement).toBe(element);

    input.deactivate();

    expect(document.activeElement).not.toBe(element);
    expect(removeSpy.mock.calls.filter(([type]) => type === 'pointerdown')).toHaveLength(1);
    expect(findCaret(input.view)).toBeUndefined(); // the caret left the row with the edit
  });

  test('deactivate() on an idle field does nothing', () => {
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    let blurSpy = vitest.spyOn(element, 'blur');

    expect(() => {
      input.deactivate();
    }).not.toThrow();

    expect(blurSpy).not.toHaveBeenCalled();
  });

  test('removing an overlay that holds an editing field ends the edit', () => {
    let root = new UiRoot({theme: createTestTheme()});
    let input = createInput();
    let element = container.querySelector('input');

    if (element === null) {
      throw new Error('hidden input was not created');
    }

    // A kept overlay: nothing destroys the field, so only deactivate can end
    // the edit.
    let overlay = {view: new pixi.Container(), children: [input]};

    overlay.view.addChild(input.view);
    root.addOverlay(overlay);
    input.startEditing();

    expect(document.activeElement).toBe(element);

    root.removeOverlay(overlay);

    expect(document.activeElement).not.toBe(element);
    expect(input.view.destroyed).toBe(false);

    // The field still works when the overlay comes back.
    root.addOverlay(overlay);
    input.activate();

    expect(document.activeElement).toBe(element);

    input.destroy();
    root.destroy();
  });
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run --project browser tests/UiRoot.browser.test.ts tests/TextInput.browser.test.ts`

Expected: `Tests 14 failed | 89 passed (103)`. All 11 tests of `overlay attach protocol` fail (for example `expected "vi.fn()" to be called 1 times, but got 0 times` and `expected [Function] to throw an error`), and the three `TextInput` tests fail (`TypeError: input.deactivate is not a function` for the first). No other test fails.

- [ ] **Step 6: Write the `Overlay` contract**

Replace the whole content of `source/engine/ui/Overlay.ts` with:

```ts
import {type UiParent} from './UiChild.js';
import {type UiRoot} from './UiRoot.js';

// A component attached to a UiRoot as an overlay. Every overlay holds the
// focus scope while it is attached, so focus discovery cannot leave it; a
// component shown on top that must not trap focus is a plain child. UiRoot
// calls attach right after the overlay got its scope and detach right after it
// left the tree; nothing else calls them, and an overlay with nothing to do
// there omits them. Declaring `close` is what makes the cancel command dismiss
// it; an overlay without one traps focus and ignores cancel (the dialogue
// box). Modal is the general-purpose overlay.
export type Overlay = UiParent & {
  attach?: (ui: UiRoot) => void;
  close?: () => void;
  detach?: () => void;
};
```

`Overlay.ts` and `UiRoot.ts` now import each other's types, as `System.ts` and `World.ts` do. Both imports are `type` imports, so there is no runtime cycle.

- [ ] **Step 7: Add `deactivate` to `Focusable`**

In `source/engine/ui/Focusable.ts`, replace:

```ts
  increase?: () => void;
  decrease?: () => void;
};
```

with:

```ts
  increase?: () => void;
  decrease?: () => void;
  // Ends what activate started, when it is still running. Optional: only a
  // component that stays busy after activation has something to end, which
  // today is TextInput and its edit. UiRoot calls it on every focusable of an
  // overlay it removes.
  deactivate?: () => void;
};
```

- [ ] **Step 8: Rename the ring container part**

In `source/engine/ui/UiRootParts.ts`, replace:

```ts
export type UiRootParts = Parts<{overlay: pixi.Container; ring: pixi.NineSliceSprite}>;
```

with:

```ts
export type UiRootParts = Parts<{ring: pixi.NineSliceSprite; ringContainer: pixi.Container}>;
```

In `source/engine/ui/UiRoot.ts`, in the constructor (`:46`), replace:

```ts
    this.#parts = {overlay: ringContainer, ring};
```

with:

```ts
    this.#parts = {ring, ringContainer};
```

In `update()` (`:419`), replace:

```ts
    let {overlay, ring} = this.#parts;
```

with:

```ts
    let {ring, ringContainer} = this.#parts;
```

and (`:431-432`) replace:

```ts
    let topLeft = overlay.toLocal({x: bounds.x, y: bounds.y});
    let bottomRight = overlay.toLocal({
```

with:

```ts
    let topLeft = ringContainer.toLocal({x: bounds.x, y: bounds.y});
    let bottomRight = ringContainer.toLocal({
```

- [ ] **Step 9: Guard `addOverlay` and call `attach`**

In `source/engine/ui/UiRoot.ts` (`:169-179`), replace:

```ts
  // Scope/removal interplay: removeChild refuses an overlay that holds a scope,
  // so removeOverlay is the only way out through UiRoot. Detaching or destroying
  // its view through pixi directly is unsupported, as for any component.
  /** Attaches the overlay as the last UI child and gives it the focus scope. */
  addOverlay(overlay: Overlay): this {
    this.addChild(overlay);
    this.#runtime.scopes.push({previousFocus: this.#runtime.focused, root: overlay});
    this.#runtime.focused = null;

    return this;
  }
```

with:

```ts
  // Scope/removal interplay: removeChild refuses an overlay that holds a scope,
  // so removeOverlay is the only way out through UiRoot. Detaching or destroying
  // its view through pixi directly is unsupported, as for any component. Adding
  // an overlay twice, or adding a destroyed one, is a programming error. attach
  // comes last, so an overlay that sets its initial focus there sets it inside
  // the scope.
  /** Attaches the overlay as the last UI child and gives it the focus scope. */
  addOverlay(overlay: Overlay): this {
    if (this.children.includes(overlay)) {
      throw new Error('Overlay was already added to the UI root!');
    }

    if (overlay.view.destroyed) {
      throw new Error('Overlay is destroyed!');
    }

    this.addChild(overlay);
    this.#runtime.scopes.push({previousFocus: this.#runtime.focused, root: overlay});
    this.#runtime.focused = null;
    overlay.attach?.(this);

    return this;
  }
```

- [ ] **Step 10: Guard `removeOverlay`, deactivate the focusables and call `detach`**

The scope release in the middle is unchanged. In `source/engine/ui/UiRoot.ts` (`:384-414`), replace:

```ts
  // Drops this overlay's own scope, not whatever is on top, and tolerates a
  // scope that is already gone (clearFocus on hide). A buried scope is legal: a
  // closing modal keeps its scope through the fade while the game already runs,
  // so overlays can open above it or close beneath it. The scope goes before the
  // child, so the order is not the caller's to get wrong.
  /** Detaches the overlay and releases its focus scope. */
  removeOverlay(overlay: Overlay): this {
    let index = this.#runtime.scopes.findIndex((scope) => scope.root === overlay);

    if (index !== -1 && index === this.#runtime.scopes.length - 1) {
      let scope = this.#runtime.scopes.pop();

      if (scope !== undefined) {
        this.#runtime.focused =
          scope.previousFocus !== null && this.#focusables.includes(scope.previousFocus) ?
            scope.previousFocus
          : null;
      }
    } else if (index !== -1) {
      // The scope above was opened while this one was on top, so its
      // previousFocus points into this overlay; it inherits this scope's. The
      // type assertions are ok, because index is not the last one.
      let [buried] = this.#runtime.scopes.splice(index, 1) as [FocusScope];

      (this.#runtime.scopes[index] as FocusScope).previousFocus = buried.previousFocus;
    }

    this.removeChild(overlay);

    return this;
  }
```

with:

```ts
  // Drops this overlay's own scope, not whatever is on top, and tolerates a
  // scope that is already gone (clearFocus on hide). A buried scope is legal: a
  // closing modal keeps its scope through the fade while the game already runs,
  // so overlays can open above it or close beneath it. The scope goes before the
  // child, so the order is not the caller's to get wrong. The overlay's
  // focusables are told to stop first, while they are still on screen (a text
  // field ends its edit), and detach comes last, once the overlay left the tree.
  /** Detaches the overlay and releases its focus scope. */
  removeOverlay(overlay: Overlay): this {
    if (!this.children.includes(overlay)) {
      throw new Error("Overlay wasn't found!");
    }

    for (let focusable of collectFocusables(overlay)) {
      focusable.deactivate?.();
    }

    let index = this.#runtime.scopes.findIndex((scope) => scope.root === overlay);

    if (index !== -1 && index === this.#runtime.scopes.length - 1) {
      let scope = this.#runtime.scopes.pop();

      if (scope !== undefined) {
        this.#runtime.focused =
          scope.previousFocus !== null && this.#focusables.includes(scope.previousFocus) ?
            scope.previousFocus
          : null;
      }
    } else if (index !== -1) {
      // The scope above was opened while this one was on top, so its
      // previousFocus points into this overlay; it inherits this scope's. The
      // type assertions are ok, because index is not the last one.
      let [buried] = this.#runtime.scopes.splice(index, 1) as [FocusScope];

      (this.#runtime.scopes[index] as FocusScope).previousFocus = buried.previousFocus;
    }

    this.removeChild(overlay);
    overlay.detach?.();

    return this;
  }
```

`topOverlay`, `cancel()`, `removeChild`, `clearFocus()`, `destroy()` and the command verbs are untouched.

- [ ] **Step 11: Add `TextInput.deactivate`**

In `source/engine/ui/TextInput.ts`, insert the method directly above this block (`:351`), with one blank line after it. That is its sorted position, between `activate()` and `destroy()`.

```ts
  /** Destroys the instance. */
  destroy() {
    this.stopEditing();
```

The method:

```ts
  /** @internal Called by `UiRoot`. */
  deactivate() {
    this.stopEditing();
  }
```

`stopEditing()` returns early when no edit is running, so `deactivate()` on an idle field does nothing.

- [ ] **Step 12: Format and lint**

Run:

```bash
npx prettier --write source/engine/ui/Overlay.ts source/engine/ui/Focusable.ts source/engine/ui/UiRootParts.ts source/engine/ui/UiRoot.ts source/engine/ui/TextInput.ts tests/UiRoot.browser.test.ts tests/TextInput.browser.test.ts
npx eslint --fix source/engine/ui/Overlay.ts source/engine/ui/Focusable.ts source/engine/ui/UiRootParts.ts source/engine/ui/UiRoot.ts source/engine/ui/TextInput.ts tests/UiRoot.browser.test.ts tests/TextInput.browser.test.ts
git diff --stat
```

Expected: eslint reports `0 errors` (4 warnings: `unicorn/expiring-todo-comments` in `UiRoot.ts` and twice in `TextInput.ts`, `vitest/require-hook` in `UiRoot.browser.test.ts`). `git diff --stat` lists exactly the seven files above; neither tool moved a member.

- [ ] **Step 13: Run the tests to verify they pass**

Run: `npx vitest run --project browser tests/UiRoot.browser.test.ts tests/TextInput.browser.test.ts tests/Modal.browser.test.ts tests/DialogueBox.browser.test.ts tests/pauseFlow.browser.test.ts`

Expected: `Test Files 5 passed (5)`, `Tests 137 passed (137)` (74 + 29 + 16 + 14 + 4). The last three files are unchanged and prove that `Modal.open` and `DialogueBox.open` still work against the guarded `UiRoot`.

- [ ] **Step 14: Typecheck**

Run: `npm run typecheck`

Expected: no output after the two `tsc` command lines.

- [ ] **Step 15: Commit**

```bash
git add source/engine/ui/Overlay.ts source/engine/ui/Focusable.ts source/engine/ui/UiRootParts.ts source/engine/ui/UiRoot.ts source/engine/ui/TextInput.ts tests/UiRoot.browser.test.ts tests/TextInput.browser.test.ts
git commit -m "Add overlay attach protocol to UiRoot"
```

---

### Task 2: Modal attaches through UiRoot

Spec "Sequencing" step 2. Both screens switch to `addOverlay` in this task, or the game does not compile. `Modal.resize()` still exists after this task; Task 5 deletes it.

**Files:**
- Modify: `source/engine/ui/ModalRuntime.ts` (whole file)
- Modify: `source/engine/ui/Modal.ts:14-17` (class comment), `:29-32`, `:44` (fields), `:108` (new `attach` above `close`), `:141-196` (`destroy`, `open`), `:198-201` (`resize` comment), `:227-234` (`#finishClose`)
- Modify: `source/game/screens/worldScreen.ts:123`, `source/game/screens/mainMenuScreen.ts:107`
- Test: `tests/Modal.browser.test.ts`, `tests/pauseFlow.browser.test.ts:84`

**Interfaces:**
- Consumes (Task 1): `UiRoot.addOverlay(overlay)` calls `overlay.attach?.(ui)` after the overlay is a child and holds the scope, and throws `'Overlay was already added to the UI root!'` and `'Overlay is destroyed!'`. `UiRoot.removeOverlay(overlay)` calls `overlay.detach?.()` after the overlay left `children`, and tolerates a scope that `clearFocus()` already emptied.
- Produces:
  - `Modal.attach(ui: UiRoot): void`. Throws `'Modal is already attached to a UI root!'`. Applies `initialFocus`, starts the fade-in, sets the state to `'opening'` or `'open'`.
  - `Modal.detach(): void`. Throws `'Modal is not attached to a UI root!'`. Cancels a running fade, sets the state to `'closed'`. Destroys nothing, fires no lifecycle hook.
  - `Modal.open` no longer exists. `Modal.resize(width: number, height: number): void`, `Modal.close()`, `Modal.destroy()` and `Modal.state` keep their signatures.
  - `type ModalRuntime = Runtime<{cancelFade: (() => void) | null; ui: UiRoot | null}>`

- [ ] **Step 1: Replace the double-open test**

The spec counts 14 `modal.open(root)` call sites in `tests/Modal.browser.test.ts`. Two of them are in this test, which is replaced as a whole. In `tests/Modal.browser.test.ts` (`:129-138`), replace:

```ts
  test('open() is a no-op unless closed', () => {
    let root = createRoot();
    let modal = new Modal({});

    modal.open(root);
    modal.open(root);

    expect(root.children.filter((child) => child === modal)).toHaveLength(1);
    expect(modal.state).toBe('open');
  });
```

with:

```ts
  test('adding an attached modal throws', () => {
    let root = createRoot();
    let modal = new Modal({});

    root.addOverlay(modal);

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('Overlay was already added to the UI root!');

    expect(root.children.filter((child) => child === modal)).toHaveLength(1);
    expect(root.topOverlay).toBe(modal);
    expect(modal.state).toBe('open');
  });

  test('adding a closed modal throws, because close() destroyed it', () => {
    let root = createRoot();
    let modal = new Modal({});

    root.addOverlay(modal);
    modal.close();

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('Overlay is destroyed!');

    expect(root.children).not.toContain(modal);
    expect(root.topOverlay).toBeNull();
  });

  test('a modal is attached to one root at a time', () => {
    let first = createRoot();
    let second = createRoot();
    let modal = new Modal({});

    first.addOverlay(modal);

    expect(() => {
      second.addOverlay(modal);
    }).toThrow('Modal is already attached to a UI root!');

    expect(first.topOverlay).toBe(modal);
    expect(modal.state).toBe('open');
  });

  test('detach() throws for a modal that is not attached', () => {
    let modal = new Modal({});

    expect(() => {
      modal.detach();
    }).toThrow('Modal is not attached to a UI root!');
  });
```

- [ ] **Step 2: Switch the remaining call sites**

Run:

```bash
sed -i 's/modal\.open(root);/root.addOverlay(modal);/' tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts
```

Then run: `grep -c 'modal\.open(' tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts`

Expected: `tests/Modal.browser.test.ts:0` and `tests/pauseFlow.browser.test.ts:0` (12 call sites changed in the first file, 1 in the second).

- [ ] **Step 3: Reword the titles that name `open()`**

In `tests/Modal.browser.test.ts`, four titles. Replace (`:64`):

```ts
  test('open(ui) adds the modal as the last UI child, below the focus-ring overlay', () => {
```

with:

```ts
  test('addOverlay adds the modal as the last UI child, below the focus ring', () => {
```

Replace (`:83`):

```ts
  test('open(ui) traps focus inside the modal', () => {
```

with:

```ts
  test('an added modal traps focus inside it', () => {
```

Replace (`:108`):

```ts
  test('open() applies initialFocus programmatically (no ring)', () => {
```

with:

```ts
  test('adding applies initialFocus programmatically (no ring)', () => {
```

Replace (`:258`):

```ts
    test('open() fades in: opening at alpha 0, open at alpha 1', () => {
```

with:

```ts
    test('adding fades in: opening at alpha 0, open at alpha 1', () => {
```

- [ ] **Step 4: Write the failing tests for a direct `removeOverlay`**

In `tests/Modal.browser.test.ts`, insert the test below directly above this line, with one blank line after it:

```ts
  test('the cancel command closes the modal', () => {
```

The test:

```ts
  test('ui.removeOverlay(modal) leaves the modal alive and fires neither close hook', () => {
    let root = createRoot();
    let outside = focusable();

    root.addChild(outside);

    let onClosing = vitest.fn<() => void>();
    let onClosed = vitest.fn<() => void>();
    let inside = focusable();
    let modal = new Modal({children: [panel([inside])], onClosing, onClosed});

    root.focus(outside);
    root.addOverlay(modal);
    root.removeOverlay(modal);

    expect(root.children).not.toContain(modal);
    expect(root.topOverlay).toBeNull();
    expect(root.focused).toBe(outside);
    expect((modal.view as unknown as MockContainer).destroyed).toBe(false);
    expect(modal.state).toBe('closed');
    expect(onClosing).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();

    // Removed, not destroyed: the same instance goes back in.
    root.addOverlay(modal);

    expect(modal.state).toBe('open');
    expect(root.topOverlay).toBe(modal);

    modal.destroy();
  });
```

Inside `describe('fade (scheduler + fadeDuration)', ...)`, insert the two tests below directly above this line, with one blank line after them:

```ts
    test('destroy() mid-fade cancels the tween and fires neither close hook', () => {
```

The tests:

```ts
    test('adding a modal that is still fading out throws', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let modal = new Modal({scheduler, fadeDuration: 200});

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();

      expect(modal.state).toBe('closing');

      expect(() => {
        root.addOverlay(modal);
      }).toThrow('Overlay was already added to the UI root!');

      expect(modal.state).toBe('closing');

      scheduler.update(tick(200)); // the fade-out still completes

      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
    });

    test('ui.removeOverlay(modal) during a fade cancels the tween', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let modal = new Modal({scheduler, fadeDuration: 200, onClosing, onClosed});
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();
      scheduler.update(tick(100)); // mid fade-out

      root.removeOverlay(modal);

      let alphaAtRemoval = view.alpha;

      expect(modal.state).toBe('closed');
      expect(view.destroyed).toBe(false);

      scheduler.update(tick(1000));

      // onClosing fired at close-start; the cancelled fade never reaches
      // onClosed, and the view is left alone.
      expect(view.alpha).toBe(alphaAtRemoval);
      expect(view.destroyed).toBe(false);
      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).not.toHaveBeenCalled();

      modal.destroy();
    });
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts`

Expected: `Tests 18 failed | 8 passed (26)`. `root.addOverlay(modal)` adds the modal but nothing opens it, so the typical failure is `expected 'closed' to be 'open'`; `detach() throws for a modal that is not attached` fails with `modal.detach is not a function`. The one failure in `pauseFlow.browser.test.ts` is `expected [] to deeply equal [ 'resume' ]`.

- [ ] **Step 6: Keep the root in the runtime bag**

Replace the whole content of `source/engine/ui/ModalRuntime.ts` with:

```ts
import {type Runtime} from '../utilities/Runtime.js';
import {type UiRoot} from './UiRoot.js';

export type ModalRuntime = Runtime<{cancelFade: (() => void) | null; ui: UiRoot | null}>;
```

- [ ] **Step 7: Rewrite the class comment and the two fields**

In `source/engine/ui/Modal.ts` (`:14-17`), replace:

```ts
// A reusable modal: a flat widget in the existing Container/Panel idiom (public
// `children` + `view`, no inheritance). Constructed per open by whatever
// handler opens it; the owning screen tracks the open instance and calls
// destroy() (never the animated close()) from its onHide.
```

with:

```ts
// A modal: a flat widget in the existing Container/Panel idiom (public
// `children` + `view`, no inheritance) and the general-purpose overlay, added
// with ui.addOverlay(modal). Constructed per open by whatever handler opens
// it; the owning screen tracks the instance and calls destroy() (never the
// animated close()) from its onHide.
```

Replace (`:29-32`):

```ts
  readonly #disposables: Disposables<'instance', 'open'> = {
    instance: new DisposableStack(),
    open: null,
  };
```

with:

```ts
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};
```

Replace (`:44`):

```ts
  readonly #runtime: ModalRuntime = {cancelFade: null};
```

with:

```ts
  readonly #runtime: ModalRuntime = {cancelFade: null, ui: null};
```

- [ ] **Step 8: Add `attach`**

In `source/engine/ui/Modal.ts`, insert the method directly above the doc comment of `close()` (`:108`), which starts with these two lines, with one blank line after the method:

```ts
  /**
   * User-facing close, and what the cancel command calls. A no-op while
```

The method. Its fade-in block is the one that `open()` has today, unchanged:

```ts
  // The root is not a constructor option: UiRoot passes itself in when the
  // modal is added, so a kept modal can be added again. By then the modal is
  // the last UI child (above the HUD by insertion order; UiRoot keeps the
  // focus ring topmost) and holds the focus scope, which is why initialFocus
  // lands inside it.
  /** @internal Called by `UiRoot`. */
  attach(ui: UiRoot) {
    if (this.#runtime.ui) {
      throw new Error('Modal is already attached to a UI root!');
    }

    this.#runtime.ui = ui;

    if (this.#config.initialFocus !== undefined) {
      ui.focus(this.#config.initialFocus);
    }

    if (this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined) {
      this.#state = 'opening';
      this.view.alpha = 0;
      this.#runtime.cancelFade = this.#config.scheduler.tween({
        target: this.view,
        to: {alpha: 1},
        duration: this.#config.fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#runtime.cancelFade = null;
          this.#state = 'open';
        },
      });
    } else {
      this.#state = 'open';
    }
  }
```

- [ ] **Step 9: Replace `destroy` and `open` with `destroy` and `detach`**

`close()` is unchanged. In `source/engine/ui/Modal.ts` (`:141-196` at the base commit), replace:

```ts
  // Teardown path (owning-screen onHide, or any out-of-band cleanup): releases
  // the overlay if still attached (tolerant of an already-empty scope stack)
  // and synchronously removes + destroys; callable from any state, never
  // animated, never fires onClosing or onClosed.
  /** Destroys the instance. */
  destroy() {
    this.#disposables.open?.dispose();
    this.#disposables.open = null;
    this.#state = 'closed';
    this.#destroyViews();
  }

  // A modal is opened INTO a ui root, so the target is a parameter of open,
  // not the constructor. Attaches the modal as an overlay: the last UI child
  // (above the HUD by insertion order; UiRoot keeps the focus-ring overlay
  // topmost), holding the focus scope while it is attached.
  /** TBD */
  open(ui: UiRoot) {
    if (this.#state !== 'closed' || this.view.destroyed) {
      return;
    }

    this.#disposables.open = new DisposableStack();

    ui.addOverlay(this);

    // removeOverlay releases this modal's own scope before removing it, so the
    // previousFocus restoration (the Options flow depends on it) cannot be lost
    // to ordering here.
    this.#disposables.open.defer(() => {
      this.#runtime.cancelFade?.();
      this.#runtime.cancelFade = null;
      ui.removeOverlay(this);
    });

    if (this.#config.initialFocus !== undefined) {
      ui.focus(this.#config.initialFocus);
    }

    if (this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined) {
      this.#state = 'opening';
      this.view.alpha = 0;
      this.#runtime.cancelFade = this.#config.scheduler.tween({
        target: this.view,
        to: {alpha: 1},
        duration: this.#config.fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#runtime.cancelFade = null;
          this.#state = 'open';
        },
      });
    } else {
      this.#state = 'open';
    }
  }
```

with:

```ts
  // Teardown path (owning-screen onHide, or any out-of-band cleanup): leaves
  // the UiRoot if still attached (tolerant of an already-empty scope stack)
  // and synchronously destroys; callable from any state, never animated, never
  // fires onClosing or onClosed.
  /** Destroys the instance. */
  destroy() {
    this.#runtime.ui?.removeOverlay(this);
    this.#destroyViews();
  }

  // Undoes attach() and nothing more: it destroys nothing and fires neither
  // close hook.
  /** @internal Called by `UiRoot`. */
  detach() {
    if (!this.#runtime.ui) {
      throw new Error('Modal is not attached to a UI root!');
    }

    this.#runtime.cancelFade?.();
    this.#runtime.cancelFade = null;
    this.#runtime.ui = null;
    this.#state = 'closed';
  }
```

Why `destroy()` no longer sets the state: `removeOverlay` calls `detach()`, which does. A modal that was never attached is `closed` already. `destroy()` stays idempotent, because `detach()` clears `#runtime.ui` and `#destroyViews()` returns early on a destroyed view.

The comments of the deleted `open()` moved: "opened INTO a ui root" became the comment of `attach()` in Step 8, and "removeOverlay releases this modal's own scope" becomes the comment of `#finishClose()` in Step 11.

- [ ] **Step 10: Reword the `resize` comment**

`resize()` itself stays until Task 5. In `source/engine/ui/Modal.ts`, replace:

```ts
  // Dumb plumbing: gives the caller's layout something to resolve against and
  // keeps the scrim covering the screen. The owning screen calls it once right
  // after open() and again from its onResize; the modal never reads screen
  // dimensions itself.
```

with:

```ts
  // Dumb plumbing: gives the caller's layout something to resolve against and
  // keeps the scrim covering the screen. The owning screen calls it once right
  // after ui.addOverlay(modal) and again from its onResize; the modal never
  // reads screen dimensions itself.
```

- [ ] **Step 11: Leave the root from `#finishClose`**

In `source/engine/ui/Modal.ts`, replace:

```ts
  /** TBD */
  #finishClose() {
    this.#state = 'closed';
    this.#disposables.open?.dispose();
    this.#disposables.open = null;
    this.#destroyViews();
    this.#onClosed?.();
  }
```

with:

```ts
  // removeOverlay releases this modal's own scope before removing it, so the
  // previousFocus restoration (the Options flow depends on it) cannot be lost
  // to ordering here; it then calls detach().
  /** TBD */
  #finishClose() {
    this.#runtime.ui?.removeOverlay(this);
    this.#destroyViews();
    this.#onClosed?.();
  }
```

- [ ] **Step 12: Switch both screens**

In `source/game/screens/worldScreen.ts` (`:123`), replace:

```ts
      modal.open(screen.ui);
```

with:

```ts
      screen.ui.addOverlay(modal);
```

In `source/game/screens/mainMenuScreen.ts` (`:107`), replace:

```ts
  modal.open(screen.ui);
```

with:

```ts
  screen.ui.addOverlay(modal);
```

The `modal.resize(...)` call that follows each of them stays until Task 5. `buildPauseModal`, the `openModal !== null` guard, both `onHide` lifecycle hooks and the cancel check on `topOverlay?.close` are unchanged.

- [ ] **Step 13: Format and lint**

Run:

```bash
npx prettier --write source/engine/ui/Modal.ts source/engine/ui/ModalRuntime.ts source/game/screens/worldScreen.ts source/game/screens/mainMenuScreen.ts tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts
npx eslint --fix source/engine/ui/Modal.ts source/engine/ui/ModalRuntime.ts source/game/screens/worldScreen.ts source/game/screens/mainMenuScreen.ts tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts
grep -n 'open(' source/engine/ui/Modal.ts
```

Expected: eslint reports `0 errors` (1 warning, `vitest/require-hook` in `Modal.browser.test.ts`). The `grep` prints nothing. The member order in `Modal.ts` is `attach`, `close`, `destroy`, `detach`, `resize`, `#destroyViews`, `#finishClose`.

- [ ] **Step 14: Run the tests to verify they pass**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts tests/UiRoot.browser.test.ts`

Expected: `Test Files 3 passed (3)`, `Tests 100 passed (100)` (22 + 4 + 74).

- [ ] **Step 15: Typecheck**

Run: `npm run typecheck`

Expected: no error. This is what proves that no caller of `Modal.open` is left.

- [ ] **Step 16: Commit**

```bash
git add source/engine/ui/Modal.ts source/engine/ui/ModalRuntime.ts source/game/screens/worldScreen.ts source/game/screens/mainMenuScreen.ts tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts
git commit -m "Attach Modal through UiRoot"
```

---

### Task 3: DialogueBox attaches through UiRoot

Spec "Sequencing" step 3. Independent of Task 2: it needs only Task 1.

**Files:**
- Modify: `source/engine/dialogue/DialogueBox.ts:76-88` (class doc comment), `:226` (getter doc comment), `:243-273` (`destroy`, `open`)
- Modify: `source/game/systems/dialogueBoxSystem.ts:209-219`
- Test: `tests/DialogueBox.browser.test.ts`

**Interfaces:**
- Consumes (Task 1): `UiRoot.addOverlay(overlay)` calls `overlay.attach?.(ui)`; `UiRoot.removeOverlay(overlay)` calls `overlay.detach?.()` and throws `"Overlay wasn't found!"` for an overlay that is not a child.
- Produces:
  - `DialogueBox.attach(ui: UiRoot): void`. Throws `'Dialogue box is already attached to a UI root!'`.
  - `DialogueBox.detach(): void`. Throws `'Dialogue box is not attached to a UI root!'`.
  - `DialogueBox.open` no longer exists. `resize`, `showNode`, `setChoices`, `setSelected`, `setRevealed`, `setAdvanceMarker`, `focusedChoiceIndex`, `breaks`, `children`, `isCollapsed` and `destroy` keep their signatures. The box gets no `isReusable`: that option decides what `close()` does, and the box has none.

- [ ] **Step 1: Switch the call sites**

Run:

```bash
sed -i 's/box\.open(ui);/ui.addOverlay(box);/' tests/DialogueBox.browser.test.ts
```

Then run: `grep -c 'ui\.addOverlay(box);' tests/DialogueBox.browser.test.ts` and `grep -c 'box\.open(' tests/DialogueBox.browser.test.ts`

Expected: `5` and `0`.

- [ ] **Step 2: Reword the title and the comment that say "open"**

In `tests/DialogueBox.browser.test.ts` (`:299`), replace:

```ts
  test('open takes a focus scope: no choices means nothing is focusable', async () => {
```

with:

```ts
  test('an added box takes a focus scope: no choices means nothing is focusable', async () => {
```

and in the same test replace:

```ts
    // The regression: focus commands must not escape to HUD widgets while the
    // box is open with plain text.
```

with:

```ts
    // The regression: focus commands must not escape to HUD widgets while the
    // box is attached with plain text.
```

- [ ] **Step 3: Write the failing tests**

In `tests/DialogueBox.browser.test.ts`, inside `describe('DialogueBox focus integration', ...)`, insert the six tests below directly above this line, with one blank line after them:

```ts
  test('destroy releases the scope back to the screen', async () => {
```

The tests. `createUiWithOutsideButton` and `createBox` already exist in the file:

```ts
  test('adding an attached box throws', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    ui.addOverlay(box);

    expect(() => {
      ui.addOverlay(box);
    }).toThrow('Overlay was already added to the UI root!');

    expect(ui.children.filter((child) => child === box)).toHaveLength(1);
    expect(ui.topOverlay).toBe(box);
  });

  test('a box is attached to one root at a time', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {ui: other} = await createUiWithOutsideButton();
    let {box} = createBox();

    ui.addOverlay(box);

    expect(() => {
      other.addOverlay(box);
    }).toThrow('Dialogue box is already attached to a UI root!');
  });

  test('detach() throws for a box that is not attached', () => {
    let {box} = createBox();

    expect(() => {
      box.detach();
    }).toThrow('Dialogue box is not attached to a UI root!');
  });

  test('ui.removeOverlay(box) keeps the box alive, and it can be added again', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let chosen = vitest.fn<(index: number) => void>();
    let {box} = createBox({onChooseTap: chosen});

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);
    ui.removeOverlay(box);

    expect(box.view.destroyed).toBe(false);
    expect(ui.children).not.toContain(box);
    expect(ui.topOverlay).toBeNull();
    // Detached, the box no longer asks the root which choice is focused.
    expect(box.focusedChoiceIndex).toBe(-1);

    ui.focusNext();

    expect(ui.focused).toBe(outside);

    // The same instance across dialogues: the scope and the focus sync are back.
    ui.addOverlay(box);
    box.showNode({page: 'Again'});
    box.setChoices(['Yes', 'No'], 1);

    expect(ui.topOverlay).toBe(box);
    expect(box.focusedChoiceIndex).toBe(1);

    ui.activate();

    expect(chosen).toHaveBeenCalledWith(1);
  });

  test('destroy() after ui.removeOverlay(box) leaves the root alone', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    ui.removeOverlay(box);

    expect(() => {
      box.destroy();
    }).not.toThrow();

    expect(box.view.destroyed).toBe(true);
    expect(ui.children).toEqual([outside]);
  });

  test('destroy() survives a root that was destroyed first', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    // Not through ui.destroy(), which would cascade into box.destroy(): the
    // root's view is gone while the box still points at the root.
    ui.view.destroy();

    expect(() => {
      box.destroy();
    }).not.toThrow();

    expect(box.view.destroyed).toBe(true);
    expect(box.focusedChoiceIndex).toBe(-1);
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run --project browser tests/DialogueBox.browser.test.ts`

Expected: `Tests 6 failed | 14 passed (20)`. The six failures: `choices are focusable in the scope and activation confirms the focused one` and `setSelected pulls focus along, so hover and keyboard stay in lockstep` (`expected -1 to be ...`, the box never learns its root), `a box is attached to one root at a time`, `detach() throws for a box that is not attached` (`box.detach is not a function`), `ui.removeOverlay(box) keeps the box alive, and it can be added again`, and `destroy releases the scope back to the screen`.

Three of the new tests pass already, and that is correct: `adding an attached box throws` is carried by the guard Task 1 put into `UiRoot`, and the two `destroy()` tests pin behaviour that must survive Step 6, where the order inside `destroy()` changes.

- [ ] **Step 5: Rewrite the two doc comments**

In `source/engine/dialogue/DialogueBox.ts` (`:76-88`), replace the first two paragraphs of the class doc comment. The third paragraph ("The layout is settled at showNode...") is unchanged:

```ts
/**
 * The dialogue display widget in the Modal idiom: a flat class owning a view,
 * composed from the existing UI widgets, no inheritance, no ECS and no
 * channels. The root positions itself as a bottom bar in screen art px; a
 * LayoutContainer subtree under a plain container computes as an independent
 * layout root because its width and height are numbers.
 *
 * Like Modal, the box opens INTO a ui root as an overlay and holds its focus
 * scope while it lives: choice buttons are ordinary focusables inside the
 * scope, and with no choices on screen the scope is empty, so focus commands
 * cannot wander to HUD widgets behind the box. Unlike Modal it declares no
 * close, so it is not dismissible: the cancel command passes over it.
 *
```

with:

```ts
/**
 * The dialogue display widget: a flat class owning a view, composed from the
 * existing UI widgets, no inheritance, no ECS and no channels. The root
 * positions itself as a bottom bar in screen art px; a LayoutContainer subtree
 * under a plain container computes as an independent layout root because its
 * width and height are numbers.
 *
 * The box is an overlay: it is added with ui.addOverlay(box) and holds the
 * focus scope while it is attached. Choice buttons are ordinary focusables
 * inside the scope, and with no choices on screen the scope is empty, so focus
 * commands cannot wander to HUD widgets behind the box. It declares no close,
 * so it is not dismissible: the cancel command passes over it.
 *
```

Replace (`:226`):

```ts
  /** Index of the focused choice button, -1 when focus is elsewhere or the box is not open. */
```

with:

```ts
  /** Index of the focused choice button, -1 when focus is elsewhere or the box is not attached. */
```

- [ ] **Step 6: Replace `destroy` and `open` with `attach`, `destroy` and `detach`**

The `#ui` field stays: the box needs it for `focusedChoiceIndex` and `#applySelected`. In `source/engine/dialogue/DialogueBox.ts` (`:243-273`), replace:

```ts
  /** Destroys the instance. */
  destroy(): void {
    // removeOverlay releases this box's own scope, not whatever sits on top,
    // and owns the scope-then-child order that keeps previousFocus restored.
    let ui = this.#ui;

    this.#ui = null;

    if (ui !== null && !ui.view.destroyed) {
      ui.removeOverlay(this);
    }

    this.#choiceButtons = [];
    this.#box?.destroy();
    this.#box = null;
    this.view.destroy({children: true});
  }

  /**
   * Attaches into the screen's ui as an overlay, holding the focus scope for
   * the box's lifetime; destroy releases it. With no close declared the
   * overlay is not dismissible.
   */
  open(ui: UiRoot): void {
    if (this.#ui !== null || this.view.destroyed) {
      return;
    }

    this.#ui = ui;
    ui.addOverlay(this);
  }
```

with:

```ts
  // The box keeps the root for the two things it asks of it: which choice is
  // focused, and moving focus to the selected one.
  /** @internal Called by `UiRoot`. */
  attach(ui: UiRoot) {
    if (this.#ui) {
      throw new Error('Dialogue box is already attached to a UI root!');
    }

    this.#ui = ui;
  }

  /** Destroys the instance. */
  destroy(): void {
    // removeOverlay releases this box's own scope, not whatever sits on top,
    // owns the scope-then-child order that keeps previousFocus restored, and
    // calls detach(), which needs #ui still set. The reset below covers a root
    // that was destroyed first.
    let ui = this.#ui;

    if (ui !== null && !ui.view.destroyed) {
      ui.removeOverlay(this);
    }

    this.#ui = null;

    this.#choiceButtons = [];
    this.#box?.destroy();
    this.#box = null;
    this.view.destroy({children: true});
  }

  /** @internal Called by `UiRoot`. */
  detach() {
    if (!this.#ui) {
      throw new Error('Dialogue box is not attached to a UI root!');
    }

    this.#ui = null;
  }
```

The order inside `destroy()` changed on purpose: `this.#ui = null` used to come before `removeOverlay`. It now comes after, because `removeOverlay` calls `detach()`, and `detach()` throws when `#ui` is already `null`.

- [ ] **Step 7: Switch `dialogueBoxSystem`**

In `source/game/systems/dialogueBoxSystem.ts` (`:209-219`), replace:

```ts
      // The Modal precedent: the box opens into the screen's ui and holds a
      // focus scope, so focus commands stay on its choices (or nothing) and
      // never wander to HUD widgets. Headless harnesses without a screen fall
      // back to the world layer; the box works there minus keyboard focus.
      let ui = game.currentScreen?.ui;

      if (ui === undefined) {
        layer.addChild(box.view);
      } else {
        box.open(ui);
      }
```

with:

```ts
      // The box is added to the screen's ui as an overlay and holds the focus
      // scope, so focus commands stay on its choices (or nothing) and never
      // wander to HUD widgets. Headless harnesses without a screen fall back
      // to the world layer; the box works there minus keyboard focus.
      let ui = game.currentScreen?.ui;

      if (ui === undefined) {
        layer.addChild(box.view);
      } else {
        ui.addOverlay(box);
      }
```

One box per dialogue stays: the system still creates the box when a dialogue starts and destroys it when the dialogue ends.

- [ ] **Step 8: Format and lint**

Run:

```bash
npx prettier --write source/engine/dialogue/DialogueBox.ts source/game/systems/dialogueBoxSystem.ts tests/DialogueBox.browser.test.ts
npx eslint --fix source/engine/dialogue/DialogueBox.ts source/game/systems/dialogueBoxSystem.ts tests/DialogueBox.browser.test.ts
grep -rn '\.open(' source tests --include=*.ts
```

Expected: eslint reports `0 errors` (2 warnings: `no-non-null-assertion` in `DialogueBox.ts`, `vitest/require-hook` in the test). With Task 2 done the `grep` prints nothing; with Task 2 still open it prints only the `modal.open(` lines Task 2 removes.

- [ ] **Step 9: Run the tests to verify they pass**

Run:

```bash
npx vitest run --project browser tests/DialogueBox.browser.test.ts tests/DialogueBoxLayout.browser.test.ts tests/DialogueBoxReveal.browser.test.ts tests/mapSign.browser.test.ts
npx vitest run --project unit tests/dialogueBoxSystem.test.ts
```

Expected: browser `Test Files 4 passed (4)`, `Tests 33 passed (33)`, of which `DialogueBox.browser.test.ts` is 20. Unit `Tests 3 passed (3)`; that suite has no screen, so it runs the `layer.addChild(box.view)` fallback.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`

Expected: no error.

- [ ] **Step 11: Commit**

```bash
git add source/engine/dialogue/DialogueBox.ts source/game/systems/dialogueBoxSystem.ts tests/DialogueBox.browser.test.ts
git commit -m "Attach DialogueBox through UiRoot"
```

---

### Task 4: Reusable modals

Spec "Sequencing" step 4. Needs Task 2.

**Files:**
- Modify: `source/engine/ui/ModalOptions.ts:16`
- Modify: `source/engine/ui/ModalConfig.ts:7`
- Modify: `source/engine/ui/Modal.ts` (class comment, constructor, `destroy` comment, `#finishClose`)
- Test: `tests/Modal.browser.test.ts`

**Interfaces:**
- Consumes (Task 2): `Modal.attach(ui)`, `Modal.detach()`, `#finishClose()` calling `this.#runtime.ui?.removeOverlay(this)`. (Task 1): `addOverlay` throws `'Overlay was already added to the UI root!'` and `'Overlay is destroyed!'`.
- Produces:
  - `ModalOptions['isReusable']?: boolean | undefined`, default `false`.
  - `ModalConfig['isReusable']: boolean`.
  - With `isReusable: true`, `close()` removes the modal, keeps its views, fires `onClosing` and `onClosed`, and ends in `'closed'`; the same instance can be added again. `destroy()` always destroys.

The three ways out, from the spec:

| Way out | Lifecycle hooks | `isReusable: false` | `isReusable: true` |
| --- | --- | --- | --- |
| `close()`, cancel command | `onClosing`, `onClosed` | removed, destroyed | removed, kept |
| `destroy()` | none | removed, destroyed | removed, destroyed |
| `ui.removeOverlay(modal)` | none | removed, kept | removed, kept |

- [ ] **Step 1: Write the failing tests**

In `tests/Modal.browser.test.ts`, insert the block below directly above this line, with one blank line after it:

```ts
  describe('fade (scheduler + fadeDuration)', () => {
```

The block:

```ts
  describe('isReusable', () => {
    test('close() keeps the views, fires onClosed and ends in closed', () => {
      let root = createRoot();
      let outside = focusable();

      root.addChild(outside);

      let calls: string[] = [];
      let content = {...panel([focusable()]), destroy: vitest.fn<() => void>()};
      let modal = new Modal({
        children: [content],
        isReusable: true,
        onClosing: () => {
          calls.push('closing');
        },
        onClosed: () => {
          calls.push(`closed:${modal.state}:${String(root.children.includes(modal))}`);
        },
      });

      root.focus(outside);
      root.addOverlay(modal);
      modal.close();

      // onClosed fires last: the modal has already left the root by then.
      expect(calls).toEqual(['closing', 'closed:closed:false']);
      expect(modal.state).toBe('closed');
      expect(root.children).not.toContain(modal);
      expect(root.topOverlay).toBeNull();
      expect(root.focused).toBe(outside);
      expect((modal.view as unknown as MockContainer).destroyed).toBe(false);
      expect(content.destroy).not.toHaveBeenCalled();
      expect(modal.children).toEqual([content]);

      modal.destroy();
    });

    test('a kept modal can be added again, and every close fires both hooks', () => {
      let root = createRoot();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let first = focusable();
      let second = focusable();
      let modal = new Modal({
        children: [panel([first, second])],
        initialFocus: first,
        isReusable: true,
        onClosing,
        onClosed,
      });

      root.addOverlay(modal);
      root.focus(second);
      modal.close();
      root.addOverlay(modal);

      // Keyboard focus is not kept: initialFocus is applied on every attach.
      expect(modal.state).toBe('open');
      expect(root.topOverlay).toBe(modal);
      expect(root.focused).toBe(first);
      expect(root.isRingVisible).toBe(false);

      modal.close();

      expect(onClosing).toHaveBeenCalledTimes(2);
      expect(onClosed).toHaveBeenCalledTimes(2);
      expect((modal.view as unknown as MockContainer).destroyed).toBe(false);

      modal.destroy();
    });

    test('a kept modal fades in again from alpha 0', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let modal = new Modal({isReusable: true, scheduler, fadeDuration: 200});
      let view = modal.view as unknown as MockContainer;

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();
      scheduler.update(tick(200)); // closed, alpha 0

      expect(modal.state).toBe('closed');
      expect(view.alpha).toBe(0);
      expect(view.destroyed).toBe(false);

      root.addOverlay(modal);

      expect(modal.state).toBe('opening');
      expect(view.alpha).toBe(0);

      scheduler.update(tick(100));

      expect(view.alpha).toBeCloseTo(0.75); // easeOutQuad(0.5)

      scheduler.update(tick(100));

      expect(view.alpha).toBe(1);
      expect(modal.state).toBe('open');

      modal.destroy();
    });

    test('adding a kept modal that is still fading out throws', () => {
      let root = createRoot();
      let scheduler = new Scheduler();
      let modal = new Modal({isReusable: true, scheduler, fadeDuration: 200});

      root.addOverlay(modal);
      scheduler.update(tick(200)); // open
      modal.close();

      expect(() => {
        root.addOverlay(modal);
      }).toThrow('Overlay was already added to the UI root!');

      scheduler.update(tick(200)); // closed

      expect(() => {
        root.addOverlay(modal);
      }).not.toThrow();

      modal.destroy();
    });

    test('destroy() destroys a kept modal, attached or not', () => {
      let root = createRoot();
      let onClosing = vitest.fn<() => void>();
      let onClosed = vitest.fn<() => void>();
      let attachedContent = {...panel([]), destroy: vitest.fn<() => void>()};
      let attached = new Modal({
        children: [attachedContent],
        isReusable: true,
        onClosing,
        onClosed,
      });
      let kept = new Modal({isReusable: true, onClosing, onClosed});

      root.addOverlay(attached);
      attached.destroy();

      root.addOverlay(kept);
      kept.close();
      kept.destroy();

      expect(root.children).toEqual([]);
      expect((attached.view as unknown as MockContainer).destroyed).toBe(true);
      expect(attachedContent.destroy).toHaveBeenCalledTimes(1);
      expect((kept.view as unknown as MockContainer).destroyed).toBe(true);
      // Only kept.close() fired hooks; destroy() never does.
      expect(onClosing).toHaveBeenCalledTimes(1);
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    test('adding a destroyed kept modal throws', () => {
      let root = createRoot();
      let modal = new Modal({isReusable: true});

      root.addOverlay(modal);
      modal.close();
      modal.destroy();

      expect(() => {
        root.addOverlay(modal);
      }).toThrow('Overlay is destroyed!');
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts`

Expected: `Tests 4 failed | 24 passed (28)`. Failing: `close() keeps the views, fires onClosed and ends in closed` (`expected true to be false`, the view was destroyed), `a kept modal can be added again, and every close fires both hooks` and `adding a kept modal that is still fading out throws` (`Overlay is destroyed!`), and `a kept modal fades in again from alpha 0`.

`destroy() destroys a kept modal, attached or not` and `adding a destroyed kept modal throws` pass already: today every modal is destroyed by `close()`. They pin what `isReusable` must not change.

- [ ] **Step 3: Add the option**

In `source/engine/ui/ModalOptions.ts` (`:16`), replace:

```ts
  initialFocus?: Focusable | undefined;
  // Fired once when a user-facing close begins, before any fade, never on
```

with:

```ts
  initialFocus?: Focusable | undefined;
  // Keeps the modal alive after close(), so the same instance can be added
  // again with ui.addOverlay(); its owner then destroys it. Off by default:
  // close() destroys the modal.
  isReusable?: boolean | undefined;
  // Fired once when a user-facing close begins, before any fade, never on
```

In `source/engine/ui/ModalConfig.ts` (`:7`), replace:

```ts
  initialFocus: Focusable | undefined;
  scheduler: Scheduler | undefined;
```

with:

```ts
  initialFocus: Focusable | undefined;
  isReusable: boolean;
  scheduler: Scheduler | undefined;
```

- [ ] **Step 4: Resolve the option into `#config`**

In `source/engine/ui/Modal.ts`, in the constructor's parameter list, replace:

```ts
    initialFocus,
    onClosing,
    onClosed,
    scheduler,
    fadeDuration,
  }: ModalOptions) {
```

with:

```ts
    initialFocus,
    isReusable = false,
    onClosing,
    onClosed,
    scheduler,
    fadeDuration,
  }: ModalOptions) {
```

and replace:

```ts
    this.#config = {
      fadeDuration,
      initialFocus,
      scheduler,
    };
```

with:

```ts
    this.#config = {
      fadeDuration,
      initialFocus,
      isReusable,
      scheduler,
    };
```

- [ ] **Step 5: Skip the destroy for a kept modal**

In `source/engine/ui/Modal.ts`, replace:

```ts
  // removeOverlay releases this modal's own scope before removing it, so the
  // previousFocus restoration (the Options flow depends on it) cannot be lost
  // to ordering here; it then calls detach().
  /** TBD */
  #finishClose() {
    this.#runtime.ui?.removeOverlay(this);
    this.#destroyViews();
    this.#onClosed?.();
  }
```

with:

```ts
  // removeOverlay releases this modal's own scope before removing it, so the
  // previousFocus restoration (the Options flow depends on it) cannot be lost
  // to ordering here; it then calls detach(). A kept modal skips the destroy
  // and can be added again.
  /** TBD */
  #finishClose() {
    this.#runtime.ui?.removeOverlay(this);

    if (!this.#config.isReusable) {
      this.#destroyViews();
    }

    this.#onClosed?.();
  }
```

`destroy()` is not touched: it calls `#destroyViews()` without asking `isReusable`.

- [ ] **Step 6: Rewrite the two comments that describe the modal's lifetime**

In `source/engine/ui/Modal.ts`, replace the class comment:

```ts
// with ui.addOverlay(modal). Constructed per open by whatever handler opens
// it; the owning screen tracks the instance and calls destroy() (never the
// animated close()) from its onHide.
```

with:

```ts
// with ui.addOverlay(modal). Constructed per open by whatever handler opens
// it, unless isReusable keeps it alive after close(); the owning screen tracks
// the instance and calls destroy() (never the animated close()) from its
// onHide.
```

and in the comment of `destroy()` replace:

```ts
  // and synchronously destroys; callable from any state, never animated, never
  // fires onClosing or onClosed.
```

with:

```ts
  // and synchronously destroys; callable from any state, never animated, never
  // fires onClosing or onClosed, and destroys a kept modal too.
```

- [ ] **Step 7: Format and lint**

Run:

```bash
npx prettier --write source/engine/ui/Modal.ts source/engine/ui/ModalOptions.ts source/engine/ui/ModalConfig.ts tests/Modal.browser.test.ts
npx eslint --fix source/engine/ui/Modal.ts source/engine/ui/ModalOptions.ts source/engine/ui/ModalConfig.ts tests/Modal.browser.test.ts
grep -rn 'isReusable' source/game
```

Expected: eslint reports `0 errors` (1 warning, `vitest/require-hook`). The `grep` prints nothing: both modals of the test game stay single-use.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/pauseFlow.browser.test.ts`

Expected: `Test Files 2 passed (2)`, `Tests 32 passed (32)` (28 + 4).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`

Expected: no error.

- [ ] **Step 10: Commit**

```bash
git add source/engine/ui/Modal.ts source/engine/ui/ModalOptions.ts source/engine/ui/ModalConfig.ts tests/Modal.browser.test.ts
git commit -m "Add reusable modals"
```

---

### Task 5: Yoga sizes the modal

Spec "Sequencing" step 5. Last of the code tasks, because it carries the hit area, which the spec calls the only unproven part. Needs Tasks 2 and 4.

**Files:**
- Create: `tests/ModalLayout.browser.test.ts`
- Modify: `tests/Modal.browser.test.ts` (the `resize()` test, the scrim test)
- Modify: `source/engine/ui/Modal.ts` (scrim block, root layout block, `attach`, `resize` deleted)
- Modify: `source/game/screens/worldScreen.ts` (the `resize` call, the `onResize` lifecycle hook)
- Modify: `source/game/screens/mainMenuScreen.ts` (the `resize` call, the `onResize` lifecycle hook)

**Interfaces:**
- Consumes (Task 2): `Modal.attach(ui)`. (Task 4): `isReusable`.
- Produces:
  - `Modal.resize` no longer exists.
  - `Modal.attach(ui)` also throws `'UI root has no layout, the modal is sized against it!'` when `ui.view.layout === null`.
  - A `Modal` root has the layout `{position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', ...callerLayout}`. Its scrim is drawn once as `rect(0, 0, 1, 1)`, has the same five layout keys and the hit area `{contains: () => true}`.

Facts about `@pixi/layout` 3.2 this task relies on, all read in `node_modules/@pixi/layout/dist/core` and confirmed by the tests below:

- The `layout` getter of a container returns `null` while it has no layout (`ContainerMixin.mjs:12`). It exists only once `@pixi/layout` was imported. `tests/Modal.browser.test.ts` and `tests/pauseFlow.browser.test.ts` never import it, so there `view.layout` is a plain property, `undefined` on the `UiRoot` view, and the check in `attach` does not fire.
- A layout root without a parent layout is computed with `calculateLayout(style.width, style.height)`, which needs numbers (`LayoutSystem.mjs`, `updateLayout`). In the game that root is `game.view`. In `ModalLayout.browser.test.ts` a `stage` container stands in for it.
- A `pixi.Graphics` with a layout is a leaf whose `objectFit` defaults to `'fill'` (`ViewContainerMixin.mjs`): yoga scales the 1x1 drawing to the computed box.
- pixi's hit test asks `hitArea.contains()` and nothing else when a container has a hit area (`EventBoundary.hitPruneFn`, `hitTestFn`), so the scrim's size and transform do not matter to it.

- [ ] **Step 1: Write the failing layout tests**

Create `tests/ModalLayout.browser.test.ts`:

```ts
import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {afterEach, beforeAll, describe, expect, test} from 'vitest';

import {Modal} from '../source/engine/ui/Modal.js';
import {UiRoot} from '../source/engine/ui/UiRoot.js';
import {createTestTheme} from './createTestTheme.js';

// UiRoot registers its pointertap listeners via the federated event system
// (addEventListener), which pixi only installs on Container through this side
// effect. The hit test below needs the same mixin (isInteractive).
import 'pixi.js/events';

// The art-px screen of the verification probes.
const SCREEN_WIDTH = 240;
const SCREEN_HEIGHT = 135;
let layoutSystem: LayoutSystem;
let stages: pixi.Container[] = [];
let roots: UiRoot[] = [];

// Stands in for game.view: the layout root with a size in numbers, which the
// percentages of the UiRoot view resolve against.
function createStage(uiLayout: Record<string, unknown> | null = {}) {
  let stage = new pixi.Container();
  let root = new UiRoot({theme: createTestTheme()});

  stage.layout = {width: SCREEN_WIDTH, height: SCREEN_HEIGHT};

  if (uiLayout !== null) {
    root.view.layout = {width: '100%', height: '100%', ...uiLayout};
  }

  stage.addChild(root.view);
  stages.push(stage);
  roots.push(root);

  return {root, stage};
}

function layOut(stage: pixi.Container) {
  // prerender re-measures the leaf intrinsic sizes, which is what the renderer
  // does each frame; update() then runs yoga, as the first rendered frame does.
  layoutSystem.prerender({container: stage});
  layoutSystem.update(stage);
}

function getComputedLayout(container: pixi.Container) {
  let {layout} = container;

  if (!layout) {
    throw new Error('Expected a container with a computed layout!');
  }

  return layout.computedLayout;
}

function getScrim(modal: Modal): pixi.Graphics {
  let scrim = modal.view.children[0];

  if (!(scrim instanceof pixi.Graphics)) {
    throw new TypeError('Expected the scrim to be the first view child!');
  }

  return scrim;
}

// An interactive stand-in for a HUD widget behind the modal.
function createHudButton() {
  let view = new pixi.Container();

  view.eventMode = 'static';
  view.hitArea = new pixi.Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  return {view};
}

describe('Modal layout', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    for (let stage of stages) {
      stage.destroy({children: true});
    }

    roots = [];
    stages = [];
  });

  test('the modal fills the UiRoot view', () => {
    let {root, stage} = createStage();
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({
      left: 0,
      top: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
  });

  test('the modal fills the UiRoot view when that view has padding', () => {
    // worldScreen pads its HUD by 4; the modal must still reach the screen edge.
    let {root, stage} = createStage({padding: 4});
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({
      left: 0,
      top: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
  });

  test('the modal stays out of the flow of the UiRoot view', () => {
    let {root, stage} = createStage({justifyContent: 'center', alignItems: 'center'});
    let banner = new pixi.Container();

    banner.layout = {width: 40, height: 20};
    root.addChild(banner);
    layOut(stage);

    let before = {...getComputedLayout(banner)};

    root.addOverlay(new Modal({}));
    layOut(stage);

    expect(getComputedLayout(banner)).toEqual(before);
  });

  test('the caller layout places the content inside the full-screen root', () => {
    let {root, stage} = createStage();
    let content = new pixi.Container();

    // Even width, odd height: both centered offsets are whole art px.
    content.layout = {width: 40, height: 21};

    let modal = new Modal({
      children: [content],
      layout: {justifyContent: 'center', alignItems: 'center'},
    });

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(content)).toMatchObject({
      left: (SCREEN_WIDTH - 40) / 2,
      top: (SCREEN_HEIGHT - 21) / 2,
      width: 40,
      height: 21,
    });
  });

  test('the modal follows a change of the root size on the next layout pass', () => {
    let {root, stage} = createStage();
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage);

    stage.layout = {width: 480, height: 270};
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({width: 480, height: 270});
    expect(getScrim(modal).getBounds()).toMatchObject({x: 0, y: 0, width: 480, height: 270});
  });

  test('the scrim covers the whole modal in the first rendered frame', () => {
    let {root, stage} = createStage({padding: 4});
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage); // one pass, as the first rendered frame runs

    expect(getScrim(modal).getBounds()).toMatchObject({
      x: 0,
      y: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
  });

  test('a kept modal added again after a size change has the new size', () => {
    let {root, stage} = createStage();
    let modal = new Modal({isReusable: true});

    root.addOverlay(modal);
    layOut(stage);
    modal.close();

    stage.layout = {width: 480, height: 270};
    layOut(stage);

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({width: 480, height: 270});
    expect(getScrim(modal).getBounds()).toMatchObject({x: 0, y: 0, width: 480, height: 270});

    modal.destroy();
  });

  test('a pointer press right after addOverlay, before any render, hits the scrim', () => {
    let {root, stage} = createStage();
    let hud = createHudButton();
    let boundary = new pixi.EventBoundary(stage);

    root.addChild(hud);

    expect(boundary.hitTest(200, 100)).toBe(hud.view);

    let modal = new Modal({});

    root.addOverlay(modal);

    // No layout pass and no render yet: the scrim has no size, so only its
    // hit area can stop the press from reaching the HUD.
    expect(boundary.hitTest(200, 100)).toBe(getScrim(modal));
    expect(boundary.hitTest(0, 0)).toBe(getScrim(modal));
  });

  test('the scrim releases the pointer when the modal is removed', () => {
    let {root, stage} = createStage();
    let hud = createHudButton();
    let boundary = new pixi.EventBoundary(stage);
    let modal = new Modal({});

    root.addChild(hud);
    root.addOverlay(modal);
    layOut(stage);
    modal.close();

    expect(boundary.hitTest(200, 100)).toBe(hud.view);
  });

  test('attach throws when the UiRoot view has no layout', () => {
    let {root} = createStage(null);
    let modal = new Modal({});

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('UI root has no layout, the modal is sized against it!');

    // UiRoot does not roll back a throwing attach: the overlay is a child and
    // holds the scope, and the modal never opened.
    expect(modal.state).toBe('closed');
    expect(root.topOverlay).toBe(modal);
  });
});
```

- [ ] **Step 2: Replace the `resize()` test and extend the scrim test**

In `tests/Modal.browser.test.ts`, replace:

```ts
  test('resize() sizes the root layout and redraws the scrim', () => {
    let modal = new Modal({});

    modal.resize(800, 600);

    expect((modal.view as unknown as MockContainer).layout).toMatchObject({
      width: 800,
      height: 600,
    });

    let scrim = (modal.view as unknown as MockContainer).children[0] as unknown as Graphics;

    // The real Graphics records its drawing in the context bounds: the scrim
    // is redrawn to cover exactly the resized modal.
    expect(scrim.bounds).toMatchObject({x: 0, y: 0, width: 800, height: 600});
  });
```

with:

```ts
  test('the root asks yoga for the whole UiRoot view, out of its flow', () => {
    let modal = new Modal({});

    expect((modal.view as unknown as MockContainer).layout).toMatchObject({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
    });
  });
```

and replace:

```ts
  test('the scrim is a raw interactive view child behind the content, outside children[]', () => {
    let content = panel([]);
    let modal = new Modal({children: [content], scrimAlpha: 0.7});
    let viewChildren = (modal.view as unknown as MockContainer).children;
    let scrim = viewChildren[0] as unknown as Graphics;

    expect(scrim instanceof Graphics).toBe(true); // it is the Graphics scrim
    expect(scrim.alpha).toBeCloseTo(0.7);
    expect(scrim.eventMode).toBe('static');
    expect(viewChildren[1]).toBe(content.view as unknown as MockContainer);
    expect(modal.children).toEqual([content]); // the focus walk never sees the scrim
  });
```

with:

```ts
  test('the scrim is a raw interactive view child behind the content, outside children[]', () => {
    let content = panel([]);
    let modal = new Modal({children: [content], scrimAlpha: 0.7});
    let viewChildren = (modal.view as unknown as MockContainer).children;
    let scrim = viewChildren[0] as unknown as Graphics;

    expect(scrim instanceof Graphics).toBe(true); // it is the Graphics scrim
    expect(scrim.alpha).toBeCloseTo(0.7);
    expect(scrim.eventMode).toBe('static');
    // The hit area accepts every point, so the scrim blocks before yoga sized
    // it, and wherever the press lands.
    expect(scrim.hitArea?.contains(0, 0)).toBe(true);
    expect(scrim.hitArea?.contains(-5000, 9000)).toBe(true);
    // Drawn once as a unit square; yoga stretches it over the root.
    expect(scrim.bounds).toMatchObject({x: 0, y: 0, width: 1, height: 1});
    expect((scrim as unknown as MockContainer).layout).toMatchObject({
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
    });
    expect(viewChildren[1]).toBe(content.view as unknown as MockContainer);
    expect(modal.children).toEqual([content]); // the focus walk never sees the scrim
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --project browser tests/Modal.browser.test.ts tests/ModalLayout.browser.test.ts`

Expected: `Tests 10 failed | 28 passed (38)`. In `Modal.browser.test.ts` the two tests of Step 2 fail. In `ModalLayout.browser.test.ts` eight of ten fail; the modal's computed layout is 0x0 (`expected { left: +0, right: +0, top: +0, …(3) } to match object { left: +0, top: +0, width: 240, …(1) }`), the press hits the HUD stand-in instead of the scrim, and `attach` does not throw.

`the modal stays out of the flow of the UiRoot view` and `the scrim releases the pointer when the modal is removed` pass already. They pin what the new layout and the new hit area must not break.

- [ ] **Step 4: Size the scrim by layout and give it the hit area**

In `source/engine/ui/Modal.ts`, in the constructor, replace:

```ts
    // reaching the game view, which blocks click-to-move for free). It sits
    // out-of-flow (no layout of its own) at (0, 0) — the same mixed
    // layout/non-layout child behavior loadingScreen's view exercises.
    this.#parts.scrim.alpha = scrimAlpha;
    this.#parts.scrim.eventMode = 'static';
    this.view.addChild(this.#parts.scrim);
```

with:

```ts
    // reaching the game view, which blocks click-to-move for free). It sits
    // out of flow and is drawn once as a 1x1 rectangle that yoga stretches over
    // the root (a leaf's objectFit defaults to 'fill'). Its hit area accepts
    // every point, so it blocks from the moment it is attached, before the
    // first layout pass has sized it.
    this.#parts.scrim.rect(0, 0, 1, 1).fill(0x000000);
    this.#parts.scrim.alpha = scrimAlpha;
    this.#parts.scrim.eventMode = 'static';
    this.#parts.scrim.hitArea = {contains: () => true};
    this.#parts.scrim.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
    };
    this.view.addChild(this.#parts.scrim);
```

- [ ] **Step 5: Size the root by layout**

In `source/engine/ui/Modal.ts`, in the constructor, replace:

```ts
    // owning UiRoot's view may have (the menu centers its own children); the
    // caller's layout still styles content placement inside the root.
    this.view.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      ...(typeof layout === 'object' ? layout : undefined),
    };
```

with:

```ts
    // owning UiRoot's view may have (the menu centers its own children); the
    // caller's layout still styles content placement inside the root. The
    // percentages give that layout something to resolve against and keep the
    // scrim covering the screen: yoga sizes the root against the UiRoot's
    // view, so the modal never reads screen dimensions itself.
    this.view.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      ...(typeof layout === 'object' ? layout : undefined),
    };
```

- [ ] **Step 6: Refuse a root without a layout**

In `source/engine/ui/Modal.ts`, in `attach()`, replace:

```ts
      throw new Error('Modal is already attached to a UI root!');
    }

    this.#runtime.ui = ui;
```

with:

```ts
      throw new Error('Modal is already attached to a UI root!');
    }

    if (ui.view.layout === null) {
      throw new Error('UI root has no layout, the modal is sized against it!');
    }

    this.#runtime.ui = ui;
```

The comparison is with `null` on purpose. Without `@pixi/layout` the property is `undefined` and the modal has nothing to be sized by anyway.

- [ ] **Step 7: Delete `resize()`**

In `source/engine/ui/Modal.ts`, replace:

```ts
  // Dumb plumbing: gives the caller's layout something to resolve against and
  // keeps the scrim covering the screen. The owning screen calls it once right
  // after ui.addOverlay(modal) and again from its onResize; the modal never
  // reads screen dimensions itself.
  /** TBD */
  resize(width: number, height: number) {
    if (this.view.destroyed) {
      return;
    }

    this.view.layout = {width, height};
    this.#parts.scrim.clear().rect(0, 0, width, height).fill(0x000000);
  }

  /** TBD */
  #destroyViews() {
```

with:

```ts
  /** TBD */
  #destroyViews() {
```

The comment of `resize()` is not lost: what it said ("gives the caller's layout something to resolve against and keeps the scrim covering the screen", "the modal never reads screen dimensions itself") moved into the root layout comment in Step 5.

- [ ] **Step 8: Delete the `resize` calls and both `onResize` lifecycle hooks**

In `source/game/screens/worldScreen.ts`, replace:

```ts
      screen.ui.addOverlay(modal);
      modal.resize(
        screen.game.app.screen.width / screen.game.pixelScale,
        screen.game.app.screen.height / screen.game.pixelScale,
      );
```

with:

```ts
      screen.ui.addOverlay(modal);
```

and replace:

```ts
    screen.contents.openModal = null;
  },
  onResize: (screen) => {
    screen.contents.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
  onUpdate: (ticker, screen) => {
```

with:

```ts
    screen.contents.openModal = null;
  },
  onUpdate: (ticker, screen) => {
```

In `source/game/screens/mainMenuScreen.ts`, replace:

```ts
  screen.ui.addOverlay(modal);
  modal.resize(game.app.screen.width / game.pixelScale, game.app.screen.height / game.pixelScale);
```

with:

```ts
  screen.ui.addOverlay(modal);
```

and replace:

```ts
    screen.contents.openModal = null;
  },
  onResize: (screen) => {
    screen.contents.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
});
```

with:

```ts
    screen.contents.openModal = null;
  },
});
```

Both screens already give their `UiRoot` view a layout in `onAttach` (`worldScreen.ts:146`, `mainMenuScreen.ts:154`), so the check of Step 6 passes for them. `GameScreenOptions.onResize` stays in the engine.

- [ ] **Step 9: Format, lint and run the tests to verify they pass**

Run:

```bash
npx prettier --write source/engine/ui/Modal.ts source/game/screens/worldScreen.ts source/game/screens/mainMenuScreen.ts tests/Modal.browser.test.ts tests/ModalLayout.browser.test.ts
npx eslint --fix source/engine/ui/Modal.ts source/game/screens/worldScreen.ts source/game/screens/mainMenuScreen.ts tests/Modal.browser.test.ts tests/ModalLayout.browser.test.ts
npx vitest run --project browser tests/Modal.browser.test.ts tests/ModalLayout.browser.test.ts tests/pauseFlow.browser.test.ts
```

Expected: eslint reports `0 errors` (3 warnings, all `vitest/require-hook`). Vitest: `Test Files 3 passed (3)`, `Tests 42 passed (42)` (28 + 10 + 4).

**Only if `a pointer press right after addOverlay, before any render, hits the scrim` fails while the other nine layout tests pass**, apply the fallback the spec prescribes ("the hit area is dropped and the one-frame gap is documented in the scrim's comment instead"). It passed on 2026-09-29, so first check that Step 4 was applied as written. The fallback:

1. In `source/engine/ui/Modal.ts` delete the line `this.#parts.scrim.hitArea = {contains: () => true};` and replace the last sentence of the scrim comment ("Its hit area accepts every point, so it blocks from the moment it is attached, before the first layout pass has sized it.") with "Its computed layout is 0x0 between attach and the first prerender, so it blocks no pointer press in that window."
2. In `tests/ModalLayout.browser.test.ts` delete the test `a pointer press right after addOverlay, before any render, hits the scrim`. The test `the scrim releases the pointer when the modal is removed` stays; it does not depend on the hit area.
3. In `tests/Modal.browser.test.ts`, in the scrim test, delete the two `scrim.hitArea?.contains` assertions and their comment.
4. Re-run this step. Expected then: `Tests 41 passed (41)`. Say in the commit message and in the task report that the fallback was taken.

- [ ] **Step 10: Typecheck and check that no caller is left**

Run:

```bash
npm run typecheck
grep -rn 'resize(' source/engine/ui source/game/screens tests/Modal.browser.test.ts tests/ModalLayout.browser.test.ts
```

Expected: typecheck prints no error. The `grep` prints nothing. (`box.resize(` in `dialogueBoxSystem.ts` and the `DialogueBox` tests is outside these paths and stays.)

- [ ] **Step 11: Commit**

```bash
git add source/engine/ui/Modal.ts source/game/screens/worldScreen.ts source/game/screens/mainMenuScreen.ts tests/Modal.browser.test.ts tests/ModalLayout.browser.test.ts
git commit -m "Size Modal with yoga"
```

---

### Task 6: Remaining comment rewrites and whole-branch verification

Spec "Sequencing" step 6. No behaviour changes in this task, so there is no red step: the existing suites are the safety net.

**Files:**
- Modify: `source/game/screens/worldScreen.ts` (one comment in `onAttach`)
- Modify: `source/engine/ui/ModalOptions.ts` (the comment of `initialFocus`)
- Modify: `tests/UiRoot.browser.test.ts` (six ring tests: a local and one comment)
- Modify: `tests/Modal.browser.test.ts` (one ring local)

**Interfaces:**
- Consumes: everything Tasks 1 to 5 produced.
- Produces: nothing new. After this task "overlay" means one thing in the source and in the tests: a component added with `addOverlay`.

- [ ] **Step 1: Rewrite the `onAttach` comment of the world screen**

In `source/game/screens/worldScreen.ts`, replace:

```ts
    // handled by the existing root-layout resize path. The focus-ring overlay
    // and the modal stay out of the flow (no layout / position: absolute).
```

with:

```ts
    // handled by the existing root-layout resize path. The focus ring and the
    // overlays stay out of the flow (no layout / position: absolute).
```

- [ ] **Step 2: Rewrite the `initialFocus` comment**

A kept modal is attached more than once, and `initialFocus` is applied each time. In `source/engine/ui/ModalOptions.ts`, replace:

```ts
  // Applied via ui.focus() on open (programmatic — no ring shown). When
  // omitted nothing is focused, same as screens.
```

with:

```ts
  // Applied via ui.focus() on every attach (programmatic, no ring shown).
  // When omitted nothing is focused, same as screens.
```

- [ ] **Step 3: Rename the ring container local in the tests**

Six tests in `tests/UiRoot.browser.test.ts` and one in `tests/Modal.browser.test.ts` hold the ring container in a local named `overlay`. Every pattern below matches only those tests; the overlay tests use `let overlay = {...panel(`, `let overlay = panel(` or no such local. Run:

```bash
sed -i \
  -e 's/let overlay = view\.children\[0\]/let ringContainer = view.children[0]/' \
  -e 's/let overlay = view\.children\.at(-1) as MockContainer;/let ringContainer = view.children.at(-1) as MockContainer;/' \
  -e 's/let ring = overlay\.children\[0\]/let ring = ringContainer.children[0]/' \
  -e 's/toEqual(\[a\.view, b, overlay\]);/toEqual([a.view, b, ringContainer]);/' \
  -e 's/toEqual(\[b, overlay\]);/toEqual([b, ringContainer]);/' \
  -e "s/expect(overlay\.eventMode)\.toBe('none');/expect(ringContainer.eventMode).toBe('none');/" \
  tests/UiRoot.browser.test.ts
sed -i \
  -e 's/let overlay = rootView\.children\[0\];/let ringContainer = rootView.children[0];/' \
  -e 's/expect(rootView\.children\.at(-1))\.toBe(overlay);/expect(rootView.children.at(-1)).toBe(ringContainer);/' \
  tests/Modal.browser.test.ts
```

Then run: `grep -c 'ringContainer' tests/UiRoot.browser.test.ts tests/Modal.browser.test.ts`

Expected: `tests/UiRoot.browser.test.ts:13` and `tests/Modal.browser.test.ts:2`.

- [ ] **Step 4: Reword the ring test's comment**

In `tests/UiRoot.browser.test.ts`, in the test `the focus ring is transparent to hit-testing so it never steals a tap from the widget beneath it`, replace:

```ts
      // The overlay sits on top of every widget and, once focused, the ring
      // covers the focused widget. Left hit-testable, pixi resolves a tap on the
      // covered widget to the ring's nearest interactive ancestor (the root view)
      // and never reaches the widget, so its onClick never fires. 'none' prunes
      // the overlay subtree from hit-testing, letting the tap fall through.
```

with:

```ts
      // The ring container sits on top of every widget and, once focused, the
      // ring covers the focused widget. Left hit-testable, pixi resolves a tap on
      // the covered widget to the ring's nearest interactive ancestor (the root
      // view) and never reaches the widget, so its onClick never fires. 'none'
      // prunes the ring container's subtree from hit-testing, letting the tap
      // fall through.
```

- [ ] **Step 5: Sweep for wording that names what no longer exists**

Run:

```bash
grep -rn -i 'focus-ring overlay\|focus ring overlay\|Modal idiom\|Modal precedent\|opens into\|\.open(\|open(ui)\|open()\|modal\.resize' source tests --include=*.ts
git diff 81919a6 -- source tests | grep -E '^\+\s*(//|/\*\*|\*)' | awk 'length > 101'
```

Expected: both print nothing. The first finds no wording that names `open()`, `Modal.resize()` or the ring container as an overlay. The second finds no added comment line longer than 100 columns (101 with the leading `+`).

These stay as they are, because their subject did not change: "constructed per open" and "rebuilt per open" (`worldScreen.ts:39`, `:58`, `mainMenuScreen.ts:45`), "nothing is focused on open" (`mainMenuScreen.ts:47`), "with the modal open" (`worldScreen.ts:110`), and the `openModal` and `openPauseMenu` identifiers. A modal is still opened; only the `open()` method is gone.

- [ ] **Step 6: Format, lint and run everything**

Run:

```bash
npx prettier --check $(git diff --name-only --relative 81919a6 -- source tests)
npx eslint $(git diff --name-only --relative 81919a6 -- source tests)
npm run typecheck
npx vitest run --project unit
npx vitest run --project browser
```

Expected: prettier reports `All matched files use Prettier code style!`. eslint reports `0 errors` over 19 files. Typecheck prints no error. Unit: `Test Files 75 passed (75)`, `Tests 722 passed (722)`. Browser: `Test Files 28 passed (28)`, `Tests 428 passed (428)`.

- [ ] **Step 7: Check the real game**

The two screens have no test of their own, and the spec promises that "nothing the player can see or do changes". This step needs the Playwright MCP tools. If they are not available, say so in the task report instead of skipping silently.

Start the dev server in the background with `npm run develop` and wait until `http://localhost:5000/` answers. Then pass this function as `code` to `browser_run_code_unsafe`. It drives the buttons through `activate()`, because a synthetic `pointertap` does not press them, and it reads the canvas through the game singleton, because screenshots of the WebGL canvas come out white.

```js
async (page) => {
  const wait = (ms) => page.waitForTimeout(ms);
  // The modal under test is kept on window.__modal between the steps.
  const measure = () =>
    page.evaluate(() => {
      const game = window.__game;
      const modal = window.__modal;
      const bounds = modal.view.children[0].getBounds();
      const {width, height} = modal.view.layout.computedLayout;

      return {
        state: modal.state,
        fillsScreen:
          width === game.app.screen.width / game.pixelScale &&
          height === game.app.screen.height / game.pixelScale,
        scrimCoversCanvas:
          bounds.x === 0 &&
          bounds.y === 0 &&
          bounds.width === game.app.screen.width &&
          bounds.height === game.app.screen.height,
      };
    });
  const closed = () =>
    page.evaluate(() => {
      const screen = window.__game.currentScreen;
      const modal = window.__modal;

      return {
        state: modal.state,
        isDestroyed: modal.view.destroyed,
        isReferenceCleared: screen.contents.openModal === null,
        topOverlayIsNull: screen.ui.topOverlay === null,
      };
    });

  await page.setViewportSize({width: 960, height: 540});
  await page.goto('http://localhost:5000/');
  await wait(3000);

  // 1. Options on the main menu: opens with a fade and covers the screen.
  const optionsAtOpen = await page.evaluate(async () => {
    const {game} = await import('/source/game/core/game.ts');
    const screen = game.currentScreen;

    window.__game = game;
    screen.contents.optionsButton.activate();
    window.__modal = screen.contents.openModal;

    return {
      state: window.__modal.state,
      isTopOverlay: screen.ui.topOverlay === window.__modal,
    };
  });

  await wait(1500);

  const optionsOpen = await measure();

  // 2. It follows a window resize with no onResize lifecycle hook.
  await page.setViewportSize({width: 700, height: 900});
  await wait(1500);

  const optionsResized = await measure();

  // 3. The cancel command closes it; focus returns to the Options button.
  const optionsFocus = await page.evaluate(() => {
    const screen = window.__game.currentScreen;

    screen.ui.cancel();

    return {stateAtClose: window.__modal.state};
  });

  await wait(1500);

  const optionsClosed = await closed();

  // 4. The pause menu on the world screen, whose UI view is padded by 4.
  await page.evaluate(() => {
    window.__game.currentScreen.contents.newGameButton.activate();
  });
  await wait(6000);

  const pauseAtOpen = await page.evaluate(() => {
    const screen = window.__game.currentScreen;

    screen.contents.pauseButton.activate();
    window.__modal = screen.contents.openModal;

    let resumeButton = window.__modal.children[0].children[1];

    return {isResumeFocused: screen.ui.focused === resumeButton};
  });

  await wait(1500);

  const pauseOpen = await measure();

  await page.evaluate(() => {
    window.__game.currentScreen.ui.cancel();
  });
  await wait(1500);

  const pauseClosed = await closed();

  // 5. A dialogue box is an overlay without close: Escape opens the pause
  // menu above it, and Quit to menu tears both down. The keep-out sign is a
  // static dialogue zone (Mira strolls); the press is repeated until the
  // world has seen the player next to it.
  await page.evaluate(async () => {
    const {dialogueBoxSystem} = await import('/source/game/systems/dialogueBoxSystem.ts');
    const {TriggerComponent} = await import('/source/game/components/TriggerComponent.ts');
    const {playersQuery} = await import('/source/game/queries/playersQuery.ts');
    const {MotionComponent} = await import('/source/game/components/MotionComponent.ts');
    const sign = dialogueBoxSystem.entities
      .map((entity) => entity.getComponent(TriggerComponent))
      .find((trigger) => trigger.name === 'keep-out-sign');

    playersQuery.getFirst().getComponent(MotionComponent).position.set(sign.rect.x, sign.rect.y);
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    await wait(1000);

    if (await page.evaluate(() => window.__game.currentScreen.ui.topOverlay !== null)) {
      break;
    }

    await page.keyboard.press('KeyE');
  }

  const dialogue = await page.evaluate(() => {
    const box = window.__game.currentScreen.ui.topOverlay;

    return {
      isAttached: box !== null,
      declaresClose: box?.close !== undefined,
      declaresAttach: typeof box?.attach === 'function',
    };
  });

  await page.keyboard.press('Escape');
  await wait(1500);

  const pauseOverBox = await page.evaluate(() => {
    const screen = window.__game.currentScreen;

    window.__world = screen;
    window.__modal = screen.contents.openModal;

    return {
      isModalOnTop: window.__modal !== null && screen.ui.topOverlay === window.__modal,
      uiChildren: screen.ui.children.length,
    };
  });

  await page.evaluate(() => {
    window.__modal.children[0].children[3].activate(); // Quit to menu
  });
  await wait(4000);

  const quit = await page.evaluate(() => {
    const world = window.__world;

    return {
      isModalDestroyed: window.__modal.view.destroyed,
      worldUiChildren: world.ui.children.length,
      worldTopOverlayIsNull: world.ui.topOverlay === null,
      isOnMenu: window.__game.currentScreen !== world,
    };
  });

  return {
    optionsAtOpen,
    optionsOpen,
    optionsResized,
    optionsFocus,
    optionsClosed,
    pauseAtOpen,
    pauseOpen,
    pauseClosed,
    dialogue,
    pauseOverBox,
    quit,
  };
}
```

Expected result, as returned on 2026-09-29:

```json
{
  "optionsAtOpen": {"state": "opening", "isTopOverlay": true},
  "optionsOpen": {"state": "open", "fillsScreen": true, "scrimCoversCanvas": true},
  "optionsResized": {"state": "open", "fillsScreen": true, "scrimCoversCanvas": true},
  "optionsFocus": {"stateAtClose": "closing"},
  "optionsClosed": {"state": "closed", "isDestroyed": true, "isReferenceCleared": true, "topOverlayIsNull": true},
  "pauseAtOpen": {"isResumeFocused": true},
  "pauseOpen": {"state": "open", "fillsScreen": true, "scrimCoversCanvas": true},
  "pauseClosed": {"state": "closed", "isDestroyed": true, "isReferenceCleared": true, "topOverlayIsNull": true},
  "dialogue": {"isAttached": true, "declaresClose": false, "declaresAttach": true},
  "pauseOverBox": {"isModalOnTop": true, "uiChildren": 4},
  "quit": {"isModalDestroyed": true, "worldUiChildren": 2, "worldTopOverlayIsNull": true, "isOnMenu": true}
}
```

What each part proves: `optionsResized` is the deleted `onResize` lifecycle hook (the modal followed the window from 960x540 to 700x900 by layout alone); `pauseOpen` is the padded `UiRoot` view of the world screen; `pauseOverBox.uiChildren` is HUD, pause button, dialogue box and modal; `quit` is `onHide` destroying a modal whose scope `GameScreen.hide` already cleared.

Then check the console with `browser_console_messages` at level `error`. Expected: only the two `favicon.ico` 404 lines that the base commit has as well. Close the browser and stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add source/game/screens/worldScreen.ts source/engine/ui/ModalOptions.ts tests/UiRoot.browser.test.ts tests/Modal.browser.test.ts
git commit -m "Rewrite overlay comments"
```

---

## Rules for the owner of a kept modal

Not part of the diff. This is what an engine user has to know, copied from the spec so that reviewers can hold the tests against it.

1. Refresh before adding. The modal shows what it showed last time.
2. Add only when `modal.state === 'closed'`. During the fade-out the modal is still attached and `addOverlay` throws. (Test: `adding a kept modal that is still fading out throws`.)
3. Destroy or remove it in `onHide`. `GameScreen.hide()` clears the scheduler, so a kept modal caught mid-fade would stay in `opening` or `closing`.
4. Destroy it eventually. `UiRoot.destroy()` reaches only overlays attached at that moment. (Test: `destroy() destroys a kept modal, attached or not`.)
5. Keyboard focus is not kept: it lives in `UiRoot`, and `initialFocus` is applied on every attach. (Test: `a kept modal can be added again, and every close fires both hooks`.)

## Spec coverage

| Spec section | Task |
| --- | --- |
| Engine: `Overlay.ts`, `Focusable.ts`, `UiRoot.ts`, `UiRootParts.ts`, `TextInput.ts` | 1 |
| Engine: `Modal.ts` `attach`, `detach`, `destroy`, `#finishClose`; `ModalRuntime.ts` | 2 |
| Engine: `ModalOptions.ts`, `ModalConfig.ts`, `isReusable` | 4 |
| Engine: `Modal.ts` scrim, root layout, layout check, no `resize` | 5 |
| Engine: `DialogueBox.ts` | 3 |
| Game: `dialogueBoxSystem.ts` | 3 |
| Game: `worldScreen.ts`, `mainMenuScreen.ts` | 2 (`addOverlay`), 5 (`resize`, `onResize`), 6 (comment) |
| Game: `pauseFlow.ts`, `errorScreen.ts`, `loadingScreen.ts`: no change | none |
| Invariants 1, 2 | 1 (`overlay attach protocol`) |
| Invariants 3, 4 | 2, 4 |
| Invariant 5 | 1, 2, 3 (existing focus-trap tests, unchanged) |
| Invariant 6 | 5 |
| Invariants 7, 8 (kept from 2026-09-25 and 2026-09-26) | existing tests, unchanged: `removeOverlay tolerates a scope that is already gone`, `removeChild refuses an overlay that holds a scope`, `removeOverlay on a buried overlay hands its previousFocus up to the scope above` |
| Tests: `UiRoot.browser.test.ts` | 1 |
| Tests: `TextInput.browser.test.ts` | 1 |
| Tests: `Modal.browser.test.ts` | 2, 4, 5 |
| Tests: `ModalLayout.browser.test.ts` | 5 |
| Tests: `DialogueBox.browser.test.ts` | 3 |
| Tests: `pauseFlow.browser.test.ts` | 2 |
| "At the end": both Vitest projects | 6 |
