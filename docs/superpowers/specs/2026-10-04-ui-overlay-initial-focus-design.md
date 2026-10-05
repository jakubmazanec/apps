# Overlay initial focus: design

Date: 2026-10-04. Package: `packages/tellurion`. Status: implemented.

## Background

A keyboard player presses Escape on a game screen and a menu opens. One of its buttons has the
focus, and nothing on the screen shows which one:

- Enter activates that button. The player pressed a button that nothing marked.
- An arrow key moves the focus to the next button and the ring appears there. The ring never showed
  on the first button, so the press seems to skip it.

This is the case in Somewhere's pause menu and in Foam's in-game menu.

In a DOS menu such as Doom's, one item is always the current one and it is always drawn that way. In
Tellurion the focused component plays that part, and the focus ring is drawn by a different rule:

- Each screen's `UiRoot` has one flag, `isRingVisible`. `focusNext`, `focusPrevious` and `moveFocus`
  turn it on. A pointer press anywhere turns it off, and so does `clearFocus()`, which runs when the
  screen is hidden.
- `focus()` sets the focused component and leaves the flag as it is.
- `Modal` takes an `initialFocus` option and applies it in `attach()` with `ui.focus()`.
  `ModalOptions` describes that as "programmatic, no ring shown".

So a modal's default button shows the ring only if the player moved the focus with arrows or Tab on
that screen since the last pointer press. The 2026-09-25 overlay spec states the rule as its
invariant 5: "Programmatic focus shows no ring; command-driven focus does."

The engine has one state for this, the focus. A second state, "selected", beside it is not wanted:
the dialogue box has one (the `▶` marker of its selected choice) and has to keep the focus in step
with it.

## Decisions

- An overlay that declares `initialFocus` opens with that component focused and the ring shown,
  whatever opened the overlay: a key, a tap, or the game's own code.
- After that the ring follows the rule it follows everywhere. A pointer press hides it and a focus
  command shows it again.
- `initialFocus` is declared by the parent, not by the default component. `Modal` already takes it
  as an option, and the option keeps its name.
- `Overlay` gains `initialFocus` as an optional member, declared the way `close` is.
- `UiRoot.addOverlay()` applies it, inside the method that already adds the overlay and gives it the
  focus scope. `UiRoot` gets no new method.
- `Modal` keeps the option as a public `readonly` field, as `GameScreen` keeps `assetBundles` for
  `Game.showScreen()` to read. `Modal.attach()` no longer calls `ui.focus()`.
- `focus()` stays as it is: it sets the focus and does not touch the ring.

Rejected:

- Counting more inputs as keyboard use: every focus command turning the ring on, or one record of
  the last input kind for the whole game. Neither shows a menu's default after a tap opened the
  menu, and neither says where a current item has to be visible.
- A menu that draws its focus at all times, with the pointer moving the focus. Showing the default
  when the menu opens was chosen instead.
- A setter for `isRingVisible`: it exposes the flag and does not say when a focus is shown.
- An option on `focus()`, such as `focus(component, {isRingVisible: true})`: the same flag, passed
  at a call that is tied to no moment.
- `focus()` itself showing the ring. The dialogue box calls `focus()` whenever its selection moves,
  also under the pointer, so its choices would show the ring for pointer players.
- The default component declaring it, as HTML's `autofocus` does: it adds a member to `Focusable`
  and an option to every widget, and `ModalOptions.initialFocus` already says the same thing from
  the parent's side.
- A new method on `UiRoot` that applies a declared initial focus, called from `addOverlay()` and
  from `GameScreen.show()`: `addOverlay()` can do the work itself.

## Engine

### `source/ui/Overlay.ts`

```ts
// A component attached to a UiRoot as an overlay. Every overlay holds the
// focus scope while it is attached, so focus discovery cannot leave it; a
// component shown on top that must not trap focus is a plain child. UiRoot
// calls attach right after the overlay got its scope and detach right after it
// left the tree; nothing else calls them, and an overlay with nothing to do
// there omits them. Declaring `close` is what makes the cancel command dismiss
// it; an overlay without one traps focus and ignores cancel (the dialogue
// box). Declaring `initialFocus` is what makes the overlay open with that
// component focused and the ring shown; an overlay without one opens with
// nothing focused. Modal is the general-purpose overlay.
export type Overlay = UiParent & {
  attach?: (ui: UiRoot) => void;
  close?: () => void;
  detach?: () => void;
  readonly initialFocus?: Focusable | undefined;
};
```

The file gains a type import of `Focusable`.

### `source/ui/UiRoot.ts`

In `addOverlay()`, the line `this.#runtime.focused = null;` is replaced:

```ts
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
  this.#runtime.focused = overlay.initialFocus ?? null;

  // An overlay that declares its initial focus opens with it marked, whatever
  // opened the overlay. A pointer press hides the ring again, as everywhere.
  if (overlay.initialFocus !== undefined) {
    this.#runtime.isRingVisible = true;
  }

  overlay.attach?.(this);

  return this;
}
```

