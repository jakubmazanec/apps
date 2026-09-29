# UI overlay attach protocol, reusable modals and yoga-sized modals: design

Date: 2026-09-29 App: `apps/somewhere` Status: approved design, implementation not started. Builds
on the 2026-09-25 and 2026-09-26 overlay designs. It replaces how an overlay gets into a `UiRoot`
(`Modal.open`, `DialogueBox.open`) and how a `Modal` is sized, and keeps everything else those
designs decided.

## Background

`apps/somewhere` is an engine first; `source/game/` is its test bed. The decisions below are judged
against what an engine user would build, not against the two modals the test game has.

**Overlays attach themselves, unlike everything else in the engine.** `World.addSystem(system)`
calls `system.attach(world)` (`System.ts:112`), `World` does the same for `EntityQuery` and
`EventChannel`, and `Game.addScreen` calls `screen.attach(game)` (`GameScreen.ts:139`). All of these
are owner-called methods, marked `@internal Called by`. `Modal.open(ui)` and `DialogueBox.open(ui)`
are the inverse: the screen calls the overlay, and the overlay calls `ui.addOverlay(this)`. Because
`addOverlay` is public too, there are two ways in, and the direct one skips `Modal`'s state machine:
the state stays `closed`, so `close()` and the cancel command return early and the modal cannot be
dismissed. `addOverlay` has no guard of its own, so a second call duplicates the child and pushes a
second scope.

**The attach plumbing exists twice.** `Modal` keeps the root in a disposer closure (`Modal.ts:170`),
`DialogueBox` in a `#ui` field, and each has its own double-open guard. The box's comments describe
it as "in the Modal idiom" (`DialogueBox.ts:77`) and "The Modal precedent"
(`dialogueBoxSystem.ts:209`): the shared concept is passed on by imitation.

**A `Modal` is single-use.** `#finishClose` destroys the views (`Modal.ts:232`), so every open
builds a new instance. An overlay that should remember its cursor, scroll offset or tab has to read
that state out before it dies and pass it back into the next build.

**A `Modal` is the only widget sized by hand.** Every screen calls `modal.resize(w, h)` after
opening and again from its `onResize` lifecycle hook, repeating the `pixelScale` arithmetic
(`worldScreen.ts:124`, `:243`, `mainMenuScreen.ts:108`, `:215`). Forgetting the first call leaves a
zero-size modal with no scrim and no error. The rest of the UI is sized by yoga.

**Only `destroy()` tells a widget that it left the screen.** A `TextInput` ends its edit on the
submit or cancel key, on a pointer press outside the field, on DOM blur, on `disable()` and on
`destroy()`. Whenever the player closes a modal the edit is already over. When code removes a modal,
today's `destroy()` cascade ends it. A modal that is kept alive gets no such cascade: the DOM input
would keep focus and `GameInput` would stay deaf.

Verification on 2026-09-29 (code reading plus throwaway browser probes, since deleted) found the
following. The probes ran in headless Chromium in the dev container with software GL, not on a
phone; the throttled row uses Chrome's CPU throttling as a rough stand-in for a mid-range one.

Main-thread time of the frame in which the overlay appears, median of opens 2 to 5. Built per open
is construct, attach and first render; kept is attach and first render.

| Overlay                             | Widgets | Built per open | Kept instance |
| ----------------------------------- | ------- | -------------- | ------------- |
| Pause menu                          | 8       | 4.0 ms         | 0.7 ms        |
| Options                             | 19      | 7.9 ms         | 1.0 ms        |
| Grid of 25 cells                    | 80      | 22.1 ms        | 1.4 ms        |
| Grid of 100 cells                   | 305     | 94.3 ms        | 3.4 ms        |
| Grid of 300 cells                   | 905     | 202.6 ms       | 8.3 ms        |
| Grid of 100 cells, CPU throttled 4x | 305     | 335.0 ms       | 16.2 ms       |

