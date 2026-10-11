import {EventChannel} from 'tellurion';

import {PlayerActionFinished} from './PlayerActionFinished.js';

export const playerActionFinishedChannel = new EventChannel({
  event: PlayerActionFinished,
  displayName: 'Player action finished',
});
