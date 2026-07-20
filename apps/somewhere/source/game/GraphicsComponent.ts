import type * as pixi from 'pixi.js';

import {Component} from '../engine/ecs/Component.js';
import {Sprite, type SpriteOptions} from '../engine/graphics/Sprite.js';

export type GraphicsComponentOptions = {
  spriteOptions: SpriteOptions;
  boundingBox: pixi.Rectangle;
  // Render in the map's topmost layer (above the overhead "air" layers) instead of the default
  // entity layer. Used for foreground effects like the wall-hit spark.
  overlay?: boolean;
};

export class GraphicsComponent extends Component {
  sprite: Sprite;
  boundingBox: pixi.Rectangle;
  overlay: boolean;

  constructor({spriteOptions, boundingBox, overlay = false}: GraphicsComponentOptions) {
    super();

    this.sprite = new Sprite(spriteOptions);
    this.boundingBox = boundingBox;
    this.overlay = overlay;
  }
}
