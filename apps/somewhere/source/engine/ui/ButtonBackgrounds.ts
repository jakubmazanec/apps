import type * as pixi from 'pixi.js';

export type ButtonBackgrounds = {
  normal: pixi.Container;
  hovered?: pixi.Container | undefined;
  active?: pixi.Container | undefined;
  disabled?: pixi.Container | undefined;
};
