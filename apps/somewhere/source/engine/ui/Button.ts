import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

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
  // Pixels to shift the content down while pressed, so the label tracks a
  // background whose face drops on press (e.g. an extruded 3D button).
  pressOffset?: number;
};

export class Button {
  readonly view: LayoutContainer;

  readonly #onClick?: (button: Button) => void;

  #state: ButtonState = 'normal';
  readonly #backgrounds: Record<ButtonState, pixi.Container>;
  readonly #pressOffset: number;
  readonly #disposables = new DisposableStack();

  constructor({backgrounds, children, onClick, layout, pressOffset = 0}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    this.#pressOffset = pressOffset;

    this.#backgrounds = {
      normal: backgrounds.normal,
      hovered: backgrounds.hovered ?? backgrounds.normal,
      pressed: backgrounds.pressed ?? backgrounds.normal,
      disabled: backgrounds.disabled ?? backgrounds.normal,
    };

    // Inactive backgrounds are detached during swaps, so `{children: true}` does
    // not reach them; destroy any that the view did not already take down.
    for (let background of new Set(Object.values(this.#backgrounds))) {
      this.#disposables.adopt(background, (b) => {
        if (!b.destroyed) {
          b.destroy();
        }
      });
    }

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

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

    this.view.layout = {
      justifyContent: 'center',
      alignItems: 'center',
      ...(typeof layout === 'object' ? layout : undefined),
    };

    this.#disposables.defer(() => this.view.destroy({children: true}));
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
    this.#disposables.dispose();
  }

  #setState(state: ButtonState) {
    let previous = this.#backgrounds[this.#state];
    let next = this.#backgrounds[state];

    this.#state = state;
    this.#applyPressOffset();

    if (previous === next) {
      return;
    }

    this.view.containerMethods.removeChild(previous);
    this.view.containerMethods.addChildAt(next, 0);
    this.view.background = next;
    next.setSize(previous.width, previous.height);
  }

  // Shift content down while pressed by moving padding from the bottom to the
  // top, so the box height is unchanged and the centered label tracks a face
  // that drops on press (the extruded button background).
  #applyPressOffset() {
    if (this.#pressOffset === 0) {
      return;
    }

    // The base padding stays readable in the merged styles even while the
    // paddingTop/paddingBottom edges override it during a press.
    let {padding = 0} = (this.view.layout?.style ?? {}) as {padding?: number};
    let shift = this.#state === 'pressed' ? this.#pressOffset : 0;

    // Always set both edges explicitly: @pixi/layout merges style assignments,
    // so omitting paddingTop/paddingBottom on release would leave the pressed
    // values stuck rather than resetting them to the base padding.
    this.view.layout = {paddingTop: padding + shift, paddingBottom: padding - shift};
  }
}
