# UI overlays, cancel routing and text-input bindings: design

Date: 2026-09-25 App: `apps/somewhere` Status: implemented.

## Background

`UiRoot` is six things at once: the screen's UI tree, its focus state, its focus-scope stack, the
focus-ring renderer, the dispatcher for the ten `FocusCommand` values, and the pointer barrier
that keeps UI taps off the world. Three parts of that mix are wrong today.

**Attaching an overlay is an unenforced two-call protocol.** `Modal.open` and `DialogueBox.open`
each call `ui.addChild(this)` and then `ui.pushFocusScope(this)`, and each tears down in the
reverse order, which matters. Three comments carry the rule (`Modal.ts:177`,
`DialogueBox.ts:243`, `UiRoot.ts:279-283`) and two of them give the wrong reason: they claim
remove-before-pop loses the `previousFocus` restoration, but the self-heal in
`#collectFocusables` restores it, as `tests/UiRoot.browser.test.ts:861` asserts. The real hazard
is a double pop, because `popFocusScope` pops the top scope rather than the caller's. Scopes do
nest (the dialogue box takes a scope without claiming cancel, so the pause menu opens above it),
so the cross-pop is reachable in principle. Today it is prevented only by the dialogue system not
running while the world is paused and by `GameScreen.hide` clearing the stack before teardown.

**The cancel command is a second dispatch mechanism bolted onto the first.** Nine commands are a
direct call on `UiRoot`. The tenth carries a "was it claimed" boolean from `FocusScope.onCancel`
through `UiRoot.cancel()` into `adoptInput`'s `&& !ui.cancel()` and on to `GameScreen.cancel()`,
under a `// TODO: I don't like this magic` comment. The boolean also leaks modal animation state
into routing, because `Modal`'s default handler returns `close()`, which is `false` during a fade.

**`FocusScope.root` is typed `UiChild`**, whose raw-`pixi.Container` branch the focus walk cannot
process: `walk` returns immediately for it, so such a scope would collect no focusables and
freeze navigation. Every real caller passes a component, and the union exists for plain children.

Two smaller findings come along. `ModalOptions.onCancel` is a free closure that has to be kept in
sync by hand with the overlay's own dismissal; `worldScreen.ts:41-42` explains why it exists at
all (the pause menu must resume the world as well as close it, and it must resume at close-start,
behind the fading scrim, where `onClose` is too late). And `TextInput` hardcodes
`event.key === 'Enter'` and `'Escape'` on a raw DOM listener, so the keys that commit or dismiss
a field ignore the binding table; `GameInput` is deliberately deaf while a text-entry element has
DOM focus, which is why the listener exists but not why it names keys.

## Decisions

- An overlay is a component: `Overlay = UiParent & {close?: () => void}`. Declaring `close` is
  what makes the cancel command dismiss it. `DialogueBox` declares none and is not dismissible.
- `UiChild`'s component branch gets a name, `UiComponent`. `FocusScope.root` becomes `Overlay`
  and `FocusScope` stops being exported.
- Two names for two things, kept apart: the *overlay* is the component, the *focus scope* is its
  entry on the stack while it is attached. The stack stays `#runtime.scopes`.
- `UiRoot` gains `addOverlay`/`removeOverlay` and loses `pushFocusScope`/`popFocusScope`.
  `removeOverlay` drops its own scope wherever it sits, tolerates a scope that is already gone,
  and removes the child afterwards, so the ordering rule cannot be expressed and the cross-pop
  cannot happen.
- `UiRoot.cancel()` becomes one expression and returns `void`. There is no fallback and no claim
  protocol: `UiRoot` stops knowing that a screen exists.
- `GameScreenOptions.onCancel`, `GameScreen.cancel()` and `GameScreen.#onCancel` are deleted.
- Opening the pause menu becomes a game concern. `worldScreen` polls a new `pause` action and the
  `cancel` command from `onUpdate`, using a new `UiRoot.topOverlay` getter to ask whether
  anything dismissible was open. User-facing behaviour is unchanged, plus `KeyP` as a second way
  in.
- The command verbs on `UiRoot` keep their names and signatures. `adoptInput` keeps its `if`s;
  only the cancel branch loses its `&&`.
- `ModalOptions.onCancel` is deleted. `Modal.close()` returns `void` and fires a new `onClosing`
  hook once, inside its state guard. `onClose` is renamed `onClosed` to match `ModalState`.
  `pauseFlow.resumeFromPause` is deleted, the pause modal passes
  `onClosing: () => world.resume()` and the Resume button calls `close()`.
