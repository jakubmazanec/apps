# UI teardown on the instance stack: design

Date: 2026-10-01 App: `apps/somewhere` Status: approved design, implementation not started. Builds
on the 2026-09-29 overlay attach and reuse design and keeps every behaviour it decided.

## Background

Every UI component owns `#disposables.instance` and defers `this.view.destroy({children: true})`
onto it at the end of its constructor. That is the only thing on the stack. The rest of teardown is
written by hand in `destroy()`:

- `Text`, `Slider`, `Toggle`: `destroy()` is `dispose()`.
- `Container`, `Panel`, `Button`: the same 5-line loop over `children`, then `dispose()`.
- `UiRoot`: the same loop over a copy of `children`, because an overlay's `destroy()` splices it out
  of `root.children` mid-loop. Only `UiRoot` has that protection.
- `Modal`: `destroy()` is `removeOverlay` plus `#destroyViews()`. `#destroyViews()` is a
  `view.destroyed` guard, the loop and `dispose()`. `#finishClose()` is `removeOverlay`,
  `#destroyViews()` unless `isReusable`, then `onClosed`. It exists because `close()` forks on the
  scheduler and both branches need the finish.
- `DialogueBox`: a hand-written `destroy()` with no stack, a guard that skips `removeOverlay` when
  the root's view is already destroyed, and resets of `#ui`, `#choiceButtons` and `#box`.

The ternary `'view' in child ? child.view : child` appears 10 times: `addChild` and `removeChild` in
`Container`, `Panel`, `Button` and `UiRoot`, the constructor of `Modal`, and `applyPressShift`.

### Why the stack can own all of it

- **Children change after construction, and a stack cannot drop an entry.** One deferred function
  that reads the live `children` array at dispose time covers it. A child removed with `removeChild`
  is no longer in the array, so it is not destroyed. No per-child registration.
- **Overlays splice themselves out of `UiRoot.children` mid-loop.** The deferred function iterates a
  snapshot.
- **Modal leaves the root before its views go.** Leaving the root is a deferred step registered
  last, so the LIFO stack runs it first. `#destroyViews`' `view.destroyed` guard is redundant: a
  disposed stack ignores a second `dispose()`.

### The stale-root guard is dead code

`DialogueBox.destroy()` skips `removeOverlay` when `ui.view.destroyed`. It dates from `c1a7983`,
when the box called `ui.popFocusScope()` and `ui.removeChild(this)` itself. It fires only when the
root's view was destroyed in place (`ui.view.destroy()` instead of `ui.destroy()`) while the box is
attached; `GameScreen.destroy()` calls `ui.destroy()`, which destroys every overlay first. Verified
on 2026-10-01 with real pixi and layout: `UiRoot.removeOverlay` works on a root whose view was
destroyed in place (with and without `children: true`) for a `Modal`, and the whole
`DialogueBox.browser.test.ts` suite, including "destroy() survives a root that was destroyed first",
passes with the guard removed.

## Decisions

1. Every UI component's `destroy()` is `this.#disposables.instance.dispose()`, except `TextInput`,
   which keeps `stopEditing()` before it (it ends its renewable `editing` stack first, the
   `GameScreen.destroy` pattern).
2. Parents register the child loop with a new `internals/adoptChildren.ts`, shaped like
   `adoptDetachedBackgrounds`: one deferred loop over a snapshot of the live array.
3. Overlays register "leave the root" on the instance stack, after everything else, so it runs
   first.
4. `Modal`'s scheduler fork moves into one private `#fade(alpha, onComplete)`. `attach()` and
   `close()` call it; close's finish is written once, as the `onComplete` closure. `#destroyViews`
   and `#finishClose` are deleted.
5. `DialogueBox` gets `#disposables: Disposables<'instance'>` and drops the stale-root guard.
6. The ternary becomes `internals/resolveView.ts`.
7. No renewable stacks are added. Each candidate period was checked:

   | Class                    | Period                      | Acquires       | Why not                                                                                                                                       |
   | ------------------------ | --------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
   | Container, Panel, Button | a child being in `children` | one per child  | `removeChild` would have to discard the stack with `move()` and re-register every survivor; one live-array loop does the job.                 |
   | Modal                    | `attached`                  | the fade tween | `detach()`'s 4 lines would move into a closure in `attach()`; `close()` must cancel the fade-in early anyway, so `#runtime.cancelFade` stays. |
   | Modal                    | `closing`                   | the finish     | The finish is a continuation that must be skipped when the fade is cancelled; a stack runs its callbacks when disposed.                       |
   | DialogueBox              | `node`                      | `#box`         | One resource whose `destroy()` already cascades; a stack would only wrap `#box?.destroy()`.                                                   |

No public API changes. `Overlay`, `UiChild`, `UiParent` and every option type stay as they are.

## Engine

### `source/engine/ui/internals/resolveView.ts` (new)

```ts
import type * as pixi from 'pixi.js';

import {type UiChild} from '../UiChild.js';

/** The display object of a UI child: a component's view, or the raw pixi container itself. */
export function resolveView(child: UiChild): pixi.Container {
  return 'view' in child ? child.view : child;
}
```

