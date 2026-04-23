import {defineComponent} from '../ecs/Component.js';
import {type EventEmit} from './EventEmit.js';
import {type Timer} from './Timer.js';

export const TimerComponent = defineComponent<{
  timers: Array<{timer: Timer; emit?: EventEmit | undefined}>;
}>();
