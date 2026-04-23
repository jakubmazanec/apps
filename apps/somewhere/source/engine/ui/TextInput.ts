import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './attachWidgetInteraction.js';
import {type Focusable} from './Focusable.js';
import {resolveBackgrounds} from './resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './setInteractionEnabled.js';
import {swapBackground} from './swapBackground.js';
import {Text} from './Text.js';
import {type ThemedOptions} from './UiTheme.js';

export type TextInputState = 'disabled' | 'hovered' | 'normal';

export type TextInputBackgrounds = {
  normal: pixi.Container;
  hovered?: pixi.Container;
  disabled?: pixi.Container;
};

export type TextInputOptions = ThemedOptions<TextInputBackgrounds> & {
  value?: string;
  placeholder?: string;
  maxLength?: number;
  container: HTMLElement;
  role?: 'body' | 'label';
  fontFamily?: string;
  fontSize?: number;
  fill?: pixi.ColorSource;
  onChange?: (input: TextInput) => void;
  onEnter?: (input: TextInput) => void;
  layout?: pixi.ContainerOptions['layout'];
};

// One full blink cycle in ticker frames: ~0.5 s lit, ~0.5 s dark at 60 fps.
const BLINK_PERIOD = 60;

export class TextInput implements Focusable {
  /** TBD */
  readonly view: LayoutContainer;

  /** TBD */
  readonly #backgrounds: Record<TextInputState, pixi.Container>;

  /** TBD */
  #blinkTick = 0;

  /** TBD */
  readonly #caret: pixi.Sprite;

  /** TBD */
  readonly #caretHeight: number;

  // -1 on both until #syncCaret writes the first layout; no measured offset or
  // width can be negative, so the first sync always applies.
  /** TBD */
  #caretOffset = -1;

  /** TBD */
  #caretWidth = -1;

  /** TBD */
  readonly #container: HTMLElement;

  /** TBD */
  readonly #disposables = new DisposableStack();

  /** TBD */
  readonly #input: HTMLInputElement;

  /** TBD */
  #isEditing = false;

  /** TBD */
  #isOwnPointerDown = false;

  /** TBD */
  readonly #maxLength?: number;

  /** TBD */
  readonly #onChange?: (input: TextInput) => void;

  /** TBD */
  readonly #onEnter?: (input: TextInput) => void;

  /** TBD */
  readonly #placeholderText: Text;

  /** TBD */
  readonly #row: LayoutContainer;

  /** TBD */
  #state: TextInputState = 'normal';

  /** TBD */
  #value: string;

  /** TBD */
  readonly #valueText: Text;

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

    this.#container = container;
    this.#value = value;

    if (maxLength !== undefined) {
      this.#maxLength = maxLength;
    }

    let resolved = resolveThemedBackgrounds(
      ['normal', 'hovered', 'disabled'],
      theme?.textInput,
      backgrounds,
    );

    if (resolved.normal === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('TextInput needs a theme or a normal background!');
    }

