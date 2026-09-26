# UI overlay removal without self-heal: design

Date: 2026-09-26 App: `apps/somewhere` Status: approved design, implementation not started.
Replaces the self-heal parts of the 2026-09-25 overlays design (its invariant 2 and the prune it
kept in `#collectFocusables`).

## Background

`UiRoot.#collectFocusables()` does two jobs. It walks the focusables of the innermost overlay,
and before walking it pops scopes whose overlay view is destroyed or detached, restoring the
last popped scope's `previousFocus`. The prune exists because an overlay can leave without
`removeOverlay`: through the public `removeChild`, or through pixi (`overlay.view.destroy()`,
`removeFromParent()`, reparenting).

Verification on 2026-09-26 (code reading plus throwaway browser probes) found:

- No app code needs the prune. Every overlay teardown already goes through `removeOverlay`:
  `Modal.close`/`destroy` and `DialogueBox.destroy`, including the screen-hide teardown.
- `topOverlay` and `cancel()` read the stack without pruning. After an overlay's view is
  destroyed, `topOverlay` returns it and `cancel()` calls its `close()`, while
  `worldScreen.ts:256` uses `topOverlay` to decide whether Escape pauses.
- The proper API restores focus worse than the self-heal. `removeOverlay` on a buried overlay
  splices its scope and drops its `previousFocus`; the same removal through `removeChild` keeps
  it and restores it later.
- The self-heal's restore is overwritten inside `removeOverlay`: the prune runs inside the
  ternary that assigns `focused`. It only survives when the removed scope's `previousFocus` is
  null.
- Plain components get no connectivity check. A Panel detached through pixi stays focusable;
  only overlays are special.
- `UiRoot.destroy()` iterates `this.children` while each overlay's `destroy()` splices it
  through `removeOverlay`, so the overlay after one that removes itself is never destroyed. No
  app code calls `UiRoot.destroy()` today.
- Buried removal is reachable. A closing Modal fires `onClosing` (the pause menu resumes the
  world) but keeps its scope until the fade ends, so a dialogue box can open above it or close
  beneath it during those 200 ms.

## Decisions

- An overlay that holds a scope cannot leave through `removeChild`: it throws before anything
  is removed. `removeOverlay` is unaffected because it releases the scope first.
- Detaching or destroying an overlay's view through pixi directly is unsupported, as it already
  is for every other component. The prune and `#isConnected` are deleted. The walk keeps
  skipping destroyed views, so that misuse still cannot crash navigation.
- `removeOverlay` on a buried overlay stays legal. The scope directly above inherits the buried
  scope's `previousFocus`, because it was opened while the buried one was on top.
- `#collectFocusables()` becomes the side-effect-free private getter `#focusables`.
- `UiRoot.destroy()` iterates a copy of `this.children`.
- Comments are rewritten where their subject changed, never deleted.

Rejected: throwing on a buried `removeOverlay` (crashes the pause-fade cases above); releasing a
Modal's scope at close-start (Resume must stay activatable during the fade); throwing from a
pixi `'removed'` listener (a probe showed a throw during `view.destroy()` aborts it halfway:
`destroyed` is set, `'destroyed'` never fires, children are detached but not destroyed and the
listeners stay); a lazy assertion at the next read (fires on the next keypress, far from the
culprit, and every reader must call it); eager pruning on pixi events (listener bookkeeping for
a path now declared unsupported); folding scope release into `removeChild` and deleting
`removeOverlay` (bigger diff for the same guarantee).

## Engine

### `source/engine/ui/UiRoot.ts`

```ts
// Scope/removal interplay: removeChild refuses an overlay that holds a scope,
// so removeOverlay is the only way out through UiRoot. Detaching or destroying
// its view through pixi directly is unsupported, as for any component.
/** Attaches the overlay as the last UI child and gives it the focus scope. */
addOverlay(overlay: Overlay): this {
  // unchanged
}

/** Destroys the instance. */
destroy() {
  // A copy: an overlay's destroy() leaves children through removeOverlay.
  for (let child of [...this.children]) {
    // unchanged
  }

  this.#disposables.instance.dispose();
}

/** TBD */
removeChild(...children: UiChild[]): this {
  // An overlay leaves through removeOverlay, which releases its scope first.
  // Checked before anything is removed, so a refused call changes nothing.
  if (children.some((child) => this.#runtime.scopes.some((scope) => scope.root === child))) {
    throw new Error('Overlay must be removed with removeOverlay()!');
  }

  // unchanged, the stale-focus drop reads this.#focusables
}

// Drops this overlay's own scope, not whatever is on top, and tolerates a
// scope that is already gone (clearFocus on hide). A buried scope is legal: a
// closing modal keeps its scope through the fade while the game already runs,
// so overlays can open above it or close beneath it. The scope goes before the
// child, so the order is not the caller's to get wrong.
/** Detaches the overlay and releases its focus scope. */
removeOverlay(overlay: Overlay): this {
  let index = this.#runtime.scopes.findIndex((scope) => scope.root === overlay);

  if (index !== -1 && index === this.#runtime.scopes.length - 1) {
    // pop and restore unchanged, reading this.#focusables
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

// Depth-first order over the component hierarchy is the Tab order. Raw Pixi
// containers are leaves (components are only discoverable through public
// children arrays), and subtrees whose view is hidden are pruned.
//
// The scope stack needs no repair here: removeChild refuses an overlay that
// holds a scope, so no scope outlives its overlay through UiRoot. A view
// detached through pixi directly is invisible to UiRoot (attachment lives on
// the pixi view.parent chain; component-level parent pointers don't exist),
// which is why that is unsupported, as for any component.
/** TBD */
get #focusables(): Focusable[] {
  let result: Focusable[] = [];
  let walk = (node: UiChild) => {
    // unchanged, including the destroyed-view guard and its comment
  };

  walk(this.#runtime.scopes.at(-1)?.root ?? this);

  return result;
}
```

