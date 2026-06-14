import * as pixi from 'pixi.js';

import {type Focusable} from './Focusable.js';
import {type FocusDirection, FocusManager} from './FocusManager.js';
import {type UiChild, type UiParent} from './UiChild.js';

export {type FocusDirection} from './FocusManager.js';

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

export class UiRoot implements UiParent {
  readonly view: pixi.Container = new pixi.Container();
  readonly children: UiChild[] = [];

  readonly #overlay: pixi.Container = new pixi.Container();
  readonly #manager: FocusManager;
  readonly #focusRing?: FocusRingOptions;
  readonly #disposables = new DisposableStack();

  #ring: pixi.NineSliceSprite | null = null;

  constructor({focusRing}: UiRootOptions = {}) {
    if (focusRing !== undefined) {
      this.#focusRing = focusRing;
    }

    this.#manager = new FocusManager({root: this});
    this.view.addChild(this.#overlay);

    // Tapping a focusable silently moves navigation focus to it (the ring
    // stays hidden), so Tab/arrows resume from where the user last clicked.
    // Capture phase: components stop propagation of their pointertap, which
    // would hide the tap from a bubble listener here.
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleTap = (event: pixi.FederatedPointerEvent) => {
      this.#manager.focusFromPointer(event.target as pixi.Container | null);
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
      this.#manager.hideRing();
    };

    globalThis.addEventListener('pointerdown', handlePointerDown);

    this.#disposables.defer(() => {
      globalThis.removeEventListener('pointerdown', handlePointerDown);
    });

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  get focused(): Focusable | null {
    return this.#manager.focused;
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

  focus(component: Focusable) {
    this.#manager.focus(component);
  }

  moveFocus(direction: FocusDirection) {
    this.#manager.moveFocus(direction);
  }

  focusNext() {
    this.#manager.focusNext();
  }

  focusPrevious() {
    this.#manager.focusPrevious();
  }

  activate() {
    this.#manager.activate();
  }

  pushFocusScope(component: UiChild) {
    this.#manager.pushFocusScope(component);
  }

  popFocusScope() {
    this.#manager.popFocusScope();
  }

  clearFocus() {
    this.#manager.clearFocus();
  }

  update() {
    let {focused, isRingVisible} = this.#manager;

    if (this.#focusRing === undefined || !isRingVisible || !focused?.isFocusable) {
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
}
