import * as pixi from 'pixi.js';

import {type Focusable} from './Focusable.js';
import {type UiChild, type UiParent} from './UiChild.js';

export type FocusDirection = 'down' | 'left' | 'right' | 'up';

export type FocusRingOptions = {
  assetName: string;
  bottomHeight: number;
  leftWidth: number;
  // Extra space between the focused component's bounds and the outside of the
  // ring, in screen pixels.
  padding: number;
  rightWidth: number;
  topHeight: number;
};

export type UiRootOptions = {
  focusRing?: FocusRingOptions;
};

type FocusScope = {
  previousFocus: Focusable | null;
  root: UiChild;
};

// Spatial scoring: distance along the movement axis plus a weighted penalty
// for perpendicular gap (zero while the candidate stays within the source's
// cross-axis extent); candidates whose bounds overlap the source's
// perpendicular extent score better, so "down" prefers the component directly
// below over a nearer diagonal one.
const PERPENDICULAR_PENALTY = 2;
const OVERLAP_BONUS = 0.5;

export class UiRoot implements UiParent {
  readonly view: pixi.Container = new pixi.Container();
  readonly children: UiChild[] = [];

  readonly #overlay: pixi.Container = new pixi.Container();
  readonly #scopes: FocusScope[] = [];
  readonly #focusRing?: FocusRingOptions;
  readonly #disposables = new DisposableStack();

  #focused: Focusable | null = null;
  #ringVisible = false;
  #ring: pixi.NineSliceSprite | null = null;

  constructor({focusRing}: UiRootOptions = {}) {
    if (focusRing !== undefined) {
      this.#focusRing = focusRing;
    }

    this.view.addChild(this.#overlay);

    // Tapping a focusable silently moves navigation focus to it (the ring
    // stays hidden), so Tab/arrows resume from where the user last clicked.
    // Capture phase: components stop propagation of their pointertap, which
    // would hide the tap from a bubble listener here.
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleTap = (event: pixi.FederatedPointerEvent) => {
      this.#focusFromPointer(event.target as pixi.Container | null);
    };

    this.view.addEventListener('pointertap', handleTap, {capture: true});

    this.#disposables.defer(() => {
      this.view.removeEventListener('pointertap', handleTap, {capture: true});
    });

    // Any pointer press hides the ring again (focus is kept); it reappears on
    // the next focus command.
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handlePointerDown = () => {
      this.#ringVisible = false;
    };

    globalThis.addEventListener('pointerdown', handlePointerDown);

