import {System} from '../engine/ecs/System.js';
import {ui} from '../engine/ui/ui.js';
import {wallHitChannel} from './wallHitChannel.js';

export const uiBridge = new System({
  components: [],
  displayName: 'ECS->UI bridge',
  onUpdate: () => {
    for (let {tile} of wallHitChannel.events) {
      ui.emit('world:wallHit', {tile});
    }
  },
});