- Build cost is linear, about 0.2 to 0.3 ms per widget. Building per open stops fitting a 16.7 ms
  frame at about 60 widgets.
- The single-use path leaks nothing: listeners, `Ticker.shared` callbacks, yoga nodes, DOM elements
  and tweens were flat over 1,600 open and close cycles.
- A kept instance holds about 9 KB per widget while it is off screen. Pixi's collector unloads the
  GPU data of a view unused for about a minute; the next attach of a 100-cell grid then costs 14 ms
  instead of 2 ms.
- A root with `position: 'absolute'` and percentage sizes resolves to the full box of the `UiRoot`
  view (240x135), padding on that view included, and follows a change of the root size on the next
  layout pass. The 100 ms layout throttle covers only the re-measure of intrinsic leaves.
- A scrim sized by layout is full size in the first drawn frame. Its computed layout is 0x0 between
  attach and the first `prerender`, so it blocks no pointer press in that window. Today's scrim
  covers only part of the screen in the same window, because a freshly attached child has a stale
  transform (`attachHitArea.ts:4`).
- Without a layout on the `UiRoot` view, a percentage-sized root collapses to the size of its
  content, silently.
- `DialogueBox` needs its width synchronously: the runner takes the page breaks in the same update
  as `showNode` (`dialogueBoxSystem.ts:244`), and yoga computes in `prerender`, after every update.

## Decisions

- `UiRoot.addOverlay` and `UiRoot.removeOverlay` are the only way an overlay enters or leaves.
  `Modal.open(ui)` and `DialogueBox.open(ui)` are deleted.
- `Overlay` gains two optional owner-called methods, `attach(ui)` and `detach()`. `UiRoot` calls
  `attach` after the overlay has its focus scope and `detach` after it left the tree.
- `detach()` undoes `attach()` and nothing else. It never destroys and fires no lifecycle hook.
- One concept, called overlay: whatever goes through `addOverlay` holds the focus scope. A component
  shown on top that must not trap focus is a plain child. All identifiers keep their names:
  `Overlay`, `addOverlay`, `removeOverlay`, `topOverlay`, `Modal`, `DialogueBox`.
- Inside `UiRoot` the ring container `#parts.overlay` becomes `#parts.ringContainer`, so that
  "overlay" means one thing there.
- `addOverlay` throws for an overlay that is already attached or destroyed. `removeOverlay` throws
  for one that is not attached. `attach` and `detach` throw like `System.attach` and
  `System.detach`. `removeOverlay` keeps tolerating a scope that `clearFocus` already emptied.
- `ModalOptions` gains `isReusable`, default `false`. With it, `close()` removes the modal but does
  not destroy it, and the same instance can be added again. `destroy()` always destroys.
- `Modal.resize()` is deleted. The root and the scrim take percentage sizes and yoga sizes them
  against the `UiRoot` view. `Modal.attach` throws when that view has no layout. The scrim gets a
  hit area that accepts every point, so it blocks from the moment it is attached.
- `DialogueBox.resize()` stays, fed by `dialogueBoxSystem` as today.
- `Focusable` gains an optional `deactivate()`. `UiRoot.removeOverlay` calls it on every focusable
  inside the overlay before removing it, and `TextInput` implements it as `stopEditing()`.
- Both modals of the test game stay single-use. Nothing the player can see or do changes.
- Comments are rewritten where their subject changed, never deleted.

