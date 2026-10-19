import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {attachInteraction} from './internals/attachInteraction.js';
import {disposeDetachedBackgrounds} from './internals/disposeDetachedBackgrounds.js';
import {resolveThemeBackgrounds} from './internals/resolveThemeBackgrounds.js';
import {setLayerContainerBackground} from './internals/setLayerContainerBackground.js';
import {toggleBackground} from './internals/toggleBackground.js';
import {type ToggleConfig} from './ToggleConfig.js';
import {type ToggleOptions} from './ToggleOptions.js';
import {type ToggleParts} from './ToggleParts.js';
import {type ToggleRuntime} from './ToggleRuntime.js';
import {type ToggleState} from './ToggleState.js';

import '@pixi/layout';

export class Toggle implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: ToggleConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the toggle's checked state changes. */
  readonly #onChange?: (toggle: Toggle) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: ToggleParts;

  /** Object for internal values that may change. */
  readonly #runtime: ToggleRuntime; // basically a `value`

  /** State; which part of its life cycle the instance is currently in. */
  #state: ToggleState = 'normal';

  constructor({backgrounds, theme, checked = false, onChange}: ToggleOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    this.#config = {theme};

    let resolved = resolveThemeBackgrounds(
      ['unchecked', 'checked', 'hovered', 'hoveredChecked', 'disabled', 'disabledChecked'],
      this.#config.theme?.toggle,
      backgrounds,
    );

    this.#parts = {
      backgrounds: {
        unchecked: {
          normal: resolved.unchecked,
          hovered: resolved.hovered,
          disabled: resolved.disabled,
        },
        checked: {
          normal: resolved.checked,
          hovered: resolved.hoveredChecked,
          disabled: resolved.disabledChecked,
        },
      },
    };

    disposeDetachedBackgrounds(this.#disposables.instance, [
      ...Object.values(this.#parts.backgrounds.unchecked),
      ...Object.values(this.#parts.backgrounds.checked),
    ]);

    this.#runtime = {isChecked: checked};
    this.view = new LayoutContainer({
      background: this.#parts.backgrounds[checked ? 'checked' : 'unchecked'].normal,
    });
    this.view.layout = {width: resolved.unchecked.width, height: resolved.unchecked.height};

    attachInteraction(this.view, {
      cursor: 'pointer',
      setState: (state) => {
        this.#state = state;

        setLayerContainerBackground(
          this.view,
          toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, state),
        );
      },
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.activate();
      }
    });

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get isChecked(): boolean {
    return this.#runtime.isChecked;
  }

  /** TBD */
  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  /** TBD */
  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  /** State. */
  get state(): ToggleState {
    return this.#state;
  }

  /** Activates the toggle; flips whether it's checked and calls `onChange` handler. */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#runtime.isChecked = !this.#runtime.isChecked;

    setLayerContainerBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, this.#state),
    );

    this.#onChange?.(this);
  }

  /** TBD */
  check() {
    if (this.#runtime.isChecked) {
      return;
    }

    this.#runtime.isChecked = true;

    setLayerContainerBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, true, this.#state),
    );
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** Disables the toggle. */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';

    this.view.eventMode = 'none';
    this.view.cursor = 'default';

    setLayerContainerBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, 'disabled'),
    );
  }

  /** Enables the toggle. */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    setLayerContainerBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, 'normal'),
    );
  }

  /** TBD */
  uncheck() {
    if (!this.#runtime.isChecked) {
      return;
    }

    this.#runtime.isChecked = false;

    setLayerContainerBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, false, this.#state),
    );
  }
}
