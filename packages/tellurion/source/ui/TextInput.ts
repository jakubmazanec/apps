import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type FocusableUiComponent} from './FocusableUiComponent.js';
import {attachInteraction} from './internals/attachInteraction.js';
import {disposeDetachedBackgrounds} from './internals/disposeDetachedBackgrounds.js';
import {measureTextWidth} from './internals/measureTextWidth.js';
import {resolveThemeBackgrounds} from './internals/resolveThemeBackgrounds.js';
import {setLayerContainerBackground} from './internals/setLayerContainerBackground.js';
import {Text} from './Text.js';
import {type TextInputConfig} from './TextInputConfig.js';
import {type TextInputOptions} from './TextInputOptions.js';
import {type TextInputParts} from './TextInputParts.js';
import {type TextInputRuntime} from './TextInputRuntime.js';
import {type TextInputState} from './TextInputState.js';

import '@pixi/layout';

// One full blink cycle in ticker frames: ~0.5 s lit, ~0.5 s dark at 60 fps.
const BLINK_PERIOD = 60;

export class TextInput implements FocusableUiComponent {
  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: TextInputConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance', 'editing'> = {
    editing: null,
    instance: new DisposableStack(),
  };

  /** Lifecycle hook called when the input's value changes. */
  readonly #onChange?: (input: TextInput) => void;

  /** Lifecycle hook called when the input is done editing. */
  readonly #onSubmit?: (input: TextInput) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: TextInputParts;

  /** Object for internal values that may change. */
  readonly #runtime: TextInputRuntime;

  /** State; which part of its life cycle the instance is currently in. */
  #state: TextInputState = 'normal';

  constructor({
    backgrounds,
    theme,
    value = '',
    placeholder = '',
    maxLength,
    container,
    body,
    onChange,
    onSubmit,
    layout,
  }: TextInputOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    if (onSubmit !== undefined) {
      this.#onSubmit = onSubmit;
    }

    let style = body ?? theme?.textInput.body;

    this.#config = {
      caretHeight: style?.fontSize ?? 0,
      container,
      maxLength,
      theme,
    };

    let row = new LayoutContainer({});

    row.layout = {flexDirection: 'row', alignItems: 'center'};
    row.eventMode = 'none'; // LayoutContainer makes itself interactive, that's unwanted here.

    let valueText = new Text({text: value, layout: true, label: style});
    let placeholderText = new Text({
      text: placeholder,
      layout: true,
      label: style,
    });

    placeholderText.view.alpha = 0.5;

    let caret = new pixi.Sprite(pixi.Texture.WHITE);

    caret.tint = style?.fill ?? 0xffffff;

    let input = document.createElement('input');

    input.type = 'text';
    input.value = value;
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.tabIndex = -1;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');

    if (this.#config.maxLength !== undefined) {
      input.maxLength = this.#config.maxLength;
    }

    input.style.position = 'fixed';
    input.style.top = '0';
    input.style.left = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.border = '0';
    input.style.outline = 'none';
    input.style.background = 'transparent';
    input.style.color = 'transparent';
    input.style.caretColor = 'transparent';
    input.style.fontSize = '16px';
    input.style.pointerEvents = 'none';

    this.#parts = {
      backgrounds: resolveThemeBackgrounds(
        ['normal', 'hovered', 'disabled'],
        this.#config.theme?.textInput,
        backgrounds,
      ),
      caret,
      input,
      placeholderText,
      row,
      valueText,
    };
    this.#runtime = {
      blinkTick: 0,
      caretOffset: undefined,
      caretWidth: undefined,
      pointerDownEvent: undefined,
      isEditing: false,
      value,
    };

    disposeDetachedBackgrounds(this.#disposables.instance, Object.values(this.#parts.backgrounds));

    this.view = new LayoutContainer({background: this.#parts.backgrounds.normal});
    this.view.layout = {
      justifyContent: 'flex-start',
      alignItems: 'center',
      ...this.#config.theme?.textInput.layout,
      ...layout,
    };

    attachInteraction(this.view, {
      cursor: 'text',
      setState: (state) => {
        this.#state = state;

        setLayerContainerBackground(this.view, this.#parts.backgrounds[state]);
      },
    });

    this.view.addChild(row);

    // We need to cancel the event, so focus isn't moved from the hidden <input> element.
    this.view.on('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();

      this.#runtime.pointerDownEvent = event.nativeEvent;
    });

    this.view.on('pointerup', (event) => {
      event.stopPropagation();
      this.#startEditing();
    });

    this.#config.container.append(input);

    let handleInput = () => {
      if (this.#state === 'disabled') {
        return;
      }

      let next = input.value;

      if (this.#config.maxLength !== undefined && next.length > this.#config.maxLength) {
        next = next.slice(0, this.#config.maxLength);
        input.value = next;
      }

      this.#runtime.value = next;
      this.#parts.valueText.setText(next);
      this.#onChange?.(this);
    };

    input.addEventListener('input', handleInput);

    this.#disposables.instance.defer(() => {
      input.removeEventListener('input', handleInput);
      input.remove();
    });

    let update = (ticker: pixi.Ticker) => {
      if (!this.#runtime.isEditing) {
        return;
      }

      this.#syncCaret();

      this.#runtime.blinkTick = (this.#runtime.blinkTick + ticker.deltaTime) % BLINK_PERIOD;
      this.#parts.caret.alpha = this.#runtime.blinkTick < BLINK_PERIOD / 2 ? 1 : 0;
    };

    pixi.Ticker.shared.add(update);

    this.#disposables.instance.defer(() => {
      pixi.Ticker.shared.remove(update);
    });

    this.#disposables.instance.defer(() => {
      this.#parts.row.removeChildren();
      this.#parts.valueText.destroy(); // `#parts.valueText` can sometimes not be in `#parts.row.children`.
      this.#parts.placeholderText.destroy(); // `#parts.placeholderText` can sometimes not be in `#parts.row.children`.
      this.#parts.caret.destroy(); // `#parts.caret` can sometimes not be in `#parts.row.children`.
      this.view.destroy({children: true});
    });

    this.#syncCaret();
    this.#syncRow();
  }

  /** Is the text input disabled? */
  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  /** Is the text input focusable? */
  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  /** Value. */
  get value(): string {
    return this.#runtime.value;
  }

  set value(value: string) {
    this.#runtime.value =
      this.#config.maxLength === undefined ? value : value.slice(0, this.#config.maxLength);
    this.#parts.valueText.setText(this.#runtime.value);
    this.#parts.input.value = this.#runtime.value;

    this.#syncRow();
  }

  /** Activates the text input: starts editing, or, while editing, submits and stops. */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    if (this.#runtime.isEditing) {
      this.#onSubmit?.(this);
      this.#stopEditing();

      return;
    }

    this.#startEditing();
  }

  /** @internal Called by `UiRoot`. */
  deactivate() {
    this.#stopEditing();
  }

  /** Destroys the instance. */
  destroy() {
    this.#stopEditing();
    this.#disposables.instance.dispose();
  }

  /** Disables the text input. */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';
    this.view.eventMode = 'none';
    this.view.cursor = 'default';

    setLayerContainerBackground(this.view, this.#parts.backgrounds.disabled);
    this.#stopEditing();
  }

  /** Enables the text input. */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';
    this.view.eventMode = 'static';
    this.view.cursor = 'text';

    setLayerContainerBackground(this.view, this.#parts.backgrounds.normal);
  }

  /** Starts the edit: focuses the hidden input and shows the caret. */
  #startEditing() {
    if (this.#runtime.isEditing) {
      return;
    }

    this.#runtime.isEditing = true;
    this.#disposables.editing = new DisposableStack();

    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handlePointerDown = (event: Event) => {
      if (event !== this.#runtime.pointerDownEvent) {
        this.#stopEditing();
      }
    };
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleBlur = () => {
      this.#stopEditing();
    };

    globalThis.addEventListener('pointerdown', handlePointerDown);
    this.#parts.input.addEventListener('blur', handleBlur);
    this.#disposables.editing.defer(() => {
      globalThis.removeEventListener('pointerdown', handlePointerDown);
      this.#parts.input.removeEventListener('blur', handleBlur);
    });

    this.#parts.input.value = this.#runtime.value;

    let {left, top} = this.#config.container.getBoundingClientRect();
    let {x, y} = this.view.getGlobalPosition();
    let ratio = window.devicePixelRatio || 1;

    this.#parts.input.style.left = `${left + x / ratio}px`;
    this.#parts.input.style.top = `${top + y / ratio}px`;

    this.#parts.input.focus({preventScroll: true});

    this.#syncRow();
  }

  /** Ends the edit: blurs the hidden input and hides the caret. */
  #stopEditing() {
    if (!this.#runtime.isEditing) {
      return;
    }

    this.#runtime.isEditing = false;

    this.#disposables.editing?.dispose();
    this.#disposables.editing = null;

    // Called after disposing, so the blur finds no listeners.
    this.#parts.input.blur();

    this.#syncRow();
  }

  /** Syncs the caret with the hidden input's cursor. */
  #syncCaret() {
    let index = this.#parts.input.selectionStart ?? this.#runtime.value.length;
    let offset = measureTextWidth(this.#runtime.value.slice(0, index), this.#parts.valueText.style);
    let width = measureTextWidth(this.#runtime.value[index] ?? ' ', this.#parts.valueText.style);

    if (offset !== this.#runtime.caretOffset || width !== this.#runtime.caretWidth) {
      this.#runtime.caretOffset = offset;
      this.#runtime.caretWidth = width;
      this.#runtime.blinkTick = 0;

      this.#parts.caret.layout = {
        width,
        height: this.#config.caretHeight,
        position: 'absolute',
        left: offset,
      };
    }
  }

  /** Syncs the row. */
  #syncRow() {
    this.#parts.row.removeChildren();

    if (this.#runtime.isEditing) {
      this.#parts.row.addChild(this.#parts.valueText.view, this.#parts.caret);
    } else if (this.#runtime.value.length === 0) {
      this.#parts.row.addChild(this.#parts.placeholderText.view);
    } else {
      this.#parts.row.addChild(this.#parts.valueText.view);
    }
  }
}
