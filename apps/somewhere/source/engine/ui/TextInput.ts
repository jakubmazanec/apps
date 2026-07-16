import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachHitArea} from './attachHitArea.js';
import {attachHoverHandlers} from './attachHoverHandlers.js';
import {type Focusable} from './Focusable.js';
import {swapBackground} from './swapBackground.js';
import {Text} from './Text.js';

export type TextInputState = 'disabled' | 'hovered' | 'normal';

export type TextInputOptions = {
  backgrounds: {
    normal: pixi.Container;
    hovered?: pixi.Container;
    disabled?: pixi.Container;
  };
  value?: string;
  placeholder?: string;
  maxLength?: number;
  container: HTMLElement;
  fontFamily: string;
  fontSize: number;
  fill?: pixi.ColorSource;
  onChange?: (input: TextInput) => void;
  onEnter?: (input: TextInput) => void;
  layout?: pixi.ContainerOptions['layout'];
};

// 1 art px — part of the migration's flagged caret change (grid-consistent,
// slightly thicker at ×4 than the old 2 device px), as is the 1-art-px margin.
const CARET_WIDTH = 1;

export class TextInput implements Focusable {
  readonly view: LayoutContainer;

  readonly #onChange?: (input: TextInput) => void;
  readonly #onEnter?: (input: TextInput) => void;

  readonly #container: HTMLElement;
  readonly #maxLength?: number;
  readonly #row: LayoutContainer;
  readonly #valueText: Text;
  readonly #placeholderText: Text;
  readonly #caret: pixi.Sprite;
  readonly #input: HTMLInputElement;
  readonly #disposables = new DisposableStack();
  readonly #backgrounds: Record<TextInputState, pixi.Container>;

  #state: TextInputState = 'normal';
  #value: string;
  #isEditing = false;
  #isOwnPointerDown = false;

  constructor({
    backgrounds,
    value = '',
    placeholder = '',
    maxLength,
    container,
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

    this.#backgrounds = {
      normal: backgrounds.normal,
      hovered: backgrounds.hovered ?? backgrounds.normal,
      disabled: backgrounds.disabled ?? backgrounds.normal,
    };

    adoptDetachedBackgrounds(this.#disposables, Object.values(this.#backgrounds));

    this.view = new LayoutContainer({background: this.#backgrounds.normal});
    this.view.eventMode = 'static';
    this.view.cursor = 'text';

    attachHitArea(this.view);

    this.#row = new LayoutContainer({});
    this.#row.layout = {flexDirection: 'row', alignItems: 'center'};

    // LayoutContainer makes itself an interactive hit target ('static', for its
    // scroll trackpad), and Pixi takes the canvas cursor from the deepest
    // interactive hit target only; the purely visual row would override the
    // view's 'text' cursor wherever the text covers the field.
    this.#row.eventMode = 'none';
    this.view.addChild(this.#row);

    let style = fill === undefined ? {fontFamily, fontSize} : {fontFamily, fontSize, fill};

    this.#valueText = new Text({text: value, layout: true, ...style});
    this.#placeholderText = new Text({text: placeholder, layout: true, ...style});
    this.#placeholderText.view.alpha = 0.5;

    this.#caret = new pixi.Sprite(pixi.Texture.WHITE);
    this.#caret.tint = fill ?? 0xffffff;
    this.#caret.layout = {width: CARET_WIDTH, height: Math.round(fontSize * 0.8), marginLeft: 1};

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

    attachHoverHandlers(
      this.view,
      () => this.#state,
      (state) => this.#setState(state),
    );

    this.view.layout = {
      justifyContent: 'center',
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

    let tick = 0;
    let blink = (ticker: pixi.Ticker) => {
      if (!this.#isEditing) {
        return;
      }

      tick += ticker.deltaTime;
      this.#caret.alpha = Math.abs(Math.sin(tick * 0.1));
    };

    pixi.Ticker.shared.add(blink);

    this.#disposables.defer(() => {
      pixi.Ticker.shared.remove(blink);
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

    this.#refresh();
  }

  // Closes the editor when a pointerdown lands outside this field. Doubles as the
  // input's own DOM blur handler. A tap on this field's own view sets
  // #isOwnPointerDown first (the view's federated pointerdown runs before this
  // listener), so an in-field tap keeps the edit — and the soft keyboard — alive.
  // As a window pointerdown listener it is attached only while editing (see
  // startEditing/stopEditing), so idle inputs hold no app-wide listeners.
  readonly #handleBlur = () => {
    if (this.#isOwnPointerDown) {
      this.#isOwnPointerDown = false;

      return;
    }

    this.stopEditing();
  };

  get value(): string {
    return this.#value;
  }

  setValue(value: string): this {
    this.#value = this.#maxLength === undefined ? value : value.slice(0, this.#maxLength);
    this.#valueText.setText(this.#value);
    this.#input.value = this.#value;

    this.#refresh();

    return this;
  }

  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  // Navigation focus and editing focus are distinct: activating the
  // navigation-focused field is what starts editing.
  activate() {
    if (this.#state === 'disabled') {
      return;
    }

    this.startEditing();
  }

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

  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#setState('normal');

    this.view.eventMode = 'static';
    this.view.cursor = 'text';
  }

  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setState('disabled');

    this.view.eventMode = 'none';
    this.view.cursor = 'default';
    this.stopEditing();
  }

  destroy() {
    this.stopEditing();
    this.#disposables.dispose();
  }

  #setState(state: TextInputState) {
    let previous = this.#backgrounds[this.#state];
    let next = this.#backgrounds[state];

    this.#state = state;

    if (previous === next) {
      return;
    }

    swapBackground(this.view, previous, next);
  }

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
}
