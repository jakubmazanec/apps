import * as pixi from 'pixi.js';

export type ButtonState = 'disabled' | 'hover' | 'normal' | 'pressed';

export type ButtonOptions = {
  sprites: {
    normal: pixi.Container;
    hover?: pixi.Container;
    pressed?: pixi.Container;
    disabled?: pixi.Container;
  };
  onClick?: (button: Button) => void;
};

export class Button {
  readonly view: pixi.Container = new pixi.Container();

  #state: ButtonState = 'normal';

  readonly #sprites: Record<ButtonState, pixi.Container>;
  private readonly onClick?: (button: Button) => void;

  constructor({sprites, onClick}: ButtonOptions) {
    if (onClick !== undefined) {
      this.onClick = onClick;
    }

    this.#sprites = {
      normal: sprites.normal,
      hover: sprites.hover ?? sprites.normal,
      pressed: sprites.pressed ?? sprites.normal,
      disabled: sprites.disabled ?? sprites.normal,
    };

    for (let sprite of new Set(Object.values(this.#sprites))) {
      sprite.visible = false;
      this.view.addChild(sprite);
    }
    this.#sprites.normal.visible = true;

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';

    this.view.on('pointerover', () => {
      if (this.#state === 'disabled' || this.#state === 'hover') {
        return;
      }

      this.#sprites[this.#state].visible = false;
      this.#state = 'hover';
      this.#sprites.hover.visible = true;
    });

    this.view.on('pointerout', () => {
      if (this.#state === 'disabled' || this.#state === 'normal') {
        return;
      }

      this.#sprites[this.#state].visible = false;
      this.#state = 'normal';
      this.#sprites.normal.visible = true;
    });

    this.view.on('pointerdown', () => {
      if (this.#state === 'disabled' || this.#state === 'pressed') {
        return;
      }

      this.#sprites[this.#state].visible = false;
      this.#state = 'pressed';
      this.#sprites.pressed.visible = true;
    });

    this.view.on('pointerup', () => {
      if (this.#state !== 'pressed') {
        return;
      }

      this.#sprites.pressed.visible = false;
      this.#state = 'hover';
      this.#sprites.hover.visible = true;
    });

    this.view.on('pointertap', (event) => {
      if (this.#state !== 'disabled') {
        event.stopPropagation();
        this.onClick?.(this);
      }
    });
  }

  get state(): ButtonState {
    return this.#state;
  }

  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#sprites.disabled.visible = false;
    this.#state = 'normal';
    this.#sprites.normal.visible = true;

    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
  }

  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#sprites[this.#state].visible = false;
    this.#state = 'disabled';
    this.#sprites.disabled.visible = true;

    this.view.eventMode = 'none';
    this.view.cursor = 'default';
  }
}
