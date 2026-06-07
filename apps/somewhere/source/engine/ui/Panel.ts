import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type UiChild} from './UiChild.js';

export type PanelOptions = {
  background?: pixi.Container;
  children?: UiChild[];
  layout?: pixi.ContainerOptions['layout'];
};

export class Panel {
  readonly view: LayoutContainer;

  readonly #disposables = new DisposableStack();

  constructor({background, children, layout}: PanelOptions) {
    this.view = new LayoutContainer(background === undefined ? {} : {background});

    if (children !== undefined) {
      this.addChild(...children);
    }

    if (layout !== undefined) {
      this.view.layout = layout;
    }

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

  removeChild(...children: UiChild[]): this {
    for (let child of children) {
      this.view.removeChild('view' in child ? child.view : child);
    }

    return this;
  }

  destroy() {
    this.#disposables.dispose();
  }
}
