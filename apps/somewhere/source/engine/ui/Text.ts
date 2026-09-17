import * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type TextConfig} from './TextConfig.js';
import {type TextOptions} from './TextOptions.js';
import {type TextParts} from './TextParts.js';

const DEFAULT_ANCHOR: pixi.PointData = {x: 0, y: 0} as const;
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

  constructor({
    text,
    theme,
    role = 'label',
    anchor = DEFAULT_ANCHOR,
    layout,
    ...style
  }: TextOptions) {
    this.#config = {theme};
    this.#parts = {
      content: new pixi.BitmapText({
        text,
        style:
          this.#config.theme?.text[role] === undefined ?
            style
          : {...this.#config.theme.text[role], ...style},
      }),
    };

    this.#parts.content.anchor.set(anchor.x, anchor.y);
    this.view.addChild(this.#parts.content);

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

  /** Returns the text style. */
  get style(): pixi.TextStyle {
    return this.#parts.content.style;
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** Sets the anchor. */
  setAnchor(anchor: pixi.PointData): this {
    this.#parts.content.anchor.set(anchor.x, anchor.y);

    return this;
  }

  /** Sets the text. */
  setText(text: string): this {
    this.#parts.content.text = text;

    return this;
  }
}
