import * as pixi from 'pixi.js';

export type PanelOptions = {
  children: pixi.Container[];
};

export class Panel {
  readonly view: pixi.Container = new pixi.Container();

  constructor({children}: PanelOptions) {
    for (let child of children) {
      this.view.addChild(child);
    }
  }
}
