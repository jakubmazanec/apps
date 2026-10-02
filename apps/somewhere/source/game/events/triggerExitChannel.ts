import {EventChannel} from 'tellurion';

import {TriggerExit} from './TriggerExit.js';

export const triggerExitChannel = new EventChannel({
  event: TriggerExit,
  displayName: 'Trigger exit',
});
