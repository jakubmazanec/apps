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

  private readonly onClick?: (button: Button) => void;

  #state: ButtonState = 'normal';
  readonly #backgrounds: Record<ButtonState, pixi.Container>;

  constructor({backgrounds, children, onClick, layout}: ButtonOptions) {
    if (onClick !== undefined) {
      this.onClick = onClick;
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

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.onClick?.(this);
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

  #setState(state: ButtonState) {
    let previous = this.#backgrounds[this.#state];
    let next = this.#backgrounds[state];

    this.#state = state;

    if (previous === next) {
      return;
    }

    next.position.set(0, 0);
    next.setSize(previous.width, previous.height);

    this.view.containerMethods.removeChild(previous);
    this.view.containerMethods.addChildAt(next, 0);
    this.view.background = next;
  }
}
