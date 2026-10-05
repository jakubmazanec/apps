import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {type FocusDirection} from './FocusDirection.js';
import {type FocusScope} from './FocusScope.js';
import {adoptChildren} from './internals/adoptChildren.js';
import {collectFocusables} from './internals/collectFocusables.js';
import {nearestInDirection} from './internals/nearestInDirection.js';
import {nearestTopLeft} from './internals/nearestTopLeft.js';
import {resolveView} from './internals/resolveView.js';
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

    let ringContainer = new pixi.Container();
    let ring = new pixi.NineSliceSprite({texture: this.#config.theme.focusRing.texture});

    this.#parts = {ring, ringContainer};
    ringContainer.eventMode = 'none';
    this.view.eventMode = 'static';

    ringContainer.addChild(ring);
    this.view.addChild(ringContainer);

    if (onFocusEvent !== undefined) {
      this.#onFocusEvent = onFocusEvent;
    }

    // Taps focus components without showing the ring; keyboard navigation resumes from last tapped
    // component.
    let handleTap = (event: pixi.FederatedPointerEvent) => {
      let byView = new Map<pixi.Container, Focusable>();

      for (let focusable of this.#focusables) {
        byView.set(focusable.view, focusable);
      }

      let current: pixi.Container | null = event.target;

      // We need to find component with view that is the tapped Pixi.js display object.
      while (current !== null) {
        let focusable = byView.get(current);

        if (focusable !== undefined) {
          this.#runtime.focused = focusable;

          return;
        }

        current = current.parent;
      }
    };

    this.view.addEventListener('pointertap', handleTap, {capture: true});
    this.#disposables.instance.defer(() => {
      this.view.removeEventListener('pointertap', handleTap, {capture: true});
    });

    // Stops propagating taps, so no game handlers can receive them.
    let stopTap = (event: pixi.FederatedPointerEvent) => {
      event.stopPropagation();
    };

    this.view.addEventListener('pointertap', stopTap);
    this.#disposables.instance.defer(() => {
      this.view.removeEventListener('pointertap', stopTap);
    });

    // Any pointer press hides the ring.
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
    adoptChildren(this.#disposables.instance, this.children);
  }

  /** TBD */
  get #focusables(): Focusable[] {
    return collectFocusables(this.#runtime.scopes.at(-1)?.root ?? this);
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
      this.view.addChildAt(resolveView(child), this.view.children.length - 1); // The focus ring must stay last child, to render above other children.
    }

    return this;
  }

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
    this.#disposables.instance.dispose();
  }

  /** Sets component as focused without showing the focus ring. */
  focus(component: Focusable) {
    this.#runtime.focused = component;
  }

  /** TBD */
  focusNext() {
    let focusables = this.#focusables;

    if (focusables.length === 0) {
      return;
    }

    this.#runtime.isRingVisible = true;

    if (this.#runtime.focused === null) {
      this.#runtime.focused = focusables[0] ?? null;
      this.#onFocusEvent?.({type: 'move'});

      return;
    }

    let index = focusables.indexOf(this.#runtime.focused);

    if (index === -1) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#runtime.focused = null;

      return;
    }

    let next = focusables[(index + 1) % focusables.length] ?? null;

    // A single focusable wraps to itself and stays silent.
    if (next !== this.#runtime.focused) {
      this.#runtime.focused = next;
      this.#onFocusEvent?.({type: 'move'});
    }
  }

  /** TBD */
  focusPrevious() {
    let focusables = this.#focusables;

    if (focusables.length === 0) {
      return;
    }

    this.#runtime.isRingVisible = true;

    if (this.#runtime.focused === null) {
      this.#runtime.focused = focusables.at(-1) ?? null;
      this.#onFocusEvent?.({type: 'move'});

      return;
    }

    let index = focusables.indexOf(this.#runtime.focused);

    if (index === -1) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#runtime.focused = null;

      return;
    }

    // at(-1) wraps from the first component to the last.
    let next = focusables.at(index - 1) ?? null;

    // A single focusable wraps to itself and stays silent.
    if (next !== this.#runtime.focused) {
      this.#runtime.focused = next;
      this.#onFocusEvent?.({type: 'move'});
    }
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

    if (this.#runtime.focused === null) {
      this.#runtime.focused = nearestTopLeft(focusables);

      if (this.#runtime.focused !== null) {
        this.#onFocusEvent?.({type: 'move'});
      }

      return;
    }

    if (!focusables.includes(this.#runtime.focused)) {
      this.#runtime.focused = null;

      return;
    }

    let next = nearestInDirection(this.#runtime.focused, focusables, direction);

    if (next === null) {
      // Arrow-key navigation hit a wall: the clean, detectable negative-feedback case.
      this.#onFocusEvent?.({type: 'reject'});
    } else {
      this.#runtime.focused = next;
      this.#onFocusEvent?.({type: 'move'});
    }
  }

  /** TBD */
  removeChild(...children: UiChild[]): this {
    if (children.some((child) => this.#runtime.scopes.some((scope) => scope.root === child))) {
      throw new Error('Overlay must be removed with removeOverlay()!');
    }

    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild(resolveView(child));
    }

    if (this.#runtime.focused !== null && !this.#focusables.includes(this.#runtime.focused)) {
      this.#runtime.focused = null;
    }

    return this;
  }

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
      // Topmost scope is being removed.
      let scope = this.#runtime.scopes.pop();

      if (scope !== undefined) {
        this.#runtime.focused =
          scope.previousFocus !== null && this.#focusables.includes(scope.previousFocus) ?
            scope.previousFocus
          : null;
      }
    } else if (index !== -1) {
      // The scope being removed has saved a focused element from a lower scope; we need to copy it
      // to the scope that replaces the removed one.
      let [buried] = this.#runtime.scopes.splice(index, 1) as [FocusScope];

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- it's ok, we checked for existence
      this.#runtime.scopes[index]!.previousFocus = buried.previousFocus;
    }

    this.removeChild(overlay);
    overlay.detach?.();

    return this;
  }

  /** TBD */
  update() {
    let {focused, isRingVisible} = this.#runtime;
    let {ring, ringContainer} = this.#parts;

    if (!isRingVisible || !focused?.isFocusable || focused.view.destroyed) {
      ring.visible = false;

      return;
    }

    let {padding} = this.#config.theme.focusRing;
    let bounds = focused.view.getBounds();
    let topLeft = ringContainer.toLocal({x: bounds.x, y: bounds.y});
    let bottomRight = ringContainer.toLocal({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });

    ring.visible = true;

    ring.position.set(topLeft.x - padding, topLeft.y - padding);
    ring.setSize(bottomRight.x - topLeft.x + 2 * padding, bottomRight.y - topLeft.y + 2 * padding);
  }
}
