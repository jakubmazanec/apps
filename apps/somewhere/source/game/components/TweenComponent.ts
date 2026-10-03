import {defineComponent, type Tween} from 'tellurion';

export const TweenComponent = defineComponent<{
  // `Tween<unknown>` so a `Tween<Vector>` (an entity position) or any concrete target assigns in.
  tweens: Array<Tween<unknown>>;
}>();
