import {CameraComponent} from '../engine/CameraComponent.js';
import {Entity} from '../engine/Entity.js';
import {Vector} from '../engine/Vector.js';
import {world} from './world.js';

export const camera = new Entity({
  components: [new CameraComponent({position: new Vector(0, 0)})],
});

world.addEntity(camera);
