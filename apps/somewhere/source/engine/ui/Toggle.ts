import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './attachWidgetInteraction.js';
import {type Focusable} from './Focusable.js';
import {resolveBackgrounds} from './resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './setInteractionEnabled.js';
import {swapBackground} from './swapBackground.js';
import {type ThemedOptions} from './UiTheme.js';

export type ToggleState = 'disabled' | 'hovered' | 'normal';

export type ToggleBackgrounds = {
  unchecked: pixi.Container;
  checked: pixi.Container;
  hovered?: pixi.Container;
  hoveredChecked?: pixi.Container;
  disabled?: pixi.Container;
  disabledChecked?: pixi.Container;
};

export type ToggleOptions = ThemedOptions<ToggleBackgrounds> & {
  checked?: boolean;
  onChange?: (toggle: Toggle) => void;
};

export class Toggle implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** TBD */
  readonly #backgrounds: {
    checked: Record<ToggleState, pixi.Container>;
    unchecked: Record<ToggleState, pixi.Container>;
  };

  /** Stack to register disposers that cleanup resources when needed. */
  readonly #disposables = new DisposableStack();

  /** TBD */
  #isChecked: boolean; // basically a `value`

  /** Lifecycle hook called when the toggle's checked state changes. */
  readonly #onChange?: (toggle: Toggle) => void;

  /** State; which part of its life cycle the instance is currently in. */
  #state: ToggleState = 'normal';

  constructor({backgrounds, theme, checked = false, onChange}: ToggleOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    let resolved = resolveThemedBackgrounds(
      ['unchecked', 'checked', 'hovered', 'hoveredChecked', 'disabled', 'disabledChecked'],
      theme?.toggle,
      backgrounds,
    );

    if (resolved.unchecked === undefined || resolved.checked === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Toggle needs a theme or unchecked and checked backgrounds!');
    }

    let states = ['normal', 'hovered', 'disabled'] as const;

    this.#backgrounds = {
      unchecked: resolveBackgrounds(states, resolved.unchecked, {
        hovered: resolved.hovered,
        disabled: resolved.disabled,
      }),
      checked: resolveBackgrounds(states, resolved.checked, {
        hovered: resolved.hoveredChecked,
        disabled: resolved.disabledChecked,
      }),
    };

    adoptDetachedBackgrounds(this.#disposables, [
      ...Object.values(this.#backgrounds.unchecked),
      ...Object.values(this.#backgrounds.checked),
    ]);

    this.#isChecked = checked;
    this.view = new LayoutContainer({
      background: this.#backgrounds[checked ? 'checked' : 'unchecked'].normal,
    });
    this.view.layout = {width: resolved.unchecked.width, height: resolved.unchecked.height};

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => this.#setState(state),
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.activate();
      }
    });

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get isChecked(): boolean {
    return this.#isChecked;
  }

  /** TBD */
  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  /** TBD */
  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  /** TBD */
  get state(): ToggleState {
    return this.#state;
  }

  /** TBD */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setChecked(!this.#isChecked);
    this.#onChange?.(this);
  }

  /** TBD */
  check() {
    if (this.#isChecked) {
      return;
    }

    this.#setChecked(true);
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setState('disabled');

    setInteractionEnabled(this.view, false);
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#setState('normal');

    setInteractionEnabled(this.view, true, 'pointer');
  }

  /** TBD */
  uncheck() {
    if (!this.#isChecked) {
      return;
    }

    this.#setChecked(false);
  }

  /** TBD */
  #setChecked(checked: boolean) {
    if (this.#isChecked === checked) {
      return;
    }

    this.#isChecked = checked;

    this.#updateBackground();
  }

  /** TBD */
  #setState(state: ToggleState) {
    if (this.#state === state) {
      return;
    }

    this.#state = state;

    this.#updateBackground();
  }

  /** TBD */
  #updateBackground() {
    swapBackground(
      this.view,
      this.#backgrounds[this.#isChecked ? 'checked' : 'unchecked'][this.#state],
    );
  }
}
