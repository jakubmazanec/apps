import {Entity} from '../engine/ecs/Entity.js';
import {Vector} from '../engine/utilities/Vector.js';
import {CameraComponent} from './CameraComponent.js';

export const camera = new Entity({
  components: [new CameraComponent({position: new Vector(0, 0)})],
});
