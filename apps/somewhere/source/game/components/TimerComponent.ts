import {defineComponent} from '../../engine/ecs/Component.js';
import {type EventEmit} from '../../engine/scheduler/EventEmit.js';
import {type Timer} from '../../engine/scheduler/Timer.js';

export const TimerComponent = defineComponent<{
  timers: Array<{timer: Timer; emit?: EventEmit | undefined}>;
}>();