Rejected: keeping `open(ui)`; passing the root as a constructor option (the overlay would still
attach itself); a screen-level helper such as `screen.addOverlay` (`DialogueBox` is opened from a
system); decoupling through lifecycle hooks only, with the screen calling `removeOverlay` from
`onClosed` (`destroy()` could no longer release its own scope); public `onAttached` and `onDetached`
members (a lifecycle hook is an option stored in a `#onX` field and fired by the instance, never a
public method); `DialogueBox` as content inside a `Modal` (`Modal` always has `close`, which breaks
"declaring `close` makes it dismissible"); naming the concept "modal" (`UiModal`, `addModal`: 82
renamed identifiers, and a second API once a non-trapping overlay arrives); an idempotent second
`addOverlay` (hides a programming error); a `detach()` that destroys (no `detach` in the engine
does); reusable as the default (a forgotten `destroy()` leaks silently, a forgotten `isReusable`
throws on the second add); forwarding resize through `UiRoot` (yoga already does it for `Modal`, and
it would not deliver breaks to the dialogue runner); passing `detach` down the whole component tree
(every container widget would have to forward it); a `TextInput` that watches `parentRenderGroup` on
every tick (pixi marks the property private); leaving the running edit to the owner (the failure is
silent and locks the keyboard); a default layout on the `UiRoot` view (it would add a second item to
`loadingScreen`'s centred row).

Reviewed and not adopted: removing the `openModal` tracking from the screens in favour of
`ui.topOverlay`; passing the modal to `onClosing` and `onClosed`, as other lifecycle hooks receive
their instance; a lifecycle hook that refreshes a kept modal before it shows; reversing a fade so
that a modal can be reopened during its fade-out.

## Engine

### `source/engine/ui/Overlay.ts`

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

`Overlay.ts` and `UiRoot.ts` now import each other's types, as `System.ts` and `World.ts` do.

### `source/engine/ui/Focusable.ts`

One optional member, next to `increase` and `decrease`:

```ts
// Ends what activate started, when it is still running. Optional: only a
// component that stays busy after activation has something to end, which
// today is TextInput and its edit. UiRoot calls it on every focusable of an
// overlay it removes.
deactivate?: () => void;
```

### `source/engine/ui/UiRoot.ts`, `UiRootParts.ts`

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

  // scope release unchanged: pop and restore, or pass previousFocus up

  this.removeChild(overlay);
  overlay.detach?.();

  return this;
}
```

`UiRootParts` becomes `Parts<{ring: pixi.NineSliceSprite; ringContainer: pixi.Container}>`. The
constructor assigns `{ring, ringContainer}` and `update()` reads `ringContainer` where it read
`overlay`. `topOverlay`, `cancel()`, `removeChild`, `clearFocus()`, `destroy()` and the command
verbs are untouched.

If `attach` throws, the overlay is already a child and holds a scope. `UiRoot` does not roll back: a
throw here is a programming error, the same as `World.addSystem` when `system.attach` throws.

### `source/engine/ui/TextInput.ts`

```ts
/** @internal Called by `UiRoot`. */
deactivate() {
  this.stopEditing();
}
```

`eslint --fix` decides its position (`perfectionist/sort-classes`).

### `source/engine/ui/Modal.ts`, `ModalOptions.ts`, `ModalConfig.ts`, `ModalRuntime.ts`

`open(ui)`, `resize(width, height)` and `#disposables.open` are deleted; `#disposables` becomes
`Disposables<'instance'>`. `ModalConfig` gains `isReusable: boolean`. `ModalRuntime` becomes
`Runtime<{cancelFade: (() => void) | null; ui: UiRoot | null}>`, so the root reference lives in the
existing bag and no private field is added.

```ts
// ModalOptions.ts
// Keeps the modal alive after close(), so the same instance can be added
// again with ui.addOverlay(); its owner then destroys it. Off by default:
// close() destroys the modal.
isReusable?: boolean | undefined;
```

