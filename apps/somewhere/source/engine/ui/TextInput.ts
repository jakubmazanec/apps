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

  private readonly onChange?: (input: TextInput) => void;
  private readonly onEnter?: (input: TextInput) => void;

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
      this.onChange = onChange;
    }

    if (onEnter !== undefined) {
      this.onEnter = onEnter;
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

    this.view.on('pointertap', (event) => {
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

    let input = this.#createInput();

    this.#input = input;
    this.#container.append(input);
    this.#positionInput();
    input.addEventListener('input', this.#handleInput);
    input.addEventListener('keydown', this.#handleKeyDown);
    input.focus();

    pixi.Ticker.shared.add(this.#blink);

    // Defer so the click that focused this field does not immediately blur it.
    setTimeout(() => {
      window.addEventListener('pointerdown', this.#handleOutsidePointerDown);
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
    this.view.destroy();
  }

  #createInput(): HTMLInputElement {
    let input = document.createElement('input');

    input.type = 'text';
    input.value = this.#value;

    if (this.#maxLength !== undefined) {
      input.maxLength = this.#maxLength;
    }

    let {style} = input;

    style.position = 'fixed';
    style.opacity = '0.0000001';
    style.pointerEvents = 'none';
    style.zIndex = '-1';
    style.width = '1px';
    style.height = '1px';
    style.border = '0';
    style.padding = '0';
    style.margin = '0';

    return input;
  }

  #positionInput() {
    if (!this.#input) {
      return;
    }

    let {x, y} = this.view.getGlobalPosition();
    let ratio = window.devicePixelRatio || 1;

    this.#input.style.left = `${x / ratio}px`;
    this.#input.style.top = `${y / ratio}px`;
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
    this.onChange?.(this);
  };

  readonly #handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      this.onEnter?.(this);
      this.blur();
    } else if (event.key === 'Escape') {
      this.blur();
    }
  };

  readonly #handleOutsidePointerDown = () => {
    this.blur();
  };

  readonly #blink = (ticker: pixi.Ticker) => {
    this.#tick += ticker.deltaTime;
    this.#caret.alpha = Math.abs(Math.sin(this.#tick * 0.1));
  };
}
