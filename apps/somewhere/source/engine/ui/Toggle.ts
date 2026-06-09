import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

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

  readonly #onChange?: (toggle: Toggle) => void;

  #checked: boolean;
  #state: ToggleState = 'normal';
  #background: pixi.Container;
  readonly #backgrounds: Record<ToggleState, {checked: pixi.Container; unchecked: pixi.Container}>;
  readonly #disposables = new DisposableStack();

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

    // Inactive backgrounds are detached during swaps, so `{children: true}` does
    // not reach them; destroy any that the view did not already take down.
    for (let background of new Set(
      Object.values(this.#backgrounds).flatMap((state) => [state.unchecked, state.checked]),
    )) {
      this.#disposables.adopt(background, (b) => {
        if (!b.destroyed) {
          b.destroy();
        }
      });
    }

    this.#checked = checked;
    this.#background = this.#backgrounds.normal[checked ? 'checked' : 'unchecked'];

    this.view = new LayoutContainer({background: this.#background});
    this.view.layout = {width: backgrounds.unchecked.width, height: backgrounds.unchecked.height};

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    // The state backgrounds are swapped in and out of the view, and a freshly
    // attached child's transform is stale until the next render, which would
    // let hits in that window fall through the view (e.g. a click whose
    // pointerover and pointerdown arrive in the same frame). The hit area
    // keeps hit testing independent of the background children.
    this.view.hitArea = new pixi.Rectangle();

    this.view.on('layout', ({computedLayout}) => {
      (this.view.hitArea as pixi.Rectangle).width = computedLayout.width;
      (this.view.hitArea as pixi.Rectangle).height = computedLayout.height;
    });

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
      this.#onChange?.(this);
    });

    this.#disposables.defer(() => this.view.destroy({children: true}));
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

  destroy() {
    this.#disposables.dispose();
  }

  #render() {
    let next = this.#backgrounds[this.#state][this.#checked ? 'checked' : 'unchecked'];

    if (this.#background === next) {
      return;
    }

    // The layout system sizes and positions `view.background` to the computed
    // layout box on each tick, so we only swap which sprite is displayed.
    this.view.containerMethods.removeChild(this.#background);
    this.view.containerMethods.addChildAt(next, 0);
    this.view.background = next;
    this.#background = next;
  }
}