```ts
// A modal: a flat widget in the existing Container/Panel idiom (public
// `children` + `view`, no inheritance) and the general-purpose overlay, added
// with ui.addOverlay(modal). Constructed per open by whatever handler opens
// it, unless isReusable keeps it alive after close(); the owning screen tracks
// the instance and calls destroy() (never the animated close()) from its
// onHide.
export class Modal implements Overlay {
  constructor({
    children,
    layout,
    scrimAlpha = 0.5,
    initialFocus,
    isReusable = false,
    onClosing,
    onClosed,
    scheduler,
    fadeDuration,
  }: ModalOptions) {
    // hooks unchanged

    this.#config = {
      fadeDuration,
      initialFocus,
      isReusable,
      scheduler,
    };

    // The scrim is a raw pixi child behind the layout children and deliberately
    // NOT in `children`, so the focus walk never sees it. It is interactive so
    // every pointer event lands on UI (UiRoot already stops taps on UI from
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

    // children unchanged

    // position: 'absolute' keeps the full-screen root out of any flex flow the
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

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

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

    if (ui.view.layout === null) {
      throw new Error('UI root has no layout, the modal is sized against it!');
    }

    this.#runtime.ui = ui;

    if (this.#config.initialFocus !== undefined) {
      ui.focus(this.#config.initialFocus);
    }

    // fade-in unchanged: 'opening' at alpha 0, tween to 1, then 'open'; without
    // scheduler and fadeDuration 'open' at once
  }

  // close() unchanged

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

  // Teardown path (owning-screen onHide, or any out-of-band cleanup): leaves
  // the UiRoot if still attached (tolerant of an already-empty scope stack)
  // and synchronously destroys; callable from any state, never animated, never
  // fires onClosing or onClosed, and destroys a kept modal too.
  /** Destroys the instance. */
  destroy() {
    this.#runtime.ui?.removeOverlay(this);
    this.#destroyViews();
  }

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
}
```

The three ways out:

| Way out                   | Lifecycle hooks         | `isReusable: false` | `isReusable: true` |
| ------------------------- | ----------------------- | ------------------- | ------------------ |
| `close()`, cancel command | `onClosing`, `onClosed` | removed, destroyed  | removed, kept      |
| `destroy()`               | none                    | removed, destroyed  | removed, destroyed |
| `ui.removeOverlay(modal)` | none                    | removed, kept       | removed, kept      |

`ui.removeOverlay(modal)` during a fade-out cancels the fade in `detach()`: `onClosing` has fired,
`onClosed` never will. `ModalState` and the meaning of its four values are unchanged; a modal is
`closed` before its first attach and after every detach. `children`, `layout`, `scrimAlpha`,
`initialFocus`, `scheduler`, `fadeDuration`, `onClosing` and `onClosed` are unchanged.

### `source/engine/dialogue/DialogueBox.ts`

`open(ui)` is deleted. The box keeps its `#ui` field for `focusedChoiceIndex` and `#applySelected`.
It gets no `isReusable`: that option decides what `close()` does, and the box has none.

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
 * (third paragraph unchanged)
 */
export class DialogueBox implements Overlay {
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

    // box and view teardown unchanged
  }

  /** @internal Called by `UiRoot`. */
  detach() {
    if (!this.#ui) {
      throw new Error('Dialogue box is not attached to a UI root!');
    }

    this.#ui = null;
  }
}
```

`resize`, `showNode`, `setChoices`, `setSelected`, `setRevealed`, `setAdvanceMarker` and
`focusedChoiceIndex` are unchanged. `ui.removeOverlay(box)` removes the box without destroying it,
so an engine user can keep one across dialogues.

## Game

### `source/game/systems/dialogueBoxSystem.ts`

```ts
// The box is added to the screen's ui as an overlay and holds the focus
// scope, so focus commands stay on its choices (or nothing) and never wander
// to HUD widgets. Headless harnesses without a screen fall back to the world
// layer; the box works there minus keyboard focus.
let ui = game.currentScreen?.ui;

