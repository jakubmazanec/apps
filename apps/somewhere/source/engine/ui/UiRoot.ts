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

// Any tap that bubbles this far started on a UI element (panel padding,
// labels, widgets); stop it here so it can't fall through to the game view
// and move the player. Taps on the open world never route through this view.
function stopTap(event: pixi.FederatedPointerEvent) {
  event.stopPropagation();
}

export class UiRoot implements UiParent {
  readonly view: pixi.Container = new pixi.Container();
  readonly children: UiChild[] = [];

  readonly #overlay: pixi.Container = new pixi.Container();
  readonly #scopes: FocusScope[] = [];
  readonly #focusRing?: FocusRingOptions;
  readonly #disposables = new DisposableStack();

  #focused: Focusable | null = null;
  #isRingVisible = false;
  #ring: pixi.NineSliceSprite | null = null;

  constructor({focusRing}: UiRootOptions = {}) {
    if (focusRing !== undefined) {
      this.#focusRing = focusRing;
    }

    // The overlay draws the focus ring on top of every widget, and once a
    // widget is focused the ring's bounds cover it. Pixi hit-tests front-to-back
    // and would reach the ring first; because the ring only carries the default
    // (hit-testable) event mode, pixi resolves the tap to the ring's nearest
    // interactive ancestor — this view — and stops, never descending to the
    // widget beneath. 'none' prunes the whole overlay subtree from hit-testing
    // so taps fall through to the focused widget and its onClick still fires.
    this.#overlay.eventMode = 'none';

    this.view.addChild(this.#overlay);

    // pixi notifies listeners only on interactive containers, so the root
    // must be static for the two pointertap listeners below to run. A plain
    // container has no geometry of its own, so this adds no hit target and
    // taps on the open world still reach the game view directly.
    this.view.eventMode = 'static';

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

    this.view.addEventListener('pointertap', stopTap);

    this.#disposables.defer(() => {
      this.view.removeEventListener('pointertap', stopTap);
    });

    // Any pointer press hides the ring again (focus is kept); it reappears on
    // the next focus command.
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handlePointerDown = () => {
      this.#isRingVisible = false;
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
    return this.#isRingVisible;
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

    // Stale focus (the component left with the removed subtree): drop it now,
    // matching how the focus commands treat non-collectible components.
    if (this.#focused !== null && !this.#collectFocusables().includes(this.#focused)) {
      this.#focused = null;
    }

    return this;
  }

  // Programmatic focus: sets the component without showing the ring.
  focus(component: Focusable) {
    this.#focused = component;
  }

  clearFocus() {
    this.#focused = null;
    this.#isRingVisible = false;
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

    this.#isRingVisible = true;

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

  // Scope/removal interplay: nothing forces a matching popFocusScope before a
  // scoped subtree is removed or destroyed. #collectFocusables lazily
  // self-heals at the focus choke point instead — see the prune step there.
  // Modal pops its scope properly in all designed flows; the self-heal is the
  // safety net for out-of-band removals.
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

    if (
      this.#focusRing === undefined ||
      !this.#isRingVisible ||
      !focused?.isFocusable ||
      focused.view.destroyed
    ) {
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
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

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

    this.#isRingVisible = true;

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
  //
  // Before walking, dead scopes are pruned from the top of #scopes: a scope
  // whose root view is destroyed or no longer attached under this root was
  // removed out-of-band (direct removal, deep removal e.g. via
  // Panel.removeChild, or a plain destroy()). Without this, the stale scope
  // keeps detached-but-not-destroyed widgets focusable: Tab reaches components
  // that are no longer on stage and activate() fires their handlers. Pruning
  // mirrors popFocusScope by restoring the last-pruned scope's previousFocus
  // when still collectible. Dead scopes below a live top scope wait until they
  // surface; staleness between the mutation and the next focus command is
  // unobservable (nothing reads the stack in between).
  #collectFocusables(): Focusable[] {
    let pruned: FocusScope | null = null;

    while (this.#scopes.length > 0) {
      // the type assertion is ok, because we checked `this.#scopes.length`
      let scope = this.#scopes.at(-1) as FocusScope;
      let scopeView = 'view' in scope.root ? scope.root.view : scope.root;

      if (!scopeView.destroyed && this.#isAttached(scopeView)) {
        break;
      }

      this.#scopes.pop();
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

    walk(this.#scopes.at(-1)?.root ?? this);

    if (pruned !== null) {
      this.#focused =
        pruned.previousFocus !== null && result.includes(pruned.previousFocus) ?
          pruned.previousFocus
        : null;
    }

    return result;
  }

  // Attachment is checked via the pixi view.parent chain — component-level
  // parent pointers don't exist.
  #isAttached(view: pixi.Container): boolean {
    let current: pixi.Container | null = view;

    while (current !== null) {
      if (current === this.view) {
        return true;
      }

      current = current.parent;
    }

    return false;
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
