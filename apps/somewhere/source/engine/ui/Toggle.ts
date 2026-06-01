import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

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

export class Toggle {
  readonly view: LayoutContainer;

  private readonly onChange?: (toggle: Toggle) => void;

  #checked: boolean;
  #state: ToggleState = 'normal';
  #background: pixi.Container;
  readonly #backgrounds: Record<ToggleState, {checked: pixi.Container; unchecked: pixi.Container}>;

  constructor({backgrounds, checked = false, onChange}: ToggleOptions) {
    if (onChange !== undefined) {
      this.onChange = onChange;
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

    this.#checked = checked;
    this.#background = this.#backgrounds.normal[checked ? 'checked' : 'unchecked'];

    this.view = new LayoutContainer({background: this.#background});
    this.view.layout = {width: backgrounds.unchecked.width, height: backgrounds.unchecked.height};

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    this.view.on('pointerover', () => {
      if (this.#state === 'disabled' || this.#state === 'hovered') {
        return;
      }

      this.#setState('hovered');
    });

    this.view.on('pointerout', () => {
      if (this.#state === 'disabled' || this.#state === 'normal') {
        return;
      }

      this.#setState('normal');
    });

    this.view.on('pointertap', (event) => {
      if (this.#state === 'disabled') {
        return;
      }

      event.stopPropagation();

      this.#setChecked(!this.#checked);
      this.onChange?.(this);
    });
  }

  get checked(): boolean {
    return this.#checked;
  }

  get disabled(): boolean {
    return this.#state === 'disabled';
  }

  setChecked(value: boolean): this {
    this.#setChecked(value);

    return this;
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

  #setChecked(checked: boolean) {
    if (this.#checked === checked) {
      return;
    }

    this.#checked = checked;
    this.#render();
  }

  #setState(state: ToggleState) {
    if (this.#state === state) {
      return;
    }

    this.#state = state;
    this.#render();
  }

  #render() {
    let next = this.#backgrounds[this.#state][this.#checked ? 'checked' : 'unchecked'];

    if (this.#background === next) {
      return;
    }

    next.position.set(0, 0);
    next.setSize(this.#background.width, this.#background.height);

    this.view.containerMethods.removeChild(this.#background);
    this.view.containerMethods.addChildAt(next, 0);
    this.view.background = next;
    this.#background = next;
  }
}