- `TextInput` consults the bindings for both `activate` and `cancel`, and treats any key that
  produces a character as literal text, which is what keeps Space typable when `activate` binds
  it. `TextInputOptions.onEnter` becomes `onSubmit`.
- `GameInput` gains `focusMatches(command, event)`. `TextInput` receives it as a structural
  collaborator (the `pauseFlow` idiom), so no `ui` to `input` module dependency appears.
- Comments are rewritten where their subject changed, never deleted. That includes the
  `// TODO: I don't like this magic` block, which describes routing that will not exist.

Rejected: a single `send(command)` entry point replacing the command verbs; `openScope`/
`closeScope` as a facade over the existing two-call protocol; keeping a screen-level cancel
callback anywhere, whether passed to `UiRoot` or held by `GameScreen`; walking down the scope
stack for an unclaimed cancel; letting an overlay swallow the cancel command whether or not it is
dismissible; a dedicated `submit` focus command for text fields (`GameInput` rejects a key bound
in two entries, so Enter cannot be in both `activate` and `submit`).

Reviewed and not adopted: merging `focusNext`/`focusPrevious`/`moveFocus` into one
`moveFocus(move)` (62 test call sites for one concept); splitting `UiRoot` into tree, focus and
ring units; rewriting the engine comments and option names that name keys rather than commands
(deferred deliberately, except `onEnter`, which this design makes factually wrong).

## Engine

### `source/engine/ui/UiChild.ts`

```ts
export type UiComponent = {destroy?: () => void; view: pixi.Container};
export type UiChild = pixi.Container | UiComponent;
export type UiParent = UiComponent & {children: UiChild[]};
```

The existing comment about focus discovery recursing through `children` stays.

### `source/engine/ui/Overlay.ts` (new)

```ts
// A component attached to a UiRoot as an overlay: it holds the focus scope
// while it is attached, so focus discovery cannot leave it. Declaring `close`
// is what makes the cancel command dismiss it; an overlay without one traps
// focus and ignores cancel (the dialogue box).
export type Overlay = UiParent & {close?: () => void};
```

### `source/engine/ui/FocusScope.ts`

`onCancel` is removed and `root` becomes `Overlay`, leaving `{previousFocus, root}`. The type is
no longer imported outside `UiRoot`.

### `source/engine/ui/UiRoot.ts`

```ts
get topOverlay(): Overlay | null {
  return this.#runtime.scopes.at(-1)?.root ?? null;
}

addOverlay(overlay: Overlay): this {
  this.addChild(overlay);
  this.#runtime.scopes.push({previousFocus: this.#runtime.focused, root: overlay});
  this.#runtime.focused = null;

  return this;
}

// Drops this overlay's own scope, not whatever is on top, and tolerates a
// scope that is already gone (clearFocus on hide, or the self-heal prune).
removeOverlay(overlay: Overlay): this {
  let index = this.#runtime.scopes.findIndex((scope) => scope.root === overlay);

  if (index !== -1 && index === this.#runtime.scopes.length - 1) {
    this.#popScope();
  } else if (index !== -1) {
    this.#runtime.scopes.splice(index, 1);
  }

  this.removeChild(overlay);

  return this;
}

// The topmost overlay owns cancel. Nothing open, or an overlay that declares
// no close, means nothing happens here; what the game does instead is the
// game's business.
cancel() {
  this.#runtime.scopes.at(-1)?.root.close?.();
}
```

`#popScope` is the body of today's `popFocusScope` (pop, then restore `previousFocus` when it is
still collectible), now private. `pushFocusScope` and `popFocusScope` are gone. `addChild`,
`removeChild` and the stale-focus prune inside `removeChild` are unchanged, as is the lazy
self-heal in `#collectFocusables`, which remains the net for out-of-band removal and destruction.
`isRingVisible`, `focus`, `clearFocus`, `focusNext`, `focusPrevious`, `moveFocus`, `activate`,
`increase`, `decrease`, `update` and `destroy` are untouched.

### `source/engine/ui/Modal.ts` and `ModalOptions.ts`

`Modal implements Overlay`. `onCancel` and the wrapper that adapted it to the claim protocol are
deleted. `ModalOptions` loses `onCancel`, renames `onClose` to `onClosed` and gains:

```ts
// Fired once when a user-facing close begins, before any fade, never on
// destroy(). Side effects of dismissal belong here, so the cancel command and
// the modal's own close button cannot diverge: the pause menu unfreezes the
// world at close-start, behind the fading scrim.
onClosing?: (() => void) | undefined;
```

