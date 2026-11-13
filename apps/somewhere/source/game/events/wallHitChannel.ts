import {EventChannel} from 'tellurion';

import {WallHit} from './WallHit.js';

export const wallHitChannel = new EventChannel({event: WallHit, displayName: 'Wall hit'});
