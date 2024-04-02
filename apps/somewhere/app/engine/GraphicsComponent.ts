import * as pixi from 'pixi.js';

import {Component} from './Component.js';
import {Sprite, type SpriteOptions} from './Sprite.js';

export type GraphicsComponentOptions = {
  spriteOptions: SpriteOptions;
  boundingBox: pixi.Rectangle;
};

export class GraphicsComponent extends Component {
  sprite: Sprite;
  boundingBox: pixi.Rectangle;

  constructor({spriteOptions, boundingBox}: GraphicsComponentOptions) {
    super();

    this.sprite = new Sprite(spriteOptions);
    this.boundingBox = boundingBox;
  }
}
