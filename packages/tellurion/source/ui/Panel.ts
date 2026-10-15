import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {disposeChildren} from './internals/disposeChildren.js';
import {resolveThemeBackgrounds} from './internals/resolveThemeBackgrounds.js';
import {resolveView} from './internals/resolveView.js';
import {type PanelConfig} from './PanelConfig.js';
import {type PanelOptions} from './PanelOptions.js';
import {type PanelParts} from './PanelParts.js';
import {type UiChild, type UiParent} from './UiChild.js';

import '@pixi/layout';

export class Panel implements UiParent {
  /** Children. */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: PanelConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: PanelParts;

  constructor({backgrounds, theme, children, layout}: PanelOptions) {
    this.#config = {theme};
    this.#parts = resolveThemeBackgrounds(['background'], this.#config.theme?.panel, backgrounds);
    this.view = new LayoutContainer({background: this.#parts.background});

    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout = {...this.#config.theme?.panel.layout, ...layout};

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
    disposeChildren(this.children, this.#disposables.instance);
  }

  /** Adds children to the panel's view. */
  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild(resolveView(child));
    }

    return this;
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** Removes children from the panel's view. */
  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      let index = this.children.indexOf(child);

      if (index !== -1) {
        this.children.splice(index, 1);
      }

      this.view.removeChild(resolveView(child));
    }

    return this;
  }
}
