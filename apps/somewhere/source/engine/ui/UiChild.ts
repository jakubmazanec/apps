import type * as pixi from 'pixi.js';

export type UiChild = pixi.Container | {view: pixi.Container};

// A component that exposes the components added to it in a public children
// array. Focus discovery recurses through these, so a focusable is only
// discoverable while it is reachable through component-level addChild calls
// from the screen's UI root; raw Pixi containers are leaves.
export type UiParent = {
  children: UiChild[];
  view: pixi.Container;
};
