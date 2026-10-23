import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
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

export class TextInput implements Focusable {
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
    row.eventMode = 'none'; // LayoutContainer makes itself an interactive hit target, that's unwanted here.

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
      isEditing: false,
      isOwnPointerDown: false,
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

    // We need to cancel the event, so focus isn¨t moved from the hidden <input> element.
    this.view.on('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();

      this.#runtime.isOwnPointerDown = true;
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

      // Ahead of the advance below, so a caret that moved this frame is lit for
      // the frame it moved on rather than one later.
      this.#syncCaret();

      this.#runtime.blinkTick = (this.#runtime.blinkTick + ticker.deltaTime) % BLINK_PERIOD;

      // A block covers the character it sits on, so it blinks hard on and off;
      // fading would leave that character half-obscured for most of the cycle.
      this.#parts.caret.alpha = this.#runtime.blinkTick < BLINK_PERIOD / 2 ? 1 : 0;
    };

    pixi.Ticker.shared.add(update);

    this.#disposables.instance.defer(() => {
      pixi.Ticker.shared.remove(update);
    });

    // #parts.valueText / #parts.placeholderText / #parts.caret are swapped in and out of
    // #parts.row, so whichever is currently detached would leak under view.destroy({children}).
    this.#disposables.instance.defer(() => {
      this.#parts.row.removeChildren();
      this.#parts.valueText.destroy();
      this.#parts.placeholderText.destroy();
      this.#parts.caret.destroy();
      this.view.destroy({children: true});
    });

    // The caret is only in the row while editing, but it has to carry a layout
    // before it first lands there: an unlaid-out sprite renders at the white
    // texture's own size for a frame.
    this.#syncCaret();
    this.#refresh();
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
  get value(): string {
    return this.#runtime.value;
  }

  set value(value: string) {
    this.#runtime.value =
      this.#config.maxLength === undefined ? value : value.slice(0, this.#config.maxLength);
    this.#parts.valueText.setText(this.#runtime.value);
    this.#parts.input.value = this.#runtime.value;

    this.#refresh();
  }

  /** Activates the text input: starts editing, or, while editing, submits and stops. */
  // GameInput ignores every key while a text-entry element has DOM focus, which
  // is what keeps arrows and Space as editing keys; the keys bound to activate
  // and cancel land here through UiRoot like any other command.
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

  /** TBD */
  #positionCaret(offset: number, width: number) {
    this.#runtime.caretOffset = offset;
    this.#runtime.caretWidth = width;

    // Restart the blink lit. A caret that moved during the dark half would
    // otherwise leave the user hunting for where it went — and since typing
    // moves it too, this also keeps it solid while the user types.
    this.#runtime.blinkTick = 0;

    this.#parts.caret.layout = {
      width,
      height: this.#config.caretHeight,
      // Out of the row's flow: an in-flow caret can only ever land after the
      // whole value, and it would shove the text following it aside as the
      // cursor moved through the string. `top` is left undefined so the row's
      // alignItems still centers it vertically.
      position: 'absolute',
      left: offset,
    };
  }

  /** TBD */
  #refresh() {
    this.#parts.row.removeChildren();

    if (this.#runtime.isEditing) {
      this.#parts.row.addChild(this.#parts.valueText.view, this.#parts.caret);
    } else if (this.#runtime.value.length === 0) {
      this.#parts.row.addChild(this.#parts.placeholderText.view);
    } else {
      this.#parts.row.addChild(this.#parts.valueText.view);
    }
  }

  /** Starts the edit: focuses the hidden input and shows the caret. */
  #startEditing() {
    if (this.#runtime.isEditing) {
      return;
    }

    this.#runtime.isEditing = true;

    // Clear the own-pointer flag the opening tap set, so the first outside tap
    // is recognized as outside (nothing else clears it before the listener
    // below exists).
    this.#runtime.isOwnPointerDown = false;

    // Everything that only matters during an edit is registered by the edit and
    // torn down with it, so idle inputs hold no app-wide listeners. Closes the
    // editor when a pointerdown lands outside this field, and when the input
    // loses focus on its own (e.g. the soft keyboard is dismissed), so the
    // field can be focused again afterwards. A tap on this field's own view
    // sets #runtime.isOwnPointerDown first (the view's federated pointerdown runs
    // before the window listener), so an in-field tap keeps the edit — and the
    // soft keyboard — alive.
    this.#disposables.editing = new DisposableStack();

    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleBlur = () => {
      if (this.#runtime.isOwnPointerDown) {
        this.#runtime.isOwnPointerDown = false;

        return;
      }

      this.#stopEditing();
    };

    globalThis.addEventListener('pointerdown', handleBlur);
    this.#parts.input.addEventListener('blur', handleBlur);
    this.#disposables.editing.defer(() => {
      globalThis.removeEventListener('pointerdown', handleBlur);
      this.#parts.input.removeEventListener('blur', handleBlur);
    });

    this.#parts.input.value = this.#runtime.value;

    let {x, y} = this.view.getGlobalPosition();
    let ratio = window.devicePixelRatio || 1;
    // getGlobalPosition is in renderer (device) pixels relative to the canvas;
    // the input is position: fixed (viewport-relative), so offset by the canvas
    // container's viewport rect and convert device px -> CSS px.
    let rect = this.#config.container.getBoundingClientRect();

    this.#parts.input.style.left = `${rect.left + x / ratio}px`;
    this.#parts.input.style.top = `${rect.top + y / ratio}px`;

    this.#parts.input.focus({preventScroll: true});

    this.#refresh();
  }

  /** Ends the edit: blurs the hidden input and hides the caret. */
  #stopEditing() {
    if (!this.#runtime.isEditing) {
      return;
    }

    this.#runtime.isEditing = false;

    // Disposed before blur() below, so the blur it raises finds no listener.
    this.#disposables.editing?.dispose();
    this.#disposables.editing = null;

    this.#parts.input.blur();

    this.#refresh();
  }

  /** TBD */
  #syncCaret() {
    // The hidden input owns the cursor: arrow keys, Home/End, word jumps and IME
    // all move it without changing the value, so there is no event to hook —
    // reading the selection back each frame is what catches every one of them.
    let index = this.#parts.input.selectionStart ?? this.#runtime.value.length;
    let offset = measureTextWidth(this.#runtime.value.slice(0, index), this.#parts.valueText.style);
    // The font leaves a single 1 art px column between glyphs and its descenders
    // fill the line box, so a bar caret has nowhere to sit without touching ink.
    // The caret is a block over the character's cell instead, the way a
    // terminal's is. Past the last character there is no cell to cover, so it
    // falls back to a space's advance.
    let width = measureTextWidth(this.#runtime.value[index] ?? ' ', this.#parts.valueText.style);

    if (offset !== this.#runtime.caretOffset || width !== this.#runtime.caretWidth) {
      this.#positionCaret(offset, width);
    }
  }
}
