import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './attachWidgetInteraction.js';
import {type Focusable} from './Focusable.js';
import {resolveBackgrounds} from './resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './setInteractionEnabled.js';
import {swapBackground} from './swapBackground.js';
import {type UiChild, type UiParent} from './UiChild.js';
import {type ThemedOptions} from './UiTheme.js';

export type ButtonState = 'active' | 'disabled' | 'hovered' | 'normal';

export type ButtonBackgrounds = {
  normal: pixi.Container;
  hovered?: pixi.Container;
  active?: pixi.Container;
  disabled?: pixi.Container;
};

export type ButtonOptions = ThemedOptions<ButtonBackgrounds> & {
  children?: UiChild[];
  onClick?: (button: Button) => void;
  layout?: pixi.ContainerOptions['layout'];
  // Pixels to shift the content down while pressed, so the label tracks a
  // background whose face drops on press (e.g. an extruded 3D button).
  pressOffset?: number;
};

export class Button implements Focusable, UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** TBD */
  readonly view: LayoutContainer;

  /** TBD */
  readonly #backgrounds: Record<ButtonState, pixi.Container>;

  /** TBD */
  readonly #basePaddingBottom: number;

  /** TBD */
  readonly #basePaddingTop: number;

  /** TBD */
  readonly #disposables = new DisposableStack();

  /** TBD */
  readonly #onClick?: (button: Button) => void;

  /** TBD */
  readonly #pressOffset: number;

  /** TBD */
  #state: ButtonState = 'normal';

  constructor({backgrounds, theme, children, onClick, layout, pressOffset}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    this.#pressOffset = pressOffset ?? theme?.button.pressOffset ?? 0;

    // The theme provides per-property layout defaults; an instance property wins.
    let mergedLayout = {
      ...theme?.button.layout,
      ...(typeof layout === 'object' ? layout : undefined),
    };
    let {
      padding = 0,
      paddingTop = padding,
      paddingBottom = padding,
    } = mergedLayout as {
      padding?: number;
      paddingTop?: number;
      paddingBottom?: number;
    };

    this.#basePaddingTop = paddingTop;
    this.#basePaddingBottom = paddingBottom;

    let resolved = resolveThemedBackgrounds(
      ['normal', 'hovered', 'active', 'disabled'],
      theme?.button,
      backgrounds,
    );

    if (resolved.normal === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Button needs a theme or a normal background!');
    }

    this.#backgrounds = resolveBackgrounds(
      ['normal', 'hovered', 'active', 'disabled'],
      resolved.normal,
      resolved,
    );

    adoptDetachedBackgrounds(this.#disposables, Object.values(this.#backgrounds));

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => this.#setState(state),
    });

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
      ...mergedLayout,
    };

    this.#disposables.defer(() => this.view.destroy({children: true}));
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
  get state(): ButtonState {
    return this.#state;
  }

  /** TBD */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#onClick?.(this);
  }

  /** TBD */
  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

  /** TBD */
  destroy() {
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

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

  /** TBD */
  #setState(state: ButtonState) {
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

    swapBackground(this.view, this.#backgrounds[state]);
  }
}
