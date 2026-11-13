import type * as pixi from 'pixi.js';

export type UiComponent = {destroy?: () => void; view: pixi.Container};
