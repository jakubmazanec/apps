import * as pixi from 'pixi.js';

import {easeOutQuad} from '../scheduler/easing.js';
import {type Disposables} from '../utilities/Disposables.js';
import {adoptChildren} from './internals/adoptChildren.js';
import {resolveView} from './internals/resolveView.js';
import {type ModalConfig} from './ModalConfig.js';
import {type ModalOptions} from './ModalOptions.js';
import {type ModalParts} from './ModalParts.js';
import {type ModalRuntime} from './ModalRuntime.js';
import {type ModalState} from './ModalState.js';
import {type Overlay} from './Overlay.js';
import {type UiChild} from './UiChild.js';
import {type UiRoot} from './UiRoot.js';

import '@pixi/layout';

/** TBD */
export class Modal implements Overlay {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Object for storing config. */
  readonly #config: ModalConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the modal is closed. */
  readonly #onClosed?: () => void;

  /** Lifecycle hook called when a user-facing close begins. */
  readonly #onClosing?: () => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: ModalParts = {scrim: new pixi.Graphics()};

  /** Object for internal values that may change. */
  readonly #runtime: ModalRuntime = {cancelFade: null, ui: null};

  /** State; which part of its life cycle the instance is currently in. */
  #state: ModalState = 'closed';

  constructor({
    children,
    layout,
    scrimColor,
    scrimAlpha,
    theme,
    initialFocus,
    isReusable = false,
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
      isReusable,
      scheduler,
    };

    this.#parts.scrim.rect(0, 0, 1, 1).fill(scrimColor ?? theme?.modal.scrimColor ?? 0x000000);
    this.#parts.scrim.alpha = scrimAlpha ?? theme?.modal.scrimAlpha ?? 0.5;
    this.#parts.scrim.eventMode = 'static';
    this.#parts.scrim.hitArea = {contains: () => true}; // Accept every point, so the scrim block interactino with object behind it immediatelly.
    this.#parts.scrim.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
    };

    this.view.addChild(this.#parts.scrim);

    if (children !== undefined) {
      for (let child of children) {
        this.children.push(child);
        this.view.addChild(resolveView(child));
      }
    }

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
    adoptChildren(this.#disposables.instance, this.children);
    // Leaves the root first, while the children are alive: removeOverlay
    // deactivates the focusables inside and restores the previous focus, then
    // calls detach(), which cancels a running fade.
    this.#disposables.instance.defer(() => {
      this.#runtime.ui?.removeOverlay(this);
    });
  }

  /** TBD */
  get state(): ModalState {
    return this.#state;
  }

  // The root is not a constructor option: UiRoot passes itself in when the
  // modal is added, so a kept modal can be added again. By then the modal is
  // the last UI child (above the HUD by insertion order; UiRoot keeps the
  // focus ring topmost) and holds the focus scope, which is why initialFocus
  // lands inside it. The root is recorded before the layout check, the way
  // System.attach sets its world before onAttach: UiRoot does not roll back a
  // throwing attach, so the modal is already a child holding a scope when the
  // check throws, and destroy() needs #runtime.ui set to leave the root.
  /** @internal Called by `UiRoot`. */
  attach(ui: UiRoot) {
    if (this.#runtime.ui) {
      throw new Error('Modal is already attached to a UI root!');
    }

    this.#runtime.ui = ui;

    if (ui.view.layout === null) {
      throw new Error('UI root has no layout, the modal is sized against it!');
    }

    if (this.#config.initialFocus !== undefined) {
      ui.focus(this.#config.initialFocus);
    }

    this.#state = 'opening';
    this.view.alpha = 0;
    this.#fade(1, () => {
      this.#state = 'open';
    });
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

    // The hook may have destroyed the modal or taken it off the root; detach()
    // has then set the state to closed, and there is nothing left to close.
    if (this.#runtime.ui === null) {
      return;
    }

    this.#state = 'closing';
    // removeOverlay releases this modal's own scope before removing it, so the
    // previousFocus restoration (the Options flow depends on it) cannot be lost
    // to ordering here; it then calls detach(), which leaves the destroy below
    // nothing to leave. A kept modal skips the destroy and can be added again.
    this.#fade(0, () => {
      this.#runtime.ui?.removeOverlay(this);

      if (!this.#config.isReusable) {
        this.destroy();
      }

      this.#onClosed?.();
    });
  }

  // Teardown path (owning-screen onHide, or any out-of-band cleanup): leaves
  // the UiRoot if still attached and synchronously destroys; callable from any
  // state, never animated, never fires onClosing or onClosed, and destroys a
  // kept modal too.
  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

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

  /** Fades the view to `alpha`, or sets it at once without a scheduler, then calls `onComplete`. */
  #fade(alpha: number, onComplete: () => void) {
    this.#runtime.cancelFade?.();
    this.#runtime.cancelFade = null;

    let {scheduler, fadeDuration} = this.#config;

    if (scheduler === undefined || fadeDuration === undefined) {
      this.view.alpha = alpha;
      onComplete();

      return;
    }

    this.#runtime.cancelFade = scheduler.tween({
      target: this.view,
      to: {alpha},
      duration: fadeDuration,
      easing: easeOutQuad,
      onComplete: () => {
        this.#runtime.cancelFade = null;
        onComplete();
      },
    });
  }
}
