import type * as pixi from 'pixi.js';

import {type Entity} from '../engine/ecs/Entity.js';
import {defineEvent} from '../engine/ecs/Event.js';
import {type MapTile} from '../engine/tiled/Map.js';

export const WallHit = defineEvent<{entity: Entity; tile: MapTile; box: pixi.Rectangle}>();