All 10 ternaries call it. `applyPressShift` becomes `resolveView(child).y = shift;`.

### `source/engine/ui/internals/adoptChildren.ts` (new)

```ts
import {type UiChild} from '../UiChild.js';

// Destroys the components still in `children` when the stack is disposed; a
// child taken out with removeChild() earlier belongs to whoever took it.
// Iterates a snapshot, because an overlay's destroy() splices it out of its
// root's children. Call it after deferring the view's own destroy, so the
// (LIFO) stack tears the children down first.
export function adoptChildren(disposables: DisposableStack, children: UiChild[]): void {
  disposables.defer(() => {
    let snapshot = [...children];

    for (let child of snapshot) {
      if ('view' in child) {
        child.destroy?.();
      }
    }
  });
}
```

The snapshot is held in a local because `unicorn/no-useless-spread` rejects `for (x of [...arr])`.

### `Container.ts`, `Panel.ts`, `Button.ts`

Constructor tail:

```ts
this.#disposables.instance.defer(() => this.view.destroy({children: true}));
adoptChildren(this.#disposables.instance, this.children);
```

`destroy()`:

```ts
/** Destroys the instance. */
destroy() {
  this.#disposables.instance.dispose();
}
```

Order on dispose: component children (each through its own stack), then the view with the raw pixi
children still in it. Same as today.

### `UiRoot.ts`

Same as above: `adoptChildren` after the view's deferred destroy, `destroy()` is `dispose()`. The
copy-before-loop comment moves into `adoptChildren`. Order on dispose: children (overlays leave the
root through their own stacks while the root is alive), the view, then the three listener removals.
Same as today.

### `Modal.ts`

Constructor tail:

```ts
this.#disposables.instance.defer(() => this.view.destroy({children: true}));
adoptChildren(this.#disposables.instance, this.children);
// Leaves the root first, while the children are alive: removeOverlay
// deactivates the focusables inside and restores the previous focus, then
// calls detach(), which cancels a running fade.
this.#disposables.instance.defer(() => {
  this.#runtime.ui?.removeOverlay(this);
});
```

The block body is required: `removeOverlay` returns `this`, and the void-return rule flags the
expression form.

`attach()`, after the `initialFocus` line (the guard, the root assignment and the layout check are
unchanged):

```ts
this.#state = 'opening';
this.view.alpha = 0;
this.#fade(1, () => {
  this.#state = 'open';
});
```

`close()`:

```ts
close(): void {
  if (this.#state === 'closing' || this.#state === 'closed') {
    return;
  }

  this.#onClosing?.();
  this.#state = 'closing';
  // removeOverlay releases this modal's own scope before removing it, so the
  // previousFocus restoration (the Options flow depends on it) cannot be lost
  // to ordering here; it then calls detach(), which leaves the destroy below
  // nothing to leave. A kept modal skips the destroy and can be added again.
  this.#fade(0, () => {
    this.#runtime.ui?.removeOverlay(this);

    if (!this.#config.isReusable) {
      this.destroy();
    }

    this.#onClosed?.();
  });
}
```

`destroy()`:

```ts
// Teardown path (owning-screen onHide, or any out-of-band cleanup): leaves
// the UiRoot if still attached and synchronously destroys; callable from any
// state, never animated, never fires onClosing or onClosed, and destroys a
// kept modal too.
/** Destroys the instance. */
destroy() {
  this.#disposables.instance.dispose();
}
```

`detach()` is unchanged. `#destroyViews` and `#finishClose` are deleted. New private method:

```ts
/** Fades the view to `alpha`, or sets it at once without a scheduler, then calls `onComplete`. */
#fade(alpha: number, onComplete: () => void) {
  this.#runtime.cancelFade?.();
  this.#runtime.cancelFade = null;

  let {scheduler, fadeDuration} = this.#config;

  if (scheduler === undefined || fadeDuration === undefined) {
    this.view.alpha = alpha;
    onComplete();

    return;
  }

  this.#runtime.cancelFade = scheduler.tween({
    target: this.view,
    to: {alpha},
    duration: fadeDuration,
    easing: easeOutQuad,
    onComplete: () => {
      this.#runtime.cancelFade = null;
      onComplete();
    },
  });
}
```

The constructor's child loop calls `resolveView`.

#### Flows

| Call                                             | Steps                                                                                                                                                          | Hooks                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `close()`, non-reusable                          | `onClosing`; `closing`; fade; `removeOverlay` (scope released, focus restored, `detach` → `ui` null, `closed`); `destroy()` (leave-root no-op, children, view) | `onClosing`, `onClosed` |
| `close()`, reusable                              | the same without `destroy()`; the views survive, the next `addOverlay` fades in from alpha 0                                                                   | `onClosing`, `onClosed` |
| `removeOverlay` from outside, any state          | `detach` cancels the fade, so `onComplete` never runs; views survive                                                                                           | none                    |
| `destroy()`, never attached                      | leave-root skipped (`ui` null); children; view                                                                                                                 | none                    |
| `destroy()`, open or mid-fade                    | `removeOverlay` (`detach` cancels the fade); children; view                                                                                                    | none                    |
| `destroy()`, kept modal after close              | leave-root skipped; children; view                                                                                                                             | none                    |
| `destroy()` after a non-reusable close, or twice | the stack is already disposed: nothing                                                                                                                         | none                    |

