import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

export type ButtonState = 'disabled' | 'hover' | 'normal' | 'pressed';

export type ButtonOptions = {
  backgrounds: {
    normal: pixi.Container;
    hover?: pixi.Container;
    pressed?: pixi.Container;
    disabled?: pixi.Container;
  };
  onClick?: (button: Button) => void;
  layout?: pixi.ContainerOptions['layout'];
};

export class Button {
  readonly view: LayoutContainer;

  #state: ButtonState = 'normal';

  readonly #backgrounds: Record<ButtonState, pixi.Container>;
  readonly #onClick?: (button: Button) => void;

  constructor({backgrounds, onClick, layout}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    this.#backgrounds = {
      normal: backgrounds.normal,
      hover: backgrounds.hover ?? backgrounds.normal,
      pressed: backgrounds.pressed ?? backgrounds.normal,
      disabled: backgrounds.disabled ?? backgrounds.normal,
    };

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    this.view.on('pointerover', () => {
      if (this.#state === 'disabled' || this.#state === 'hover') {
        return;
      }

      this.#setState('hover');
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

      this.#setState('hover');
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.#onClick?.(this);
      }
    });

    if (layout !== undefined) {
      this.view.layout = layout;
    }
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

  // `LayoutContainer.background` is a plain field added as a direct child once
  // in the constructor, so swapping states means re-parenting via the library's
  // public `containerMethods` (the original Container methods; the public
  // `addChild` is rebound to route into `overflowContainer`). The incoming
  // background is sized from the outgoing one — which the layout engine already
  // sized to fill — so the swap is correct immediately without forcing a
  // relayout; later relayouts keep sizing `view.background` as usual.
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
