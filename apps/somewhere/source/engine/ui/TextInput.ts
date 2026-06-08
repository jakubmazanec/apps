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
  readonly #input: HTMLInputElement;
  readonly #disposables = new DisposableStack();

  #value: string;
  #focused = false;

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
        this.blur();
      } else if (event.key === 'Escape') {
        this.blur();
      }
    };

    // TODO: remove when linter config contains fix for this: https://github.com/sindresorhus/eslint-plugin-unicorn/issues/2088
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleBlur = () => {
      this.blur();
    };

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeyDown);

    // Keep our state in sync when the input loses focus on its own (e.g. the soft
    // keyboard is dismissed), so the field can be focused again afterwards.
    input.addEventListener('blur', handleBlur);

    this.#disposables.defer(() => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeyDown);
      input.removeEventListener('blur', handleBlur);
      input.remove();
    });

    // Stay attached for the component lifetime; blur() self-guards on #focused, so
    // this is a no-op until the field is focused. The tap that focuses the field
    // fires pointerdown while #focused is still false (focus happens on pointerup),
    // so it does not immediately blur the field. This replaces an earlier
    // focus-time setTimeout whose timer id was never stored and so could never be
    // cleared.
    globalThis.addEventListener('pointerdown', handleBlur);

    this.#disposables.defer(() => {
      globalThis.removeEventListener('pointerdown', handleBlur);
    });

    let tick = 0;
    let blink = (ticker: pixi.Ticker) => {
      if (!this.#focused) {
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

  focus(): this {
    if (this.#focused) {
      return this;
    }

    this.#focused = true;

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

  blur(): this {
    if (!this.#focused) {
      return this;
    }

    this.#focused = false;

    this.#input.blur();

    this.#refresh();

    return this;
  }

  destroy() {
    this.blur();
    this.#disposables.dispose();
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
}
