import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {Fader} from './Fader.js';
import {type Focusable} from './Focusable.js';
import {disposeChildren} from './internals/disposeChildren.js';
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
  /** Children. */
  readonly children: UiChild[] = [];

  /** A component that takes the initial focus. */
  readonly initialFocus: Focusable | undefined;

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
  readonly #runtime: ModalRuntime;

  /** State; which part of its life cycle the instance is currently in. */
  #state: ModalState = 'closed';

  constructor({
    children,
    layout,
    scrimColor,
    scrimAlpha,
    theme,
    initialFocus,
    destroyOnClose = true,
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

    this.initialFocus = initialFocus;
    this.#config = {destroyOnClose};
    this.#runtime = {
      fader:
        scheduler === undefined ? null : (
          new Fader({duration: fadeDuration, scheduler, view: this.view})
        ),
      ui: null,
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

    // Modal is absolutely positioned so its layout is unaffected by its parents.
    this.view.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      ...(typeof layout === 'object' ? layout : undefined),
    };

    // Disposing is in reverse order of registration, so the removal of modal as an overlay first
    // restores focus, etc. before disposing children.
    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
    disposeChildren(this.children, this.#disposables.instance);
    this.#disposables.instance.defer(() => {
      this.#runtime.ui?.removeOverlay(this);
    });
  }

  /** State. */
  get state(): ModalState {
    return this.#state;
  }

  /** @internal Called by `UiRoot`. */
  attach(ui: UiRoot) {
    if (this.#runtime.ui) {
      throw new Error('Modal is already attached to a UI root!');
    }

    this.#runtime.ui = ui;

    if (ui.view.layout === null) {
      throw new Error('UI root has no layout, the modal is sized against it!');
    }

    if (this.#runtime.fader === null) {
      this.#state = 'open';

      return;
    }

    this.#state = 'opening';
    this.view.alpha = 0;
    this.#runtime.fader.to(1, () => {
      this.#state = 'open';
    });
  }

  /** Closes the modal. */
  close(): void {
    if (this.#state === 'closing' || this.#state === 'closed') {
      return;
    }

    this.#onClosing?.();

    if (this.#runtime.ui === null) {
      return;
    }

    this.#state = 'closing';

    if (this.#runtime.fader === null) {
      this.#runtime.ui.removeOverlay(this);

      if (this.#config.destroyOnClose) {
        this.destroy();
      }

      this.#onClosed?.();

      return;
    }

    this.#runtime.fader.to(0, () => {
      this.#runtime.ui?.removeOverlay(this);

      if (this.#config.destroyOnClose) {
        this.destroy();
      }

      this.#onClosed?.();
    });
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** @internal Called by `UiRoot`. */
  detach() {
    if (!this.#runtime.ui) {
      throw new Error('Modal is not attached to a UI root!');
    }

    this.#runtime.fader?.cancel();

    this.#runtime.ui = null;
    this.#state = 'closed';
  }
}
