import {EventChannel} from '../engine/ecs/EventChannel.js';
import {TriggerEnter} from './TriggerEnter.js';

export const triggerEnterChannel = new EventChannel({
  event: TriggerEnter,
  displayName: 'Trigger enter',
});
