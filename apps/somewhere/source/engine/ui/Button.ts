import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {type ButtonConfig} from './ButtonConfig.js';
import {type ButtonOptions} from './ButtonOptions.js';
import {type ButtonParts} from './ButtonParts.js';
import {type ButtonState} from './ButtonState.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {applyPressShift} from './internals/applyPressShift.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type UiChild, type UiParent} from './UiChild.js';

export class Button implements Focusable, UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: ButtonConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the button is clicked. */
  readonly #onClick?: (button: Button) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: ButtonParts;

  /** State; which part of its life cycle the instance is currently in. */
  #state: ButtonState = 'normal';

  constructor({backgrounds, theme, children, onClick, layout, pressOffset}: ButtonOptions) {
    if (onClick !== undefined) {
      this.#onClick = onClick;
    }

    this.#config = {
      pressOffset: pressOffset ?? theme?.button.pressOffset ?? 0,
      theme,
    };

    this.#parts = {
      backgrounds: resolveThemedBackgrounds(
        ['normal', 'hovered', 'active', 'disabled'],
        this.#config.theme?.button,
        backgrounds,
      ),
    };

    adoptDetachedBackgrounds(this.#disposables.instance, Object.values(this.#parts.backgrounds));

    this.view = new LayoutContainer({background: this.#parts.backgrounds.normal});

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        if (this.#config.pressOffset !== 0) {
          applyPressShift(this.children, state, this.#config.pressOffset);
        }

        swapBackground(this.view, this.#parts.backgrounds[state]);
      },
    });

    this.view.on('pointerdown', () => {
      if (this.#state === 'disabled' || this.#state === 'active') {
        return;
      }

      this.#state = 'active';

      if (this.#config.pressOffset !== 0) {
        applyPressShift(this.children, 'active', this.#config.pressOffset);
      }

      swapBackground(this.view, this.#parts.backgrounds.active);
    });

    this.view.on('pointerup', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#state = 'hovered';

      if (this.#config.pressOffset !== 0) {
        applyPressShift(this.children, 'hovered', this.#config.pressOffset);
      }

      swapBackground(this.view, this.#parts.backgrounds.hovered);
    });

    // A press released outside the button never fires `pointerup`, which would
    // otherwise leave the button stuck in `active`.
    this.view.on('pointerupoutside', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#state = 'normal';

      if (this.#config.pressOffset !== 0) {
        applyPressShift(this.children, 'normal', this.#config.pressOffset);
      }

      swapBackground(this.view, this.#parts.backgrounds.normal);
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
      ...theme?.button.layout,
      ...layout,
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

      if (this.#config.pressOffset !== 0) {
        applyPressShift([child], this.#state, this.#config.pressOffset);
      }
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

    if (this.#config.pressOffset !== 0) {
      applyPressShift(this.children, 'disabled', this.#config.pressOffset);
    }

    swapBackground(this.view, this.#parts.backgrounds.disabled);

    setInteractionEnabled(this.view, false);
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';

    if (this.#config.pressOffset !== 0) {
      applyPressShift(this.children, 'normal', this.#config.pressOffset);
    }

    swapBackground(this.view, this.#parts.backgrounds.normal);

    setInteractionEnabled(this.view, true, 'pointer');
  }

  /** TBD */
  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      if (this.#config.pressOffset !== 0) {
        applyPressShift([child], 'normal', this.#config.pressOffset);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }
}
