import * as pixi from 'pixi.js';

import {type UiChild} from './UiChild.js';

export type ContainerOptions = {
  children?: UiChild[];
  layout?: pixi.ContainerOptions['layout'];
};

export class Container {
  readonly view: pixi.Container = new pixi.Container();

  constructor({children, layout}: ContainerOptions) {
    if (children !== undefined) {
      this.addChild(...children);
    }

    this.view.layout =
      typeof layout === 'object' && layout !== null ?
        {flexDirection: 'row', alignItems: 'center', ...layout}
      : {flexDirection: 'row', alignItems: 'center'};
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
}