Nothing else in `UiRoot` changes. `focus()` keeps its doc comment, "Sets component as focused
without showing the focus ring."

### `source/ui/Modal.ts`, `ModalOptions.ts` and `ModalConfig.ts`

`Modal` gains a public field, between `children` and `view`:

```ts
/** The component that takes the focus, with the ring shown, each time the modal is added. */
readonly initialFocus: Focusable | undefined;
```

The constructor assigns it from the option. `initialFocus` leaves `#config` and `ModalConfig`.

`attach()` loses these lines:

```ts
if (this.#config.initialFocus !== undefined) {
  ui.focus(this.#config.initialFocus);
}
```

The comment above `attach()` says that the modal "holds the focus scope, which is why initialFocus
lands inside it". It is rewritten to say that `UiRoot` has applied the modal's `initialFocus` by the
time `attach()` runs.

The comment of the option in `ModalOptions.ts` becomes:

```ts
// The component that takes the focus, with the ring shown, each time the
// modal is added. When omitted nothing is focused, same as screens.
initialFocus?: Focusable | undefined;
```

### Behaviour

| Case                                                      | Result                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| The overlay declares `initialFocus`                       | That component is focused and the ring is shown                  |
| The overlay declares none                                 | Nothing is focused and the ring stays as it was                  |
| The overlay's `attach` sets a focus itself                | That focus wins: `attach` runs after `initialFocus` is applied   |
| A kept modal (`isReusable`) is added again                | `initialFocus` is applied again                                  |
| A pointer press after the overlay opened                  | The ring hides and the focus stays                               |
| The overlay is removed                                    | The previous focus returns, as today; the ring stays as it is    |
| The declared component cannot take the focus at that time | It is set as focused, as `focus()` does today, and draws no ring |

The last row is today's behaviour of `focus()`, which does not check its argument. `UiRoot.update()`
draws the ring only around a component that is focusable and not destroyed, and the next focus
command drops a focus that is not in the scope.

Adding an overlay fires no focus event, so no sound plays for the initial focus.

## Games

- **Somewhere.** Its pause menu passes `initialFocus: resumeButton`, so it opens with the ring on
  Resume, after Escape and after the pause key. No file under `apps/somewhere` changes. Its Options
  modal and its dialogue box declare no initial focus and behave as before.
- **Foam.** Its in-game menu sets the focus with `ui.focus(resumeButton)` after adding the modal,
  which shows no ring. Passing `initialFocus` to that modal belongs to Foam's own spec. No file
  under `apps/foam` changes here.

## Invariants

1. A focus command shows the ring. A pointer press hides it.
2. `focus()` sets the focus and does not touch the ring.
3. An overlay's declared `initialFocus` is focused, with the ring shown, each time the overlay is
   added, and only then.
4. A menu's current item is its focus. This design adds no "selected" state beside the focus.
5. The invariants of the 2026-09-25, 2026-09-26 and 2026-09-29 overlay specs hold, with the 09-25
   invariant 5 read as items 1 to 3 above.

## Sequencing

1. Tests: change the two `Modal` tests and add the `UiRoot` tests listed below, and see them fail.
2. `Overlay.ts`: the optional member and the comment.
3. `Modal.ts`, `ModalOptions.ts`, `ModalConfig.ts` and `UiRoot.ts` together. Between them a modal's
   `initialFocus` would not be applied at all.

## Tests and verification

`packages/tellurion/tests/Modal.browser.test.ts`:

- "adding applies initialFocus programmatically (no ring)" becomes "adding focuses initialFocus and
  shows the ring" and expects `isRingVisible` to be `true`.
- "a kept modal can be added again, and every close fires both hooks" expects `isRingVisible` to be
  `true` after the second add. Its comment says that `initialFocus` is applied each time the modal
  is added.
- "nothing is focused when initialFocus is omitted" stays, and also checks that the ring stays
  hidden.
- New: a pointer press after a modal with `initialFocus` opened hides the ring and keeps the focus.

`packages/tellurion/tests/UiRoot.browser.test.ts`:

- New: an overlay that declares `initialFocus` opens with it focused and the ring shown.
- New: an overlay without one opens with nothing focused, with the ring hidden when it was hidden
  and shown when it was shown.
- New: a focus set inside `attach` wins over a declared `initialFocus`.
- "focus set inside attach survives addOverlay" and the four tests of the "ring visibility" block
  stay as they are.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

It must pass for all three packages: Somewhere and Foam read the engine's build, and neither has a
test that depends on a modal's ring.

## Non-goals

- A default focus for a screen. A screen that wants one calls `ui.focus()` in `onShow`, which shows
  no ring, as today.
- `initialFocus` on `Panel` or `Container`.
- A menu that always draws its focus, or a pointer that moves the focus.
- Any change to `focus()`, to the focus commands or to the dialogue box.
- A modal that the cancel command passes over. A window that is not dismissible is an overlay class
  of its own without `close`, as the dialogue box is.
- Any change under `apps/somewhere` or `apps/foam`.
