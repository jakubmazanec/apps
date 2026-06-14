import type * as pixi from 'pixi.js';

import {type Focusable} from './Focusable.js';
import {type UiChild, type UiParent} from './UiChild.js';

export type FocusDirection = 'down' | 'left' | 'right' | 'up';

export type FocusManagerOptions = {
  root: UiChild;
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

export class FocusManager {
  readonly #root: UiChild;
  readonly #scopes: FocusScope[] = [];

  #focused: Focusable | null = null;
  #ringVisible = false;

  constructor({root}: FocusManagerOptions) {
    this.#root = root;
  }

  get focused(): Focusable | null {
    return this.#focused;
  }

  get isRingVisible(): boolean {
    return this.#ringVisible;
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

  hideRing() {
    this.#ringVisible = false;
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

  // Pointer interplay: resolve a Pixi hit-test target back to the component
  // that owns it and focus it silently (the ring stays hidden), so keyboard
  // navigation resumes from where the user last tapped.
  focusFromPointer(target: pixi.Container | null) {
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

    walk(this.#scopes.at(-1)?.root ?? this.#root);

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
