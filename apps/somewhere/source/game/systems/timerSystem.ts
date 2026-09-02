import {System} from '../../engine/ecs/System.js';
import {TimerComponent} from '../components/TimerComponent.js';

export const timerSystem = new System({
  components: [TimerComponent],
  displayName: 'Timer',
  onUpdate: (ticker, system) => {
    for (let entity of system.entities) {
      let {timers} = entity.getComponent(TimerComponent);

      for (let index = timers.length - 1; index >= 0; index--) {
        let {timer, emit} = timers[index]!;

        if (timer.update(ticker)) {
          emit?.channel.push(emit.event); // consumed next frame by a gameplay system

          if (!timer.isRepeating) {
            timers.splice(index, 1);
          }
        }
      }
    }
  },
});
