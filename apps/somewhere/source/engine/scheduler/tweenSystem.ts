import {System} from '../ecs/System.js';
import {TweenComponent} from './TweenComponent.js';

export const tweenSystem = new System({
  components: [TweenComponent],
  displayName: 'Tween',
  onUpdate: (ticker, system) => {
    for (let entity of system.entities) {
      let {tweens} = entity.getComponent(TweenComponent);

      for (let index = tweens.length - 1; index >= 0; index--) {
        let {tween, emit} = tweens[index]!;

        // A tween never repeats, so it always removes its entry on completion.
        if (tween.update(ticker)) {
          emit?.channel.push(emit.event);
          tweens.splice(index, 1);
        }
      }
    }
  },
});
