import {System} from '../engine/ecs/System.js';
import {BehaviorComponent, randomStrollWait} from './BehaviorComponent.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueQuery} from './dialogueQuery.js';
import {MotionComponent} from './MotionComponent.js';

// The one piece motionSystem's seek mode is missing: something that sets
// motion.target. A small per-entity state machine on behavior.phase; walks end
// when motionSystem clears the target — on arrival and when fully blocked
// alike — so a blocked stroll self-heals into "give up, head back after the
// wait" with no pathfinding and no walking-in-place.
export const behaviorSystem = new System({
  displayName: 'Behavior system',
  components: [BehaviorComponent, MotionComponent],
  onUpdate: (ticker, system) => {
    let isDialogueActive = dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null;

    for (let entity of system.entities) {
      let {behavior} = entity.getComponent(BehaviorComponent);
      let motion = entity.getComponent(MotionComponent);
      let goalPoint = behavior.goal === 'home' ? behavior.home : behavior.destination;

      // Dialogue freeze first: interrupt a live walk; everything else —
      // wait timers included — holds until the dialogue ends.
      if (isDialogueActive) {
        if (behavior.phase === 'walking' && motion.target !== undefined) {
          motion.target = undefined;
          // set(0, 0) keeps the stored angle, so facing survives the freeze.
          motion.velocity.set(0, 0);
          behavior.phase = 'paused';
        }

        continue;
      }

      // The dialogue has ended: resume the interrupted stroll toward the
      // same goal.
      if (behavior.phase === 'paused') {
        behavior.phase = 'walking';
        motion.target = goalPoint.clone();

        continue;
      }

      if (behavior.phase === 'waiting') {
        behavior.waitRemaining -= ticker.deltaMS;

        if (behavior.waitRemaining <= 0) {
          behavior.phase = 'walking';
          // Cloned so motionSystem's consume/clear can never alias the
          // authored home/destination vectors.
          motion.target = goalPoint.clone();
        }

        continue;
      }

      // walking: a cleared target means the walk is over (arrived or fully
      // blocked). Flip the goal and rest.
      if (motion.target === undefined) {
        behavior.goal = behavior.goal === 'home' ? 'destination' : 'home';
        behavior.phase = 'waiting';
        behavior.waitRemaining = randomStrollWait();
      }
    }
  },
});
