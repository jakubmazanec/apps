import * as pixi from 'pixi.js';

import {easeOutQuad} from '../scheduler/easing.js';
import {type Disposables} from '../utilities/Disposables.js';
import {type ModalConfig} from './ModalConfig.js';
import {type ModalOptions} from './ModalOptions.js';
import {type ModalParts} from './ModalParts.js';
import {type ModalRuntime} from './ModalRuntime.js';
import {type ModalState} from './ModalState.js';
import {type Overlay} from './Overlay.js';
import {type UiChild} from './UiChild.js';
import {type UiRoot} from './UiRoot.js';

// A reusable modal: a flat widget in the existing Container/Panel idiom (public
// `children` + `view`, no inheritance). Constructed per open by whatever
// handler opens it; the owning screen tracks the open instance and calls
// destroy() (never the animated close()) from its onHide.
export class Modal implements Overlay {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Object for storing config. */
  readonly #config: ModalConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance', 'open'> = {
    instance: new DisposableStack(),
    open: null,
  };

  /** Lifecycle hook called when the modal is closed. */
  readonly #onClosed?: () => void;

  /** Lifecycle hook called when a user-facing close begins. */
  readonly #onClosing?: () => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: ModalParts = {scrim: new pixi.Graphics()};

  /** Object for internal values that may change. */
  readonly #runtime: ModalRuntime = {cancelFade: null};

  /** State; which part of its life cycle the instance is currently in. */
  #state: ModalState = 'closed';

  constructor({
    children,
    layout,
    scrimAlpha = 0.5,
    initialFocus,
    onClosing,
    onClosed,
    scheduler,
    fadeDuration,
  }: ModalOptions) {
    if (onClosing !== undefined) {
      this.#onClosing = onClosing;
    }

    if (onClosed !== undefined) {
      this.#onClosed = onClosed;
    }

    this.#config = {
      fadeDuration,
      initialFocus,
      scheduler,
    };

    // The scrim is a raw pixi child behind the layout children and deliberately
    // NOT in `children`, so the focus walk never sees it. It is interactive so
    // every pointer event lands on UI (UiRoot already stops taps on UI from
    // reaching the game view, which blocks click-to-move for free). It sits
    // out-of-flow (no layout of its own) at (0, 0) — the same mixed
    // layout/non-layout child behavior loadingScreen's view exercises.
    this.#parts.scrim.alpha = scrimAlpha;
    this.#parts.scrim.eventMode = 'static';
    this.view.addChild(this.#parts.scrim);

    if (children !== undefined) {
      for (let child of children) {
        this.children.push(child);
        this.view.addChild('view' in child ? child.view : child);
      }
    }

    // position: 'absolute' keeps the full-screen root out of any flex flow the
    // owning UiRoot's view may have (the menu centers its own children); the
    // caller's layout still styles content placement inside the root.
    this.view.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      ...(typeof layout === 'object' ? layout : undefined),
    };

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get state(): ModalState {
    return this.#state;
  }

  /**
   * User-facing close, and what the cancel command calls. A no-op while
   * already closing/closed, so `onClosing` fires once per close however many
   * callers race it (Resume stays activatable during the fade-out).
   */
  close(): void {
    if (this.#state === 'closing' || this.#state === 'closed') {
      return;
    }

    this.#onClosing?.();

    if (this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined) {
      // Tweens don't reverse: cancel any in-flight fade-in and start a new
      // tween toward 0 — Tween captures its from-value from the current alpha
      // at construction, so the replacement picks up with no visual jump.
      this.#runtime.cancelFade?.();
      this.#state = 'closing';
      this.#runtime.cancelFade = this.#config.scheduler.tween({
        target: this.view,
        to: {alpha: 0},
        duration: this.#config.fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#runtime.cancelFade = null;
          this.#finishClose();
        },
      });
    } else {
      this.#finishClose();
    }
  }

  // Teardown path (owning-screen onHide, or any out-of-band cleanup): releases
  // the overlay if still attached (tolerant of an already-empty scope stack)
  // and synchronously removes + destroys; callable from any state, never
  // animated, never fires onClosing or onClosed.
  /** Destroys the instance. */
  destroy() {
    this.#disposables.open?.dispose();
    this.#disposables.open = null;
    this.#state = 'closed';
    this.#destroyViews();
  }

  // A modal is opened INTO a ui root, so the target is a parameter of open,
  // not the constructor. Attaches the modal as an overlay: the last UI child
  // (above the HUD by insertion order; UiRoot keeps the focus-ring overlay
  // topmost), holding the focus scope while it is attached.
  /** TBD */
  open(ui: UiRoot) {
    if (this.#state !== 'closed' || this.view.destroyed) {
      return;
    }

    this.#disposables.open = new DisposableStack();

    ui.addOverlay(this);

    // removeOverlay releases this modal's own scope before removing it, so the
    // previousFocus restoration (the Options flow depends on it) cannot be lost
    // to ordering here.
    this.#disposables.open.defer(() => {
      this.#runtime.cancelFade?.();
      this.#runtime.cancelFade = null;
      ui.removeOverlay(this);
    });

    if (this.#config.initialFocus !== undefined) {
      ui.focus(this.#config.initialFocus);
    }

    if (this.#config.scheduler !== undefined && this.#config.fadeDuration !== undefined) {
      this.#state = 'opening';
      this.view.alpha = 0;
      this.#runtime.cancelFade = this.#config.scheduler.tween({
        target: this.view,
        to: {alpha: 1},
        duration: this.#config.fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#runtime.cancelFade = null;
          this.#state = 'open';
        },
      });
    } else {
      this.#state = 'open';
    }
  }

  // Dumb plumbing: gives the caller's layout something to resolve against and
  // keeps the scrim covering the screen. The owning screen calls it once right
  // after open() and again from its onResize; the modal never reads screen
  // dimensions itself.
  /** TBD */
  resize(width: number, height: number) {
    if (this.view.destroyed) {
      return;
    }

    this.view.layout = {width, height};
    this.#parts.scrim.clear().rect(0, 0, width, height).fill(0x000000);
  }

  /** TBD */
  #destroyViews() {
    if (this.view.destroyed) {
      return;
    }

    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.instance.dispose();
  }

  /** TBD */
  #finishClose() {
    this.#state = 'closed';
    this.#disposables.open?.dispose();
    this.#disposables.open = null;
    this.#destroyViews();
    this.#onClosed?.();
  }
}
