import {System} from '../../engine/ecs/System.js';
import {TweenComponent} from '../components/TweenComponent.js';

export const tweenSystem = new System({
  components: [TweenComponent],
  displayName: 'Tween',
  onUpdate: (ticker, system) => {
    for (let entity of system.entities) {
      let {tweens} = entity.getComponent(TweenComponent);

      for (let index = tweens.length - 1; index >= 0; index--) {
        let tween = tweens[index]!;

        tween.update(ticker);

        // A tween never repeats, so it always removes its entry on completion.
        if (tween.isCompleted) {
          tweens.splice(index, 1);
        }
      }
    }
  },
});
