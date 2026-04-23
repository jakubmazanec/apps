import * as pixi from 'pixi.js';

import {type UiTheme} from './UiTheme.js';

// TODO: support other styling options
export type TextOptions = Pick<
  pixi.TextStyleOptions,
  // breakWords/wordWrap/wordWrapWidth are honored by pixi's own bitmap-text layout
  // (getBitmapTextLayout), so they need no engine-side wrapping pass; the dialogue's
  // wrapText exists for a different job (a length-preserving wrap the typewriter can index).
  'breakWords' | 'fontFamily' | 'fontSize' | 'wordWrap' | 'wordWrapWidth'
> & {
  text: string;
  theme?: UiTheme;
  // Which theme.text style applies. Labels are the common case.
  role?: 'body' | 'label';
  fill?: pixi.ColorSource;
  anchor?: pixi.PointData;
  layout?: pixi.ContainerOptions['layout'];
};

const DEFAULT_ANCHOR: pixi.PointData = {x: 0, y: 0};
// A layout leaf is measured by its own bounds, but @pixi/layout then fits it to
// the box yoga computed: objectFit defaults to 'fill', which SCALES the glyphs
// by box/bounds on each axis, and objectPosition defaults to 'center', which
// re-centers them inside the box. The box comes from the leaf's intrinsic size,
// which LayoutSystem re-measures on a ~100 ms throttle, so text that changes
// every frame (the dialogue typewriter) renders most frames against a stale
// box: squashed to a fractional width and drifting. The font has one size and
// must render 1:1, so the leaf opts out of both.
const LEAF_LAYOUT = {isLeaf: true, objectFit: 'none', objectPosition: 'left top'} as const;

export class Text {
  /** TBD */
  readonly view: pixi.Container = new pixi.Container();

  /** TBD */
  readonly #disposables = new DisposableStack();

  /** TBD */
  readonly #sprite: pixi.BitmapText;

  constructor(options: TextOptions) {
    let {text, theme, role = 'label', anchor = DEFAULT_ANCHOR, layout, ...style} = options;
    let themeStyle = theme?.text[role];

    this.#sprite = new pixi.BitmapText({
      text,
      style: themeStyle === undefined ? style : {...themeStyle, ...style},
    });

    this.#sprite.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this.#sprite);

    if (layout !== undefined) {
      if (layout === true) {
        this.view.layout = {...LEAF_LAYOUT};
      } else if (typeof layout === 'object' && layout !== null) {
        this.view.layout = {...LEAF_LAYOUT, ...layout};
      } else {
        this.view.layout = layout;
      }
    }

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get style(): pixi.TextStyle {
    return this.#sprite.style;
  }

  /** TBD */
  destroy() {
    this.#disposables.dispose();
  }

  /** TBD */
  measureWidth(text: string): number {
    // measureText returns the width in the font's own measurement units, which
    // BitmapText scales by `scale` to reach the style's font size (see its
    // updateBounds). trimEnd is off because it would drop a trailing space's
    // advance, and a caret has to move when one is typed.
    let {width, scale} = pixi.BitmapFontManager.measureText(text, this.#sprite.style, false);

    return width * scale;
  }

  /** TBD */
  setAnchor(anchor: pixi.PointData): this {
    this.#sprite.anchor.set(anchor.x, anchor.y);

    return this;
  }

  /** TBD */
  setText(text: string): this {
    this.#sprite.text = text;

    return this;
  }
}
