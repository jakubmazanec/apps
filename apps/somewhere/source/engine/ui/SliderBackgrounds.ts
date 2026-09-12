import type * as pixi from 'pixi.js';

export type SliderBackgrounds = {
  track: pixi.Container;
  fill: pixi.Container;
  hovered?: pixi.Container | undefined;
  disabled?: pixi.Container | undefined;
};
