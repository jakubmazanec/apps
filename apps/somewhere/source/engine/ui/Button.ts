import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type ButtonOptions} from './ButtonOptions.js';
import {type ButtonState} from './ButtonState.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type UiChild, type UiParent} from './UiChild.js';

export class Button implements Focusable, UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** TBD */
  readonly #backgrounds: Record<ButtonState, pixi.Container>;

  /** TBD */
  readonly #basePaddingBottom: number;

  /** TBD */
  readonly #basePaddingTop: number;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the button is clicked. */
  readonly #onClick?: (button: Button) => void;

  /** TBD */
  readonly #pressOffset: number;

  /** State; which part of its life cycle the instance is currently in. */
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

    adoptDetachedBackgrounds(this.#disposables.instance, Object.values(this.#backgrounds));

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        if (this.#pressOffset !== 0) {
          this.view.layout = pressPadding(state, {
            pressOffset: this.#pressOffset,
            basePaddingTop: this.#basePaddingTop,
            basePaddingBottom: this.#basePaddingBottom,
          });
        }

        swapBackground(this.view, this.#backgrounds[state]);
      },
    });

    this.view.on('pointerdown', () => {
      if (this.#state === 'disabled' || this.#state === 'active') {
        return;
      }

      this.#state = 'active';

      if (this.#pressOffset !== 0) {
        this.view.layout = pressPadding('active', {
          pressOffset: this.#pressOffset,
          basePaddingTop: this.#basePaddingTop,
          basePaddingBottom: this.#basePaddingBottom,
        });
      }

      swapBackground(this.view, this.#backgrounds.active);
    });

    this.view.on('pointerup', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#state = 'hovered';

      if (this.#pressOffset !== 0) {
        this.view.layout = pressPadding('hovered', {
          pressOffset: this.#pressOffset,
          basePaddingTop: this.#basePaddingTop,
          basePaddingBottom: this.#basePaddingBottom,
        });
      }

      swapBackground(this.view, this.#backgrounds.hovered);
    });

    // A press released outside the button never fires `pointerup`, which would
    // otherwise leave the button stuck in `active`.
    this.view.on('pointerupoutside', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#state = 'normal';

      if (this.#pressOffset !== 0) {
        this.view.layout = pressPadding('normal', {
          pressOffset: this.#pressOffset,
          basePaddingTop: this.#basePaddingTop,
          basePaddingBottom: this.#basePaddingBottom,
        });
      }

      swapBackground(this.view, this.#backgrounds.normal);
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

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
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

  /** Destroys the instance. */
  destroy() {
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.instance.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';

    if (this.#pressOffset !== 0) {
      this.view.layout = pressPadding('disabled', {
        pressOffset: this.#pressOffset,
        basePaddingTop: this.#basePaddingTop,
        basePaddingBottom: this.#basePaddingBottom,
      });
    }

    swapBackground(this.view, this.#backgrounds.disabled);

    setInteractionEnabled(this.view, false);
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';

    if (this.#pressOffset !== 0) {
      this.view.layout = pressPadding('normal', {
        pressOffset: this.#pressOffset,
        basePaddingTop: this.#basePaddingTop,
        basePaddingBottom: this.#basePaddingBottom,
      });
    }

    swapBackground(this.view, this.#backgrounds.normal);

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
}

// Layout assignments merge onto the current style, so restoring the base padding on release
// needs the value captured at construction rather than reading it back from the view.
function pressPadding(
  state: ButtonState,
  {
    pressOffset,
    basePaddingTop,
    basePaddingBottom,
  }: {pressOffset: number; basePaddingTop: number; basePaddingBottom: number},
): {paddingTop: number; paddingBottom: number} {
  let shift = state === 'active' ? pressOffset : 0;

  return {
    paddingTop: basePaddingTop + shift,
    paddingBottom: basePaddingBottom - shift,
  };
}
