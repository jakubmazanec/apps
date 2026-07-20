import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachHitArea} from './attachHitArea.js';
import {attachHoverHandlers} from './attachHoverHandlers.js';
import {type Focusable} from './Focusable.js';
import {swapBackground} from './swapBackground.js';

export type ToggleState = 'disabled' | 'hovered' | 'normal';

export type ToggleOptions = {
  backgrounds: {
    unchecked: pixi.Container;
    checked: pixi.Container;
    hovered?: pixi.Container;
    hoveredChecked?: pixi.Container;
    disabled?: pixi.Container;
    disabledChecked?: pixi.Container;
  };
  checked?: boolean;
  onChange?: (toggle: Toggle) => void;
};

export class Toggle implements Focusable {
  #isChecked: boolean; // basically a `value`
  #state: ToggleState = 'normal';

  readonly view: LayoutContainer;
  readonly #disposables = new DisposableStack();

  readonly #onChange?: (toggle: Toggle) => void;

  readonly #backgrounds: Record<ToggleState, {checked: pixi.Container; unchecked: pixi.Container}>;

  constructor({backgrounds, checked = false, onChange}: ToggleOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    this.#backgrounds = {
      normal: {unchecked: backgrounds.unchecked, checked: backgrounds.checked},
      hovered: {
        unchecked: backgrounds.hovered ?? backgrounds.unchecked,
        checked: backgrounds.hoveredChecked ?? backgrounds.checked,
      },
      disabled: {
        unchecked: backgrounds.disabled ?? backgrounds.unchecked,
        checked: backgrounds.disabledChecked ?? backgrounds.checked,
      },
    };

    adoptDetachedBackgrounds(
      this.#disposables,
      Object.values(this.#backgrounds).flatMap((state) => [state.unchecked, state.checked]),
    );

    this.#isChecked = checked;
    this.view = new LayoutContainer({
      background: this.#backgrounds.normal[checked ? 'checked' : 'unchecked'],
    });
    this.view.layout = {width: backgrounds.unchecked.width, height: backgrounds.unchecked.height};
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    attachHitArea(this.view);
    attachHoverHandlers(
      this.view,
      () => this.#state,
      (state) => this.#setState(state),
    );

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.activate();
      }
    });

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  destroy() {
    this.#disposables.dispose();
  }

  get isChecked(): boolean {
    return this.#isChecked;
  }

  get state(): ToggleState {
    return this.#state;
  }

  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  check() {
    if (this.#isChecked) {
      return;
    }

    this.#setChecked(true);
  }

  uncheck() {
    if (!this.#isChecked) {
      return;
    }

    this.#setChecked(false);
  }

  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#setState('normal');

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
  }

  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setState('disabled');

    this.view.eventMode = 'none';
    this.view.cursor = 'default';
  }

  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setChecked(!this.#isChecked);
    this.#onChange?.(this);
  }

  #setChecked(checked: boolean) {
    if (this.#isChecked === checked) {
      return;
    }

    this.#isChecked = checked;

    this.#updateBackground();
  }

  #setState(state: ToggleState) {
    if (this.#state === state) {
      return;
    }

    this.#state = state;

    this.#updateBackground();
  }

  #updateBackground() {
    let previous = this.view.background;
    let next = this.#backgrounds[this.#state][this.#isChecked ? 'checked' : 'unchecked'];

    if (next === previous) {
      return;
    }

    swapBackground(this.view, previous, next);
  }
}