    this.#disposables.defer(() => {
      globalThis.removeEventListener('pointerdown', handlePointerDown);
    });

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  get focused(): Focusable | null {
    return this.#focused;
  }

  get isRingVisible(): boolean {
    return this.#ringVisible;
  }

  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      // The overlay (focus ring layer) stays the topmost view child.
      this.view.addChildAt('view' in child ? child.view : child, this.view.children.length - 1);
    }

    return this;
  }

  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }

  // Programmatic focus: sets the component without showing the ring.
  focus(component: Focusable) {
    this.#focused = component;
  }

  clearFocus() {
    this.#focused = null;
    this.#ringVisible = false;
    this.#scopes.length = 0;
  }

  focusNext() {
    this.#moveLinear(1);
  }

  focusPrevious() {
    this.#moveLinear(-1);
  }

  moveFocus(direction: FocusDirection) {
    let focusables = this.#collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    this.#ringVisible = true;

    let current = this.#focused;

    if (current === null) {
      this.#focused = this.#nearestTopLeft(focusables);

      return;
    }

    if (!focusables.includes(current)) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#focused = null;

      return;
    }

    let next = this.#nearestInDirection(current, focusables, direction);

    if (next !== null) {
      this.#focused = next;
    }
  }

  activate() {
    if (this.#focused === null) {
      return;
    }

    if (!this.#collectFocusables().includes(this.#focused)) {
      this.#focused = null;

      return;
    }

    this.#focused.activate();
  }

  pushFocusScope(component: UiChild) {
    this.#scopes.push({root: component, previousFocus: this.#focused});
    this.#focused = null;
  }

  popFocusScope() {
    let scope = this.#scopes.pop();

    if (scope === undefined) {
      return;
    }

    this.#focused =
      scope.previousFocus !== null && this.#collectFocusables().includes(scope.previousFocus) ?
        scope.previousFocus
      : null;
  }

  update() {
    let focused = this.#focused;

    if (this.#focusRing === undefined || !this.#ringVisible || !focused?.isFocusable) {
      if (this.#ring !== null) {
        this.#ring.visible = false;
      }

      return;
    }

    let ring = this.#ring ?? this.#createRing(this.#focusRing);
    let {padding} = this.#focusRing;

    // Bounds are re-read every frame while the ring is visible, so it tracks
    // layout changes and animations without any cached geometry to invalidate.
    let bounds = focused.view.getBounds();
    let topLeft = this.#overlay.toLocal({x: bounds.x, y: bounds.y});
    let bottomRight = this.#overlay.toLocal({
      x: bounds.x + bounds.width,
      y: bounds.y + bounds.height,
    });

    ring.visible = true;
    ring.position.set(topLeft.x - padding, topLeft.y - padding);
    ring.setSize(bottomRight.x - topLeft.x + 2 * padding, bottomRight.y - topLeft.y + 2 * padding);
  }

  destroy() {
    this.#disposables.dispose();
  }

  #createRing(options: FocusRingOptions): pixi.NineSliceSprite {
    this.#ring = new pixi.NineSliceSprite({
      texture: pixi.Assets.get(options.assetName),
      leftWidth: options.leftWidth,
      topHeight: options.topHeight,
      rightWidth: options.rightWidth,
      bottomHeight: options.bottomHeight,
    });
    this.#overlay.addChild(this.#ring);

    return this.#ring;
  }

  // Pointer interplay: resolve a Pixi hit-test target back to the component
  // that owns it and focus it silently (the ring stays hidden), so keyboard
  // navigation resumes from where the user last tapped.
  #focusFromPointer(target: pixi.Container | null) {
    let byView = new Map<pixi.Container, Focusable>();

    for (let focusable of this.#collectFocusables()) {
      byView.set(focusable.view, focusable);
    }

    let current = target;

    while (current !== null) {
      let focusable = byView.get(current);

      if (focusable !== undefined) {
        this.#focused = focusable;

        return;
      }

      current = current.parent;
    }
  }

  #moveLinear(step: -1 | 1) {
    let focusables = this.#collectFocusables();

    if (focusables.length === 0) {
      return;
    }

    this.#ringVisible = true;

    let current = this.#focused;

    if (current === null) {
      this.#focused = focusables[0] ?? null;

      return;
    }

    let index = focusables.indexOf(current);

    if (index === -1) {
      // Stale focus (the component was disabled, hidden or removed): drop it
      // now; the next focus command behaves like initial focus in the scope.
      this.#focused = null;

      return;
    }

    this.#focused = focusables[(index + step + focusables.length) % focusables.length] ?? null;
  }

  // Depth-first order over the component hierarchy is the Tab order. Raw Pixi
  // containers are leaves (components are only discoverable through public
  // children arrays), and subtrees whose view is hidden are pruned.
  #collectFocusables(): Focusable[] {
    let result: Focusable[] = [];

    let walk = (node: UiChild) => {
      if (!('view' in node)) {
        return;
      }

      if (!node.view.visible) {
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

    walk(this.#scopes.at(-1)?.root ?? this);

    return result;
  }

  #nearestTopLeft(focusables: Focusable[]): Focusable | null {
    let best: Focusable | null = null;
    let bestScore = Infinity;

    for (let candidate of focusables) {
      let bounds = candidate.view.getBounds();
      let score = bounds.x + bounds.y;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }

  #nearestInDirection(
    current: Focusable,
    focusables: Focusable[],
    direction: FocusDirection,
  ): Focusable | null {
    let source = current.view.getBounds();
    let horizontal = direction === 'left' || direction === 'right';
    let best: Focusable | null = null;
    let bestScore = Infinity;

    for (let candidate of focusables) {
      if (candidate === current) {
        continue;
      }

      let bounds = candidate.view.getBounds();
      let dx = bounds.x + bounds.width / 2 - (source.x + source.width / 2);
      let dy = bounds.y + bounds.height / 2 - (source.y + source.height / 2);
      let forward =
        direction === 'right' ? dx
        : direction === 'left' ? -dx
        : direction === 'down' ? dy
        : -dy;

      if (forward <= 0) {
        continue;
      }

      let overlaps =
        horizontal ?
          bounds.y < source.y + source.height && source.y < bounds.y + bounds.height
        : bounds.x < source.x + source.width && source.x < bounds.x + bounds.width;

      // Perpendicular distance is the gap between the two extents on the cross
      // axis, which is zero whenever the candidate sits within the source's
      // column (vertical moves) or row (horizontal moves). Measuring the gap
      // rather than the center-to-center offset means a small control directly
      // under a wide one counts as straight ahead, so "down" prefers it over a
      // farther but center-aligned component.
      let perpendicularGap =
        horizontal ?
          Math.max(
            0,
            Math.max(source.y, bounds.y) -
              Math.min(source.y + source.height, bounds.y + bounds.height),
          )
        : Math.max(
            0,
            Math.max(source.x, bounds.x) -
              Math.min(source.x + source.width, bounds.x + bounds.width),
          );
      let score = forward + PERPENDICULAR_PENALTY * perpendicularGap;

      if (overlaps) {
        score *= OVERLAP_BONUS;
      }

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best;
  }
}
