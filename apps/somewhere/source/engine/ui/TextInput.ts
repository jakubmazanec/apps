import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveBackgrounds} from './internals/resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {Text} from './Text.js';
import {type TextInputConfig} from './TextInputConfig.js';
import {type TextInputOptions} from './TextInputOptions.js';
import {type TextInputParts} from './TextInputParts.js';
import {type TextInputRuntime} from './TextInputRuntime.js';
import {type TextInputState} from './TextInputState.js';

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

  /** Lifecycle hook called when Enter is pressed while editing. */
  readonly #onEnter?: (input: TextInput) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: TextInputParts;

  // caretOffset and caretWidth are -1 until #syncCaret writes the first layout; no
  // measured offset or width can be negative, so the first sync always applies.
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
    role,
    fontFamily,
    fontSize,
    fill,
    onChange,
    onEnter,
    layout,
  }: TextInputOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    if (onEnter !== undefined) {
      this.#onEnter = onEnter;
    }

    // TextInput defaults to 'body' because it renders entered text, not a label.
    let style = theme === undefined ? undefined : theme.text[role ?? 'body'];
    let resolvedFontFamily = fontFamily ?? style?.fontFamily;
    let resolvedFontSize = fontSize ?? style?.fontSize;
    let resolvedFill = fill ?? style?.fill;

    this.#config = {
      // The block covers the character's whole line box, the way a terminal's cell
      // cursor does. Falls back to 0 only in the no-theme, no-explicit-fontSize
      // branch — unreachable through TextInputOptions in practice (the theme, when
      // present, always supplies a fontSize), used here only, not smuggled into
      // the text style above.
      caretHeight: resolvedFontSize ?? 0,
      container,
      layout: typeof layout === 'object' ? layout : undefined,
      maxLength,
      placeholder,
      textStyle: {
        ...(resolvedFontFamily === undefined ? undefined : {fontFamily: resolvedFontFamily}),
        ...(resolvedFontSize === undefined ? undefined : {fontSize: resolvedFontSize}),
        ...(resolvedFill === undefined ? undefined : {fill: resolvedFill}),
      },
      theme,
    };

    let resolved = resolveThemedBackgrounds(
      ['normal', 'hovered', 'disabled'],
      this.#config.theme?.textInput,
      backgrounds,
    );

    if (resolved.normal === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('TextInput needs a theme or a normal background!');
    }

    let row = new LayoutContainer({});

    row.layout = {flexDirection: 'row', alignItems: 'center'};

    // LayoutContainer makes itself an interactive hit target ('static', for its
    // scroll trackpad), and Pixi takes the canvas cursor from the deepest
    // interactive hit target only; the purely visual row would override the
    // view's 'text' cursor wherever the text covers the field.
    row.eventMode = 'none';

    let valueText = new Text({text: value, layout: true, ...this.#config.textStyle});
    let placeholderText = new Text({
      text: this.#config.placeholder,
      layout: true,
      ...this.#config.textStyle,
    });

    placeholderText.view.alpha = 0.5;

    let caret = new pixi.Sprite(pixi.Texture.WHITE);

    caret.tint = this.#config.textStyle.fill ?? 0xffffff;

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

    let inputStyle = input.style;

    // Keep the element genuinely present and focusable so mobile opens the soft
    // keyboard, but make it visually invisible via transparent colors rather than
    // display:none / visibility:hidden / opacity:0 / z-index:-1, all of which can
    // stop Android from opening the keyboard. pointerEvents is 'none' so taps
    // always route through the Pixi view, never this element.
    inputStyle.position = 'fixed';
    inputStyle.top = '0';
    inputStyle.left = '0';
    inputStyle.width = '1px';
    inputStyle.height = '1px';
    inputStyle.padding = '0';
    inputStyle.margin = '0';
    inputStyle.border = '0';
    inputStyle.outline = 'none';
    inputStyle.background = 'transparent';
    inputStyle.color = 'transparent';
    inputStyle.caretColor = 'transparent';
    inputStyle.fontSize = '16px'; // >= 16px avoids iOS focus zoom
    inputStyle.pointerEvents = 'none';

    this.#parts = {
      backgrounds: resolveBackgrounds(['normal', 'hovered', 'disabled'], resolved.normal, resolved),
      caret,
      input,
      placeholderText,
      row,
      valueText,
    };
    this.#runtime = {
      blinkTick: 0,
      caretOffset: -1,
      caretWidth: -1,
      isEditing: false,
      isOwnPointerDown: false,
      value,
    };

    adoptDetachedBackgrounds(this.#disposables.instance, Object.values(this.#parts.backgrounds));

    this.view = new LayoutContainer({background: this.#parts.backgrounds.normal});

    attachWidgetInteraction(this.view, {
      cursor: 'text',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        swapBackground(this.view, this.#parts.backgrounds[state]);
      },
    });

    this.view.addChild(row);

    // Cancel the native pointerdown so the browser does not generate the
    // compatibility mouse events whose default action moves focus to the canvas,
    // which would immediately blur the hidden input right after startEditing() and close
    // the soft keyboard. (Per the Pointer Events spec, canceling pointerdown
    // suppresses the compatibility mouse events.)
    this.view.on('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.#runtime.isOwnPointerDown = true;
    });

    // Use pointerup rather than pointertap: on touch, a tap with slight finger
    // movement is classified as a drag and pointertap never fires, so the field
    // would never focus and the soft keyboard would never open.
    this.view.on('pointerup', (event) => {
      event.stopPropagation();
      this.startEditing();
    });

    // The view is a row (@pixi/layout defaults flexDirection to 'row'), so
    // justifyContent is the horizontal axis. Typed text reads left-to-right from
    // the field's left edge, as text fields customarily do; only the vertical
    // axis is centered. Centering the main axis instead would drift the value
    // sideways on every keystroke whenever the field is wider than its content.
    this.view.layout = {
      justifyContent: 'flex-start',
      alignItems: 'center',
      ...this.#config.layout,
    };

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
    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        this.#onEnter?.(this);
        this.stopEditing();
      } else if (event.key === 'Escape') {
        this.stopEditing();
      }
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeyDown);

    this.#disposables.instance.defer(() => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeyDown);
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

  // Navigation focus and editing focus are distinct: activating the
  // navigation-focused field is what starts editing.
  /** TBD */
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.startEditing();
  }

  /** Destroys the instance. */
  destroy() {
    this.stopEditing();
    this.#disposables.instance.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#state = 'disabled';

    swapBackground(this.view, this.#parts.backgrounds.disabled);

    setInteractionEnabled(this.view, false);
    this.stopEditing();
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';

    swapBackground(this.view, this.#parts.backgrounds.normal);

    setInteractionEnabled(this.view, true, 'text');
  }

  /** TBD */
  startEditing(): this {
    if (this.#runtime.isEditing) {
      return this;
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

      this.stopEditing();
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

    return this;
  }

  /** TBD */
  stopEditing(): this {
    if (!this.#runtime.isEditing) {
      return this;
    }

    this.#runtime.isEditing = false;

    // Disposed before blur() below, so the blur it raises finds no listener.
    this.#disposables.editing?.dispose();
    this.#disposables.editing = null;

    this.#parts.input.blur();

    this.#refresh();

    return this;
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

  /** TBD */
  #syncCaret() {
    // The hidden input owns the cursor: arrow keys, Home/End, word jumps and IME
    // all move it without changing the value, so there is no event to hook —
    // reading the selection back each frame is what catches every one of them.
    let index = this.#parts.input.selectionStart ?? this.#runtime.value.length;
    let offset = this.#parts.valueText.measureWidth(this.#runtime.value.slice(0, index));
    // The font leaves a single 1 art px column between glyphs and its descenders
    // fill the line box, so a bar caret has nowhere to sit without touching ink.
    // The caret is a block over the character's cell instead, the way a
    // terminal's is. Past the last character there is no cell to cover, so it
    // falls back to a space's advance.
    let width = this.#parts.valueText.measureWidth(this.#runtime.value[index] ?? ' ');

    if (offset !== this.#runtime.caretOffset || width !== this.#runtime.caretWidth) {
      this.#positionCaret(offset, width);
    }
  }
}
