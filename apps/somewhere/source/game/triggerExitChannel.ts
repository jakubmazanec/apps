import {EventChannel} from '../engine/ecs/EventChannel.js';
import {TriggerExit} from './TriggerExit.js';

export const triggerExitChannel = new EventChannel({
  event: TriggerExit,
  displayName: 'Trigger exit',
});
