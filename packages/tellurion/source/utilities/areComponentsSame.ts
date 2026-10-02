import {type Entity} from '../ecs/Entity.js';
import {type EntityQuery} from '../ecs/EntityQuery.js';
import {type System} from '../ecs/System.js';

// all components of `system` must be also in `entity`, but not the vice versa
export function areComponentsSame(system: EntityQuery | System, entity: Entity) {
  for (let ComponentConstructor of system.components) {
    if (!entity.hasComponent(ComponentConstructor)) {
      return false;
    }
  }

  return true;
}
