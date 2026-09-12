import {LayoutContainer} from '@pixi/layout/components';

import {type Disposables} from '../utilities/Disposables.js';
import {createBackground} from './internals/createBackground.js';
import {type PanelOptions} from './PanelOptions.js';
import {type UiChild, type UiParent} from './UiChild.js';

export class Panel implements UiParent {
  /** TBD */
  readonly children: UiChild[] = [];

  /** View. */
  readonly view: LayoutContainer;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  constructor({background, theme, children, layout}: PanelOptions) {
    let resolved = background ?? (theme && createBackground(theme.panel.background));

    this.view = new LayoutContainer(resolved === undefined ? {} : {background: resolved});

    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout = {
      ...(typeof layout === 'object' ? layout : undefined),
    };

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
