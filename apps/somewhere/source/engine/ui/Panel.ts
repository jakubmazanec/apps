import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type UiChild, type UiParent} from './UiChild.js';

export type PanelOptions = {
  background?: pixi.Container;
  children?: UiChild[];
  layout?: pixi.ContainerOptions['layout'];
};

export class Panel implements UiParent {
  readonly view: LayoutContainer;
  readonly children: UiChild[] = [];

  readonly #disposables = new DisposableStack();

  constructor({background, children, layout}: PanelOptions) {
    this.view = new LayoutContainer(background === undefined ? {} : {background});

    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout = {
      ...(typeof layout === 'object' ? layout : undefined),
    };

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  addChild(...children: UiChild[]): this {
    for (let child of children) {
      this.children.push(child);
      this.view.addChild('view' in child ? child.view : child);
    }

    return this;
  }

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

  destroy() {
    this.#disposables.dispose();
  }
}