    this.#backgrounds = resolveBackgrounds(
      ['normal', 'hovered', 'disabled'],
      resolved.normal,
      resolved,
    );

    adoptDetachedBackgrounds(this.#disposables, Object.values(this.#backgrounds));

    this.view = new LayoutContainer({background: this.#backgrounds.normal});

    attachWidgetInteraction(this.view, {
      cursor: 'text',
      getState: () => this.#state,
      setState: (state) => this.#setState(state),
    });

    this.#row = new LayoutContainer({});
    this.#row.layout = {flexDirection: 'row', alignItems: 'center'};

    // LayoutContainer makes itself an interactive hit target ('static', for its
    // scroll trackpad), and Pixi takes the canvas cursor from the deepest
    // interactive hit target only; the purely visual row would override the
    // view's 'text' cursor wherever the text covers the field.
    this.#row.eventMode = 'none';
    this.view.addChild(this.#row);

    // TextInput defaults to 'body' because it renders entered text, not a label.
    let style = theme === undefined ? undefined : theme.text[role ?? 'body'];
    let resolvedFontFamily = fontFamily ?? style?.fontFamily;
    let resolvedFontSize = fontSize ?? style?.fontSize;
    let resolvedFill = fill ?? style?.fill;
    let textStyle = {
      ...(resolvedFontFamily === undefined ? undefined : {fontFamily: resolvedFontFamily}),
      ...(resolvedFontSize === undefined ? undefined : {fontSize: resolvedFontSize}),
      ...(resolvedFill === undefined ? undefined : {fill: resolvedFill}),
    };

    this.#valueText = new Text({text: value, layout: true, ...textStyle});
    this.#placeholderText = new Text({text: placeholder, layout: true, ...textStyle});
    this.#placeholderText.view.alpha = 0.5;

    this.#caret = new pixi.Sprite(pixi.Texture.WHITE);
    this.#caret.tint = resolvedFill ?? 0xffffff;

    // The block covers the character's whole line box, the way a terminal's cell
    // cursor does. Falls back to 0 only in the no-theme, no-explicit-fontSize
    // branch — unreachable through TextInputOptions in practice (the theme, when
    // present, always supplies a fontSize), used here only, not smuggled into
    // the text style above.
    this.#caretHeight = resolvedFontSize ?? 0;

    // Cancel the native pointerdown so the browser does not generate the
    // compatibility mouse events whose default action moves focus to the canvas,
    // which would immediately blur the hidden input right after startEditing() and close
    // the soft keyboard. (Per the Pointer Events spec, canceling pointerdown
    // suppresses the compatibility mouse events.)
    this.view.on('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.#isOwnPointerDown = true;
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
      ...(typeof layout === 'object' ? layout : undefined),
    };

    let input = document.createElement('input');

    input.type = 'text';
    input.value = value;
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.tabIndex = -1;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');

    if (maxLength !== undefined) {
      input.maxLength = maxLength;
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

    this.#input = input;
    this.#container.append(input);

    let handleInput = () => {
      if (this.#state === 'disabled') {
        return;
      }

      let next = input.value;

      if (this.#maxLength !== undefined && next.length > this.#maxLength) {
        next = next.slice(0, this.#maxLength);
        input.value = next;
      }

      this.#value = next;
      this.#valueText.setText(next);
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

    // Keep our state in sync when the input loses focus on its own (e.g. the soft
    // keyboard is dismissed), so the field can be focused again afterwards.
    input.addEventListener('blur', this.#handleBlur);

    this.#disposables.defer(() => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('blur', this.#handleBlur);
      input.remove();
    });

    let update = (ticker: pixi.Ticker) => {
      if (!this.#isEditing) {
        return;
      }

      // Ahead of the advance below, so a caret that moved this frame is lit for
      // the frame it moved on rather than one later.
      this.#syncCaret();

      this.#blinkTick = (this.#blinkTick + ticker.deltaTime) % BLINK_PERIOD;

      // A block covers the character it sits on, so it blinks hard on and off;
      // fading would leave that character half-obscured for most of the cycle.
      this.#caret.alpha = this.#blinkTick < BLINK_PERIOD / 2 ? 1 : 0;
    };

    pixi.Ticker.shared.add(update);

    this.#disposables.defer(() => {
      pixi.Ticker.shared.remove(update);
    });

    // #valueText / #placeholderText / #caret are swapped in and out of #row, so
    // whichever is currently detached would leak under view.destroy({children}).
    this.#disposables.defer(() => {
      this.#row.removeChildren();
      this.#valueText.destroy();
      this.#placeholderText.destroy();
      this.#caret.destroy();
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
    return this.#value;
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

  /** TBD */
  destroy() {
    this.stopEditing();
    this.#disposables.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setState('disabled');

    setInteractionEnabled(this.view, false);
    this.stopEditing();
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#setState('normal');

    setInteractionEnabled(this.view, true, 'text');
  }

  /** TBD */
  setValue(value: string): this {
    this.#value = this.#maxLength === undefined ? value : value.slice(0, this.#maxLength);
    this.#valueText.setText(this.#value);
    this.#input.value = this.#value;

    this.#refresh();

    return this;
  }

  /** TBD */
  startEditing(): this {
    if (this.#isEditing) {
      return this;
    }

    this.#isEditing = true;

    // Watch for an outside tap only while editing, so idle inputs hold no
    // app-wide listeners. Clear the own-pointer flag the opening tap set, so the
    // first outside tap is recognized as outside (the constructor's always-on
    // listener used to clear it; now nothing else does).
    this.#isOwnPointerDown = false;
    globalThis.addEventListener('pointerdown', this.#handleBlur);

    this.#input.value = this.#value;

    let {x, y} = this.view.getGlobalPosition();
    let ratio = window.devicePixelRatio || 1;
    // getGlobalPosition is in renderer (device) pixels relative to the canvas;
    // the input is position: fixed (viewport-relative), so offset by the canvas
    // container's viewport rect and convert device px -> CSS px.
    let rect = this.#container.getBoundingClientRect();

    this.#input.style.left = `${rect.left + x / ratio}px`;
    this.#input.style.top = `${rect.top + y / ratio}px`;

    this.#input.focus({preventScroll: true});

    this.#refresh();

    return this;
  }

  /** TBD */
  stopEditing(): this {
    if (!this.#isEditing) {
      return this;
    }

    this.#isEditing = false;

    globalThis.removeEventListener('pointerdown', this.#handleBlur);

    this.#input.blur();

    this.#refresh();

    return this;
  }

  // Closes the editor when a pointerdown lands outside this field. Doubles as the
  // input's own DOM blur handler. A tap on this field's own view sets
  // #isOwnPointerDown first (the view's federated pointerdown runs before this
  // listener), so an in-field tap keeps the edit — and the soft keyboard — alive.
  // As a window pointerdown listener it is attached only while editing (see
  // startEditing/stopEditing), so idle inputs hold no app-wide listeners.
  /** TBD */
  readonly #handleBlur = () => {
    if (this.#isOwnPointerDown) {
      this.#isOwnPointerDown = false;

      return;
    }

    this.stopEditing();
  };

  /** TBD */
  #positionCaret(offset: number, width: number) {
    this.#caretOffset = offset;
    this.#caretWidth = width;

    // Restart the blink lit. A caret that moved during the dark half would
    // otherwise leave the user hunting for where it went — and since typing
    // moves it too, this also keeps it solid while the user types.
    this.#blinkTick = 0;

    this.#caret.layout = {
      width,
      height: this.#caretHeight,
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
    this.#row.removeChildren();

    if (this.#isEditing) {
      this.#row.addChild(this.#valueText.view, this.#caret);
    } else if (this.#value.length === 0) {
      this.#row.addChild(this.#placeholderText.view);
    } else {
      this.#row.addChild(this.#valueText.view);
    }
  }

  /** TBD */
  #setState(state: TextInputState) {
    this.#state = state;

    swapBackground(this.view, this.#backgrounds[state]);
  }

  /** TBD */
  #syncCaret() {
    // The hidden input owns the cursor: arrow keys, Home/End, word jumps and IME
    // all move it without changing the value, so there is no event to hook —
    // reading the selection back each frame is what catches every one of them.
    let index = this.#input.selectionStart ?? this.#value.length;
    let offset = this.#valueText.measureWidth(this.#value.slice(0, index));
    // The font leaves a single 1 art px column between glyphs and its descenders
    // fill the line box, so a bar caret has nowhere to sit without touching ink.
    // The caret is a block over the character's cell instead, the way a
    // terminal's is. Past the last character there is no cell to cover, so it
    // falls back to a space's advance.
    let width = this.#valueText.measureWidth(this.#value[index] ?? ' ');

    if (offset !== this.#caretOffset || width !== this.#caretWidth) {
      this.#positionCaret(offset, width);
    }
  }
}