```ts
close(): void {
  if (this.#state === 'closing' || this.#state === 'closed') {
    return;
  }

  this.#onClosing?.();
  // unchanged from here: cancel any in-flight fade, tween to alpha 0, or
  // #finishClose() directly when there is no scheduler
}
```

`close()` no longer reports whether it initiated; the guard above is the only thing that needed
it. `#finishClose` calls `#onClosed` instead of `#onClose`. The open and close disposers call
`ui.addOverlay(this)` and `ui.removeOverlay(this)`; the comment about popping before removing is
replaced by one noting that `removeOverlay` owns the order.

### `source/engine/ui/TextInput.ts` and `TextInputOptions.ts`

```ts
// Consulted while editing, so the keys that commit or dismiss a field follow
// the game's bindings. Structural, so tests pass a fake and neither module
// imports the other.
input: {focusMatches: (command: 'activate' | 'cancel', event: KeyboardEvent) => boolean};
```

```ts
let handleKeyDown = (event: KeyboardEvent) => {
  // While editing, a key that produces a character is literal text, never a
  // command: `activate` binds Space, and any binding could name a printable
  // key. `code` identifies the physical key for bindings, `key` says what the
  // current layout produces.
  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    return;
  }

  if (this.#config.input.focusMatches('activate', event)) {
    this.#onSubmit?.(this);
    this.stopEditing();
  } else if (this.#config.input.focusMatches('cancel', event)) {
    this.stopEditing();
  }
};
```

`onEnter` becomes `onSubmit` in both files. It has no game or test call site. The DOM listener
stays, because `GameInput` ignores every key while a text-entry element has DOM focus
(`GameInput.ts:198-200`), which is what keeps arrows and Space as editing keys.

### `source/engine/input/GameInput.ts`

```ts
/** Whether the event matches one of the command's bindings. */
focusMatches(command: FocusCommand, event: KeyboardEvent): boolean
```

