import * as pixi from 'pixi.js';

import {SCALE} from '../constants.js';

// TODO: support other styling options
export type TextOptions = Pick<pixi.TextStyleOptions, 'fontFamily' | 'fontSize'> & {
  text: string;
  fill?: pixi.ColorSource;
  outlineColor?: pixi.ColorSource;
  shadowColor?: pixi.ColorSource;
  shadowOffset?: pixi.PointData;
  anchor?: pixi.PointData;
};

const DEFAULT_ANCHOR: pixi.PointData = {x: 0, y: 0};
const DEFAULT_SHADOW_OFFSET: pixi.PointData = {x: 1, y: 1};

const OUTLINE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export class Text extends pixi.Container {
  readonly #layers: pixi.BitmapText[] = [];

  constructor(options: TextOptions) {
    super();

    let {
      text,
      outlineColor,
      shadowColor,
      shadowOffset = DEFAULT_SHADOW_OFFSET,
      anchor = DEFAULT_ANCHOR,
      ...style
    } = options;

    if (shadowColor !== undefined) {
      let shadow = new pixi.BitmapText({text, style: {...style, fill: shadowColor}});

      shadow.x = shadowOffset.x;
      shadow.y = shadowOffset.y;
      shadow.alpha = new pixi.Color(shadowColor).alpha; // BitmapText ignores alpha channel, only the RGB channels are used, so instead we set the alpha directly.

      this.#layers.push(shadow);
    }

    if (outlineColor !== undefined) {
      let outlineAlpha = new pixi.Color(outlineColor).alpha;

      for (let [dx, dy] of OUTLINE_OFFSETS) {
        let outline = new pixi.BitmapText({text, style: {...style, fill: outlineColor}});

        outline.x = dx;
        outline.y = dy;
        outline.alpha = outlineAlpha;

        this.#layers.push(outline);
      }
    }

    let main = new pixi.BitmapText({text, style});

    if (style.fill !== undefined) {
      main.alpha = new pixi.Color(style.fill).alpha;
    }

    this.#layers.push(main);

    for (let layer of this.#layers) {
      layer.anchor.set(anchor.x, anchor.y);
      this.addChild(layer);
    }

    this.scale.set(SCALE);
  }

  setText(text: string): this {
    for (let layer of this.#layers) {
      layer.text = text;
    }

    return this;
  }

  setAnchor(anchor: pixi.PointData): this {
    for (let layer of this.#layers) {
      layer.anchor.set(anchor.x, anchor.y);
    }

    return this;
  }
}