#### Behaviour changes (no scheduler only)

- `attach()` sets alpha to 0, then to 1 and the state from `opening` to `open`, all synchronously.
  Nothing renders in between.
- `close()` passes through `closing` synchronously and leaves a kept modal at alpha 0 instead of 1.
  The modal is off the root by then, and the next `attach()` resets alpha.

`removeOverlay` keeps two call sites in `Modal`, the teardown step and the close finish: they are
two events and both must leave the root.

### `source/engine/dialogue/DialogueBox.ts`

New field, with the `Disposables` import:

```ts
/** Stacks to register disposers that cleanup resources when needed. */
readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};
```

Constructor tail:

```ts
this.#disposables.instance.defer(() => this.view.destroy({children: true}));
// The box is rebuilt per node, so this reads the field at dispose time; its
// Container.destroy() cascades into the panels and buttons, which a bare
// view.destroy() would not reach.
this.#disposables.instance.defer(() => {
  this.#box?.destroy();
});
// Leaves the root first: removeOverlay releases this box's own scope, not
// whatever sits on top, and calls detach(), which clears #ui.
this.#disposables.instance.defer(() => {
  this.#ui?.removeOverlay(this);
});
```

`destroy()` is `this.#disposables.instance.dispose()`. Dropped: the `ui.view.destroyed` guard, the
`#ui = null` reset (`detach()` does it), and the `#choiceButtons = []` and `#box = null` resets,
which only made a second call safe. `focusedChoiceIndex` returns -1 after destroy because `#ui` is
null. `#buildPanels` and `#buildChoices` are unchanged.

## Invariants

1. A UI component's teardown is registered on `#disposables.instance` in its constructor;
   `destroy()` disposes it. `TextInput` ends its `editing` stack first.
2. A parent destroys exactly the components in its `children` at destroy time. A child removed
   earlier is never destroyed by it.
3. An overlay leaves the root before its children and view are destroyed.
4. `destroy()` is idempotent, works from any state, never animates and fires no lifecycle hook.
5. Kept from 2026-09-29: `detach()` undoes `attach()` and nothing else; `onClosing` and `onClosed`
   fire for `close()` only; `onClosed` fires after the modal left `root.children` with state
   `closed`; a direct `removeOverlay` leaves the views alive.
6. `UiRoot.destroy()` reaches every overlay even though overlays splice themselves out.

## Sequencing

Red first for every behaviour change. Each step compiles and passes its tests before the next.

0. Baseline: both Vitest projects and `npm run typecheck` green. `npm run lint` is red on the
   baseline, so lint is checked per changed file.
1. `resolveView` and its 10 call sites. Pure refactor.
2. `adoptChildren`; `Container`, `Panel`, `Button`, `UiRoot` switch to it. The new "removed child
   survives" tests are written first; they pass before and after, pinning the behaviour through the
   refactor.
3. `Modal`: instance-stack teardown, `#fade`, `attach()`, `close()`, `destroy()`; delete
   `#destroyViews` and `#finishClose`. The new stale-root test is written first.
4. `DialogueBox`: `#disposables`, constructor tail, `destroy()`, guard dropped.
5. Delete `docs/ui-teardown-disposables-brief.md` (done with this spec's commit).

Step 3 needs step 2. Step 4 is independent of step 3.

## Tests and verification

### `tests/Container.browser.test.ts`, `tests/Panel.browser.test.ts`, `tests/Button.browser.test.ts`

- New, in each: a child component removed with `removeChild` before `destroy()` is not destroyed,
  and the remaining children are.
- `destroy() cascades to child components`: unchanged.

### `tests/UiRoot.browser.test.ts`

- Unchanged, including
  `destroy() reaches every overlay, including the one after an overlay that removes itself` and
  `destroy() lets an overlay that removes itself run its detach`.

### `tests/Modal.browser.test.ts`

- New: `destroy()` survives a root whose view was destroyed in place: the modal's view is destroyed,
  `root.children` no longer holds it, state is `closed`, no hook fires.
- Every existing test unchanged, in particular the close, reusable, fade and `destroy()` tests.

### `tests/DialogueBox.browser.test.ts`

- Unchanged. `destroy() survives a root that was destroyed first` now passes without the guard.

### Commands

```
npx eslint <changed files>
npx vitest run --project unit
npx vitest run --project browser
npm run typecheck
```

No dependency changes.

## Non-goals

- Renewable stacks anywhere in this change (see Decisions, item 7).
- `TextInput` and `GameScreen` teardown.
- Sharing `addChild` and `removeChild` between `Container` and `Panel`.
