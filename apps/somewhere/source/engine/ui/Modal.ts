import * as pixi from 'pixi.js';

import {easeOutQuad} from '../scheduler/easing.js';
import {type Scheduler} from '../scheduler/Scheduler.js';
import {type Focusable} from './Focusable.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type UiRoot} from './UiRoot.js';

export type ModalState = 'closed' | 'closing' | 'open' | 'opening';

export type ModalOptions = {
  children?: UiChild[];
  // Content placement inside the full-screen root (e.g. {justifyContent:
  // 'center', alignItems: 'center'} for a centered dialog); passed through
  // verbatim — the primitive has no placement opinion for its content.
  layout?: pixi.ContainerOptions['layout'];
  scrimAlpha?: number;
  // Applied via ui.focus() on open (programmatic — no ring shown). When
  // omitted nothing is focused, same as screens.
  initialFocus?: Focusable;
  // Fired when a user-facing close() completes (never on destroy()); the
  // owning screen clears its `openModal` reference here.
  onClose?: () => void;
  // Both or neither — enables the open/close fade, driven by the owning
  // screen's Scheduler (which deliberately keeps running while the world is
  // paused).
} & ({fadeDuration: number; scheduler: Scheduler} | {fadeDuration?: undefined; scheduler?: undefined});

// A reusable modal: a flat widget in the existing Container/Panel idiom (public
// `children` + `view`, no inheritance). Constructed per open by whatever
// handler opens it; the owning screen tracks the open instance and calls
// destroy() (never the animated close()) from its onHide.
export class Modal implements UiParent {
  readonly view: pixi.Container = new pixi.Container();
  readonly children: UiChild[] = [];

  readonly #scrim: pixi.Graphics = new pixi.Graphics();
  readonly #disposables = new DisposableStack();

  readonly #initialFocus?: Focusable;
  readonly #onClose?: () => void;

  readonly #scheduler?: Scheduler;
  readonly #fadeDuration?: number;

  #cancelFade: (() => void) | null = null;
  #state: ModalState = 'closed';
  #ui: UiRoot | null = null;

  constructor({
    children,
    layout,
    scrimAlpha = 0.5,
    initialFocus,
    onClose,
    scheduler,
    fadeDuration,
  }: ModalOptions) {
    if (initialFocus !== undefined) {
      this.#initialFocus = initialFocus;
    }

    if (onClose !== undefined) {
      this.#onClose = onClose;
    }

    if (scheduler !== undefined && fadeDuration !== undefined) {
      this.#scheduler = scheduler;
      this.#fadeDuration = fadeDuration;
    }

    // The scrim is a raw pixi child behind the layout children and deliberately
    // NOT in `children`, so the focus walk never sees it. It is interactive so
    // every pointer event lands on UI (UiRoot already stops taps on UI from
    // reaching the game view, which blocks click-to-move for free). It sits
    // out-of-flow (no layout of its own) at (0, 0) — the same mixed
    // layout/non-layout child behavior loadingScreen's view exercises.
    this.#scrim.alpha = scrimAlpha;
    this.#scrim.eventMode = 'static';
    this.view.addChild(this.#scrim);

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

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  get state(): ModalState {
    return this.#state;
  }

  // A modal is opened INTO a ui root, so the target is a parameter of open,
  // not the constructor. Adds the modal as the last UI child (above the HUD by
  // insertion order; UiRoot.addChild keeps the focus-ring overlay topmost),
  // then pushes the focus scope (scope root = the modal itself).
  open(ui: UiRoot) {
    if (this.#state !== 'closed' || this.view.destroyed) {
      return;
    }

    this.#ui = ui;
    ui.addChild(this);
    ui.pushFocusScope(this);

    if (this.#initialFocus !== undefined) {
      ui.focus(this.#initialFocus);
    }

    if (this.#scheduler !== undefined && this.#fadeDuration !== undefined) {
      this.#state = 'opening';
      this.view.alpha = 0;
      this.#cancelFade = this.#scheduler.tween({
        target: this.view,
        to: {alpha: 1},
        duration: this.#fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#cancelFade = null;
          this.#state = 'open';
        },
      });
    } else {
      this.#state = 'open';
    }
  }

  /**
   * User-facing close. Returns whether THIS call initiated the close (`false`
   * while already closing/closed) — callers gate close side effects on it,
   * e.g. the pause menu must not `world.resume()` twice.
   */
  close(): boolean {
    if (this.#state === 'closing' || this.#state === 'closed') {
      return false;
    }

    if (this.#scheduler !== undefined && this.#fadeDuration !== undefined) {
      // Tweens don't reverse: cancel any in-flight fade-in and start a new
      // tween toward 0 — Tween captures its from-value from the current alpha
      // at construction, so the replacement picks up with no visual jump.
      this.#cancelFade?.();
      this.#state = 'closing';
      this.#cancelFade = this.#scheduler.tween({
        target: this.view,
        to: {alpha: 0},
        duration: this.#fadeDuration,
        easing: easeOutQuad,
        onComplete: () => {
          this.#cancelFade = null;
          this.#finishClose();
        },
      });
    } else {
      this.#finishClose();
    }

    return true;
  }

  // Teardown path (owning-screen onHide, or any out-of-band cleanup): pops the
  // scope if one is still pushed (tolerant of an already-empty stack) and
  // synchronously removes + destroys; callable from any state, never animated,
  // never fires onClose.
  destroy() {
    this.#cancelFade?.();
    this.#cancelFade = null;
    this.#detach();
    this.#state = 'closed';
    this.#destroyViews();
  }

  // Dumb plumbing: gives the caller's layout something to resolve against and
  // keeps the scrim covering the screen. The owning screen calls it once right
  // after open() and again from its onResize; the modal never reads screen
  // dimensions itself.
  resize(width: number, height: number) {
    if (this.view.destroyed) {
      return;
    }

    this.view.layout = {width, height};
    this.#scrim.clear().rect(0, 0, width, height).fill(0x000000);
  }

  #finishClose() {
    this.#state = 'closed';
    this.#detach();
    this.#destroyViews();
    this.#onClose?.();
  }

  // The scope is popped BEFORE removeChild: removing first would let UiRoot's
  // scope self-heal drop the scope as stale and silently lose the
  // previousFocus restoration (the Options flow depends on it).
  #detach() {
    let ui = this.#ui;

    this.#ui = null;

    if (ui === null) {
      return;
    }

    ui.popFocusScope();
    ui.removeChild(this);
  }

  #destroyViews() {
    if (this.view.destroyed) {
      return;
    }

    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.dispose();
  }
}
