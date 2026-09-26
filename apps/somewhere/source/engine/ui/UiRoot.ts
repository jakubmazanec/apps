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

    return result;
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

    if (!this.#focusables.includes(this.#runtime.focused)) {
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

    if (!this.#focusables.includes(this.#runtime.focused)) {
      this.#runtime.focused = null;

      return;
    }

    this.#runtime.focused.decrease?.();
  }

  /** Destroys the instance. */
  destroy() {
    // A copy: an overlay's destroy() leaves children through removeOverlay.
    let children = [...this.children];

    for (let child of children) {
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

    if (!this.#focusables.includes(this.#runtime.focused)) {
      this.#runtime.focused = null;

      return;
    }

    this.#runtime.focused.increase?.();
  }

  /** TBD */
  moveFocus(direction: FocusDirection) {
    let focusables = this.#focusables;

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
    // An overlay leaves through removeOverlay, which releases its scope first.
    // Checked before anything is removed, so a refused call changes nothing.
    if (children.some((child) => this.#runtime.scopes.some((scope) => scope.root === child))) {
      throw new Error('Overlay must be removed with removeOverlay()!');
    }

    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    // Stale focus (the component left with the removed subtree): drop it now,
    // matching how the focus commands treat non-collectible components.
    if (this.#runtime.focused !== null && !this.#focusables.includes(this.#runtime.focused)) {
      this.#runtime.focused = null;
    }

    return this;
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

    for (let focusable of this.#focusables) {
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

  /** TBD */
  #moveLinear(step: -1 | 1) {
    let focusables = this.#focusables;

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
