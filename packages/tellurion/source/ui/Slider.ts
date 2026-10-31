import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {attachInteraction} from './internals/attachInteraction.js';
import {disposeDetachedBackgrounds} from './internals/disposeDetachedBackgrounds.js';
import {resolveThemeBackgrounds} from './internals/resolveThemeBackgrounds.js';
import {setLayerContainerBackground} from './internals/setLayerContainerBackground.js';
import {snapToStep} from './internals/snapToStep.js';
import {valueFromEvent} from './internals/valueFromEvent.js';
import {type SliderConfig} from './SliderConfig.js';
import {type SliderOptions} from './SliderOptions.js';
import {type SliderParts} from './SliderParts.js';
import {type SliderRuntime} from './SliderRuntime.js';
import {type SliderState} from './SliderState.js';

import '@pixi/layout';

export class Slider implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: SliderConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the slider's value changes. */
  readonly #onChange?: (slider: Slider) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: SliderParts;

  /** Object for internal values that may change. */
  readonly #runtime: SliderRuntime;

  /** State; which part of its life cycle the instance is currently in. */
  #state: SliderState = 'normal';

  constructor({
    backgrounds,
    theme,
    min = 0,
    max = 1,
    step = 0.1,
    value = min,
    onChange,
  }: SliderOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    this.#parts = {
      backgrounds: resolveThemeBackgrounds(
        ['normal', 'fill', 'hovered', 'disabled'],
        theme?.slider,
        backgrounds,
      ),
    };
    this.#config = {
      min,
      max,
      step,
      theme,
      trackWidth: this.#parts.backgrounds.normal.width,
      trackHeight: this.#parts.backgrounds.normal.height,
    };
    this.#runtime = {
      isDragging: false,
      value: snapToStep(value, this.#config),
    };

    disposeDetachedBackgrounds(this.#disposables.instance, Object.values(this.#parts.backgrounds));

    this.view = new LayoutContainer({background: this.#parts.backgrounds.normal});
    this.view.layout = {width: this.#config.trackWidth, height: this.#config.trackHeight};

    attachInteraction(this.view, {
      cursor: 'pointer',
      setState: (state) => {
        this.#state = state;

        setLayerContainerBackground(this.view, this.#parts.backgrounds[state]);
      },
    });

    this.#parts.backgrounds.fill.position.set(0, 0);
    this.#parts.backgrounds.fill.setSize(
      this.#config.trackWidth *
        (this.#config.max === this.#config.min ?
          0
        : (this.#runtime.value - this.#config.min) / (this.#config.max - this.#config.min)),
      this.#config.trackHeight,
    );
    this.view.addChild(this.#parts.backgrounds.fill);

    this.view.on('pointerdown', (event) => {
      if (this.#state === 'disabled') {
        return;
      }

      // Only primary button may start the slider drag.
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      this.#runtime.isDragging = true;
      this.value = valueFromEvent(event, this.view, this.#config);
      this.#onChange?.(this);
    });

    this.view.on('globalpointermove', (event) => {
      if (!this.#runtime.isDragging) {
        return;
      }

      // No buttons are pressed, so we cancel the slider drag.
      if (event.buttons === 0) {
        this.#runtime.isDragging = false;

        return;
      }

      let next = valueFromEvent(event, this.view, this.#config);

      if (next === this.#runtime.value) {
        return;
      }

      this.value = next;
      this.#onChange?.(this);
    });

    this.view.on('pointerup', () => {
      this.#runtime.isDragging = false;
    });
    this.view.on('pointerupoutside', () => {
      this.#runtime.isDragging = false;
    });
    this.view.on('pointercancel', () => {
      this.#runtime.isDragging = false;
    });

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

  /** Is the slider disabled? */
  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  /** Is the slider focusable? */
  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  /** State. */
  get state(): SliderState {
    return this.#state;
  }

  /** Value. */
  get value(): number {
    return this.#runtime.value;
  }

  set value(value: number) {
    this.#runtime.value = snapToStep(value, this.#config);
    this.#parts.backgrounds.fill.setSize(
      this.#config.trackWidth *
        (this.#config.max === this.#config.min ?
          0
        : (this.#runtime.value - this.#config.min) / (this.#config.max - this.#config.min)),
      this.#config.trackHeight,
    );
  }

  /** Activates the slider; does nothing, use `increase` and `decrease`. */
  activate() {}

  /** Decreases the slider's value by one step; calls `onChange` handler. */
  decrease() {
    if (this.#state === 'disabled') {
      return;
    }

    this.value = this.#runtime.value - this.#config.step;
    this.#onChange?.(this);
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** Disables the slider. */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#runtime.isDragging = false;
    this.#state = 'disabled';
    this.view.eventMode = 'none';
    this.view.cursor = 'default';

    setLayerContainerBackground(this.view, this.#parts.backgrounds.disabled);
  }

  /** Enables the slider. */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    setLayerContainerBackground(this.view, this.#parts.backgrounds.normal);
  }

  /** Increases the slider's value by one step; calls `onChange` handler. */
  increase() {
    if (this.#state === 'disabled') {
      return;
    }

    this.value = this.#runtime.value + this.#config.step;
    this.#onChange?.(this);
  }
}
