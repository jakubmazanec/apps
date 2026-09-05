import {defineComponent} from '../../engine/ecs/Component.js';
import {type Timer} from '../../engine/scheduler/Timer.js';

export const TimerComponent = defineComponent<{timers: Timer[]}>();
