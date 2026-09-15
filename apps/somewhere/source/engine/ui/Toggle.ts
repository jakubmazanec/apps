import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type ToggleConfig} from './ToggleConfig.js';
import {type ToggleOptions} from './ToggleOptions.js';
import {type ToggleParts} from './ToggleParts.js';
import {type ToggleRuntime} from './ToggleRuntime.js';
import {type ToggleState} from './ToggleState.js';

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

    let resolved = resolveThemedBackgrounds(
      ['unchecked', 'checked', 'hovered', 'hoveredChecked', 'disabled', 'disabledChecked'],
      this.#config.theme?.toggle,
      backgrounds,
    );

    if (resolved.unchecked === undefined || resolved.checked === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Toggle needs a theme or unchecked and checked backgrounds!');
    }

    let states = ['normal', 'hovered', 'disabled'] as const;

    this.#parts = {
      backgrounds: {
        unchecked: resolveBackgrounds(states, resolved.unchecked, {
          hovered: resolved.hovered,
          disabled: resolved.disabled,
        }),
        checked: resolveBackgrounds(states, resolved.checked, {
          hovered: resolved.hoveredChecked,
          disabled: resolved.disabledChecked,
        }),
      },
    };

    adoptDetachedBackgrounds(this.#disposables.instance, [
      ...Object.values(this.#parts.backgrounds.unchecked),
      ...Object.values(this.#parts.backgrounds.checked),
    ]);

    this.#runtime = {isChecked: checked};
    this.view = new LayoutContainer({
      background: this.#parts.backgrounds[checked ? 'checked' : 'unchecked'].normal,
    });
    this.view.layout = {width: resolved.unchecked.width, height: resolved.unchecked.height};

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        swapBackground(
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

  /** TBD */
  get state(): ToggleState {
    return this.#state;
  }

  /** TBD */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#runtime.isChecked = !this.#runtime.isChecked;

    swapBackground(
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

    swapBackground(this.view, toggleBackground(this.#parts.backgrounds, true, this.#state));
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';

    swapBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, 'disabled'),
    );

    setInteractionEnabled(this.view, false);
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';

    swapBackground(
      this.view,
      toggleBackground(this.#parts.backgrounds, this.#runtime.isChecked, 'normal'),
    );

    setInteractionEnabled(this.view, true, 'pointer');
  }

  /** TBD */
  uncheck() {
    if (!this.#runtime.isChecked) {
      return;
    }

    this.#runtime.isChecked = false;

    swapBackground(this.view, toggleBackground(this.#parts.backgrounds, false, this.#state));
  }
}

function toggleBackground(
  backgrounds: {
    checked: Record<ToggleState, pixi.Container>;
    unchecked: Record<ToggleState, pixi.Container>;
  },
  isChecked: boolean,
  state: ToggleState,
): pixi.Container {
  return backgrounds[isChecked ? 'checked' : 'unchecked'][state];
}
