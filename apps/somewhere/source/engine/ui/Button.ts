import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachHitArea} from './attachHitArea.js';
import {attachHoverHandlers} from './attachHoverHandlers.js';
import {type Focusable} from './Focusable.js';
import {swapBackground} from './swapBackground.js';
import {type UiChild, type UiParent} from './UiChild.js';

export type ButtonState = 'active' | 'disabled' | 'hovered' | 'normal';

export type ButtonOptions = {
  backgrounds: {
    normal: pixi.Container;
    hovered?: pixi.Container;
    active?: pixi.Container;
    disabled?: pixi.Container;
  };
  children?: UiChild[];
  onClick?: (button: Button) => void;
  layout?: pixi.ContainerOptions['layout'];
  // Pixels to shift the content down while pressed, so the label tracks a
  // background whose face drops on press (e.g. an extruded 3D button).
  pressOffset?: number;
};

export class Button implements Focusable, UiParent {
  readonly view: LayoutContainer;
  readonly children: UiChild[] = [];

  readonly #onClick?: (button: Button) => void;

  #state: ButtonState = 'normal';
  readonly #backgrounds: Record<ButtonState, pixi.Container>;
  readonly #pressOffset: number;
  readonly #basePaddingTop: number;
  readonly #basePaddingBottom: number;
  readonly #disposables = new DisposableStack();

  constructor({backgrounds, children, onClick, layout, pressOffset = 0}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    this.#pressOffset = pressOffset;

    let {
      padding = 0,
      paddingTop = padding,
      paddingBottom = padding,
    } = ((typeof layout === 'object' ? layout : undefined) ?? {}) as {
      padding?: number;
      paddingTop?: number;
      paddingBottom?: number;
    };

    this.#basePaddingTop = paddingTop;
    this.#basePaddingBottom = paddingBottom;

    this.#backgrounds = {
      normal: backgrounds.normal,
      hovered: backgrounds.hovered ?? backgrounds.normal,
      active: backgrounds.active ?? backgrounds.normal,
      disabled: backgrounds.disabled ?? backgrounds.normal,
    };

    adoptDetachedBackgrounds(this.#disposables, Object.values(this.#backgrounds));

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    attachHitArea(this.view);
    attachHoverHandlers(
      this.view,
      () => this.#state,
      (state) => this.#setState(state),
    );

    this.view.on('pointerdown', () => {
      if (this.#state === 'disabled' || this.#state === 'active') {
        return;
      }

      this.#setState('active');
    });

    this.view.on('pointerup', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#setState('hovered');
    });

    // A press released outside the button never fires `pointerup`, which would
    // otherwise leave the button stuck in `active`.
    this.view.on('pointerupoutside', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#setState('normal');
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.activate();
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

  destroy() {
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.dispose();
  }

  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }

  get state(): ButtonState {
    return this.#state;
  }

  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  get isFocusable(): boolean {
    return this.#state !== 'disabled';
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

    this.#onClick?.(this);
  }

  #setState(state: ButtonState) {
    let previous = this.#backgrounds[this.#state];
    let next = this.#backgrounds[state];

    this.#state = state;

    if (this.#pressOffset !== 0) {
      // Layout assignments merge onto the current style, so restoring the base padding on
      // release needs the value captured at construction rather than reading it back here.
      let shift = this.#state === 'active' ? this.#pressOffset : 0;

      this.view.layout = {
        paddingTop: this.#basePaddingTop + shift,
        paddingBottom: this.#basePaddingBottom - shift,
      };
    }

    if (previous === next) {
      return;
    }

    swapBackground(this.view, previous, next);
  }
}
