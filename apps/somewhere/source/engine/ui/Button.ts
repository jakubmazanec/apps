import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type UiChild} from './UiChild.js';

export type ButtonState = 'disabled' | 'hovered' | 'normal' | 'pressed';

export type ButtonOptions = {
  backgrounds: {
    normal: pixi.Container;
    hovered?: pixi.Container;
    pressed?: pixi.Container;
    disabled?: pixi.Container;
  };
  children?: UiChild[];
  onClick?: (button: Button) => void;
  layout?: pixi.ContainerOptions['layout'];
};

export class Button {
  readonly view: LayoutContainer;

  readonly #onClick?: (button: Button) => void;

  #state: ButtonState = 'normal';
  readonly #backgrounds: Record<ButtonState, pixi.Container>;

  constructor({backgrounds, children, onClick, layout}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    this.#backgrounds = {
      normal: backgrounds.normal,
      hovered: backgrounds.hovered ?? backgrounds.normal,
      pressed: backgrounds.pressed ?? backgrounds.normal,
      disabled: backgrounds.disabled ?? backgrounds.normal,
    };

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

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

    this.view.on('pointerdown', () => {
      if (this.#state === 'disabled' || this.#state === 'pressed') {
        return;
      }

      this.#setState('pressed');
    });

    this.view.on('pointerup', () => {
      if (this.#state !== 'pressed') {
        return;
      }

      this.#setState('hovered');
    });

    // A press released outside the button never fires `pointerup`, which would
    // otherwise leave the button stuck in `pressed`.
    this.view.on('pointerupoutside', () => {
      if (this.#state !== 'pressed') {
        return;
      }

      this.#setState('normal');
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.#onClick?.(this);
      }
    });

    if (children !== undefined) {
      this.addChild(...children);
    }

    if (layout !== undefined) {
      this.view.layout = layout;
    }
  }

  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }

  get state(): ButtonState {
    return this.#state;
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

  destroy() {
    let backgrounds = new Set(Object.values(this.#backgrounds));

    this.view.destroy({children: true});

    // Inactive backgrounds are detached during swaps, so `{children: true}` does
    // not reach them; destroy any that the view did not already take down.
    for (let background of backgrounds) {
      if (!background.destroyed) {
        background.destroy();
      }
    }
  }

  #setState(state: ButtonState) {
    let previous = this.#backgrounds[this.#state];
    let next = this.#backgrounds[state];

    this.#state = state;

    if (previous === next) {
      return;
    }

    this.view.containerMethods.removeChild(previous);
    this.view.containerMethods.addChildAt(next, 0);
    this.view.background = next;
    next.setSize(previous.width, previous.height);
  }
}