It builds a code set from `event.code` plus the event's modifier flags and reuses `#matches`,
which already resolves modifiers and the specificity rule. `GameInput` then satisfies
`TextInput`'s structural option without either module importing the other. The doc comment on
`focusPressed` ("`Game` is the only caller") and on `GameInputOptions.focus` ("Engine-consumed
focus commands") are reworded: a screen may observe a command as well.

### `source/engine/app/`

`GameScreenOptions.onCancel`, `GameScreen.#onCancel` and `GameScreen.cancel()` are deleted.
`GameScreen.hide`'s `ui.clearFocus()` stays exactly where it is. In `internals/adoptInput.ts` the
cancel branch becomes uniform with the other nine:

```ts
if (input.focusPressed('cancel')) {
  game.currentScreen.ui.cancel();
}
```

### `source/engine/dialogue/DialogueBox.ts`

`open` calls `ui.addOverlay(this)` and `destroy` calls `ui.removeOverlay(this)`, each replacing a
pair. `DialogueBox` declares no `close`, so the cancel command passes over it, which is what the
screen-level behaviour below depends on. The "Modal precedent" comments are rewritten to state
that an overlay without `close` is not dismissible.

## Game

### `source/game/core/input.ts`

```ts
// Dismisses the topmost overlay; with nothing dismissible open the world
// screen reads this same command and opens the pause menu.
cancel: {keys: ['Escape']},
```

and in `actions`, `pause: {keys: ['KeyP']}`. A key may appear in exactly one entry, which is why
pausing gets its own key rather than sharing Escape.

### `source/game/screens/worldScreen.ts`

The `onCancel` hook is deleted and replaced by:

```ts
onUpdate: (ticker, screen) => {
  // The pause key works from anywhere; the cancel command opens the menu only
  // when there was nothing to dismiss, which is what the screen-level hook did.
  if (
    input.pressed('pause') ||
    (input.focusPressed('cancel') && screen.ui.topOverlay?.close === undefined)
  ) {
    openPauseModal(screen);
  }
},
```

`openPauseModal` and its `openModal !== null` guard are unchanged. The module gains an `input`
import. `focusPressed` is a pure read of latched state, so `adoptInput` reading it at HIGH
priority and this hook reading it later in the same frame do not interfere, and neither ordering
changes the outcome.

`buildPauseModal` loses its `resume` closure: the Resume button becomes
`onClick: () => screen.contents.openModal?.close()`, and the modal takes
`onClosing: () => world.resume()` next to `onClosed: () => { screen.contents.openModal = null; }`.

### `source/game/screens/pauseFlow.ts`

`resumeFromPause` is deleted. `openPauseMenu` (freeze, then open) and `teardownWorldScreen`
(synchronous `destroy()`, never the animated close) are unchanged.

### `source/game/screens/mainMenuScreen.ts`

`onClose` becomes `onClosed` on the options modal. The `TextInput` gains `input`. Its `onChange`
callback already names its parameter `input`, which would shadow the module-level binding, so one
of the two is renamed at the same time.

## Invariants

Any implementation has to keep these; several are load-bearing and not obvious from the code.

1. Focus discovery reaches only components attached through component-level `addChild`, and only
   inside the innermost overlay.
2. A destroyed or detached subtree cannot crash navigation, whoever removed it. The lazy
   self-heal at the focus choke point stays the mechanism.
3. The world unfreezes at close-start, behind the fading scrim, never at close-complete.
4. `GameScreen.hide` clears focus before `onHide` runs, so overlay teardown must tolerate an
   already-empty scope stack.
5. Programmatic focus shows no ring; command-driven focus does.
6. No engine code decides behaviour from a key name. `game/core/input.ts` is the only place a
   key is chosen; `GameInput` parses key strings, and `TextInput` reads `event.key` only to ask
   whether the key produced a character. Engine comments that still name keys are a known
   exception, listed under non-goals.

## Sequencing

1. Types: `UiComponent`, `Overlay`, the `FocusScope` change.
2. `UiRoot`: `addOverlay`, `removeOverlay`, `topOverlay`, `#popScope`, the new `cancel`.
3. `Modal` and `DialogueBox` call sites, then `ModalOptions` (`onClosing`, `onClosed`, no
   `onCancel`, `close(): void`).
4. `GameScreen`, `GameScreenOptions`, `adoptInput`.
5. `worldScreen`, `pauseFlow`, `mainMenuScreen`, `game/core/input.ts`. The game does not compile
   between steps 4 and 5; they land together.
6. `GameInput.focusMatches`, then `TextInput`.

## Tests and verification

- `tests/UiRoot.browser.test.ts`: its share of the 23 `pushFocusScope`/`popFocusScope`
  references (the rest are the two spies in `tests/Modal.browser.test.ts`) become
  `addOverlay`/`removeOverlay`. The self-heal tests keep driving the API out of band (remove
  without a matching close) and keep their assertions. The `onCancel` scope tests are replaced by
  overlays that declare `close`. New test: with two overlays open, `removeOverlay` on the lower
  one leaves the top scope in place and still dismissible, which is the cross-pop regression.
- `tests/Modal.browser.test.ts`: the call-order spy test at line 141 asserts the outcome instead
  (prior focus restored, modal gone) because ordering is no longer the caller's to get wrong. The
  `onCancel` tests go; new tests cover `onClosing` firing once for a close with and without a
  fade, and never on `destroy()`. `onClose` assertions become `onClosed`, and the `close()`
  return assertions are dropped.
- `tests/pauseFlow.browser.test.ts`: the `resumeFromPause` tests go with the function. The
  freeze-then-open and teardown tests are unchanged.
- `tests/DialogueBox.browser.test.ts`, `tests/mapSign.browser.test.ts`,
  `tests/GameScreenState.browser.test.ts`: the `UiRoot` mock and the direct calls follow the
  renamed methods.
- `tests/TextInput.browser.test.ts`: the three construction sites take a fake `input`. New tests:
  a printable key bound to `activate` types instead of committing (the Space case), and a
  rebound `cancel` dismisses the field.
- New unit tests for `GameInput.focusMatches`: a bare binding, a modified one (`Shift+Tab`
  matching `previous` but not `next`), and an unbound command reading false.
- No test covers the engine's pause routing directly today, and none is added: the behaviour
  moves into `worldScreen`, which has no integration harness (game UI design section 7).

Run from `apps/somewhere`:

```
npx vitest run --project unit
npx vitest run --project browser
npm run lint
npm run typecheck
```

No dependency changes.

## Non-goals

- Splitting `UiRoot` into separate tree, focus and ring units.
- Collapsing the command verbs into one dispatch method.
- Rewriting the engine comments that describe commands in key names (`GameScreenOptions.ts:17`,
  `ModalOptions.ts:20`, `Focusable.ts:7-11`, four in `UiRoot.ts`).
- Any change to focus navigation, the focus ring, the pointer barrier or the focus sounds.
