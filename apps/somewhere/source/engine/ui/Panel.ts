import * as pixi from 'pixi.js';

export type PanelOptions = {
  children: pixi.Container[];
  layout?: pixi.Container['layout'];
};

export class Panel {
  readonly view: pixi.Container = new pixi.Container();

  constructor({children, layout}: PanelOptions) {
    for (let child of children) {
      this.view.addChild(child);
    }

    if (layout !== undefined) {
      this.view.layout = layout;
    }
  }
}
