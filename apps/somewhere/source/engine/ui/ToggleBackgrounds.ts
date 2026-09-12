import type * as pixi from 'pixi.js';

export type ToggleBackgrounds = {
  unchecked: pixi.Container;
  checked: pixi.Container;
  hovered?: pixi.Container | undefined;
  hoveredChecked?: pixi.Container | undefined;
  disabled?: pixi.Container | undefined;
  disabledChecked?: pixi.Container | undefined;
};
