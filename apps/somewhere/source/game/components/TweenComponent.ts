import {defineComponent} from '../../engine/ecs/Component.js';
import {type EventEmit} from '../../engine/scheduler/EventEmit.js';
import {type Tween} from '../../engine/scheduler/Tween.js';

export const TweenComponent = defineComponent<{
  // `Tween<unknown>` so a `Tween<Vector>` (an entity position) or any concrete target assigns in.
  tweens: Array<{tween: Tween<unknown>; emit?: EventEmit | undefined}>;
}>();