The eight `this.#collectFocusables()` calls become `this.#focusables`. `#isConnected` is deleted
with the prune; its comment's content moves into the `#focusables` comment above, and the prune
loop's type-assertion note moves to the pass-up branch. `eslint --fix` decides the getter's
position (`perfectionist/sort-classes`). `topOverlay`, `cancel()`, `clearFocus()` and the command
verbs are untouched.

### `source/engine/ui/Modal.ts`, `source/engine/dialogue/DialogueBox.ts`

No change. Their comments about `removeOverlay` releasing their own scope and tolerating an
empty stack stay accurate.

## Invariants

1. The scope stack changes only through `addOverlay`, `removeOverlay` and `clearFocus`. An
   overlay holding a scope cannot leave through `removeChild`.
2. A destroyed subtree cannot crash navigation, whoever destroyed it. Detaching or destroying a
   component's view through pixi, bypassing its parent component, is unsupported for every
   component, overlays included.
3. Removing a buried overlay keeps the `previousFocus` chain: the scope above inherits it.
4. `#focusables` has no side effects.
5. Kept from 2026-09-25: `GameScreen.hide` clears the stack before `onHide`, so `removeOverlay`
   tolerates a missing scope; the world unfreezes at close-start, which is why buried removal
   must stay legal.

## Sequencing

Red first for every behaviour change.

0. Baseline: both Vitest projects, `npm run lint`, `npm run typecheck` green.
1. `destroy()` copy: add the destroy test, see it fail, iterate a copy.
2. Pass-up: add the buried-removal test, see it fail, change the `else if` branch and the
   `removeOverlay` comment.
3. `removeChild` throw: rewrite the first self-heal test into the refusal test, see it fail, add
   the check. In the same step, move the `previousFocus`-left-with-the-overlay test onto
   `removeOverlay` and delete the dead-lower-scope test; both call `removeChild` on a scoped
   overlay.
4. Self-heal removal: delete the prune and `#isConnected`, turn the method into the getter,
   rewrite the `addOverlay` and `#focusables` comments. The crash-safety test stays green
   through it.
5. Verify.

Steps 1 and 2 are independent.

## Tests and verification

All in `tests/UiRoot.browser.test.ts`.

- New: `destroy()` destroys every overlay, including the one after an overlay that removes
  itself. Two overlays whose `destroy()` calls `removeOverlay`; both spies are called once.
- New: `removeOverlay` on a buried overlay hands its `previousFocus` up. Focus `a`, open
  `lower`, focus its `b`, open `top`, remove `lower`, remove `top`: focus is back on `a` (today
  `null`).
- `removeOverlay on the lower of two overlays leaves the top one in charge`: unchanged.
- The `focus scope self-heal (out-of-band removal)` suite becomes `overlay removal contract`:
  - `removing the overlay without removeOverlay...` becomes `removeChild refuses an overlay that
    holds a scope`: it throws and `children`, `topOverlay` and `focused` are unchanged.
  - `destroying the overlay in place is healed the same way` becomes `destroying an overlay's
    view in place does not crash navigation`: `focusNext`, `moveFocus` and `activate` do not
    throw.
  - `a previousFocus that left with the overlay is dropped, not restored`: same assertions,
    driven through `removeOverlay`.
  - `a dead scope below a live top scope waits until it surfaces`: deleted. Its removal is now
    refused, and the pass-up test covers the restore it asserted.

Run from `apps/somewhere`:

```
npx vitest run --project unit
npx vitest run --project browser
npm run lint
npm run typecheck
```

No dependency changes.

## Non-goals

- Watching pixi events for overlay views.
- Changing when a Modal releases its scope.
- Splitting `UiRoot`, or any change to navigation, the focus ring or the pointer barrier.
