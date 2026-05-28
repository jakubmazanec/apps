import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

export type PanelOptions = {
  background?: pixi.Container;
  children: pixi.Container[];
  layout?: pixi.ContainerOptions['layout'];
};

export class Panel {
  readonly view: LayoutContainer;

  constructor({background, children, layout}: PanelOptions) {
    this.view = new LayoutContainer(background === undefined ? {} : {background});

    for (let child of children) {
      this.view.addChild(child);
    }

    if (layout !== undefined) {
      this.view.layout = layout;
    }
  }
}
