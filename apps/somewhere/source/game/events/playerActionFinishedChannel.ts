import {EventChannel} from '../../engine/ecs/EventChannel.js';
import {PlayerActionFinished} from './PlayerActionFinished.js';

export const playerActionFinishedChannel = new EventChannel({
  event: PlayerActionFinished,
  displayName: 'Player action finished',
});
