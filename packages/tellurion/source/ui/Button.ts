import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {type ButtonConfig} from './ButtonConfig.js';
import {type ButtonOptions} from './ButtonOptions.js';
import {type ButtonParts} from './ButtonParts.js';
import {type ButtonState} from './ButtonState.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {disposeChildren} from './internals/disposeChildren.js';
import {resolveThemeBackgrounds} from './internals/resolveThemeBackgrounds.js';
import {resolveView} from './internals/resolveView.js';
import {setLayerContainerBackground} from './internals/setLayerContainerBackground.js';
import {setVerticalOffset} from './internals/setVerticalOffset.js';
import {type UiChild, type UiParent} from './UiChild.js';

import '@pixi/layout';

export class Button implements Focusable, UiParent {
  /** Children. */
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
      backgrounds: resolveThemeBackgrounds(
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
          setVerticalOffset(this.children, 0);
        }

        setLayerContainerBackground(this.view, this.#parts.backgrounds[state]);
      },
    });

    this.view.on('pointerdown', () => {
      if (this.#state === 'disabled' || this.#state === 'active') {
        return;
      }

      this.#state = 'active';

      if (this.#config.pressOffset !== 0) {
        setVerticalOffset(this.children, this.#config.pressOffset);
      }

      setLayerContainerBackground(this.view, this.#parts.backgrounds.active);
    });

    this.view.on('pointerup', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#state = 'hovered';

      if (this.#config.pressOffset !== 0) {
        setVerticalOffset(this.children, 0);
      }

      setLayerContainerBackground(this.view, this.#parts.backgrounds.hovered);
    });

    // A press released outside the button never fires `pointerup`.
    this.view.on('pointerupoutside', () => {
      if (this.#state !== 'active') {
        return;
      }

      this.#state = 'normal';

      if (this.#config.pressOffset !== 0) {
        setVerticalOffset(this.children, 0);
      }

      setLayerContainerBackground(this.view, this.#parts.backgrounds.normal);
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
    disposeChildren(this.children, this.#disposables.instance);
  }

  /** Is the button disabled? */
  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  /** Is the button focusable? */
  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  /** State. */
  get state(): ButtonState {
    return this.#state;
  }

  /** Activates the button; calls `onClick` handler. */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#onClick?.(this);
  }

  /** Adds children to the button's view. */
  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild(resolveView(child));

      if (this.#config.pressOffset !== 0) {
        setVerticalOffset([child], this.#state === 'active' ? this.#config.pressOffset : 0);
      }
    }

    return this;
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** Disables the button. */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';
    this.view.eventMode = 'none';
    this.view.cursor = 'default';

    if (this.#config.pressOffset !== 0) {
      setVerticalOffset(this.children, 0);
    }

    setLayerContainerBackground(this.view, this.#parts.backgrounds.disabled);
  }

  /** Enables the button. */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    if (this.#config.pressOffset !== 0) {
      setVerticalOffset(this.children, 0);
    }

    setLayerContainerBackground(this.view, this.#parts.backgrounds.normal);
  }

  /** Removes children from the button's view. */
  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      if (this.#config.pressOffset !== 0) {
        setVerticalOffset([child], 0);
      }

      this.view.removeChild(resolveView(child));
    }

    return this;
  }
}
