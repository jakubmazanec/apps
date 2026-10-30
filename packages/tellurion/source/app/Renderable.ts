import type * as pixi from 'pixi.js';

export type Renderable = {
  view: pixi.Container;
  update: (ticker: pixi.Ticker) => void;
};
