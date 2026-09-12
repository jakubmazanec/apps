import type * as pixi from 'pixi.js';

export type TextInputBackgrounds = {
  normal: pixi.Container;
  hovered?: pixi.Container | undefined;
  disabled?: pixi.Container | undefined;
};
