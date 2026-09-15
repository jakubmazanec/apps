import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {createBackground} from './internals/createBackground.js';
import {type PanelConfig} from './PanelConfig.js';
import {type PanelOptions} from './PanelOptions.js';
import {type PanelParts} from './PanelParts.js';
import {type UiChild, type UiParent} from './UiChild.js';

export class Panel implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: PanelConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: PanelParts;

  constructor({background, theme, children, layout}: PanelOptions) {
    this.#config = {layout: typeof layout === 'object' ? layout : undefined, theme};
    this.#parts = {
      background:
        background ?? (this.#config.theme && createBackground(this.#config.theme.panel.background)),
    };

    this.view = new LayoutContainer(
      this.#parts.background === undefined ? {} : {background: this.#parts.background},
    );

    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout = {...this.#config.layout};

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

  /** Destroys the instance. */
  destroy() {
    for (let child of this.children) {
      if ('view' in child) {
        child.destroy?.();
      }
    }

    this.#disposables.instance.dispose();
  }

  /** TBD */
  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }
}
