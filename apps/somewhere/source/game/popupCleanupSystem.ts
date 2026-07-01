import {System} from '../engine/ecs/System.js';
import {popupExpiredChannel} from './popupExpiredChannel.js';

export const popupCleanupSystem = new System({
  components: [],
  displayName: 'Popup cleanup',
  onUpdate: (ticker, system, world) => {
    for (let {entity} of popupExpiredChannel.events) {
      world.removeEntity(entity); // graphicsSystem.onRemoveEntity tears the sprite down
    }
  },
});
