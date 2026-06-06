import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';

import {Text} from './Text.js';

export type TextInputOptions = {
  background: pixi.Container;
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

const CARET_WIDTH = 2;

export class TextInput {
  readonly view: LayoutContainer;

  readonly #onChange?: (input: TextInput) => void;
  readonly #onEnter?: (input: TextInput) => void;

  readonly #container: HTMLElement;
  readonly #maxLength?: number;
  readonly #row: LayoutContainer;
  readonly #valueText: Text;
  readonly #placeholderText: Text;
  readonly #caret: pixi.Sprite;

  #value: string;
  #focused = false;
  #tick = 0;
  #input: HTMLInputElement | undefined = undefined;

  constructor({
    background,
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

    this.view = new LayoutContainer({background});
    this.view.eventMode = 'static';
    this.view.cursor = 'text';

    this.#row = new LayoutContainer({});
    this.#row.layout = {flexDirection: 'row', alignItems: 'center'};
    this.view.addChild(this.#row);

    let style = fill === undefined ? {fontFamily, fontSize} : {fontFamily, fontSize, fill};

    this.#valueText = new Text({text: value, layout: true, ...style});
    this.#placeholderText = new Text({text: placeholder, layout: true, ...style});
    this.#placeholderText.view.alpha = 0.5;

    this.#caret = new pixi.Sprite(pixi.Texture.WHITE);
    this.#caret.tint = fill ?? 0xffffff;
    this.#caret.layout = {width: CARET_WIDTH, height: Math.round(fontSize * 0.8), marginLeft: 2};

    // Cancel the native pointerdown so the browser does not generate the
    // compatibility mouse events whose default action moves focus to the canvas,
    // which would immediately blur the hidden input right after focus() and close
    // the soft keyboard. (Per the Pointer Events spec, canceling pointerdown
    // suppresses the compatibility mouse events.)
    this.view.on('pointerdown', (event) => {
      event.stopPropagation();
      event.preventDefault();
    });

    // Use pointerup rather than pointertap: on touch, a tap with slight finger
    // movement is classified as a drag and pointertap never fires, so the field
    // would never focus and the soft keyboard would never open.
    this.view.on('pointerup', (event) => {
      event.stopPropagation();
      this.focus();
    });

    if (layout !== undefined) {
      this.view.layout = layout;
    }

    this.#refresh();
  }

  get value(): string {
    return this.#value;
  }

  setValue(value: string): this {
    this.#value = this.#maxLength === undefined ? value : value.slice(0, this.#maxLength);
    this.#valueText.setText(this.#value);

    if (this.#input) {
      this.#input.value = this.#value;
    }

    this.#refresh();

    return this;
  }

  focus(): this {
    if (this.#focused) {
      return this;
    }

    this.#focused = true;

    let input = document.createElement('input');

    input.type = 'text';
    input.value = this.#value;
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('autocapitalize', 'none');

    if (this.#maxLength !== undefined) {
      input.maxLength = this.#maxLength;
    }

    let {style} = input;

    // Keep the element genuinely present and focusable so mobile opens the soft
    // keyboard, but make it visually invisible via transparent colors rather than
    // display:none / visibility:hidden / opacity:0 / z-index:-1, all of which can
    // stop Android from opening the keyboard. pointerEvents is 'none' so taps
    // always route through the Pixi view, never this element.
    style.position = 'fixed';
    style.top = '0';
    style.left = '0';
    style.width = '1px';
    style.height = '1px';
    style.padding = '0';
    style.margin = '0';
    style.border = '0';
    style.outline = 'none';
    style.background = 'transparent';
    style.color = 'transparent';
    style.caretColor = 'transparent';
    style.fontSize = '16px'; // >= 16px avoids iOS focus zoom
    style.pointerEvents = 'none';

    this.#input = input;
    this.#container.append(input);

    let {x, y} = this.view.getGlobalPosition();
    let ratio = window.devicePixelRatio || 1;

    // getGlobalPosition is in renderer (device) pixels relative to the canvas;
    // the input is position: fixed (viewport-relative), so offset by the canvas
    // container's viewport rect and convert device px -> CSS px.
    let rect = this.#container.getBoundingClientRect();

    style.left = `${rect.left + x / ratio}px`;
    style.top = `${rect.top + y / ratio}px`;

    input.addEventListener('input', this.#handleInput);
    input.addEventListener('keydown', this.#handleKeyDown);
    input.addEventListener('blur', this.#handleInputBlur);
    input.focus({preventScroll: true});

    pixi.Ticker.shared.add(this.#blink);

    // Defer so the click that focused this field does not immediately blur it.
    setTimeout(() => {
      // Guard against focus() -> blur()/destroy() within the same tick, which
      // would otherwise attach a global listener that is never removed.
      if (this.#focused) {
        window.addEventListener('pointerdown', this.#handleOutsidePointerDown);
      }
    }, 0);

    this.#refresh();

    return this;
  }

  blur(): this {
    if (!this.#focused) {
      return this;
    }

    this.#focused = false;

    pixi.Ticker.shared.remove(this.#blink);
    window.removeEventListener('pointerdown', this.#handleOutsidePointerDown);

    if (this.#input) {
      this.#input.removeEventListener('input', this.#handleInput);
      this.#input.removeEventListener('keydown', this.#handleKeyDown);
      this.#input.removeEventListener('blur', this.#handleInputBlur);
      this.#input.blur();
      this.#input.remove();
      this.#input = undefined;
    }

    this.#tick = 0;
    this.#refresh();

    return this;
  }

  destroy() {
    this.blur();

    // #valueText / #placeholderText / #caret are swapped in and out of #row, so
    // whichever is currently detached would leak under view.destroy({children}).
    this.#row.removeChildren();
    this.#valueText.destroy();
    this.#placeholderText.destroy();
    this.#caret.destroy();

    this.view.destroy({children: true});
  }

  #refresh() {
    this.#row.removeChildren();

    if (this.#focused) {
      this.#row.addChild(this.#valueText.view, this.#caret);
    } else if (this.#value.length === 0) {
      this.#row.addChild(this.#placeholderText.view);
    } else {
      this.#row.addChild(this.#valueText.view);
    }
  }

  readonly #handleInput = () => {
    let next = this.#input?.value ?? '';

    if (this.#maxLength !== undefined && next.length > this.#maxLength) {
      next = next.slice(0, this.#maxLength);

      if (this.#input) {
        this.#input.value = next;
      }
    }

    this.#value = next;
    this.#valueText.setText(next);
    this.#onChange?.(this);
  };

  readonly #handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      this.#onEnter?.(this);
      this.blur();
    } else if (event.key === 'Escape') {
      this.blur();
    }
  };

  readonly #handleOutsidePointerDown = () => {
    this.blur();
  };

  // Keep our state in sync when the input loses focus on its own (e.g. the soft
  // keyboard is dismissed), so the field can be focused again afterwards.
  readonly #handleInputBlur = () => {
    this.blur();
  };

  readonly #blink = (ticker: pixi.Ticker) => {
    this.#tick += ticker.deltaTime;
    this.#caret.alpha = Math.abs(Math.sin(this.#tick * 0.1));
  };
}
