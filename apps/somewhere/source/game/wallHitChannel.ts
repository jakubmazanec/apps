import {EventChannel} from '../engine/ecs/EventChannel.js';
import {WallHit} from './WallHit.js';

export const wallHitChannel = new EventChannel({event: WallHit, displayName: 'Wall hit'});
