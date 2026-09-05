import type * as pixi from 'pixi.js';

import {Component} from '../../engine/ecs/Component.js';

export type TriggerComponentOptions = {
  id: number; // Tiled object id; door targets resolve against this
  name: string;
  type: string;
  rect: pixi.Rectangle; // map-space art px
  properties: Record<string, boolean | number | string>;
  // The rect's authored offset from the owning entity's position. Only the
  // npc factory passes these; doors and zones have no entity position to
  // follow and keep the 0 default.
  rectOffsetX?: number | undefined;
  rectOffsetY?: number | undefined;
};

export class TriggerComponent extends Component {
  id: number;
  // undefined = unseeded: triggerSystem's first test seeds it from the
  // current overlap without emitting, so a restored save that loads inside a
  // trigger stays silent.
  isPlayerInside: boolean | undefined = undefined;
  name: string;
  properties: Record<string, boolean | number | string>;
  rect: pixi.Rectangle;
  rectOffsetX: number;
  rectOffsetY: number;
  type: string;

  constructor({
    id,
    name,
    type,
    rect,
    properties,
    rectOffsetX = 0,
    rectOffsetY = 0,
  }: TriggerComponentOptions) {
    super();

    this.id = id;
    this.name = name;
    this.type = type;
    this.rect = rect;
    this.properties = properties;
    this.rectOffsetX = rectOffsetX;
    this.rectOffsetY = rectOffsetY;
  }
}
