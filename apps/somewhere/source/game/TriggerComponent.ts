import type * as pixi from 'pixi.js';

import {Component} from '../engine/ecs/Component.js';

export type TriggerComponentOptions = {
  id: number; // Tiled object id; door targets resolve against this
  name: string;
  type: string;
  rect: pixi.Rectangle; // map-space art px
  properties: Record<string, boolean | number | string>;
};

export class TriggerComponent extends Component {
  id: number;
  name: string;
  type: string;
  rect: pixi.Rectangle;
  properties: Record<string, boolean | number | string>;

  // undefined = unseeded: triggerSystem's first test seeds it from the
  // current overlap without emitting, so a restored save that loads inside a
  // trigger stays silent.
  isPlayerInside: boolean | undefined = undefined;

  constructor({id, name, type, rect, properties}: TriggerComponentOptions) {
    super();

    this.id = id;
    this.name = name;
    this.type = type;
    this.rect = rect;
    this.properties = properties;
  }
}