if (ui === undefined) {
  layer.addChild(box.view);
} else {
  ui.addOverlay(box);
}
```

One box per dialogue stays: keeping it would save about 0.4 ms per dialogue.

### `source/game/screens/worldScreen.ts`

```ts
openModal: () => {
  let modal = buildPauseModal(screen);

  screen.contents.openModal = modal;
  screen.ui.addOverlay(modal);
},
```

The `onResize` lifecycle hook is deleted. In the `onAttach` comment "The focus-ring overlay and the
modal stay out of the flow" becomes "The focus ring and the overlays stay out of the flow".
`buildPauseModal`, the `openModal !== null` guard, `onHide` and the cancel check on
`topOverlay?.close` are unchanged. The pause menu does not set `isReusable`: its "Saved" label
resets by being rebuilt.

### `source/game/screens/mainMenuScreen.ts`

```ts
screen.contents.openModal = modal;
screen.ui.addOverlay(modal);
```

The `onResize` lifecycle hook is deleted. `onHide` is unchanged. The Options modal does not set
`isReusable`: its widgets read the current settings when built.

### `source/game/screens/pauseFlow.ts`, `errorScreen.ts`, `loadingScreen.ts`

No change. Both screens that open a modal already give their `UiRoot` view a layout
(`worldScreen.ts:146`, `mainMenuScreen.ts:154`).

## Rules for the owner of a kept modal

Not part of the diff; this is what an engine user has to know.

1. Refresh before adding. The modal shows what it showed last time.
2. Add only when `modal.state === 'closed'`. During the fade-out the modal is still attached and
   `addOverlay` throws.
3. Destroy or remove it in `onHide`. `GameScreen.hide()` clears the scheduler, so a kept modal
   caught mid-fade would stay in `opening` or `closing`.
4. Destroy it eventually. `UiRoot.destroy()` reaches only overlays attached at that moment.
5. Keyboard focus is not kept: it lives in `UiRoot`, and `initialFocus` is applied on every attach.

```ts
function openInventory(screen) {
  let {contents, ui} = screen;

  contents.inventory ??= buildInventoryModal(screen); // isReusable: true

  if (contents.inventory.state !== 'closed') {
    return;
  }

  refreshInventory(contents.inventory);
  ui.addOverlay(contents.inventory);
}
```

## Invariants

1. An overlay enters through `addOverlay` and leaves through `removeOverlay`. `attach` and `detach`
   are called by `UiRoot` only.
2. `attach` runs after the overlay holds its scope. `deactivate` runs while the overlay is still in
   the tree, `detach` after it left.
3. `detach()` undoes `attach()` and nothing else. `destroy()` always destroys, whatever `isReusable`
   says.
4. `onClosing` and `onClosed` fire for `close()` only, never for `destroy()` or a direct
   `removeOverlay`.
5. Every overlay holds the focus scope while it is attached.
6. A `Modal` never reads screen dimensions.
7. Kept from 2026-09-25: declaring `close` is what makes an overlay dismissible; the world unfreezes
   at close-start; `GameScreen.hide` clears the stack before `onHide`, so `removeOverlay` tolerates
   a missing scope.
8. Kept from 2026-09-26: `removeChild` refuses an overlay that holds a scope; removing a buried
   overlay passes its `previousFocus` up.

## Sequencing

Red first for every behaviour change. Each step compiles and passes its tests before the next.

0. Baseline: both Vitest projects and `npm run typecheck` green. `npm run lint` is red on the
   baseline, so lint is checked per changed file.
1. Contract and `UiRoot`: `Overlay`, `Focusable`, the guards and the three new calls in `addOverlay`
   and `removeOverlay`, `TextInput.deactivate`, the ring container rename. `Modal.open` and
   `DialogueBox.open` keep working, because `attach` and `detach` are optional.
2. `Modal`: `attach`, `detach`, `#finishClose`, `destroy`, no `open`, no `#disposables.open`. Both
   screens switch to `addOverlay` in the same step, or the game does not compile. `resize()` still
   exists here.
3. `DialogueBox` and `dialogueBoxSystem`.
4. `isReusable`.
5. Sizing: percentage root, scrim, hit area, the layout check in `attach`. `resize()` and both
   `onResize` lifecycle hooks are deleted.
6. Remaining comment rewrites. Comments tied to code move with their code in steps 1 to 5.

Steps 2 and 3 are independent. Step 4 needs step 2. Step 5 comes last because it carries the only
unproven part, the hit area.

## Tests and verification

