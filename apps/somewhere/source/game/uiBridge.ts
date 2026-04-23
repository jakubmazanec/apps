import {System} from '../engine/ecs/System.js';
import {uiEvents} from './uiEvents.js';
import {wallHitChannel} from './wallHitChannel.js';

export const uiBridge = new System({
  components: [],
  displayName: 'ECS->UI bridge',
  onUpdate: () => {
    for (let {tile} of wallHitChannel.events) {
      uiEvents.emit('world:wallHit', {tile});
    }
  },
});
