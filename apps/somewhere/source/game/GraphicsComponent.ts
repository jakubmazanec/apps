import type * as pixi from 'pixi.js';

import {Component} from '../engine/ecs/Component.js';
import {Sprite} from '../engine/graphics/Sprite.js';
import {assets} from './assets.js';

export type GraphicsComponentOptions = {
  spriteOptions: {assetName: string; character?: string; spriteNames: readonly string[]};
  boundingBox: pixi.Rectangle;
  // Render in the map's topmost layer (above the overhead "air" layers) instead of the default
  // entity layer. Used for foreground effects like the wall-hit spark.
  overlay?: boolean;
  // Whether graphicsSystem drives the sprite through the eight-name
  // walking/standing directional convention. Non-character visuals (the
  // wall-hit spark) opt out and manage their own single animation.
  directional?: boolean;
};

export class GraphicsComponent extends Component {
  boundingBox: pixi.Rectangle;
  directional: boolean;
  overlay: boolean;
  sprite: Sprite;
  // Bare names travel from spawn to show() (pickDirectionalSpriteName,
  // playerActionSystem); this is the one place that knows which character's
  // names they actually are, so callers concatenate it back on at show()
  // time instead of threading the character name through.
  spriteNamePrefix: string;

  constructor({
    spriteOptions,
    boundingBox,
    overlay = false,
    directional = true,
  }: GraphicsComponentOptions) {
    super();

    this.spriteNamePrefix = spriteOptions.character ? `${spriteOptions.character}-` : '';
    this.sprite = new Sprite({
      // Typed asset keys are out of scope: assetName is a plain string here, while
      // spriteset() takes the manifest key union, so widen rather than thread types.
      spriteset: assets.spriteset(spriteOptions.assetName as never),
      spriteNames: spriteOptions.spriteNames.map((name) => this.spriteNamePrefix + name),
    });
    this.boundingBox = boundingBox;
    this.overlay = overlay;
    this.directional = directional;
  }
}