### `tests/UiRoot.browser.test.ts`

- The titles at `:95` and `:174` say "focus ring overlay"; they are reworded to "focus ring".
- New: `addOverlay` calls `attach` with the root after the scope exists. Inside `attach`,
  `topOverlay` is the overlay.
- New: `addOverlay` throws for an attached overlay; `children` and `topOverlay` are unchanged.
- New: `addOverlay` throws for an overlay whose view is destroyed.
- New: `removeOverlay` calls `detach` after the overlay left `children`.
- New: `removeOverlay` throws for an overlay that is not attached.
- New: `removeOverlay` calls `deactivate` on each focusable inside the overlay and skips those
  without it.
- New: `removeOverlay` still calls `detach` after `clearFocus()` emptied the scopes.
- `removeOverlay tolerates a scope that is already gone` and every other overlay test: unchanged.

### `tests/Modal.browser.test.ts`

- The 14 `modal.open(root)` call sites become `root.addOverlay(modal)`, and titles that say `open()`
  are reworded. The first title's "below the focus-ring overlay" becomes "below the focus ring".
- `open() is a no-op unless closed` (`:129`) becomes `adding an attached modal throws`.
- `resize() sizes the root layout and redraws the scrim` (`:206`) is deleted with `resize()`.
- `the scrim is a raw interactive view child...` (`:232`) also asserts the hit area.
- New: with `isReusable`, `close()` keeps the views, fires `onClosed` and ends in `closed`.
- New: a kept modal can be added again; it fades in and `initialFocus` is applied again.
- New: `destroy()` destroys a kept modal.
- New: adding a modal that is still fading out throws.
- New: `ui.removeOverlay(modal)` leaves the modal alive and fires neither lifecycle hook.
- New: `ui.removeOverlay(modal)` during a fade cancels the tween.

This file runs without a layout system, so `view.layout` is `undefined` there and the layout check
in `attach` does not fire.

### `tests/ModalLayout.browser.test.ts` (new)

With a real `LayoutSystem`, set up like `tests/DialogueBoxLayout.browser.test.ts:9-16`.

- The modal fills the `UiRoot` view, also when that view has padding.
- The modal follows a change of the root size on the next layout pass.
- The scrim covers the whole modal in the first rendered frame.
- A kept modal added again after a size change has the new size.
- A pointer press right after `addOverlay`, before any render, hits the scrim. If this cannot be
  made to pass, the hit area is dropped and the one-frame gap is documented in the scrim's comment
  instead.
- `attach` throws when the `UiRoot` view has no layout.

### `tests/DialogueBox.browser.test.ts`

- The 5 `box.open(ui)` call sites become `ui.addOverlay(box)`, and the title
  `open takes a focus scope...` is reworded.
- New: adding an attached box throws.
- New: `ui.removeOverlay(box)` keeps the box alive, and it can be added again.

### `tests/TextInput.browser.test.ts`

- New: `deactivate()` ends a running edit.
- New: removing an overlay that holds an editing field ends the edit.

### `tests/pauseFlow.browser.test.ts`

- The call site at `:84` becomes `root.addOverlay(modal)`.

Per step, from `apps/somewhere`:

```
npx vitest run --project browser <the test files of that step>
npx eslint <the files changed in that step>
npm run typecheck
```

At the end:

```
npx vitest run --project unit
npx vitest run --project browser
```

No dependency changes.

## Non-goals

- Removing the `openModal` tracking from the screens.
- Forwarding resize through `UiRoot`, or any change to `DialogueBox.resize`.
- Reopening a modal during its fade-out. A pause press during the fade-out is dropped today and
  stays dropped.
- Passing the modal to `onClosing` and `onClosed`.
- A lifecycle hook that refreshes a kept modal.
- Ending an edit when a panel is removed with `removeChild` or hidden.
- Making a modal of the test game reusable.
- Overlays that do not trap focus.
- The pixi graphics data that `destroy({children: true})` leaves to pixi's collector for about a
  minute.
