import {EventChannel} from 'tellurion';

import {TriggerEnter} from './TriggerEnter.js';

export const triggerEnterChannel = new EventChannel({
  event: TriggerEnter,
  displayName: 'Trigger enter',
});
