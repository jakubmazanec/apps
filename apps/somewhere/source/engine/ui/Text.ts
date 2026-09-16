import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type TextConfig} from './TextConfig.js';
import {type TextOptions} from './TextOptions.js';
import {type TextParts} from './TextParts.js';

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
  /** View. */
  readonly view: pixi.Container = new pixi.Container();

  /** Object for storing config. */
  readonly #config: TextConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: TextParts;

  constructor(options: TextOptions) {
    let {text, theme, role = 'label', anchor = DEFAULT_ANCHOR, layout, ...style} = options;
    let themeStyle = theme?.text[role];

    this.#config = {theme};
    this.#parts = {
      sprite: new pixi.BitmapText({
        text,
        style: themeStyle === undefined ? style : {...themeStyle, ...style},
      }),
    };

    this.#parts.sprite.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this.#parts.sprite);

    if (layout !== undefined) {
      if (layout === true) {
        this.view.layout = {...LEAF_LAYOUT};
      } else if (typeof layout === 'object' && layout !== null) {
        this.view.layout = {...LEAF_LAYOUT, ...layout};
      } else {
        this.view.layout = layout;
      }
    }

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get style(): pixi.TextStyle {
    return this.#parts.sprite.style;
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** TBD */
  measureWidth(text: string): number {
    // measureText returns the width in the font's own measurement units, which
    // BitmapText scales by `scale` to reach the style's font size (see its
    // updateBounds). trimEnd is off because it would drop a trailing space's
    // advance, and a caret has to move when one is typed.
    let {width, scale} = pixi.BitmapFontManager.measureText(text, this.#parts.sprite.style, false);

    return width * scale;
  }

  /** TBD */
  setAnchor(anchor: pixi.PointData): this {
    this.#parts.sprite.anchor.set(anchor.x, anchor.y);

    return this;
  }

  /** TBD */
  setText(text: string): this {
    this.#parts.sprite.text = text;

    return this;
  }
}
