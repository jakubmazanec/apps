import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {type FocusDirection} from './FocusDirection.js';
import {type FocusScope} from './FocusScope.js';
import {nearestInDirection} from './internals/nearestInDirection.js';
import {nearestTopLeft} from './internals/nearestTopLeft.js';
import {type Overlay} from './Overlay.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiFocusEvent} from './UiFocusEvent.js';
import {type UiRootConfig} from './UiRootConfig.js';
import {type UiRootOptions} from './UiRootOptions.js';
import {type UiRootParts} from './UiRootParts.js';
import {type UiRootRuntime} from './UiRootRuntime.js';

export class UiRoot implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Object for storing config. */
  readonly #config: UiRootConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when focus moves or a directional move is rejected. */
  readonly #onFocusEvent?: (event: UiFocusEvent) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: UiRootParts;

  /** Object for internal values that may change. */
  readonly #runtime: UiRootRuntime = {focused: null, isRingVisible: false, scopes: []};

  constructor({theme, onFocusEvent}: UiRootOptions) {
    this.#config = {theme};

    let overlay = new pixi.Container();
    let ring = new pixi.NineSliceSprite({texture: this.#config.theme.focusRing.texture});

    this.#parts = {overlay, ring};
    overlay.addChild(ring);

    if (onFocusEvent !== undefined) {
      this.#onFocusEvent = onFocusEvent;
    }

    // The overlay draws the focus ring on top of every widget, and once a
    // widget is focused the ring's bounds cover it. Pixi hit-tests front-to-back
    // and would reach the ring first; because the ring only carries the default
    // (hit-testable) event mode, pixi resolves the tap to the ring's nearest
    // interactive ancestor — this view — and stops, never descending to the
    // widget beneath. 'none' prunes the whole overlay subtree from hit-testing
    // so taps fall through to the focused widget and its onClick still fires.
    overlay.eventMode = 'none';

    this.view.addChild(overlay);

    // pixi notifies listeners only on interactive containers, so the root
    // must be static for the two pointertap listeners below to run. A plain
    // container has no geometry of its own, so this adds no hit target and
    // taps on the open world still reach the game view directly.
    this.view.eventMode = 'static';

    // Tapping a focusable silently moves navigation focus to it (the ring
    // stays hidden), so Tab/arrows resume from where the user last clicked.
    // Capture phase: components stop propagation of their pointertap, which
    // would hide the tap from a bubble listener here.
    let handleTap = (event: pixi.FederatedPointerEvent) => {
      this.#focusFromPointer(event.target);
    };

    this.view.addEventListener('pointertap', handleTap, {capture: true});

    this.#disposables.instance.defer(() => {
      this.view.removeEventListener('pointertap', handleTap, {capture: true});
    });

    // Any tap that bubbles this far started on a UI element (panel padding,
    // labels, widgets); stop it here so it can't fall through to the game view
    // and move the player. Taps on the open world never route through this view.
    let stopTap = (event: pixi.FederatedPointerEvent) => {
      event.stopPropagation();
    };

    this.view.addEventListener('pointertap', stopTap);

    this.#disposables.instance.defer(() => {
      this.view.removeEventListener('pointertap', stopTap);
    });

    // Any pointer press hides the ring again (focus is kept); it reappears on
    // the next focus command.
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handlePointerDown = () => {
      this.#runtime.isRingVisible = false;
    };

    globalThis.addEventListener('pointerdown', handlePointerDown);

    this.#disposables.instance.defer(() => {
      globalThis.removeEventListener('pointerdown', handlePointerDown);
    });

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get focused(): Focusable | null {
    return this.#runtime.focused;
  }

  /** TBD */
  get isRingVisible(): boolean {
    return this.#runtime.isRingVisible;
  }

  /** The innermost attached overlay, which owns focus and the cancel command. */
  get topOverlay(): Overlay | null {
    return this.#runtime.scopes.at(-1)?.root ?? null;
  }

  /** TBD */
  activate() {
    if (this.#runtime.focused === null) {
      return;
    }

    if (!this.#collectFocusables().includes(this.#runtime.focused)) {
      this.#runtime.focused = null;

      return;
    }

    this.#runtime.focused.activate();
  }

  /** TBD */
  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChildAt('view' in child ? child.view : child, this.view.children.length - 1); // The focus ring must stay last child, to render above other children.
    }

    return this;
  }

  // Scope/removal interplay: nothing forces a matching removeOverlay before an
  // overlay is removed or destroyed some other way. #collectFocusables lazily
  // self-heals at the focus choke point instead — see the prune step there.
  /** Attaches the overlay as the last UI child and gives it the focus scope. */
  addOverlay(overlay: Overlay): this {
    this.addChild(overlay);
    this.#runtime.scopes.push({previousFocus: this.#runtime.focused, root: overlay});
    this.#runtime.focused = null;

    return this;
  }

  // The topmost overlay owns cancel. Nothing open, or an overlay that declares
  // no close, means nothing happens here; what the game does instead is the
  // game's business.
  /** TBD */
  cancel() {
    this.#runtime.scopes.at(-1)?.root.close?.();
  }

  /** TBD */
  clearFocus() {
    this.#runtime.focused = null;
    this.#runtime.isRingVisible = false;
    this.#runtime.scopes.length = 0;
  }

  /** TBD */
  decrease() {
    if (this.#runtime.focused === null) {
      return;
    }

    if (!this.#collectFocusables().includes(this.#runtime.focused)) {
      this.#runtime.focused = null;

      return;
    }

    this.#runtime.focused.decrease?.();
  }

  /** Destroys the instance. */
  destroy() {
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.instance.dispose();
  }

  /** Sets component as focused without showing the focus ring. */
  focus(component: Focusable) {
    this.#runtime.focused = component;
  }

  /** TBD */
  focusNext() {
    this.#moveLinear(1);
  }

  /** TBD */
  focusPrevious() {
    this.#moveLinear(-1);
  }

  /** TBD */
  increase() {
    if (this.#runtime.focused === null) {
      return;
    }

    if (!this.#collectFocusables().includes(this.#runtime.focused)) {
      this.#runtime.focused = null;

      return;
    }

    this.#runtime.focused.increase?.();
  }

  /** TBD */
  moveFocus(direction: FocusDirection) {
    let focusables = this.#collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    this.#runtime.isRingVisible = true;

    let previous = this.#runtime.focused;
    let current = this.#runtime.focused;

    if (current === null) {
      this.#runtime.focused = nearestTopLeft(focusables);
      this.#emitFocusChange(previous);

      return;
    }

    if (!focusables.includes(current)) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#runtime.focused = null;

      return;
    }

    let next = nearestInDirection(current, focusables, direction);

    if (next === null) {
      // Arrow-key navigation hit a wall: the clean, detectable negative-feedback case.
      this.#onFocusEvent?.({type: 'reject'});
    } else {
      this.#runtime.focused = next;
      this.#emitFocusChange(previous);
    }
  }

  /** TBD */
  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    // Stale focus (the component left with the removed subtree): drop it now,
    // matching how the focus commands treat non-collectible components.
    if (
      this.#runtime.focused !== null &&
      !this.#collectFocusables().includes(this.#runtime.focused)
    ) {
      this.#runtime.focused = null;
    }

    return this;
  }

  // Drops this overlay's own scope, not whatever is on top, and tolerates a
  // scope that is already gone (clearFocus on hide, or the self-heal prune).
  // The scope goes before the child, so the order is not the caller's to get
  // wrong.
  /** Detaches the overlay and releases its focus scope. */
  removeOverlay(overlay: Overlay): this {
    let index = this.#runtime.scopes.findIndex((scope) => scope.root === overlay);

    if (index !== -1 && index === this.#runtime.scopes.length - 1) {
      let scope = this.#runtime.scopes.pop();

      if (scope !== undefined) {
        this.#runtime.focused =
          scope.previousFocus !== null && this.#collectFocusables().includes(scope.previousFocus) ?
            scope.previousFocus
          : null;
      }
    } else if (index !== -1) {
      this.#runtime.scopes.splice(index, 1);
    }

    this.removeChild(overlay);

    return this;
  }

  /** TBD */
  update() {
    let {focused, isRingVisible} = this.#runtime;
    let {overlay, ring} = this.#parts;

    if (!isRingVisible || !focused?.isFocusable || focused.view.destroyed) {
      ring.visible = false;

      return;
    }

    let {padding} = this.#config.theme.focusRing;
    // Bounds are re-read every frame while the ring is visible, so it tracks
    // layout changes and animations without any cached geometry to invalidate.
    let bounds = focused.view.getBounds();
    let topLeft = overlay.toLocal({x: bounds.x, y: bounds.y});
    let bottomRight = overlay.toLocal({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });

    ring.visible = true;
    ring.position.set(topLeft.x - padding, topLeft.y - padding);
    ring.setSize(bottomRight.x - topLeft.x + 2 * padding, bottomRight.y - topLeft.y + 2 * padding);
  }

  // Depth-first order over the component hierarchy is the Tab order. Raw Pixi
  // containers are leaves (components are only discoverable through public
  // children arrays), and subtrees whose view is hidden are pruned.
  //
  // Before walking, dead scopes are pruned from the top of #runtime.scopes: a scope
  // whose root view is destroyed or no longer attached under this root was
  // removed out-of-band (direct removal, deep removal e.g. via
  // Panel.removeChild, or a plain destroy()). Without this, the stale scope
  // keeps detached-but-not-destroyed widgets focusable: Tab reaches components
  // that are no longer on stage and activate() fires their handlers. Pruning
  // mirrors #popScope by restoring the last-pruned scope's previousFocus
  // when still collectible. Dead scopes below a live top scope wait until they
  // surface; staleness between the mutation and the next focus command is
  // unobservable (nothing reads the stack in between).
  /** TBD */
  #collectFocusables(): Focusable[] {
    let pruned: FocusScope | null = null;

    while (this.#runtime.scopes.length > 0) {
      // the type assertion is ok, because we checked `this.#runtime.scopes.length`
      let scope = this.#runtime.scopes.at(-1) as FocusScope;
      let scopeView = scope.root.view;

      if (!scopeView.destroyed && this.#isConnected(scopeView)) {
        break;
      }

      this.#runtime.scopes.pop();
      pruned = scope;
    }

    let result: Focusable[] = [];
    let walk = (node: UiChild) => {
      if (!('view' in node)) {
        return;
      }

      if (!node.view.visible) {
        return;
      }

      // A destroyed pixi container still reports visible === true, but its
      // getBounds() throws; without this prune a component destroyed while
      // still in a children array would crash the spatial-navigation math on
      // the next Tab/arrow press.
      if (node.view.destroyed) {
        return;
      }

      let {isFocusable, children} = node as Partial<Focusable> & Partial<UiParent>;

      if (isFocusable === true) {
        result.push(node as Focusable);
      }

      for (let child of children ?? []) {
        walk(child);
      }
    };

    walk(this.#runtime.scopes.at(-1)?.root ?? this);

    if (pruned !== null) {
      this.#runtime.focused =
        pruned.previousFocus !== null && result.includes(pruned.previousFocus) ?
          pruned.previousFocus
        : null;
    }

    return result;
  }

  // Fire `move` only when the focus actually changed to a different component
  // (a single-focusable focusNext wraps to itself and stays silent).
  /** TBD */
  #emitFocusChange(previous: Focusable | null) {
    if (this.#runtime.focused !== null && this.#runtime.focused !== previous) {
      this.#onFocusEvent?.({type: 'move'});
    }
  }

  // Pointer interplay: resolve a Pixi hit-test target back to the component
  // that owns it and focus it silently (the ring stays hidden), so keyboard
  // navigation resumes from where the user last tapped.
  /** TBD */
  #focusFromPointer(target: pixi.Container | null) {
    let byView = new Map<pixi.Container, Focusable>();

    for (let focusable of this.#collectFocusables()) {
      byView.set(focusable.view, focusable);
    }

    let current = target;

    while (current !== null) {
      let focusable = byView.get(current);

      if (focusable !== undefined) {
        this.#runtime.focused = focusable;

        return;
      }

      current = current.parent;
    }
  }

  // Attachment is checked via the pixi view.parent chain — component-level
  // parent pointers don't exist.
  /** TBD */
  #isConnected(view: pixi.Container): boolean {
    let current: pixi.Container | null = view;

    while (current !== null) {
      if (current === this.view) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  /** TBD */
  #moveLinear(step: -1 | 1) {
    let focusables = this.#collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    this.#runtime.isRingVisible = true;

    let previous = this.#runtime.focused;
    let current = this.#runtime.focused;

    if (current === null) {
      this.#runtime.focused = focusables[0] ?? null;
      this.#emitFocusChange(previous);

      return;
    }

    let index = focusables.indexOf(current);

    if (index === -1) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#runtime.focused = null;

      return;
    }

    this.#runtime.focused =
      focusables[(index + step + focusables.length) % focusables.length] ?? null;
    this.#emitFocusChange(previous);
  }
}
