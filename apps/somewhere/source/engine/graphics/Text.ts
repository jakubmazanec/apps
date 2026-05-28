import * as pixi from 'pixi.js';

// TODO: support other styling options
export type TextOptions = Pick<pixi.TextStyleOptions, 'fontFamily' | 'fontSize'> & {
  text: string;
  fill?: pixi.ColorSource;
  anchor?: pixi.PointData;
  layout?: pixi.ContainerOptions['layout'];
};

const DEFAULT_ANCHOR: pixi.PointData = {x: 0, y: 0};

export class Text {
  readonly view: pixi.Container = new pixi.Container();

  readonly #sprite: pixi.BitmapText;

  constructor(options: TextOptions) {
    let {text, anchor = DEFAULT_ANCHOR, layout, ...style} = options;

    this.#sprite = new pixi.BitmapText({text, style});

    if (style.fill !== undefined) {
      this.#sprite.alpha = new pixi.Color(style.fill).alpha;
    }

    this.#sprite.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this.#sprite);

    if (layout !== undefined) {
      if (layout === true) {
        this.view.layout = {isLeaf: true};
      } else if (typeof layout === 'object' && layout !== null) {
        this.view.layout = {isLeaf: true, ...layout};
      } else {
        this.view.layout = layout;
      }
    }
  }

  setText(text: string): this {
    this.#sprite.text = text;

    return this;
  }

  setAnchor(anchor: pixi.PointData): this {
    this.#sprite.anchor.set(anchor.x, anchor.y);

    return this;
  }
}
