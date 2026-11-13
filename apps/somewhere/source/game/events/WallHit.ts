import type * as pixi from 'pixi.js';
import {defineEvent, type Entity, type MapTile} from 'tellurion';

export const WallHit = defineEvent<{entity: Entity; tile: MapTile; box: pixi.Rectangle}>();
